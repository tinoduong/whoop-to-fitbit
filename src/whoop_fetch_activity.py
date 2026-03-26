import json
import requests
import sys
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from whoop_token_manager import WhoopTokenManager
from logger import get_logger

log = get_logger("whoop_fetch_activity")

BASE_DATA_DIR = 'whoop-data'
LOCAL_TZ = ZoneInfo("America/New_York")

def save_workout_idempotent(workout_obj):
    start_time_str = workout_obj.get('start_time')
    dt = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
    dt = dt.astimezone(LOCAL_TZ)

    # Overwrite timestamps with local time before saving
    workout_obj['start_time'] = dt.strftime("%Y-%m-%dT%H:%M:%S")
    if workout_obj.get('end_time'):
        end_dt = datetime.fromisoformat(workout_obj['end_time'].replace('Z', '+00:00'))
        workout_obj['end_time'] = end_dt.astimezone(LOCAL_TZ).strftime("%Y-%m-%dT%H:%M:%S")

    year = dt.strftime("%Y")
    month = dt.strftime("%m")

    target_dir = os.path.join(BASE_DATA_DIR, year, month)
    os.makedirs(target_dir, exist_ok=True)

    file_path = os.path.join(target_dir, f"{month}.json")

    existing_records = {}
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                existing_records = {item['id']: item for item in data}
        except (json.JSONDecodeError, KeyError):
            log.warning(f"Could not parse existing file: {file_path}")

    existing_records[workout_obj['id']] = workout_obj

    with open(file_path, 'w') as f:
        final_list = sorted(existing_records.values(), key=lambda x: x['start_time'])
        json.dump(final_list, f, indent=4)

def fetch_workouts(start_dt, interactive=True):
    """Core fetch logic. Raises WhoopTokenManager.AuthRequired if non-interactive and auth is needed."""
    log.info(f"Fetching WHOOP workouts from {start_dt.strftime('%Y-%m-%d')}...")

    manager = WhoopTokenManager()
    headers = manager.get_auth_header(interactive=interactive)
    url = "https://api.prod.whoop.com/developer/v2/activity/workout"

    params = {
        'start': start_dt.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'limit': 25
    }

    all_processed = 0
    next_token = True

    while next_token:
        log.info("Fetching page of WHOOP workouts...")
        response = requests.get(url, headers=headers, params=params)

        if response.status_code == 200:
            data = response.json()
            records = data.get('records', [])

            for w in records:
                score = w.get('score', {})
                kj = score.get('kilojoule', 0)

                # Base object for Fitbit upload — extra fields not included
                workout_data = {
                    "id": w.get('id'),
                    "sport_name": w.get('sport_name'),
                    "start_time": w.get('start'),
                    "end_time": w.get('end'),
                    "avg_heart_rate": score.get('average_heart_rate', 0),
                    "calories": round(kj / 4.184) if kj else 0,
                    "distance_meter": score.get('distance_meter', 0)
                }

                # --- Fitbit upload happens here (unchanged) ---
                # fitbit_write_workout(workout_data)

                # Extend with analytics fields after Fitbit upload
                workout_data["max_heart_rate"] = score.get('max_heart_rate', 0)
                workout_data["strain"] = score.get('strain', 0)
                workout_data["zone_durations"] = score.get('zone_durations', {})

                save_workout_idempotent(workout_data)
                log.info(f"Saved workout: {workout_data['sport_name']} | {workout_data['start_time']}")

                all_processed += 1

            next_token = data.get('next_token')
            if next_token:
                params['nextToken'] = next_token
            else:
                next_token = None
        else:
            log.error(f"WHOOP API error ({response.status_code}): {response.text}")
            break

    log.info(f"WHOOP fetch complete. Total workouts processed: {all_processed}")
    return all_processed


def get_workout_summary_programmatic(start_dt=None):
    """Called by the scheduler — fetches workouts from start_dt, non-interactive."""
    if start_dt is None:
        start_dt = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    # Ensure timezone-aware for the API call
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)
    return fetch_workouts(start_dt, interactive=False)


def get_workout_summary():
    start_dt = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    if len(sys.argv) > 1:
        date_input = sys.argv[1]
        try:
            if len(date_input) == 10:
                start_dt = datetime.strptime(date_input, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            elif len(date_input) == 7:
                start_dt = datetime.strptime(date_input, "%Y-%m").replace(tzinfo=timezone.utc)
        except ValueError:
            log.error("Invalid date argument. Use YYYY-MM-DD or YYYY-MM.")
            return

    fetch_workouts(start_dt, interactive=True)


if __name__ == "__main__":
    get_workout_summary()