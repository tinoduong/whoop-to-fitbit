import json
import os
import requests
import sys
from datetime import datetime

def save_weight_data(entry):
    # Route data to the correct folder based on the measurement date
    log_date = datetime.strptime(entry["date"], "%Y-%m-%d")
    year_str = log_date.strftime("%Y")
    month_str = log_date.strftime("%m")
    
    base_dir = os.path.join("fitbit-data", year_str, month_str)
    file_path = os.path.join(base_dir, f"{month_str}.json")
    
    os.makedirs(base_dir, exist_ok=True)
    
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            data = json.load(f)
    else:
        data = {"weight": []}
    
    # Idempotency: Use logId to prevent duplicates
    new_log_id = entry.get("logId")
    if any(item.get("logId") == new_log_id for item in data["weight"]):
        return False 
    
    data["weight"].append(entry)
    data["weight"].sort(key=lambda x: x["date"])
    
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=4)
    return True

def fetch_data(start_date_arg=None):
    with open(os.path.join("meta-data", "config.json"), 'r') as f:
        config = json.load(f)
    
    token = config.get('access_token')
    headers = {"Authorization": f"Bearer {token}"}
    
    # --- INPUT VALIDATION ---
    if start_date_arg:
        # If user provides YYYY-MM, assume the 1st of that month
        if len(start_date_arg) == 7:
            start_date_arg = f"{start_date_arg}-01"
        
        # Final check to ensure it's the right length for Fitbit
        if len(start_date_arg) != 10:
            print("Error: Please provide date as YYYY-MM or YYYY-MM-DD")
            return

        today_str = datetime.now().strftime("%Y-%m-%d")
        url = f"https://api.fitbit.com/1/user/-/body/log/weight/date/{start_date_arg}/{today_str}.json"
        print(f"Backfilling range: {start_date_arg} to {today_str}...")
    else:
        # Default: Just today
        url = "https://api.fitbit.com/1/user/-/body/log/weight/date/today.json"
        print("Fetching today's weight only...")

    res = requests.get(url, headers=headers)
    
    if res.status_code == 200:
        logs = res.json().get("weight", [])
        if not logs:
            print("No weight logs found for this period.")
            return

        added_count = 0
        for entry in logs:
            if save_weight_data(entry):
                added_count += 1
        print(f"Done! Processed {len(logs)} logs. Added {added_count} new entries.")
            
    elif res.status_code == 401:
        print("Token expired! Please run 'python3 auth_manager.py' first.")
    else:
        print(f"API Error {res.status_code}: {res.text}")

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    fetch_data(arg)