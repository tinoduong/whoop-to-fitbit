"""
Tests for app.py: goals data structure, data loading, and HTTP routes.
Run with: python -m unittest tests/test_app.py -v
     or:  python -m unittest discover tests
"""

import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from http.server import HTTPServer

WEBAPP_DIR = os.path.join(os.path.dirname(__file__), '..', 'webapp')
sys.path.insert(0, WEBAPP_DIR)

import app as fitness_app

GOALS_DATA_DIR = fitness_app.GOALS_DATA_DIR
_TEST_PORT = 18765


# ── Helpers ───────────────────────────────────────────────────────────────────

def _backup_goals_dir():
    """Return a dict of filename → raw bytes for every file in GOALS_DATA_DIR."""
    snapshot = {}
    for fname in os.listdir(GOALS_DATA_DIR):
        fpath = os.path.join(GOALS_DATA_DIR, fname)
        if os.path.isfile(fpath):
            with open(fpath, 'rb') as f:
                snapshot[fname] = f.read()
    return snapshot


def _restore_goals_dir(snapshot):
    """Restore GOALS_DATA_DIR to the given snapshot, removing any extra files."""
    for fname in os.listdir(GOALS_DATA_DIR):
        fpath = os.path.join(GOALS_DATA_DIR, fname)
        if os.path.isfile(fpath) and fname not in snapshot:
            os.remove(fpath)
    for fname, data in snapshot.items():
        with open(os.path.join(GOALS_DATA_DIR, fname), 'wb') as f:
            f.write(data)


# ── 1. goals data structure ───────────────────────────────────────────────────

class TestGoalsData(unittest.TestCase):
    def setUp(self):
        self.goals = fitness_app.load_goals()

    def test_top_level_fields_present(self):
        for field in ('dob', 'height_in', 'sex', 'goals'):
            with self.subTest(field=field):
                self.assertIn(field, self.goals)

    def test_goals_is_list(self):
        self.assertIsInstance(self.goals['goals'], list)

    def test_goals_not_empty(self):
        self.assertGreater(len(self.goals['goals']), 0)

    def test_dob_format(self):
        import re
        self.assertRegex(self.goals['dob'], r'^\d{4}-\d{2}-\d{2}$',
                         'dob must be YYYY-MM-DD')

    def test_sex_valid(self):
        self.assertIn(self.goals['sex'], ('male', 'female'))

    def test_height_in_positive(self):
        self.assertGreater(self.goals['height_in'], 0)

    def test_goal_snapshot_fields(self):
        required_fields = {
            'saved_date', 'saved_weight_lbs', 'target_weight', 'target_fat',
            'goal_date', 'saved_tdee', 'saved_bmr', 'saved_deficit',
            'saved_target_intake', 'saved_protein_goal', 'daily_calorie_goal',
        }
        for snapshot in self.goals['goals']:
            with self.subTest(saved_date=snapshot.get('saved_date')):
                for field in required_fields:
                    self.assertIn(field, snapshot,
                                  f"Missing '{field}' in goal snapshot")

    def test_goal_snapshot_numeric_fields_positive(self):
        for snapshot in self.goals['goals']:
            with self.subTest(saved_date=snapshot.get('saved_date')):
                for field in ('saved_tdee', 'saved_bmr', 'daily_calorie_goal'):
                    if snapshot[field] is not None:
                        self.assertGreater(snapshot[field], 0,
                                           f"'{field}' should be positive")

    def test_goal_snapshots_chronological(self):
        dates = [g['saved_date'] for g in self.goals['goals']]
        self.assertEqual(dates, sorted(dates),
                         'Goal snapshots must be in chronological order')

    def test_goal_date_format(self):
        import re
        for snapshot in self.goals['goals']:
            if snapshot.get('saved_date'):
                self.assertRegex(snapshot['saved_date'], r'^\d{4}-\d{2}-\d{2}$')
            if snapshot.get('goal_date'):
                self.assertRegex(snapshot['goal_date'], r'^\d{4}-\d{2}-\d{2}$')


# ── 2. Data loading ───────────────────────────────────────────────────────────

class TestLoadWeight(unittest.TestCase):
    def setUp(self):
        self.weights = fitness_app.load_all_weight()

    def test_returns_list(self):
        self.assertIsInstance(self.weights, list)

    def test_not_empty(self):
        self.assertGreater(len(self.weights), 0)

    def test_expected_fields(self):
        for entry in self.weights[:5]:
            with self.subTest(date=entry.get('date')):
                for field in ('date', 'weight', 'bmi'):
                    self.assertIn(field, entry)

    def test_sorted_by_date(self):
        dates = [w['date'] for w in self.weights]
        self.assertEqual(dates, sorted(dates),
                         'Weight entries must be sorted by date')

    def test_april_entries_present(self):
        april = [w for w in self.weights if w['date'].startswith('2026-04')]
        self.assertGreater(len(april), 0, 'Should have April 2026 weight data')

    def test_known_april_date_present(self):
        dates = {w['date'] for w in self.weights}
        self.assertIn('2026-04-04', dates)

    def test_weight_values_positive(self):
        for entry in self.weights:
            with self.subTest(date=entry['date']):
                self.assertGreater(entry['weight'], 0)

    def test_fat_percentage_range(self):
        for entry in self.weights:
            if entry.get('fat') is not None:
                with self.subTest(date=entry['date']):
                    self.assertGreater(entry['fat'], 0)
                    self.assertLess(entry['fat'], 100)


class TestLoadMeals(unittest.TestCase):
    def setUp(self):
        self.meals = fitness_app.load_all_meals()

    def test_returns_list(self):
        self.assertIsInstance(self.meals, list)

    def test_not_empty(self):
        self.assertGreater(len(self.meals), 0)

    def test_expected_fields(self):
        for entry in self.meals[:5]:
            with self.subTest(date=entry.get('date')):
                for field in ('date', 'items'):
                    self.assertIn(field, entry)

    def test_sorted_by_date(self):
        dates = [m['date'] for m in self.meals]
        self.assertEqual(dates, sorted(dates),
                         'Meal entries must be sorted by date')

    def test_items_is_list(self):
        for entry in self.meals[:5]:
            with self.subTest(date=entry.get('date')):
                self.assertIsInstance(entry['items'], list)

    def test_meal_item_fields(self):
        for entry in self.meals[:3]:
            for item in entry['items'][:2]:
                with self.subTest(date=entry['date'], food=item.get('foodName')):
                    for field in ('foodName', 'calories', 'protein'):
                        self.assertIn(field, item)

    def test_april_entries_present(self):
        april = [m for m in self.meals if m['date'].startswith('2026-04')]
        self.assertGreater(len(april), 0, 'Should have April 2026 meal data')


class TestLoadWorkouts(unittest.TestCase):
    def setUp(self):
        self.workouts = fitness_app.load_all_workouts()

    def test_returns_list(self):
        self.assertIsInstance(self.workouts, list)

    def test_not_empty(self):
        self.assertGreater(len(self.workouts), 0)

    def test_expected_fields(self):
        for entry in self.workouts[:5]:
            with self.subTest(id=entry.get('id')):
                for field in ('id', 'sport_name', 'start_time', 'calories'):
                    self.assertIn(field, entry)

    def test_calories_non_negative(self):
        for entry in self.workouts:
            with self.subTest(id=entry.get('id')):
                if entry.get('calories') is not None:
                    self.assertGreaterEqual(entry['calories'], 0)

    def test_april_entries_present(self):
        april = [w for w in self.workouts if '2026-04' in w.get('start_time', '')]
        self.assertGreater(len(april), 0, 'Should have April 2026 workout data')

    def test_known_april_4_workouts(self):
        april4 = [w for w in self.workouts if '2026-04-04' in w.get('start_time', '')]
        self.assertGreater(len(april4), 0,
                           'April 4 2026 should have at least one workout')

    def test_zone_durations_structure(self):
        for entry in self.workouts[:5]:
            zd = entry.get('zone_durations')
            if zd is not None:
                with self.subTest(id=entry.get('id')):
                    self.assertIsInstance(zd, dict)
                    self.assertIn('zone_zero_milli', zd)


class TestLoadGoals(unittest.TestCase):
    def test_returns_dict(self):
        goals = fitness_app.load_goals()
        self.assertIsInstance(goals, dict)

    def test_has_goals_key(self):
        goals = fitness_app.load_goals()
        self.assertIn('goals', goals)


# ── 3. HTTP route tests ───────────────────────────────────────────────────────

class TestRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('localhost', _TEST_PORT), fitness_app.FitnessHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever)
        cls.thread.daemon = True
        cls.thread.start()
        time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def _get(self, path):
        conn = http.client.HTTPConnection('localhost', _TEST_PORT, timeout=5)
        conn.request('GET', path)
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        content_type = resp.getheader('Content-Type', '')
        data = json.loads(body) if 'json' in content_type and body else None
        return resp.status, data

    # /api/workouts
    def test_workouts_status_200(self):
        status, _ = self._get('/api/workouts')
        self.assertEqual(status, 200)

    def test_workouts_returns_list(self):
        _, data = self._get('/api/workouts')
        self.assertIsInstance(data, list)

    def test_workouts_entries_shape(self):
        _, data = self._get('/api/workouts')
        self.assertGreater(len(data), 0)
        for entry in data[:3]:
            for field in ('id', 'sport_name', 'start_time', 'calories'):
                with self.subTest(field=field):
                    self.assertIn(field, entry)

    # /api/weight
    def test_weight_status_200(self):
        status, _ = self._get('/api/weight')
        self.assertEqual(status, 200)

    def test_weight_returns_list(self):
        _, data = self._get('/api/weight')
        self.assertIsInstance(data, list)

    def test_weight_entries_shape(self):
        _, data = self._get('/api/weight')
        self.assertGreater(len(data), 0)
        for entry in data[:3]:
            for field in ('date', 'weight', 'bmi'):
                with self.subTest(field=field):
                    self.assertIn(field, entry)

    # /api/meals
    def test_meals_status_200(self):
        status, _ = self._get('/api/meals')
        self.assertEqual(status, 200)

    def test_meals_returns_list(self):
        _, data = self._get('/api/meals')
        self.assertIsInstance(data, list)

    def test_meals_entries_shape(self):
        _, data = self._get('/api/meals')
        self.assertGreater(len(data), 0)
        for entry in data[:3]:
            for field in ('date', 'items'):
                with self.subTest(field=field):
                    self.assertIn(field, entry)

    # /api/goals
    def test_goals_status_200(self):
        status, _ = self._get('/api/goals')
        self.assertEqual(status, 200)

    def test_goals_returns_dict(self):
        _, data = self._get('/api/goals')
        self.assertIsInstance(data, dict)

    def test_goals_top_level_shape(self):
        _, data = self._get('/api/goals')
        for field in ('dob', 'height_in', 'sex', 'goals'):
            with self.subTest(field=field):
                self.assertIn(field, data)

    # /api/reports
    def test_reports_status_200(self):
        status, _ = self._get('/api/reports')
        self.assertEqual(status, 200)

    def test_reports_returns_list(self):
        _, data = self._get('/api/reports')
        self.assertIsInstance(data, list)

    # /api/sync/status
    def test_sync_status_200(self):
        status, _ = self._get('/api/sync/status')
        self.assertEqual(status, 200)

    def test_sync_status_shape(self):
        _, data = self._get('/api/sync/status')
        self.assertIsInstance(data, dict)
        for field in ('running', 'last_status', 'last_run', 'last_error'):
            with self.subTest(field=field):
                self.assertIn(field, data)

    # CORS header
    def test_cors_header_present(self):
        conn = http.client.HTTPConnection('localhost', _TEST_PORT, timeout=5)
        conn.request('GET', '/api/goals')
        resp = conn.getresponse()
        resp.read()
        conn.close()
        self.assertEqual(resp.getheader('Access-Control-Allow-Origin'), '*')

    # 404 for unknown route
    def test_unknown_route_returns_404(self):
        conn = http.client.HTTPConnection('localhost', _TEST_PORT, timeout=5)
        conn.request('GET', '/api/nonexistent')
        resp = conn.getresponse()
        resp.read()
        conn.close()
        self.assertEqual(resp.status, 404)


# ── 4. POST route tests ───────────────────────────────────────────────────────

class TestPostRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('localhost', _TEST_PORT + 1), fitness_app.FitnessHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever)
        cls.thread.daemon = True
        cls.thread.start()
        time.sleep(0.1)
        cls._goals_backup = _backup_goals_dir()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        _restore_goals_dir(cls._goals_backup)

    def _post(self, path, payload):
        body = json.dumps(payload).encode()
        conn = http.client.HTTPConnection('localhost', _TEST_PORT + 1, timeout=5)
        conn.request('POST', path, body=body,
                     headers={'Content-Type': 'application/json',
                               'Content-Length': str(len(body))})
        resp = conn.getresponse()
        raw = resp.read()
        conn.close()
        data = json.loads(raw) if raw else None
        return resp.status, data

    # POST /api/goals — round-trip
    def test_post_goals_status_200(self):
        goals = fitness_app.load_goals()
        status, _ = self._post('/api/goals', goals)
        self.assertEqual(status, 200)

    def test_post_goals_returns_ok(self):
        goals = fitness_app.load_goals()
        _, data = self._post('/api/goals', goals)
        self.assertEqual(data, {'status': 'ok'})

    def test_post_goals_persists_sex_change(self):
        goals = fitness_app.load_goals()
        original_sex = goals.get('sex', 'male')
        new_sex = 'female' if original_sex == 'male' else 'male'
        goals['sex'] = new_sex
        self._post('/api/goals', goals)
        reloaded = fitness_app.load_goals()
        self.assertEqual(reloaded.get('sex'), new_sex)
        # tearDownClass restores files

    def test_post_goals_new_snapshot_appended(self):
        goals = fitness_app.load_goals()
        original_count = len(goals.get('goals', []))
        new_snap = {
            'saved_date': '2099-01-01',
            'saved_weight_lbs': 140,
            'target_weight': 130,
            'target_fat': 15,
            'goal_date': '2099-06-01',
            'saved_tdee': 2000,
            'saved_bmr': 1500,
            'saved_deficit': 500,
            'saved_target_intake': 1500,
            'saved_protein_goal': 120,
            'daily_calorie_goal': 1500,
        }
        goals['goals'] = goals.get('goals', []) + [new_snap]
        self._post('/api/goals', goals)
        reloaded = fitness_app.load_goals()
        self.assertEqual(len(reloaded['goals']), original_count + 1)
        dates = [g['saved_date'] for g in reloaded['goals']]
        self.assertIn('2099-01-01', dates)
        # tearDownClass restores files

    # POST /api/goals — round-trip read-back via GET
    def test_post_goals_readable_via_get(self):
        goals = fitness_app.load_goals()
        goals['sex'] = 'male'
        self._post('/api/goals', goals)
        conn = http.client.HTTPConnection('localhost', _TEST_PORT + 1, timeout=5)
        conn.request('GET', '/api/goals')
        resp = conn.getresponse()
        data = json.loads(resp.read())
        conn.close()
        self.assertEqual(data['sex'], 'male')

    # POST /api/sync
    def test_post_sync_status_200(self):
        conn = http.client.HTTPConnection('localhost', _TEST_PORT + 1, timeout=5)
        conn.request('POST', '/api/sync', body=b'', headers={'Content-Length': '0'})
        resp = conn.getresponse()
        raw = resp.read()
        conn.close()
        self.assertEqual(resp.status, 200)
        data = json.loads(raw)
        self.assertIn(data['status'], ('started', 'already_running'))

    def test_post_sync_sets_running_state(self):
        conn = http.client.HTTPConnection('localhost', _TEST_PORT + 1, timeout=5)
        conn.request('POST', '/api/sync', body=b'', headers={'Content-Length': '0'})
        conn.getresponse().read()
        conn.close()
        conn2 = http.client.HTTPConnection('localhost', _TEST_PORT + 1, timeout=5)
        conn2.request('GET', '/api/sync/status')
        resp2 = conn2.getresponse()
        data = json.loads(resp2.read())
        conn2.close()
        self.assertIn('running', data)
        self.assertIsInstance(data['running'], bool)

    # POST /api/log-meal — validation
    def test_post_log_meal_no_input_returns_400(self):
        status, data = self._post('/api/log-meal', {})
        self.assertEqual(status, 400)
        self.assertEqual(data['status'], 'error')
        self.assertIn('message', data)

    def test_post_log_meal_empty_input_returns_400(self):
        status, data = self._post('/api/log-meal', {'input': ''})
        self.assertEqual(status, 400)
        self.assertEqual(data['status'], 'error')

    def test_post_log_meal_whitespace_input_returns_400(self):
        status, data = self._post('/api/log-meal', {'input': '   '})
        self.assertEqual(status, 400)
        self.assertEqual(data['status'], 'error')

    # POST unknown route
    def test_post_unknown_route_returns_404(self):
        conn = http.client.HTTPConnection('localhost', _TEST_PORT + 1, timeout=5)
        conn.request('POST', '/api/nonexistent', body=b'{}',
                     headers={'Content-Type': 'application/json', 'Content-Length': '2'})
        resp = conn.getresponse()
        try:
            resp.read()
        except ConnectionResetError:
            pass
        conn.close()
        self.assertEqual(resp.status, 404)

    # OPTIONS preflight
    def test_options_preflight_200(self):
        conn = http.client.HTTPConnection('localhost', _TEST_PORT + 1, timeout=5)
        conn.request('OPTIONS', '/api/goals')
        resp = conn.getresponse()
        resp.read()
        conn.close()
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.getheader('Access-Control-Allow-Origin'), '*')
        self.assertIn('POST', resp.getheader('Access-Control-Allow-Methods', ''))

    # PUT /api/goals/<id>/extend
    def test_put_extend_goal_status_200(self):
        goals = fitness_app.load_goals()
        goal_id = goals['goals'][0].get('id', 1)
        body = json.dumps({'new_end_date': '2099-12-31'}).encode()
        conn = http.client.HTTPConnection('localhost', _TEST_PORT + 1, timeout=5)
        conn.request('PUT', f'/api/goals/{goal_id}/extend', body=body,
                     headers={'Content-Type': 'application/json',
                               'Content-Length': str(len(body))})
        resp = conn.getresponse()
        data = json.loads(resp.read())
        conn.close()
        self.assertEqual(resp.status, 200)
        self.assertEqual(data['status'], 'ok')
        # tearDownClass restores files

    def test_put_extend_goal_unknown_id_returns_404(self):
        body = json.dumps({'new_end_date': '2099-12-31'}).encode()
        conn = http.client.HTTPConnection('localhost', _TEST_PORT + 1, timeout=5)
        conn.request('PUT', '/api/goals/99999/extend', body=body,
                     headers={'Content-Type': 'application/json',
                               'Content-Length': str(len(body))})
        resp = conn.getresponse()
        resp.read()
        conn.close()
        self.assertEqual(resp.status, 404)


# ── 5. Goal mutations ─────────────────────────────────────────────────────────

class TestGoalMutations(unittest.TestCase):
    def setUp(self):
        self._backup = _backup_goals_dir()

    def tearDown(self):
        _restore_goals_dir(self._backup)

    def _get_first_goal_id(self):
        return fitness_app.load_goals()['goals'][0]['id']

    def test_close_goal_returns_true_for_valid_id(self):
        self.assertTrue(fitness_app.close_goal(self._get_first_goal_id()))

    def test_close_goal_sets_is_closed_flag(self):
        goal_id = self._get_first_goal_id()
        fitness_app.close_goal(goal_id)
        reloaded = fitness_app.load_goals()
        goal = next(g for g in reloaded['goals'] if g.get('id') == goal_id)
        self.assertTrue(goal.get('is_closed'))

    def test_close_goal_returns_false_for_missing_id(self):
        self.assertFalse(fitness_app.close_goal(99999))

    def test_reopen_goal_removes_is_closed_flag(self):
        goal_id = self._get_first_goal_id()
        fitness_app.close_goal(goal_id)
        fitness_app.reopen_goal(goal_id)
        reloaded = fitness_app.load_goals()
        goal = next(g for g in reloaded['goals'] if g.get('id') == goal_id)
        self.assertNotIn('is_closed', goal)

    def test_reopen_goal_returns_true_for_valid_id(self):
        goal_id = self._get_first_goal_id()
        self.assertTrue(fitness_app.reopen_goal(goal_id))

    def test_reopen_goal_returns_false_for_missing_id(self):
        self.assertFalse(fitness_app.reopen_goal(99999))

    def test_close_then_reopen_leaves_goal_unchanged(self):
        goal_id = self._get_first_goal_id()
        # Normalize to open state first so baseline is deterministic
        fitness_app.reopen_goal(goal_id)
        original = next(g for g in fitness_app.load_goals()['goals'] if g.get('id') == goal_id)
        fitness_app.close_goal(goal_id)
        fitness_app.reopen_goal(goal_id)
        restored = next(g for g in fitness_app.load_goals()['goals'] if g.get('id') == goal_id)
        self.assertEqual(original, restored)


# ── 6. delete_meal ───────────────────────────────────────────────────────────

class TestDeleteMeal(unittest.TestCase):
    _DATE = "2099-01-15"
    _MEAL_TYPE = "dinner"
    _LOGGED_AT = "2099-01-15T19:00:00"
    _LOG_ID = 9988776655

    def _meal_file_path(self):
        return os.path.join(fitness_app.FITBIT_DATA_DIR, "2099", "01", "01-meals.json")

    def _make_record(self, **overrides):
        base = {
            "logged_at": self._LOGGED_AT,
            "date": self._DATE,
            "meal_type": self._MEAL_TYPE,
            "meal_type_id": 5,
            "raw_description": "grilled chicken",
            "items": [{"foodName": "Grilled Chicken", "calories": 300, "protein": 40.0, "log_id": self._LOG_ID}],
            "total_calories": 300,
            "total_protein": 40.0,
            "all_uploaded": True,
            "amended": False,
        }
        base.update(overrides)
        return base

    def setUp(self):
        meal_dir = os.path.join(fitness_app.FITBIT_DATA_DIR, "2099", "01")
        os.makedirs(meal_dir, exist_ok=True)
        self._meal_file = self._meal_file_path()
        with open(self._meal_file, "w") as f:
            json.dump([self._make_record()], f)

    def tearDown(self):
        if os.path.exists(self._meal_file):
            os.remove(self._meal_file)
        # Remove temp year dir if empty
        for d in [
            os.path.join(fitness_app.FITBIT_DATA_DIR, "2099", "01"),
            os.path.join(fitness_app.FITBIT_DATA_DIR, "2099"),
        ]:
            try:
                os.rmdir(d)
            except OSError:
                pass

    def _delete_with_mocked_fitbit(self, date=None, meal_type=None, logged_at=None):
        from unittest.mock import patch, MagicMock
        date = date or self._DATE
        meal_type = meal_type or self._MEAL_TYPE
        logged_at = logged_at or self._LOGGED_AT
        mock_token = "fake-token"
        with patch("fitbit_token_manager.get_valid_token", return_value=mock_token):
            with patch("fitbit_add_meal.delete_food_log", return_value=True) as mock_del:
                ok, err = fitness_app.delete_meal(date, meal_type, logged_at)
        return ok, err, mock_del

    def test_removes_record_from_json(self):
        self._delete_with_mocked_fitbit()
        with open(self._meal_file) as f:
            db = json.load(f)
        self.assertEqual(db, [])

    def test_returns_true_on_success(self):
        ok, err, _ = self._delete_with_mocked_fitbit()
        self.assertTrue(ok)
        self.assertIsNone(err)

    def test_calls_fitbit_delete_for_each_item_with_log_id(self):
        ok, err, mock_del = self._delete_with_mocked_fitbit()
        mock_del.assert_called_once_with("fake-token", self._LOG_ID)

    def test_returns_false_when_file_missing(self):
        os.remove(self._meal_file)
        ok, err = fitness_app.delete_meal(self._DATE, self._MEAL_TYPE, self._LOGGED_AT)
        self.assertFalse(ok)
        self.assertIn("not found", err)

    def test_returns_false_when_record_missing(self):
        ok, err = fitness_app.delete_meal(self._DATE, self._MEAL_TYPE, "1999-01-01T00:00:00")
        self.assertFalse(ok)
        self.assertIn("not found", err)

    def test_returns_false_for_invalid_date(self):
        ok, err = fitness_app.delete_meal("not-a-date", self._MEAL_TYPE, self._LOGGED_AT)
        self.assertFalse(ok)
        self.assertIn("Invalid date", err)

    def test_only_deletes_matching_record_leaves_others(self):
        other = self._make_record(meal_type="lunch", logged_at="2099-01-15T12:00:00")
        with open(self._meal_file, "w") as f:
            json.dump([self._make_record(), other], f)
        self._delete_with_mocked_fitbit()
        with open(self._meal_file) as f:
            db = json.load(f)
        self.assertEqual(len(db), 1)
        self.assertEqual(db[0]["meal_type"], "lunch")

    def test_skips_fitbit_delete_for_items_without_log_id(self):
        no_log_id_record = self._make_record(
            items=[{"foodName": "Apple", "calories": 80, "protein": 0.4}]
        )
        with open(self._meal_file, "w") as f:
            json.dump([no_log_id_record], f)
        from unittest.mock import patch
        with patch("fitbit_token_manager.get_valid_token", return_value="tok"):
            with patch("fitbit_add_meal.delete_food_log") as mock_del:
                ok, err = fitness_app.delete_meal(self._DATE, self._MEAL_TYPE, self._LOGGED_AT)
        mock_del.assert_not_called()
        self.assertTrue(ok)


# ── 7. delete_report ──────────────────────────────────────────────────────────

class TestDeleteReport(unittest.TestCase):
    def setUp(self):
        self._filename = 'report_goal999_2099-01-01.json'
        self._filepath = os.path.join(fitness_app.REPORTS_DATA_DIR, self._filename)
        with open(self._filepath, 'w') as f:
            json.dump({'test': True}, f)

    def tearDown(self):
        if os.path.exists(self._filepath):
            os.remove(self._filepath)

    def test_deletes_valid_report_and_returns_true(self):
        result = fitness_app.delete_report(self._filename)
        self.assertTrue(result)
        self.assertFalse(os.path.exists(self._filepath))

    def test_returns_false_for_nonexistent_file(self):
        self.assertFalse(fitness_app.delete_report('report_goal_missing_2099-01-01.json'))

    def test_path_traversal_blocked(self):
        # os.path.basename strips the path, leaving a non-report_ name
        self.assertFalse(fitness_app.delete_report('../goals/goal_1_2026-03-02.json'))

    def test_wrong_prefix_blocked(self):
        self.assertFalse(fitness_app.delete_report('data_report_goal999_2099-01-01.json'))

    def test_wrong_suffix_blocked(self):
        self.assertFalse(fitness_app.delete_report('report_goal999_2099-01-01.txt'))


# ── 7. _rolling_avg_bf ────────────────────────────────────────────────────────

class TestRollingAvgBF(unittest.TestCase):
    def test_returns_none_for_invalid_date(self):
        self.assertIsNone(fitness_app._rolling_avg_bf([], 'not-a-date'))

    def test_returns_none_for_empty_data(self):
        self.assertIsNone(fitness_app._rolling_avg_bf([], '2026-05-17'))

    def test_returns_none_when_no_fat_in_window(self):
        data = [{'date': '2026-05-17', 'fat': None}]
        self.assertIsNone(fitness_app._rolling_avg_bf(data, '2026-05-17'))

    def test_single_entry_on_center_date(self):
        data = [{'date': '2026-05-17', 'fat': 15.5}]
        self.assertAlmostEqual(fitness_app._rolling_avg_bf(data, '2026-05-17'), 15.5)

    def test_averages_entries_within_window(self):
        # default window=7, half=3 → includes [center-3, center+3]
        data = [
            {'date': '2026-05-14', 'fat': 14.0},  # center - 3: included
            {'date': '2026-05-17', 'fat': 16.0},  # center: included
            {'date': '2026-05-20', 'fat': 18.0},  # center + 3: included
        ]
        result = fitness_app._rolling_avg_bf(data, '2026-05-17')
        self.assertAlmostEqual(result, (14.0 + 16.0 + 18.0) / 3)

    def test_excludes_entries_outside_window(self):
        data = [
            {'date': '2026-05-13', 'fat': 99.0},  # center - 4: excluded
            {'date': '2026-05-17', 'fat': 15.0},  # center: included
            {'date': '2026-05-21', 'fat': 99.0},  # center + 4: excluded
        ]
        self.assertAlmostEqual(fitness_app._rolling_avg_bf(data, '2026-05-17'), 15.0)

    def test_skips_entries_with_no_fat(self):
        data = [
            {'date': '2026-05-17', 'fat': None},
            {'date': '2026-05-18', 'fat': 16.0},
        ]
        self.assertAlmostEqual(fitness_app._rolling_avg_bf(data, '2026-05-17'), 16.0)

    def test_custom_window(self):
        # window=3, half=1 → includes [center-1, center+1]
        data = [
            {'date': '2026-05-15', 'fat': 99.0},  # center - 2: excluded
            {'date': '2026-05-16', 'fat': 14.0},  # center - 1: included
            {'date': '2026-05-17', 'fat': 16.0},  # center: included
        ]
        result = fitness_app._rolling_avg_bf(data, '2026-05-17', window=3)
        self.assertAlmostEqual(result, (14.0 + 16.0) / 2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
