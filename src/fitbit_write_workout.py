import os
import json
import requests
import sys
from datetime import datetime
from fitbit_token_manager import get_valid_token
from logger import get_logger

log = get_logger("fitbit_write_workout")

ACTIVITY_MAP = {
    "running": "90009",
    "walking": "90013",
    "hiking": "90011",
    "biking": "90001",
    "swimming": "1071",
    "weightlifting": "2131",
    "hiit": "11040",
    "circuit_training": "3016",
    "treadmill": "90019",
    "workout": "3000"
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

def convert_whoop_to_fitbit(workout):
    try:
        start_dt = datetime.strptime(workout["start_time"], "%Y-%m-%dT%H:%M:%S.%fZ")
        end_dt = datetime.strptime(workout["end_time"], "%Y-%m-%dT%H:%M:%S.%fZ")
        duration_ms = int((end_dt - start_dt).total_seconds() * 1000)

        cals = workout.get("calories", 0)
        sport = workout.get("sport_name", "").lower()
        raw_dist = workout.get("distance_meter")
        dist_m = float(raw_dist) if raw_dist is not None else 0.0

        base_id = ACTIVITY_MAP.get(sport, ACTIVITY_MAP["workout"])
        final_id = base_id
        use_distance = False

        if base_id in ["90009", "90013", "90011"]:
            if dist_m > 500:
                use_distance = True
            else:
                final_id = "90019"

        payload = {
            "manualCalories": int(cals),
            "startTime": start_dt.strftime("%H:%M:%S"),
            "date": start_dt.strftime("%Y-%m-%d"),
            "durationMillis": duration_ms
        }

        if sport == "hiit":
            payload["activityName"] = "HIIT"
        else:
            payload["activityId"] = final_id

        if use_distance:
            payload["distance"] = round(dist_m / 1000, 3)
            payload["distanceUnit"] = "Kilometer"

        return payload
    except Exception as e:
        log.error(f"Conversion error for workout {workout.get('id')}: {e}")
        return None

def sync_whoop_to_fitbit(start_filter_dt):
    whoop_root, fitbit_root = "whoop-data", "fitbit-data"

    access_token = get_valid_token()
    if not access_token:
        log.error("Could not obtain a valid Fitbit token. Aborting.")
        sys.exit(1)

    log.info(f"Syncing WHOOP → Fitbit (from {start_filter_dt.strftime('%Y-%m-%d')})...")

    total_uploaded = 0
    total_skipped = 0
    total_errors = 0

    for year in sorted(os.listdir(whoop_root)):
        if not year.isdigit() or int(year) < start_filter_dt.year:
            continue
        year_path = os.path.join(whoop_root, year)

        for month in sorted(os.listdir(year_path)):
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
                w_start_dt = datetime.strptime(workout["start_time"], "%Y-%m-%dT%H:%M:%S.%fZ")

                if w_start_dt < start_filter_dt:
                    continue

                if w_id in existing_ids:
                    log.debug(f"Skipping already-synced workout: {workout.get('sport_name')} | {w_start_dt.strftime('%Y-%m-%d %H:%M')}")
                    total_skipped += 1
                    continue

                payload = convert_whoop_to_fitbit(workout)
                if not payload:
                    total_errors += 1
                    continue

                log.info(f"Uploading: {workout['sport_name']} | {w_start_dt.strftime('%Y-%m-%d %H:%M')}")

                headers = {
                    "Authorization": f"Bearer {access_token}"
                }

                try:
                    resp = requests.post("https://api.fitbit.com/1/user/-/activities.json", headers=headers, params=payload)

                    if resp.status_code in [200, 201]:
                        log.info(f"Upload successful: {workout['sport_name']} | {w_start_dt.strftime('%Y-%m-%d %H:%M')}")
                        new_ids_successfully_synced.append({"id": w_id})
                        total_uploaded += 1
                    else:
                        log.error(f"Upload failed ({resp.status_code}) for {workout['sport_name']} | {w_start_dt.strftime('%Y-%m-%d %H:%M')}: {resp.text}")
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
