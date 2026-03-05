import json
import requests
import sys
import os
from datetime import datetime, timezone

CONFIG_PATH = 'meta-data/whconfig.json'
BASE_DATA_DIR = 'whoop-data'

def save_workout_idempotent(workout_obj):
    # Organizes by start_time (e.g., '2026-03-01T19:57:00.685Z')
    start_time_str = workout_obj.get('start_time')
    dt = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
    
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
            pass

    # Idempotent overwrite using unique workout ID
    existing_records[workout_obj['id']] = workout_obj
    
    with open(file_path, 'w') as f:
        # Keep the monthly JSON sorted chronologically
        final_list = sorted(existing_records.values(), key=lambda x: x['start_time'])
        json.dump(final_list, f, indent=4)

def get_workout_summary():
    # Set default start to today UTC
    start_dt = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    if len(sys.argv) > 1:
        date_input = sys.argv[1]
        try:
            if len(date_input) == 10:
                start_dt = datetime.strptime(date_input, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            elif len(date_input) == 7:
                start_dt = datetime.strptime(date_input, "%Y-%m").replace(tzinfo=timezone.utc)
        except ValueError:
            print("Error: Use YYYY-MM-DD or YYYY-MM.")
            return

    with open(CONFIG_PATH, 'r') as f:
        config = json.load(f)
    
    headers = {'Authorization': f"Bearer {config['access_token']}"}
    url = "https://api.prod.whoop.com/developer/v2/activity/workout"
    
    params = {
        'start': start_dt.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'limit': 25 
    }

    all_processed = 0
    next_token = True

    while next_token:
        print(f"Fetching page of workouts...")
        response = requests.get(url, headers=headers, params=params)

        if response.status_code == 200:
            data = response.json()
            records = data.get('records', [])
            
            for w in records:
                score = w.get('score', {})
                kj = score.get('kilojoule', 0)
                
                # Updated Schema: Includes start, end, and distance
                workout_data = {
                    "id": w.get('id'),
                    "sport_name": w.get('sport_name'),
                    "start_time": w.get('start'),
                    "end_time": w.get('end'),
                    "avg_heart_rate": score.get('average_heart_rate', 0),
                    "calories": round(kj / 4.184) if kj else 0,
                    "distance_meter": score.get('distance_meter', 0)
                }
                save_workout_idempotent(workout_data)
                all_processed += 1
            
            next_token = data.get('next_token')
            if next_token:
                params['nextToken'] = next_token  
            else:
                next_token = None 
        else:
            print(f"Error {response.status_code}: {response.text}")
            break
            
    print(f"Sync complete. Total processed: {all_processed}")

if __name__ == "__main__":
    get_workout_summary()