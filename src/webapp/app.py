#!/usr/bin/env python3
"""
Fitness Dashboard Web App
Serves data from fitbit-data and whoop-data JSON files
"""

import json
import os
import sys
import glob
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Allow importing from the src directory (where fitbit_add_meal.py lives)
SRC_DIR = BASE_DIR
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)
FITBIT_DATA_DIR = os.path.join(BASE_DIR, "fitbit-data")
WHOOP_DATA_DIR = os.path.join(BASE_DIR, "whoop-data")
WEBAPP_DIR = os.path.dirname(os.path.abspath(__file__))

GOALS_FILE = os.path.join(WEBAPP_DIR, "goals.json")



def load_goals():
    if os.path.exists(GOALS_FILE):
        with open(GOALS_FILE) as f:
            return json.load(f)
    return {"target_weight": None, "target_fat": None, "daily_calorie_goal": 2000}


def save_goals(goals):
    with open(GOALS_FILE, "w") as f:
        json.dump(goals, f, indent=2)


def load_all_workouts():
    """Load all whoop workout data across all months."""
    workouts = []
    pattern = os.path.join(WHOOP_DATA_DIR, "**", "*.json")
    for filepath in sorted(glob.glob(pattern, recursive=True)):
        with open(filepath) as f:
            data = json.load(f)
            workouts.extend(data)
    return workouts


def load_all_weight():
    """Load all weight data from fitbit weight files."""
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
    """Load all meal data from fitbit meals files."""
    meals = []
    pattern = os.path.join(FITBIT_DATA_DIR, "**", "*-meals.json")
    for filepath in sorted(glob.glob(pattern, recursive=True)):
        with open(filepath) as f:
            data = json.load(f)
            meals.extend(data)
    meals.sort(key=lambda x: x["date"])
    return meals


class FitnessHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default logging

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
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/goals":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            goals = json.loads(body)
            save_goals(goals)
            self.send_json({"status": "ok"})

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

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


if __name__ == "__main__":
    port = 8080
    server = HTTPServer(("localhost", port), FitnessHandler)
    print(f"Fitness Dashboard running at http://localhost:{port}")
    server.serve_forever()