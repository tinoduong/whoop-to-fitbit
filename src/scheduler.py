"""
scheduler.py — Runs every hour to:
  1. Refresh Fitbit + WHOOP tokens
  2. Fetch new WHOOP workouts
  3. Sync any new workouts to Fitbit

Handles laptop sleep/wake:
  - Checks elapsed time every 60 s; if ≥1 h has passed since the last run
    (e.g. after waking from sleep), it runs immediately.
  - Persists last-run timestamp so state survives restarts.

Handles auth failures:
  - If either token refresh requires manual interaction, the scheduler logs
    a clear message and exits. Re-authenticate manually, then restart.
"""

import time
import json
import os
import sys
from datetime import datetime, timezone

from fitbit_token_manager import get_valid_token, AuthRequired as FitbitAuthRequired
from whoop_token_manager import AuthRequired as WhoopAuthRequired
from whoop_fetch_activity import get_workout_summary_programmatic
from fitbit_write_workout import sync_whoop_to_fitbit
from fitbit_load_store_weight import fetch_data as fetch_weight_data
from logger import get_logger

log = get_logger("scheduler")

INTERVAL_SECONDS = 3600  # 1 hour
STATE_FILE = os.path.join("meta-data", "scheduler_state.json")


# ── State helpers ─────────────────────────────────────────────────────────────

def load_last_run() -> float:
    """Return epoch timestamp of the last successful run, or 0 if never."""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f).get("last_run", 0)
        except Exception:
            pass
    return 0


def save_last_run(ts: float):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump({"last_run": ts}, f, indent=4)


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_whoop_fetch_start() -> datetime:
    """
    Find the start_time of the most recent locally stored WHOOP workout and
    return midnight of that day (naive UTC). Falls back to today if no data exists.
    This ensures that if the laptop was closed for multiple days, we fetch from
    the last known workout forward rather than just today.
    """
    whoop_root = "whoop-data"
    latest_start = None

    if os.path.exists(whoop_root):
        for year in sorted(os.listdir(whoop_root), reverse=True):
            year_path = os.path.join(whoop_root, year)
            if not os.path.isdir(year_path) or not year.isdigit():
                continue
            for month in sorted(os.listdir(year_path), reverse=True):
                month_path = os.path.join(year_path, month)
                file_path = os.path.join(month_path, f"{month}.json")
                if not os.path.isfile(file_path):
                    continue
                try:
                    with open(file_path, "r") as f:
                        records = json.load(f)
                    if records:
                        last = sorted(records, key=lambda x: x["start_time"])[-1]
                        latest_start = last["start_time"]
                except Exception:
                    pass
                if latest_start:
                    break
            if latest_start:
                break

    if latest_start:
        dt = datetime.fromisoformat(latest_start.replace("Z", "+00:00"))
        # Start from midnight of the day of the latest workout (inclusive)
        return dt.replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0)

    # No local data — default to today
    return datetime.now(timezone.utc).replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0)


# ── Core sync logic ───────────────────────────────────────────────────────────

def run_sync():
    log.info("=" * 60)
    log.info("Scheduler: starting sync cycle")

    # 1. Refresh Fitbit token (non-interactive — raises FitbitAuthRequired if manual auth needed)
    log.info("Refreshing Fitbit token...")
    fitbit_token = get_valid_token(interactive=False)
    if not fitbit_token:
        log.error("Could not obtain Fitbit token — skipping this cycle.")
        return False

    # 2. Determine start date: day after the latest locally stored WHOOP workout,
    #    so we catch everything missed while the laptop was closed.
    start_dt = get_whoop_fetch_start()
    log.info(f"Refreshing WHOOP token and fetching workouts from {start_dt.strftime('%Y-%m-%d')}...")
    new_workouts = get_workout_summary_programmatic(start_dt)

    # 3. Sync new WHOOP workouts → Fitbit only if there are new workouts to register
    if new_workouts:
        log.info(f"Syncing WHOOP → Fitbit (from {start_dt.strftime('%Y-%m-%d')})...")
        sync_whoop_to_fitbit(start_dt)
    else:
        log.info("No new WHOOP workouts — skipping Fitbit API call.")

    # 4. Fetch and store Fitbit weight data
    log.info("Fetching and storing Fitbit weight data...")
    fetch_weight_data()

    now = time.time()
    save_last_run(now)
    log.info(f"Sync cycle complete at {datetime.fromtimestamp(now).strftime('%Y-%m-%d %H:%M:%S')}")
    return True


# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    log.info("Scheduler started. Press Ctrl+C to stop.")

    while True:
        last_run = load_last_run()
        now = time.time()
        elapsed = now - last_run

        if elapsed >= INTERVAL_SECONDS:
            if last_run > 0:
                missed = int(elapsed // INTERVAL_SECONDS)
                log.info(
                    f"Woke up after {elapsed / 3600:.1f} h — "
                    f"running immediately (missed ~{missed} interval(s))."
                )

            try:
                run_sync()
            except (FitbitAuthRequired, WhoopAuthRequired) as e:
                log.error(f"Manual authentication required — stopping scheduler.\n  → {e}")
                log.error(
                    "Fix: re-authenticate by running the relevant token manager script, "
                    "then restart the scheduler with: python scheduler.py"
                )
                sys.exit(1)
            except Exception as e:
                log.error(f"Unexpected error during sync: {e}")
                # Don't exit — try again next hour

        else:
            next_in = INTERVAL_SECONDS - elapsed
            log.info(
                f"Next sync in {next_in / 60:.1f} min "
                f"(last run: {datetime.fromtimestamp(last_run).strftime('%Y-%m-%d %H:%M:%S') if last_run else 'never'})."
            )

        # Sleep in 60-second chunks so a wake-from-sleep is detected quickly.
        # After each chunk we re-check elapsed at the top of the loop.
        sleep_until = time.time() + INTERVAL_SECONDS
        while time.time() < sleep_until:
            chunk = min(60, sleep_until - time.time())
            if chunk <= 0:
                break
            time.sleep(chunk)
            # If the wall clock jumped forward (wake from sleep), bail early
            if time.time() - load_last_run() >= INTERVAL_SECONDS:
                break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("Scheduler stopped by user.")
        sys.exit(0)
