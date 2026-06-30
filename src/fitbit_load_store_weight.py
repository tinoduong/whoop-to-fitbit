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
    existing = next((item for item in data["weight"] if item.get("logId") == new_log_id), None)
    if existing is not None:
        if "fat" in entry and "fat" not in existing:
            existing["fat"] = entry["fat"]
            with open(file_path, 'w') as f:
                json.dump(data, f, indent=4)
            return "updated"
        return False

    data["weight"].append(entry)
    data["weight"].sort(key=lambda x: x["date"])

    with open(file_path, 'w') as f:
        json.dump(data, f, indent=4)
    return True


def _extract_log_id(name):
    part = name.split("/")[-1]
    return int(part) if part.isdigit() else part


def _extract_civil_date(sample_time):
    civil_date = sample_time.get("civilTime", {}).get("date", {})
    return f"{civil_date.get('year'):04d}-{civil_date.get('month'):02d}-{civil_date.get('day'):02d}"


def fetch_body_fat(headers, date_filter_prefix, start_date_arg, today_str):
    if start_date_arg:
        fat_filter = (
            f'body_fat.sample_time.civil_time >= "{start_date_arg}" AND '
            f'body_fat.sample_time.civil_time < "{today_str}"'
        )
    else:
        fat_filter = f'body_fat.sample_time.civil_time >= "{today_str}"'

    url = f"{BASE_URL}/users/me/dataTypes/body-fat/dataPoints"
    res = requests.get(url, headers=headers, params={"filter": fat_filter})
    if res.status_code != 200:
        log.warning(f"Could not fetch body fat data ({res.status_code}): {res.text}")
        return {}

    fat_by_log_id = {}
    for dp in res.json().get("dataPoints", []):
        log_id = _extract_log_id(dp.get("name", ""))
        pct = dp.get("bodyFat", {}).get("percentage")
        if pct is not None:
            fat_by_log_id[log_id] = round(pct, 3)
    return fat_by_log_id


def parse_data_point(dp, fat_by_log_id=None):
    weight_data = dp.get("weight", {})
    weight_grams = weight_data.get("weightGrams")
    if weight_grams is None:
        return None

    weight_kg = round(weight_grams / 1000, 1)
    date_str = _extract_civil_date(weight_data.get("sampleTime", {}))
    log_id = _extract_log_id(dp.get("name", ""))

    entry = {
        "date": date_str,
        "weight": weight_kg,
        "logId": log_id,
    }

    if fat_by_log_id and log_id in fat_by_log_id:
        entry["fat"] = fat_by_log_id[log_id]

    return entry


def fetch_data(start_date_arg=None):
    headers = get_headers()

    from datetime import timedelta
    tomorrow_str = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    if start_date_arg:
        if len(start_date_arg) == 7:
            start_date_arg = f"{start_date_arg}-01"
        if len(start_date_arg) != 10:
            log.error("Invalid date format. Use YYYY-MM or YYYY-MM-DD.")
            return
        today_str = tomorrow_str
        date_filter = (
            f'weight.sample_time.civil_time >= "{start_date_arg}" AND '
            f'weight.sample_time.civil_time < "{today_str}"'
        )
        log.info(f"Fetching weight data from {start_date_arg} to today...")
    else:
        today_str = datetime.now().strftime("%Y-%m-%d")
        date_filter = f'weight.sample_time.civil_time >= "{today_str}"'
        log.info("Fetching today's weight data...")

    fat_by_log_id = fetch_body_fat(headers, date_filter, start_date_arg, tomorrow_str if start_date_arg else today_str)

    url = f"{BASE_URL}/users/me/dataTypes/weight/dataPoints"
    res = requests.get(url, headers=headers, params={"filter": date_filter})

    if res.status_code == 200:
        data_points = res.json().get("dataPoints", [])
        if not data_points:
            log.info("No weight logs found for this period.")
            return

        added_count = 0
        updated_count = 0
        skipped_dup_count = 0

        for dp in data_points:
            entry = parse_data_point(dp, fat_by_log_id)
            if not entry:
                continue
            result = save_weight_data(entry)
            fat_str = f" | {entry['fat']}% fat" if entry.get("fat") is not None else ""
            if result is True:
                added_count += 1
                log.info(f"Saved weight entry: {entry['date']} | {entry['weight']} kg{fat_str}")
            elif result == "updated":
                updated_count += 1
                log.info(f"Updated fat for: {entry['date']} | {entry['fat']}%")
            else:
                skipped_dup_count += 1
                log.debug(f"Skipped duplicate weight entry: {entry['date']} | logId={entry['logId']}")

        log.info(
            f"Weight sync complete. Processed: {len(data_points)} | "
            f"Added: {added_count} | Updated: {updated_count} | "
            f"Skipped (duplicate): {skipped_dup_count}"
        )

    elif res.status_code == 401:
        log.error("Google Health API returned 401 Unauthorized. Run: python google_token_manager.py")
    else:
        log.error(f"Google Health API error ({res.status_code}): {res.text}")

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    fetch_data(arg)