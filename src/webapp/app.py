#!/usr/bin/env python3
"""
Fitness Dashboard Web App
Serves data from fitbit-data and whoop-data JSON files
"""

import json
import os
import sys
import glob
import re
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
from urllib.parse import urlparse, parse_qs
from datetime import datetime, date, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SRC_DIR = BASE_DIR
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

FITBIT_DATA_DIR = os.path.join(BASE_DIR, "fitbit-data")
WHOOP_DATA_DIR = os.path.join(BASE_DIR, "whoop-data")
WEBAPP_DIR = os.path.dirname(os.path.abspath(__file__))
GOALS_DATA_DIR = os.path.join(BASE_DIR, "goal-data", "goals")
REPORTS_DATA_DIR = os.path.join(BASE_DIR, "goal-data", "reports")
META_DATA_DIR = os.path.join(BASE_DIR, "meta-data")

os.makedirs(GOALS_DATA_DIR, exist_ok=True)
os.makedirs(REPORTS_DATA_DIR, exist_ok=True)

_sync_lock = threading.Lock()
_sync_state = {"running": False, "last_status": None, "last_run": None, "last_error": None}


# ===== GOALS =====

def load_goals_meta():
    meta_file = os.path.join(GOALS_DATA_DIR, "meta.json")
    if os.path.exists(meta_file):
        with open(meta_file) as f:
            return json.load(f)
    return {"dob": None, "height_in": None, "sex": "male"}


def save_goals_meta(meta):
    meta_file = os.path.join(GOALS_DATA_DIR, "meta.json")
    with open(meta_file, "w") as f:
        json.dump(meta, f, indent=2)


def load_all_goal_files():
    goal_list = []
    pattern = os.path.join(GOALS_DATA_DIR, "goal_*.json")
    for filepath in sorted(glob.glob(pattern)):
        with open(filepath) as f:
            goal_list.append(json.load(f))
    goal_list.sort(key=lambda g: g.get("saved_date", ""))
    return goal_list


def next_goal_id():
    pattern = os.path.join(GOALS_DATA_DIR, "goal_*.json")
    files = glob.glob(pattern)
    ids = []
    for f in files:
        m = re.search(r'goal_(\d+)_', os.path.basename(f))
        if m:
            ids.append(int(m.group(1)))
    return max(ids) + 1 if ids else 1


def load_goals():
    meta = load_goals_meta()
    goal_list = load_all_goal_files()
    return {
        "dob": meta.get("dob"),
        "height_in": meta.get("height_in"),
        "sex": meta.get("sex", "male"),
        "goals": goal_list,
    }


def save_goals(goals_data):
    """Save meta fields and upsert the latest goal snapshot as an individual file."""
    meta = {
        "dob": goals_data.get("dob"),
        "height_in": goals_data.get("height_in"),
        "sex": goals_data.get("sex", "male"),
    }
    save_goals_meta(meta)

    goal_list = goals_data.get("goals", [])
    if not goal_list:
        return

    new_snapshot = max(goal_list, key=lambda g: g.get("saved_date", ""))

    # If this snapshot already has an id, update the existing file
    if "id" in new_snapshot:
        goal_id = new_snapshot["id"]
        pattern = os.path.join(GOALS_DATA_DIR, f"goal_{goal_id}_*.json")
        existing = glob.glob(pattern)
        if existing:
            with open(existing[0], "w") as f:
                json.dump(new_snapshot, f, indent=2)
            return

    # New snapshot — assign next id and write a new file
    goal_id = next_goal_id()
    new_snapshot["id"] = goal_id
    saved_date = new_snapshot.get("saved_date", date.today().isoformat())
    filename = f"goal_{goal_id}_{saved_date}.json"
    filepath = os.path.join(GOALS_DATA_DIR, filename)
    with open(filepath, "w") as f:
        json.dump(new_snapshot, f, indent=2)


def extend_goal(goal_id, new_end_date):
    pattern = os.path.join(GOALS_DATA_DIR, f"goal_{goal_id}_*.json")
    files = glob.glob(pattern)
    if not files:
        return False
    with open(files[0]) as f:
        goal = json.load(f)
    goal["goal_date"] = new_end_date
    with open(files[0], "w") as f:
        json.dump(goal, f, indent=2)
    return True


# ===== DATA LOADERS =====

def load_all_workouts():
    workouts = []
    pattern = os.path.join(WHOOP_DATA_DIR, "**", "*.json")
    for filepath in sorted(glob.glob(pattern, recursive=True)):
        with open(filepath) as f:
            data = json.load(f)
            workouts.extend(data)
    return workouts


def load_all_weight():
    weights = []
    pattern = os.path.join(FITBIT_DATA_DIR, "**", "*-weight.json")
    for filepath in sorted(glob.glob(pattern, recursive=True)):
        with open(filepath) as f:
            data = json.load(f)
            if "weight" in data:
                weights.extend(data["weight"])
    weights.sort(key=lambda x: x["date"])
    return weights


def load_all_meals():
    meals = []
    pattern = os.path.join(FITBIT_DATA_DIR, "**", "*-meals.json")
    for filepath in sorted(glob.glob(pattern, recursive=True)):
        with open(filepath) as f:
            data = json.load(f)
            meals.extend(data)
    meals.sort(key=lambda x: x["date"])
    return meals


# ===== REPORTS =====

def load_reports_list():
    reports = []
    pattern = os.path.join(REPORTS_DATA_DIR, "report_*.json")
    for filepath in sorted(glob.glob(pattern)):
        with open(filepath) as f:
            reports.append(json.load(f))
    return reports


def load_report(goal_id):
    pattern = os.path.join(REPORTS_DATA_DIR, f"report_goal{goal_id}_*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        return None
    with open(files[-1]) as f:
        return json.load(f)


def _rolling_avg_bf(weight_data, center_date_str, window=7):
    try:
        cd = date.fromisoformat(center_date_str)
    except ValueError:
        return None
    half = window // 2
    start_str = (cd - timedelta(days=half)).isoformat()
    end_str = (cd + timedelta(days=half)).isoformat()
    nearby = [w for w in weight_data if start_str <= w["date"] <= end_str and w.get("fat") is not None]
    if not nearby:
        return None
    return sum(w["fat"] for w in nearby) / len(nearby)


def generate_report_data(start_date, end_date, goal_id=None):
    target_weight = None
    target_fat = None
    calorie_target = 2000
    protein_target = 135

    if goal_id is not None:
        pattern = os.path.join(GOALS_DATA_DIR, f"goal_{goal_id}_*.json")
        files = glob.glob(pattern)
        if not files:
            return None, "Goal not found"
        with open(files[0]) as f:
            goal = json.load(f)
        if not start_date:
            start_date = goal.get("saved_date", "")
        if not end_date:
            end_date = goal.get("goal_date", date.today().isoformat())
        target_weight = goal.get("target_weight")
        target_fat = goal.get("target_fat")
        calorie_target = goal.get("saved_target_intake") or goal.get("daily_calorie_goal", 2000)
        protein_target = goal.get("saved_protein_goal", 135)

    if not start_date or not end_date:
        return None, "start_date and end_date are required"

    protein_floor = max(100, int(protein_target * 0.8))

    all_weight = load_all_weight()
    all_meals = load_all_meals()
    all_workouts = load_all_workouts()

    weight_data = [w for w in all_weight if start_date <= w["date"] <= end_date]
    meals_data = [m for m in all_meals if start_date <= m["date"] <= end_date]
    workouts_data = [w for w in all_workouts if start_date <= w["start_time"][:10] <= end_date]

    if not weight_data:
        return None, "No weight data found for goal period"

    # Index by date
    meals_by_date = {}
    for meal in meals_data:
        d = meal["date"]
        if d not in meals_by_date:
            meals_by_date[d] = {"calories": 0, "protein": 0}
        meals_by_date[d]["calories"] += meal.get("total_calories", 0)
        meals_by_date[d]["protein"] += meal.get("total_protein", 0)

    workouts_by_date = {}
    for w in workouts_data:
        d = w["start_time"][:10]
        workouts_by_date.setdefault(d, []).append(w)

    weight_by_date = {w["date"]: w for w in weight_data}

    # Build daily records
    try:
        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)
    except ValueError:
        return None, "Invalid date range"

    daily_records = []
    current = sd
    while current <= ed:
        ds = current.isoformat()
        w = weight_by_date.get(ds)
        m = meals_by_date.get(ds)
        wos = workouts_by_date.get(ds, [])

        daily_strain = round(sum(wo.get("strain", 0) for wo in wos), 2) if wos else None

        daily_records.append({
            "date": ds,
            "weight_lbs": round(w["weight"] * 2.20462, 1) if w else None,
            "bf_pct": round(w["fat"], 2) if w and w.get("fat") is not None else None,
            "calories": round(m["calories"]) if m else None,
            "protein": round(m["protein"], 1) if m else None,
            "workout_strain": daily_strain,
        })
        current += timedelta(days=1)

    total_days = len(daily_records)

    # Weight stats
    weights_with_data = [r for r in daily_records if r["weight_lbs"] is not None]
    start_weight = weights_with_data[0]["weight_lbs"] if weights_with_data else None
    end_weight = weights_with_data[-1]["weight_lbs"] if weights_with_data else None

    # BF% with 7-day rolling averages
    start_bf = _rolling_avg_bf(weight_data, start_date)
    end_bf = _rolling_avg_bf(weight_data, end_date)

    # Lean mass
    start_lean = round(start_weight * (1 - start_bf / 100), 1) if start_weight and start_bf else None
    end_lean = round(end_weight * (1 - end_bf / 100), 1) if end_weight and end_bf else None

    # Calorie adherence
    logged_days = [r for r in daily_records if r["calories"] is not None]
    logged_pct = round(len(logged_days) / total_days * 100) if total_days else 0
    avg_calories = round(sum(r["calories"] for r in logged_days) / len(logged_days)) if logged_days else None

    # Protein adherence
    protein_days = [r for r in daily_records if r["protein"] is not None]
    avg_protein = round(sum(r["protein"] for r in protein_days) / len(protein_days), 1) if protein_days else None
    days_on_target = sum(1 for r in protein_days if r["protein"] >= protein_target)
    days_on_floor = sum(1 for r in protein_days if r["protein"] >= protein_floor)
    protein_target_pct = round(days_on_target / len(protein_days) * 100) if protein_days else 0
    protein_floor_pct = round(days_on_floor / len(protein_days) * 100) if protein_days else 0

    # Workout stats
    workout_days = [r for r in daily_records if r["workout_strain"] is not None]
    total_sessions = len(workout_days)
    weeks = max(1, total_days / 7)
    avg_sessions_per_week = round(total_sessions / weeks, 1)
    avg_strain = round(sum(r["workout_strain"] for r in workout_days) / total_sessions, 2) if workout_days else None

    sport_counts = {}
    for w in workouts_data:
        sport = w.get("sport_name", "unknown")
        sport_counts[sport] = sport_counts.get(sport, 0) + 1

    # Weekly summaries
    weekly_summaries = []
    week_start = sd
    while week_start <= ed:
        week_end = week_start + timedelta(days=6)
        ws_str = week_start.isoformat()
        we_str = min(week_end, ed).isoformat()
        week_records = [r for r in daily_records if ws_str <= r["date"] <= we_str]
        if week_records:
            wt = [r for r in week_records if r["weight_lbs"] is not None]
            mc = [r for r in week_records if r["calories"] is not None]
            mp = [r for r in week_records if r["protein"] is not None]
            ws = [r for r in week_records if r["workout_strain"] is not None]
            mid = (week_start + timedelta(days=3)).isoformat()
            bf_mid = _rolling_avg_bf(weight_data, mid)
            weekly_summaries.append({
                "week_start": ws_str,
                "avg_weight_lbs": round(sum(r["weight_lbs"] for r in wt) / len(wt), 1) if wt else None,
                "bf_rolling_avg_pct": round(bf_mid, 2) if bf_mid else None,
                "avg_calories": round(sum(r["calories"] for r in mc) / len(mc)) if mc else None,
                "avg_protein": round(sum(r["protein"] for r in mp) / len(mp), 1) if mp else None,
                "sessions": len(ws),
            })
        week_start += timedelta(days=7)

    # Goals met
    weight_lost = round(start_weight - end_weight, 1) if start_weight and end_weight else None
    weight_target_loss = round(start_weight - target_weight, 1) if start_weight and target_weight else None
    bf_lost = round(start_bf - end_bf, 2) if start_bf and end_bf else None

    goals_total = sum(1 for x in [target_weight, target_fat] if x is not None)
    goals_met = 0
    if weight_lost is not None and weight_target_loss is not None and weight_lost >= weight_target_loss:
        goals_met += 1
    if end_bf is not None and target_fat is not None and end_bf <= target_fat:
        goals_met += 1

    stats = {
        "start_weight_lbs": start_weight,
        "end_weight_lbs": end_weight,
        "weight_lost_lbs": weight_lost,
        "weight_target_loss_lbs": weight_target_loss,
        "start_bf_pct": round(start_bf, 2) if start_bf else None,
        "end_bf_pct": round(end_bf, 2) if end_bf else None,
        "bf_lost_pct": bf_lost,
        "bf_target_pct": target_fat,
        "start_lean_mass_lbs": start_lean,
        "end_lean_mass_lbs": end_lean,
        "avg_daily_calories": avg_calories,
        "calorie_target": calorie_target,
        "logged_days_pct": logged_pct,
        "avg_daily_protein": avg_protein,
        "protein_target": protein_target,
        "protein_floor": protein_floor,
        "protein_target_pct": protein_target_pct,
        "protein_floor_pct": protein_floor_pct,
        "total_workout_sessions": total_sessions,
        "avg_sessions_per_week": avg_sessions_per_week,
        "avg_strain": avg_strain,
        "sport_breakdown": sport_counts,
        "goal_period_days": total_days,
        "goals_met": goals_met,
        "goals_total": goals_total,
    }

    payload = {
        "goal_params": {
            "start_date": start_date,
            "end_date": end_date,
            "target_weight_lbs": target_weight,
            "target_bf_pct": target_fat,
            "calorie_target": calorie_target,
            "protein_target": protein_target,
            "protein_floor": protein_floor,
        },
        "aggregated_stats": stats,
        "daily_records": daily_records,
        "weekly_summaries": weekly_summaries,
    }

    api_key = _load_anthropic_key()
    if not api_key:
        return None, "Anthropic API key not found"

    system_prompt = (
        "You are a data-driven fitness analyst. Analyze the user's goal period data and produce a structured report.\n\n"
        "Frame the analysis causally: treat workouts, calories, and protein as input metrics; "
        "weight and body recomposition as output metrics.\n\n"
        "Instructions:\n"
        "- Identify periods where output metrics shifted meaningfully, then look back 3-7 days at inputs to find what changed.\n"
        "- Flag notable pattern shifts with approximate dates (e.g. 'around week 4, protein intake increased from X to Y "
        "and coincided with accelerated weight loss starting ~5 days later').\n"
        "- Use 7-day rolling average BF% as the BF signal. Explicitly note that BF% conclusions are directional "
        "due to limited weekly datapoints.\n"
        "- Use daily weight for weight trend analysis.\n"
        "- Only draw conclusions the data actually supports — no generic fitness advice.\n"
        "- Hedge BF% conclusions; be more definitive on weight conclusions.\n\n"
        "Generate a written report with these exact sections (use plain labels, not markdown headers):\n"
        "1. Goal Outcome — state 'X of Y goals met', then the summary line:\n"
        "   'Goal Met: X of Y | Weight: lost X.X lbs (X.X lbs vs X.X lbs target) MET/MISSED | "
        "Body Fat: lost X.X% (X.X% vs X.X% target) MET/MISSED'\n"
        "2. The Numbers — stat block: start/end weight, BF%, lean mass, deficit adherence, protein adherence\n"
        "3. Projection (if goals missed) — additional weeks needed at current rate; note fat loss is rarely linear\n"
        "4. What Drove Results — causal input→output analysis with approximate dates\n"
        "5. What Held You Back — honest gap analysis where the plan broke down\n"
        "6. Meal Patterns — recurring issues, logging gaps, high-cal day clustering\n"
        "7. Workout Patterns — consistency, strain trends, sport mix\n"
        "8. Lessons for Next Goal — concrete and specific, derived only from this data"
    )

    user_message = (
        "Here is the fitness goal data to analyze:\n\n"
        + json.dumps(payload, indent=2)
        + "\n\nGenerate the full report as plain text."
    )

    try:
        report_text = _call_claude(api_key, system_prompt, user_message)
    except Exception as e:
        return None, str(e)

    summary = {
        "goals_met": goals_met,
        "goals_total": goals_total,
        "weight_lost": weight_lost,
        "weight_target": weight_target_loss,
        "bf_lost": bf_lost,
        "bf_target": target_fat,
        "end_bf_pct": round(end_bf, 2) if end_bf is not None else None,
    }

    today_str = date.today().isoformat()
    report_data = {
        "goal_id": str(goal_id),
        "generated_at": today_str,
        "goal_start": start_date,
        "goal_end": end_date,
        "summary": summary,
        "report": report_text,
    }

    suffix = f"goal{goal_id}" if goal_id is not None else f"{start_date}_{end_date}"
    report_path = os.path.join(REPORTS_DATA_DIR, f"report_{suffix}_{today_str}.json")
    with open(report_path, "w") as f:
        json.dump(report_data, f, indent=2)

    return report_data, None


def _load_anthropic_key():
    key_file = os.path.join(META_DATA_DIR, "anthropic.json")
    if os.path.exists(key_file):
        with open(key_file) as f:
            return json.load(f).get("api_key")
    return None


def _call_claude(api_key, system_prompt, user_message):
    url = "https://api.anthropic.com/v1/messages"
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 4096,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body)
    req.add_header("Content-Type", "application/json")
    req.add_header("x-api-key", api_key)
    req.add_header("anthropic-version", "2023-06-01")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["content"][0]["text"]
    except urllib.error.HTTPError as e:
        raise Exception(f"Claude API error {e.code}: {e.read().decode('utf-8')}")


# ===== HTTP HANDLER =====

class FitnessHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, filepath, content_type):
        with open(filepath, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "/index.html":
            self.send_file(os.path.join(WEBAPP_DIR, "index.html"), "text/html")
        elif path == "/style.css":
            self.send_file(os.path.join(WEBAPP_DIR, "style.css"), "text/css")
        elif path.endswith(".js"):
            js_file = os.path.join(WEBAPP_DIR, os.path.basename(path))
            if os.path.exists(js_file):
                self.send_file(js_file, "application/javascript")
            else:
                self.send_response(404)
                self.end_headers()
        elif path == "/api/workouts":
            self.send_json(load_all_workouts())
        elif path == "/api/weight":
            self.send_json(load_all_weight())
        elif path == "/api/meals":
            self.send_json(load_all_meals())
        elif path == "/api/goals":
            self.send_json(load_goals())
        elif path == "/api/reports":
            self.send_json(load_reports_list())
        elif re.match(r'^/api/reports/\d+$', path):
            goal_id = path.split('/')[-1]
            report = load_report(goal_id)
            if report:
                self.send_json(report)
            else:
                self.send_json({"error": "Report not found"}, status=404)
        elif path == "/api/sync/status":
            self.send_json(_sync_state)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/goals":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            goals_data = json.loads(body)
            save_goals(goals_data)
            self.send_json({"status": "ok"})

        elif path == "/api/reports/generate":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)
            goal_id = data.get("goal_id")
            start_date = data.get("start_date")
            end_date = data.get("end_date")
            if not start_date or not end_date:
                self.send_json({"status": "error", "message": "start_date and end_date are required"}, status=400)
                return
            report_data, error = generate_report_data(start_date, end_date, goal_id=goal_id)
            if error:
                self.send_json({"status": "error", "message": error}, status=500)
            else:
                self.send_json({"status": "ok", "report": report_data})

        elif path == "/api/sync":
            with _sync_lock:
                if _sync_state["running"]:
                    self.send_json({"status": "already_running"})
                    return
                _sync_state["running"] = True

            def do_sync():
                try:
                    orig_dir = os.getcwd()
                    os.chdir(SRC_DIR)
                    try:
                        import scheduler
                        ok = scheduler.run_sync()
                        _sync_state["last_status"] = "ok" if ok else "error"
                    finally:
                        os.chdir(orig_dir)
                except Exception as e:
                    import traceback
                    _sync_state["last_status"] = f"error: {e}"
                    _sync_state["last_error"] = traceback.format_exc()
                finally:
                    _sync_state["last_run"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    _sync_state["running"] = False

            threading.Thread(target=do_sync, daemon=True).start()
            self.send_json({"status": "started"})

        elif path == "/api/log-meal":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            payload = json.loads(body)
            user_input = payload.get("input", "").strip()
            if not user_input:
                self.send_json({"status": "error", "message": "No input provided."}, status=400)
                return
            try:
                orig_dir = os.getcwd()
                os.chdir(SRC_DIR)
                try:
                    import fitbit_add_meal
                    fitbit_add_meal.process(user_input)
                finally:
                    os.chdir(orig_dir)
                self.send_json({"status": "ok"})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)}, status=500)

        else:
            self.send_response(404)
            self.end_headers()

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if re.match(r'^/api/goals/\d+/extend$', path):
            parts = path.split('/')
            goal_id = parts[3]
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)
            new_end_date = data.get("new_end_date")
            if not new_end_date:
                self.send_json({"status": "error", "message": "new_end_date required"}, status=400)
                return
            if extend_goal(goal_id, new_end_date):
                self.send_json({"status": "ok"})
            else:
                self.send_json({"error": "Goal not found"}, status=404)
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


if __name__ == "__main__":
    port = 8080
    server = HTTPServer(("localhost", port), FitnessHandler)
    print(f"Fitness Dashboard running at http://localhost:{port}")
    server.serve_forever()
