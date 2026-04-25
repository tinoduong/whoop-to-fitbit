"""
Tests for app.py: goals.json structure, data loading, and HTTP routes.
Run with: python -m pytest tests/test_app.py -v
     or:  python -m unittest discover tests
"""

import http.client
import json
import os
import sys
import threading
import time
import unittest
from http.server import HTTPServer

WEBAPP_DIR = os.path.join(os.path.dirname(__file__), '..', 'webapp')
sys.path.insert(0, WEBAPP_DIR)

import app as fitness_app

GOALS_FILE = fitness_app.GOALS_FILE
_TEST_PORT = 18765


# ── 1. goals.json structure ───────────────────────────────────────────────────

class TestGoalsJson(unittest.TestCase):
    def setUp(self):
        with open(GOALS_FILE) as f:
            self.goals = json.load(f)

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


if __name__ == '__main__':
    unittest.main(verbosity=2)
