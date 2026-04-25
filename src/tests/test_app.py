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


if __name__ == '__main__':
    unittest.main(verbosity=2)
