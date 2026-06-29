import json
import os
import requests
import sys
from datetime import datetime
from google_token_manager import get_headers
from logger import get_logger

log = get_logger("fitbit_load_store_weight")

BASE_URL = "https://health.googleapis.com/v4"


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


def parse_data_point(dp):
    weight_data = dp.get("weight", {})
    weight_grams = weight_data.get("weightGrams")
    if weight_grams is None:
        return None

    weight_kg = round(weight_grams / 1000, 1)
    sample_time = weight_data.get("sampleTime", {})
    civil_date = sample_time.get("civilTime", {}).get("date", {})
    date_str = f"{civil_date.get('year'):04d}-{civil_date.get('month'):02d}-{civil_date.get('day'):02d}"

    # Extract the numeric ID from the resource name for dedup compatibility with old Fitbit entries
    name = dp.get("name", "")
    log_id = int(name.split("/")[-1]) if name.split("/")[-1].isdigit() else name

    return {
        "date": date_str,
        "weight": weight_kg,
        "logId": log_id,
    }


def fetch_data(start_date_arg=None):
    headers = get_headers()

    if start_date_arg:
        if len(start_date_arg) == 7:
            start_date_arg = f"{start_date_arg}-01"
        if len(start_date_arg) != 10:
            log.error("Invalid date format. Use YYYY-MM or YYYY-MM-DD.")
            return
        today_str = datetime.now().strftime("%Y-%m-%d")
        date_filter = (
            f'weight.sample_time.civil_time >= "{start_date_arg}" AND '
            f'weight.sample_time.civil_time <= "{today_str}"'
        )
        log.info(f"Fetching weight data from {start_date_arg} to {today_str}...")
    else:
        today_str = datetime.now().strftime("%Y-%m-%d")
        date_filter = f'weight.sample_time.civil_time >= "{today_str}"'
        log.info("Fetching today's weight data...")

    url = f"{BASE_URL}/users/me/dataTypes/weight/dataPoints"
    res = requests.get(url, headers=headers, params={"filter": date_filter})

    if res.status_code == 200:
        data_points = res.json().get("dataPoints", [])
        if not data_points:
            log.info("No weight logs found for this period.")
            return

        added_count = 0
        skipped_dup_count = 0

        for dp in data_points:
            entry = parse_data_point(dp)
            if not entry:
                continue
            if save_weight_data(entry):
                added_count += 1
                log.info(f"Saved weight entry: {entry['date']} | {entry['weight']} kg")
            else:
                skipped_dup_count += 1
                log.debug(f"Skipped duplicate weight entry: {entry['date']} | logId={entry['logId']}")

        log.info(
            f"Weight sync complete. Processed: {len(data_points)} | "
            f"Added: {added_count} | "
            f"Skipped (duplicate): {skipped_dup_count}"
        )

    elif res.status_code == 401:
        log.error("Google Health API returned 401 Unauthorized. Run: python google_token_manager.py")
    else:
        log.error(f"Google Health API error ({res.status_code}): {res.text}")

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    fetch_data(arg)