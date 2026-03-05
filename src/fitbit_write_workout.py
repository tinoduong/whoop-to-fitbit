import os
import json
import requests
import sys
from datetime import datetime

CONFIG_PATH = "meta-data/config.json"

def load_config():
    if not os.path.exists(CONFIG_PATH):
        print(f"Error: Config file missing at {CONFIG_PATH}")
        sys.exit(1)
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)

def get_valid_token(config):
    """Exchanges refresh token for a new access token."""
    url = "https://api.fitbit.com/oauth2/token"
    data = {
        "grant_type": "refresh_token",
        "refresh_token": config.get("refresh_token"),
        "client_id": config.get("client_id"),
    }
    auth = (config.get("client_id"), config.get("client_secret"))
    
    try:
        response = requests.post(url, data=data, auth=auth)
        if response.status_code == 200:
            return response.json().get("access_token")
    except Exception as e:
        print(f"Auth Connection Error: {e}")
    
    return None

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
        print("Use YYYY-MM-DD format.")
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

        # Logic for GPS sports
        if base_id in ["90009", "90013", "90011"]:
            if dist_m > 500:
                use_distance = True
            else:
                # Use the standard Treadmill ID 90019
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
        print(f"Conversion Error: {e}")
        return None

def sync_whoop_to_fitbit(start_filter_dt):
    config = load_config()
    whoop_root, fitbit_root = "whoop-data", "fitbit-data"
    
    access_token = get_valid_token(config)
    if not access_token:
        print("Auth failed. Falling back to access_token from config.")
        access_token = config.get("access_token")

    print("RUNNING LIVE SYNC")
    print("-" * 60)

    for year in sorted(os.listdir(whoop_root)):
        if not year.isdigit() or int(year) < start_filter_dt.year: continue
        year_path = os.path.join(whoop_root, year)
        
        for month in sorted(os.listdir(year_path)):
            if int(year) == start_filter_dt.year and int(month) < start_filter_dt.month: continue
            
            source_file = os.path.join(year_path, month, f"{month}.json")
            if not os.path.isfile(source_file): continue

            target_dir = os.path.join(fitbit_root, year, month)
            target_file = os.path.join(target_dir, f"{month}-db.json")

            with open(source_file, 'r') as f: whoop_workouts = json.load(f)
            
            fitbit_db = []
            if os.path.exists(target_file):
                with open(target_file, 'r') as f: fitbit_db = json.load(f)

            existing_ids = {item['id'] for item in fitbit_db}
            new_ids_successfully_synced = []

            for workout in whoop_workouts:
                w_id = workout.get("id")
                w_start_dt = datetime.strptime(workout["start_time"], "%Y-%m-%dT%H:%M:%S.%fZ")

                if w_start_dt < start_filter_dt or w_id in existing_ids:
                    continue

                payload = convert_whoop_to_fitbit(workout)
                if not payload: continue

                print(f"SYNCING: {workout['sport_name']} | {w_start_dt.strftime('%Y-%m-%d %H:%M:%S')}")
                
                headers = {
                    "Authorization": f"Bearer {access_token}", 
                    "Content-Type": "application/x-www-form-urlencoded"
                }
                
                try:
                    resp = requests.post("https://api.fitbit.com/1/user/-/activities.json", headers=headers, data=payload)

                    if resp.status_code in [200, 201]:
                        print("  SUCCESS: Uploaded to Fitbit")
                        new_ids_successfully_synced.append({"id": w_id})
                    else:
                        print(f"  ERROR {resp.status_code}: {resp.text}")
                except Exception as e:
                    print(f"  Connection Error: {e}")

                print("-" * 60)

            if new_ids_successfully_synced:
                os.makedirs(target_dir, exist_ok=True)
                fitbit_db.extend(new_ids_successfully_synced)
                with open(target_file, 'w') as f: 
                    json.dump(fitbit_db, f, indent=4)
                print(f"Database updated: {target_file}")

if __name__ == "__main__":
    sync_whoop_to_fitbit(parse_start_argument())