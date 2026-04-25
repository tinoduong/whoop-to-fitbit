/**
 * Tests for goal helper functions: getGoalForDate() and getCurrentGoal().
 * Run with: node tests/test_goals.js
 *
 * These functions are defined in app.js and depend only on the `goals` global.
 * We reimplement them verbatim here to test them in isolation.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  ✓  ${name}`);
    passed++;
  } else {
    console.error(`  ✗  ${name}`);
    failed++;
  }
}

function assertEqual(actual, expected, name) {
  if (actual === expected) {
    console.log(`  ✓  ${name}`);
    passed++;
  } else {
    console.error(`  ✗  ${name}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertNull(value, name) {
  assertEqual(value, null, name);
}

// ── Functions under test (verbatim from app.js lines 68-87) ──────────────────

let goals = {};

function getGoalForDate(date) {
  const snapshots = goals.goals || [];
  if (!snapshots.length) return null;
  let best = null;
  for (const g of snapshots) {
    if (g.saved_date <= date) {
      if (!best || g.saved_date > best.saved_date) best = g;
    }
  }
  if (!best) {
    best = snapshots.reduce((a, b) => a.saved_date < b.saved_date ? a : b);
  }
  return best;
}

function getCurrentGoal() {
  const snapshots = goals.goals || [];
  if (!snapshots.length) return null;
  return snapshots.reduce((a, b) => a.saved_date > b.saved_date ? a : b);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SNAP_A = { saved_date: '2026-01-15', target_weight: 150, daily_calorie_goal: 2000 };
const SNAP_B = { saved_date: '2026-03-02', target_weight: 130, daily_calorie_goal: 1442 };
const SNAP_C = { saved_date: '2026-04-10', target_weight: 125, daily_calorie_goal: 1500 };

// ── getGoalForDate() ──────────────────────────────────────────────────────────

console.log('\ngetGoalForDate() — empty / missing goals');

goals = {};
assertNull(getGoalForDate('2026-03-01'), 'returns null when goals is undefined');

goals = { goals: [] };
assertNull(getGoalForDate('2026-03-01'), 'returns null when goals array is empty');

console.log('\ngetGoalForDate() — single snapshot');

goals = { goals: [SNAP_B] };
assertEqual(getGoalForDate('2026-03-02').saved_date, '2026-03-02',
  'exact saved_date match returns that snapshot');
assertEqual(getGoalForDate('2026-03-15').saved_date, '2026-03-02',
  'date after only snapshot returns it');
assertEqual(getGoalForDate('2026-01-01').saved_date, '2026-03-02',
  'date before only snapshot falls back to it (earliest)');

console.log('\ngetGoalForDate() — multiple snapshots');

goals = { goals: [SNAP_A, SNAP_B, SNAP_C] };

assertEqual(getGoalForDate('2025-12-31').saved_date, '2026-01-15',
  'date before all snapshots falls back to earliest');
assertEqual(getGoalForDate('2026-01-15').saved_date, '2026-01-15',
  'exact match on SNAP_A');
assertEqual(getGoalForDate('2026-02-10').saved_date, '2026-01-15',
  'date between A and B returns A');
assertEqual(getGoalForDate('2026-03-02').saved_date, '2026-03-02',
  'exact match on SNAP_B');
assertEqual(getGoalForDate('2026-03-20').saved_date, '2026-03-02',
  'date between B and C returns B');
assertEqual(getGoalForDate('2026-04-10').saved_date, '2026-04-10',
  'exact match on SNAP_C');
assertEqual(getGoalForDate('2026-12-31').saved_date, '2026-04-10',
  'date after all snapshots returns latest');

console.log('\ngetGoalForDate() — out-of-order array');

goals = { goals: [SNAP_C, SNAP_A, SNAP_B] };
assertEqual(getGoalForDate('2026-02-10').saved_date, '2026-01-15',
  'correct result regardless of array order (between A and B)');
assertEqual(getGoalForDate('2026-03-20').saved_date, '2026-03-02',
  'correct result regardless of array order (between B and C)');

// ── getCurrentGoal() ──────────────────────────────────────────────────────────

console.log('\ngetCurrentGoal() — empty / missing goals');

goals = {};
assertNull(getCurrentGoal(), 'returns null when goals is undefined');

goals = { goals: [] };
assertNull(getCurrentGoal(), 'returns null when goals array is empty');

console.log('\ngetCurrentGoal() — single snapshot');

goals = { goals: [SNAP_B] };
assertEqual(getCurrentGoal().saved_date, '2026-03-02',
  'single snapshot is the current goal');

console.log('\ngetCurrentGoal() — multiple snapshots');

goals = { goals: [SNAP_A, SNAP_B, SNAP_C] };
assertEqual(getCurrentGoal().saved_date, '2026-04-10',
  'returns most recent snapshot');

goals = { goals: [SNAP_C, SNAP_A, SNAP_B] };
assertEqual(getCurrentGoal().saved_date, '2026-04-10',
  'returns most recent regardless of array order');

goals = { goals: [SNAP_A, SNAP_B] };
assertEqual(getCurrentGoal().saved_date, '2026-03-02',
  'returns SNAP_B when SNAP_C is absent');

// ── Tests against real goal files ─────────────────────────────────────────────

console.log('\nReal goal file data');

// Reconstruct the goals object from individual goal files + meta (mirrors app.py load_goals())
const goalsDataDir = path.join(__dirname, '..', 'goal-data', 'goals');
const metaPath = path.join(goalsDataDir, 'meta.json');
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const goalFiles = fs.readdirSync(goalsDataDir)
  .filter(f => f.startsWith('goal_') && f.endsWith('.json'))
  .sort();
const goalList = goalFiles.map(f => JSON.parse(fs.readFileSync(path.join(goalsDataDir, f), 'utf8')));
goalList.sort((a, b) => (a.saved_date > b.saved_date ? 1 : -1));

const realGoals = { ...meta, goals: goalList };
goals = realGoals;

const current = getCurrentGoal();
assert(current !== null, 'getCurrentGoal() returns a non-null result');
assert('saved_date' in current, 'current goal has saved_date');
assert('target_weight' in current, 'current goal has target_weight');
assert('daily_calorie_goal' in current, 'current goal has daily_calorie_goal');
assert('saved_tdee' in current, 'current goal has saved_tdee');
assertEqual(current.saved_date, '2026-03-02',
  'known current snapshot date matches goals.json');
assertEqual(current.target_weight, 130,
  'current target_weight is 130 (from goals.json)');
assertEqual(current.daily_calorie_goal, 1442,
  'current daily_calorie_goal is 1442 (from goals.json)');

// getGoalForDate with real data — only one snapshot (2026-03-02)
const beforeAll = getGoalForDate('2026-01-01');
assert(beforeAll !== null, 'date before snapshot falls back to earliest');
assertEqual(beforeAll.saved_date, '2026-03-02',
  'fallback to the only snapshot when date is before it');

const onDate = getGoalForDate('2026-03-02');
assertEqual(onDate.saved_date, '2026-03-02',
  'exact saved_date returns that snapshot');

const afterDate = getGoalForDate('2026-04-25');
assertEqual(afterDate.saved_date, '2026-03-02',
  'date after snapshot returns it');

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
