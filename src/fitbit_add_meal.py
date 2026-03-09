import os
import json
import sys
import requests
from datetime import datetime
from fitbit_token_manager import get_valid_token
from logger import get_logger

log = get_logger("fitbit_log_meal")

ANTHROPIC_CONFIG_PATH = os.path.join("meta-data", "anthropic.json")

def load_anthropic_key():
    with open(ANTHROPIC_CONFIG_PATH, 'r') as f:
        return json.load(f)["api_key"]

ANTHROPIC_API_KEY = load_anthropic_key()
MEAL_TYPE_MAP = {
    "breakfast": 1,
    "morning snack": 2,
    "lunch": 3,
    "afternoon snack": 4,
    "dinner": 5,
    "snack": 4,
    "anytime": 7
}

# ─── Storage ────────────────────────────────────────────────────────────────

def get_meal_db_path(dt=None):
    if not dt:
        dt = datetime.now()
    year = dt.strftime("%Y")
    month = dt.strftime("%m")
    folder = os.path.join("fitbit_data", year, month)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, f"{month}-meals.json")

def load_meal_db(path):
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    return []

def save_meal_db(path, db):
    with open(path, 'w') as f:
        json.dump(db, f, indent=4)

def find_meal_record(db, meal_type, date_str):
    """Find the most recent meal record matching meal_type and date."""
    matches = [
        (i, r) for i, r in enumerate(db)
        if r["date"] == date_str and r["meal_type"].lower() == meal_type.lower()
    ]
    if not matches:
        return None, None
    return matches[-1]

# ─── Claude Parsing ─────────────────────────────────────────────────────────

def call_claude(prompt, max_tokens=1000):
    """Generic Claude API call. Returns text content or None on failure."""
    if not ANTHROPIC_API_KEY:
        log.error("ANTHROPIC_API_KEY not set.")
        sys.exit(1)

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    body = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}]
    }

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=body,
            timeout=30
        )
        resp.raise_for_status()
        raw = resp.json()["content"][0]["text"].strip()
        return raw.replace("```json", "").replace("```", "").strip()
    except requests.exceptions.Timeout:
        log.error("Claude API request timed out.")
    except requests.exceptions.RequestException as e:
        log.error(f"Claude API request failed: {e}")
    except (KeyError, IndexError) as e:
        log.error(f"Unexpected Claude API response structure: {e}")
    return None

def parse_intent_with_claude(user_input):
    """Determine intent (log vs update), meal type, date, and description."""
    today = datetime.now().strftime("%Y-%m-%d")
    prompt = f"""Today's date is {today}.

Parse this meal input and return ONLY a JSON object with these fields:
- intent: "log" for a new meal, "update" for amending an existing meal
- meal_type: one of "breakfast", "morning snack", "lunch", "afternoon snack", "dinner", "snack"
- date: the date in YYYY-MM-DD format (default to today if not specified)
- description: the full meal description (for "log" intent)
- amendment: for "update" intent, the additional or changed items in natural language (null for "log")

User input: "{user_input}"

Return ONLY valid JSON, no explanation, no markdown."""

    raw = call_claude(prompt, max_tokens=500)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        log.error(f"Failed to parse Claude intent response: {e}\nRaw: {raw}")
        return None

def parse_meal_with_claude(meal_description, meal_type):
    """Parse a meal description into structured food items with nutrition."""
    prompt = f"""Parse this meal description into a JSON array of food items with nutritional estimates.
Meal type: {meal_type}
Meal description: {meal_description}

Return ONLY a valid JSON array, no explanation, no markdown. Each item must have:
- foodName (string)
- calories (integer)
- protein (float, grams)
- totalCarbohydrate (float, grams)
- totalFat (float, grams)
- amount (float)
- unitId (integer, use 304 for serving)

Example:
[
  {{"foodName": "Grilled Chicken Breast", "calories": 165, "protein": 31.0, "totalCarbohydrate": 0.0, "totalFat": 3.6, "amount": 1, "unitId": 304}}
]"""

    raw = call_claude(prompt, max_tokens=1000)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        log.error(f"Failed to parse Claude meal response: {e}\nRaw: {raw}")
        return None

def merge_meal_description(existing_items, amendment):
    """Build a merged description from existing items + amendment for re-parsing."""
    existing_summary = ", ".join(
        f"{item.get('amount', 1)} {item['foodName']}" for item in existing_items
    )
    return f"{existing_summary}, {amendment}"

# ─── Fitbit API ──────────────────────────────────────────────────────────────

def upload_food_item(access_token, item, meal_type_id, date_str):
    """
    POST /1/user/-/foods/log.json
    Parameters are passed as query string per Fitbit API spec.
    Nutrition fields use Fitbit's documented parameter names.
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }

    # Required params
    params = {
        "foodName": item["foodName"],
        "calories": int(item["calories"]),
        "mealTypeId": meal_type_id,
        "unitId": item.get("unitId", 304),
        "amount": item.get("amount", 1),
        "date": date_str
    }

    # Optional nutrition params — Fitbit's documented field names
    if item.get("protein") is not None:
        params["protein(g)"] = round(item["protein"], 1)
    if item.get("totalCarbohydrate") is not None:
        params["totalCarbohydrate(g)"] = round(item["totalCarbohydrate"], 1)
    if item.get("totalFat") is not None:
        params["totalFat(g)"] = round(item["totalFat"], 1)

    log_id = None
    try:
        resp = requests.post(
            "https://api.fitbit.com/1/user/-/foods/log.json",
            headers=headers,
            params=params,
            timeout=15
        )
        success = resp.status_code in [200, 201]

        if success:
            try:
                data = resp.json()
                # Fitbit inconsistently returns loggedFood or logged_food
                food_log = data.get("foodLog") or data.get("food_log", {})
                log_id = food_log.get("logId") or food_log.get("log_id")
            except (ValueError, KeyError) as e:
                log.warning(f"Could not extract logId from response: {e}")

        return success, resp.status_code, resp.text, log_id

    except requests.exceptions.Timeout:
        log.error(f"Timeout uploading '{item['foodName']}'")
        return False, None, "Timeout", None
    except requests.exceptions.RequestException as e:
        log.error(f"Request error uploading '{item['foodName']}': {e}")
        return False, None, str(e), None

def delete_food_log(access_token, log_id):
    """DELETE /1/user/-/foods/log/{log-id}.json"""
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        resp = requests.delete(
            f"https://api.fitbit.com/1/user/-/foods/log/{log_id}.json",
            headers=headers,
            timeout=15
        )
        if resp.status_code == 204:
            return True
        log.warning(f"Delete returned unexpected status {resp.status_code} for logId {log_id}: {resp.text}")
        return False
    except requests.exceptions.Timeout:
        log.error(f"Timeout deleting logId {log_id}")
        return False
    except requests.exceptions.RequestException as e:
        log.error(f"Request error deleting logId {log_id}: {e}")
        return False

# ─── Core Logic ──────────────────────────────────────────────────────────────

def upload_items(access_token, items, meal_type_id, date_str):
    """Upload a list of parsed food items to Fitbit. Returns enriched item records."""
    results = []
    for item in items:
        success, status_code, response_text, log_id = upload_food_item(
            access_token, item, meal_type_id, date_str
        )
        item_record = {
            **item,
            "uploaded": success,
            "status_code": status_code,
            "log_id": log_id
        }
        if not success:
            item_record["error"] = response_text
            log.error(f"Failed to upload '{item['foodName']}': {status_code} {response_text}")
        else:
            log.info(f"Uploaded: {item['foodName']} — {item['calories']} kcal | {item.get('protein', 0)}g protein")
        results.append(item_record)
    return results

def build_meal_record(date_str, meal_type, meal_type_id, description, item_records, previous_record=None):
    total_cals = sum(i.get("calories", 0) for i in item_records if i["uploaded"])
    total_protein = sum(i.get("protein", 0) for i in item_records if i["uploaded"])

    record = {
        "logged_at": datetime.now().isoformat(),
        "date": date_str,
        "meal_type": meal_type,
        "meal_type_id": meal_type_id,
        "raw_description": description,
        "items": item_records,
        "total_calories": total_cals,
        "total_protein": round(total_protein, 1),
        "all_uploaded": all(i["uploaded"] for i in item_records),
        "amended": previous_record is not None
    }

    if previous_record:
        record["previous_version"] = {
            "logged_at": previous_record.get("logged_at"),
            "raw_description": previous_record.get("raw_description"),
            "total_calories": previous_record.get("total_calories"),
            "total_protein": previous_record.get("total_protein")
        }

    return record

# ─── Handlers ────────────────────────────────────────────────────────────────

def handle_log(access_token, meal_type, meal_type_id, description, date_str, db, db_path):
    log.info(f"Parsing meal with Claude: '{description}'")
    items = parse_meal_with_claude(description, meal_type)
    if not items:
        log.error("Meal parsing failed. Aborting.")
        return

    log.info(f"Parsed {len(items)} food items.")
    item_records = upload_items(access_token, items, meal_type_id, date_str)

    record = build_meal_record(date_str, meal_type, meal_type_id, description, item_records)
    db.append(record)
    save_meal_db(db_path, db)

    log.info(f"Meal saved to {db_path}")
    log.info(f"Total: {record['total_calories']} kcal | {record['total_protein']}g protein")

def handle_update(access_token, meal_type, meal_type_id, amendment, date_str, db, db_path):
    idx, existing = find_meal_record(db, meal_type, date_str)
    if existing is None:
        log.error(f"No existing {meal_type} found for {date_str}. Cannot update.")
        return

    log.info(f"Found existing {meal_type} for {date_str}. Deleting {len(existing['items'])} items from Fitbit...")

    for item in existing["items"]:
        if item.get("log_id"):
            deleted = delete_food_log(access_token, item["log_id"])
            if deleted:
                log.info(f"Deleted: {item['foodName']} (logId: {item['log_id']})")
            else:
                log.warning(f"Could not delete {item['foodName']} (logId: {item['log_id']})")
        else:
            log.warning(f"No logId stored for '{item['foodName']}' — skipping delete.")

    merged_description = merge_meal_description(existing["items"], amendment)
    log.info(f"Re-parsing merged meal: '{merged_description}'")
    items = parse_meal_with_claude(merged_description, meal_type)
    if not items:
        log.error("Meal parsing failed. Aborting update.")
        return

    log.info(f"Parsed {len(items)} food items.")
    item_records = upload_items(access_token, items, meal_type_id, date_str)

    record = build_meal_record(date_str, meal_type, meal_type_id, merged_description, item_records, previous_record=existing)
    db[idx] = record
    save_meal_db(db_path, db)

    log.info(f"Meal updated and saved to {db_path}")
    log.info(f"Total: {record['total_calories']} kcal | {record['total_protein']}g protein")

# ─── Main ────────────────────────────────────────────────────────────────────

def process(user_input):
    log.info(f"Input: '{user_input}'")

    intent_data = parse_intent_with_claude(user_input)
    if not intent_data:
        log.error("Could not parse intent. Aborting.")
        return

    intent = intent_data.get("intent", "log")
    meal_type = intent_data.get("meal_type", "dinner")
    date_str = intent_data.get("date", datetime.now().strftime("%Y-%m-%d"))
    description = intent_data.get("description", user_input)
    amendment = intent_data.get("amendment")

    meal_type_id = MEAL_TYPE_MAP.get(meal_type.lower(), 7)
    log_dt = datetime.strptime(date_str, "%Y-%m-%d")

    access_token = get_valid_token()
    if not access_token:
        log.error("Could not obtain Fitbit token. Aborting.")
        sys.exit(1)

    db_path = get_meal_db_path(log_dt)
    db = load_meal_db(db_path)

    if intent == "update":
        if not amendment:
            log.error("Update intent detected but no amendment description found.")
            return
        handle_update(access_token, meal_type, meal_type_id, amendment, date_str, db, db_path)
    else:
        handle_log(access_token, meal_type, meal_type_id, description, date_str, db, db_path)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Usage: python fitbit_log_meal.py "<natural language meal input>"')
        print()
        print('Examples:')
        print('  python fitbit_log_meal.py "dinner: 5oz grilled steak, half eggplant, 2 beers, 1 cup roasted potato"')
        print('  python fitbit_log_meal.py "update dinner today to include 2oz shrimp"')
        print('  python fitbit_log_meal.py "breakfast: oatmeal with banana and black coffee"')
        sys.exit(1)

    process(sys.argv[1])
