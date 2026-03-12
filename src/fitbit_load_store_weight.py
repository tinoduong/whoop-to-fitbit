import json
import os
import requests
import sys
from datetime import datetime
from fitbit_token_manager import get_valid_token
from logger import get_logger

log = get_logger("fitbit_load_store_weight")

def save_weight_data(entry):
    log_date = datetime.strptime(entry["date"], "%Y-%m-%d")
    year_str = log_date.strftime("%Y")
    month_str = log_date.strftime("%m")

    base_dir = os.path.join("fitbit-data", year_str, month_str)
    file_path = os.path.join(base_dir, f"{month_str}-weight.json")

    os.makedirs(base_dir, exist_ok=True)

    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            data = json.load(f)
    else:
        data = {"weight": []}

    new_log_id = entry.get("logId")
    if any(item.get("logId") == new_log_id for item in data["weight"]):
        return False

    data["weight"].append(entry)
    data["weight"].sort(key=lambda x: x["date"])

    with open(file_path, 'w') as f:
        json.dump(data, f, indent=4)
    return True

def fetch_data(start_date_arg=None):
    access_token = get_valid_token()
    if not access_token:
        log.error("Could not obtain a valid Fitbit token. Aborting.")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {access_token}"}

    if start_date_arg:
        if len(start_date_arg) == 7:
            start_date_arg = f"{start_date_arg}-01"

        if len(start_date_arg) != 10:
            log.error("Invalid date format. Use YYYY-MM or YYYY-MM-DD.")
            return

        today_str = datetime.now().strftime("%Y-%m-%d")
        url = f"https://api.fitbit.com/1/user/-/body/log/weight/date/{start_date_arg}/{today_str}.json"
        log.info(f"Fetching Fitbit weight data from {start_date_arg} to {today_str}...")
    else:
        url = "https://api.fitbit.com/1/user/-/body/log/weight/date/today.json"
        log.info("Fetching today's Fitbit weight data...")

    res = requests.get(url, headers=headers)

    if res.status_code == 200:
        logs = res.json().get("weight", [])
        if not logs:
            log.info("No weight logs found for this period.")
            return

        added_count = 0
        for entry in logs:
            if save_weight_data(entry):
                added_count += 1
                log.info(f"Saved weight entry: {entry.get('date')} | {entry.get('weight')} lbs")
            else:
                log.debug(f"Skipped duplicate weight entry: {entry.get('date')} | logId={entry.get('logId')}")

        log.info(f"Weight sync complete. Processed: {len(logs)} | Added: {added_count} | Skipped: {len(logs) - added_count}")

    elif res.status_code == 401:
        log.error("Fitbit API returned 401 Unauthorized. Token may be invalid.")
    else:
        log.error(f"Fitbit API error ({res.status_code}): {res.text}")

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    fetch_data(arg)
