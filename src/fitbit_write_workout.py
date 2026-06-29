import os
import json
import requests
import sys
from datetime import datetime, timezone, timedelta
from google_token_manager import get_headers
from logger import get_logger

log = get_logger("fitbit_write_workout")

BASE_URL = "https://health.googleapis.com/v4"

ACTIVITY_MAP = {
    "running": "RUNNING",
    "walking": "WALKING",
    "hiking": "HIKING",
    "biking": "BIKING",
    "swimming": "SWIMMING",
    "weightlifting": "WEIGHTLIFTING",
    "hiit": "HIIT",
    "circuit_training": "CIRCUIT_TRAINING",
    "treadmill": "TREADMILL",
    "workout": "WORKOUT",
    "contrast-therapy": "OTHER",
}

def parse_start_argument():
    if len(sys.argv) < 2:
        return datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    arg = sys.argv[1]
    try:
        return datetime.strptime(arg, "%Y-%m-%d")
    except ValueError:
        log.error("Invalid date argument. Use YYYY-MM-DD format.")
        sys.exit(1)

def convert_whoop_to_google(workout):
    try:
        start_dt = datetime.fromisoformat(workout["start_time"]).astimezone(timezone.utc)
        end_dt = datetime.fromisoformat(workout["end_time"]).astimezone(timezone.utc)

        sport = workout.get("sport_name", "").lower()
        cals = float(workout.get("calories", 0))
        raw_dist = workout.get("distance_meter")
        dist_mm = float(raw_dist) * 1000 if raw_dist else None

        exercise_type = ACTIVITY_MAP.get(sport, "WORKOUT")
        display_name = sport.replace("-", " ").title()

        metrics = {"caloriesKcal": cals}
        if dist_mm:
            metrics["distanceMillimeters"] = dist_mm

        return {
            "exercise": {
                "interval": {
                    "startTime": start_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "endTime": end_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "startUtcOffset": "-14400s",
                    "endUtcOffset": "-14400s",
                },
                "exerciseType": exercise_type,
                "displayName": display_name,
                "metricsSummary": metrics,
            }
        }
    except Exception as e:
        log.error(f"Conversion error for workout {workout.get('id')}: {e}")
        return None

def sync_whoop_to_fitbit(start_filter_dt):
    whoop_root, fitbit_root = "whoop-data", "fitbit-data"
    headers = get_headers()
    headers["Content-Type"] = "application/json"

    log.info(f"Syncing WHOOP → Google Health API (from {start_filter_dt.strftime('%Y-%m-%d')})...")

    total_uploaded = 0
    total_skipped = 0
    total_errors = 0

    for year in sorted(os.listdir(whoop_root)):
        if not year.isdigit() or int(year) < start_filter_dt.year:
            continue
        year_path = os.path.join(whoop_root, year)

        for month in sorted(os.listdir(year_path)):
            if not month.isdigit():
                continue
            if int(year) == start_filter_dt.year and int(month) < start_filter_dt.month:
                continue

            source_file = os.path.join(year_path, month, f"{month}.json")
            if not os.path.isfile(source_file):
                continue

            target_dir = os.path.join(fitbit_root, year, month)
            target_file = os.path.join(target_dir, f"{month}-db.json")

            with open(source_file, 'r') as f:
                whoop_workouts = json.load(f)

            fitbit_db = []
            if os.path.exists(target_file):
                with open(target_file, 'r') as f:
                    fitbit_db = json.load(f)

            existing_ids = {item['id'] for item in fitbit_db}
            new_ids_successfully_synced = []

            for workout in whoop_workouts:
                w_id = workout.get("id")
                w_start_dt = datetime.fromisoformat(workout["start_time"]).replace(tzinfo=None)

                if w_start_dt < start_filter_dt:
                    continue

                if w_id in existing_ids:
                    log.debug(f"Skipping already-synced workout: {workout.get('sport_name')} | {w_start_dt.strftime('%Y-%m-%d %H:%M')}")
                    total_skipped += 1
                    continue

                payload = convert_whoop_to_google(workout)
                if not payload:
                    total_errors += 1
                    continue

                log.info(f"Uploading: {workout['sport_name']} | {w_start_dt.strftime('%Y-%m-%d %H:%M')}")

                try:
                    resp = requests.post(
                        f"{BASE_URL}/users/me/dataTypes/exercise/dataPoints",
                        headers=headers,
                        json=payload,
                    )
                    if resp.status_code == 200:
                        log.info(f"Upload successful: {workout['sport_name']} | {w_start_dt.strftime('%Y-%m-%d %H:%M')}")
                        new_ids_successfully_synced.append({"id": w_id})
                        total_uploaded += 1
                    else:
                        log.error(f"Upload failed ({resp.status_code}) for {workout['sport_name']} | {w_start_dt.strftime('%Y-%m-%d %H:%M')}: {resp.text[:200]}")
                        total_errors += 1
                except Exception as e:
                    log.error(f"Connection error uploading {workout.get('sport_name')}: {e}")
                    total_errors += 1

            if new_ids_successfully_synced:
                os.makedirs(target_dir, exist_ok=True)
                fitbit_db.extend(new_ids_successfully_synced)
                with open(target_file, 'w') as f:
                    json.dump(fitbit_db, f, indent=4)
                log.info(f"Database updated: {target_file}")

    log.info(f"Sync complete. Uploaded: {total_uploaded} | Skipped (already synced): {total_skipped} | Errors: {total_errors}")

if __name__ == "__main__":
    sync_whoop_to_fitbit(parse_start_argument())