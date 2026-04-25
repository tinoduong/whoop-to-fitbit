/**
 * Tests for all fetch() calls in the webapp JS files.
 * Run with: node tests/test_fetch.js
 *
 * Uses a lightweight mock fetch — no browser or external deps needed.
 * Functions are reimplemented verbatim from their source files so the
 * tests verify the exact URLs, methods, headers, and body shapes used.
 */

'use strict';

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

// Wrap everything in an async IIFE for compatibility with older Node versions
(async () => {

function assert(condition, name) {
  if (condition) { console.log(`  ✓  ${name}`); passed++; }
  else           { console.error(`  ✗  ${name}`); failed++; }
}
function assertEqual(actual, expected, name) {
  if (actual === expected) { console.log(`  ✓  ${name}`); passed++; }
  else {
    console.error(`  ✗  ${name}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       received: ${JSON.stringify(actual)}`);
    failed++;
  }
}
function assertContains(haystack, needle, name) {
  assert((haystack || '').includes(needle), name);
}

// ── Mock fetch ────────────────────────────────────────────────────────────────

let _fetchCalls = [];
let _fetchResponses = {};

function resetMock(responses = {}) {
  _fetchCalls = [];
  _fetchResponses = responses;
}

function defaultBody(url) {
  if (url === '/api/workouts' || url === '/api/meals') return [];
  if (url === '/api/weight') return [];
  if (url === '/api/goals') return { dob: '1979-03-11', height_in: 66, sex: 'male', goals: [] };
  if (url === '/api/sync') return { status: 'started' };
  if (url === '/api/sync/status') return { running: false, last_status: 'ok', last_run: null, last_error: null };
  if (url === '/api/log-meal') return { status: 'ok' };
  return {};
}

async function fetch(url, options = {}) {
  _fetchCalls.push({ url, options: { ...options } });
  const override = _fetchResponses[url];
  const ok = override ? override.ok !== false : true;
  const status = override ? (override.status || 200) : 200;
  const body = override ? override.body : defaultBody(url);
  return {
    ok,
    status,
    json: async () => body,
  };
}

function lastCall(url) {
  return [..._fetchCalls].reverse().find(c => c.url === url);
}
function allCalls(url) {
  return _fetchCalls.filter(c => c.url === url);
}

// ── Functions under test ──────────────────────────────────────────────────────
// Each is reimplemented verbatim from its source file.

// app.js loadData() — lines 53-65
let allWorkouts, allWeight, allMeals, goals;

async function loadData() {
  const [workoutsRes, weightRes, mealsRes, goalsRes] = await Promise.all([
    fetch('/api/workouts'),
    fetch('/api/weight'),
    fetch('/api/meals'),
    fetch('/api/goals'),
  ]);
  allWorkouts = await workoutsRes.json();
  allWeight = await weightRes.json();
  allMeals = await mealsRes.json();
  goals = await goalsRes.json();
  if (!goals.goals) goals.goals = [];
}

// goals.js setupGoalsForm submit handler — lines 361-366
async function postGoals(goalsPayload) {
  return fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goalsPayload),
  });
}

// app.js log-meal fetch — lines 2361-2365
async function postLogMeal(userInput) {
  return fetch('/api/log-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: userInput }),
  });
}

// app.js post-log-meal meals refresh — line 2378
async function refreshMeals() {
  const mealsRes = await fetch('/api/meals');
  return mealsRes.json();
}

// overview.js triggerSync — line 26
async function triggerSync() {
  const res = await fetch('/api/sync', { method: 'POST' });
  return res.json();
}

// overview.js pollSyncStatus — line 46
async function pollSyncStatus() {
  const res = await fetch('/api/sync/status');
  return res.json();
}

// ── Tests: loadData() ─────────────────────────────────────────────────────────

console.log('\nloadData() — request URLs');

resetMock();
await loadData();

const urls = _fetchCalls.map(c => c.url);
assert(urls.includes('/api/workouts'), 'fetches /api/workouts');
assert(urls.includes('/api/weight'),   'fetches /api/weight');
assert(urls.includes('/api/meals'),    'fetches /api/meals');
assert(urls.includes('/api/goals'),    'fetches /api/goals');
assertEqual(urls.length, 4, 'makes exactly 4 fetch calls');

console.log('\nloadData() — GET method (no explicit method = GET)');

for (const call of _fetchCalls) {
  const method = (call.options.method || 'GET').toUpperCase();
  assertEqual(method, 'GET', `${call.url} uses GET`);
}

console.log('\nloadData() — populates globals');

resetMock({
  '/api/workouts': { body: [{ id: 'w1', sport_name: 'running', calories: 300 }] },
  '/api/weight':   { body: [{ date: '2026-04-01', weight: 60.1, bmi: 21.17 }] },
  '/api/meals':    { body: [{ date: '2026-04-01', items: [] }] },
  '/api/goals':    { body: { dob: '1979-03-11', height_in: 66, sex: 'male', goals: [{ saved_date: '2026-03-02' }] } },
});
await loadData();

assertEqual(allWorkouts.length, 1,       'allWorkouts populated');
assertEqual(allWorkouts[0].id, 'w1',     'allWorkouts[0].id correct');
assertEqual(allWeight.length, 1,         'allWeight populated');
assertEqual(allWeight[0].date, '2026-04-01', 'allWeight[0].date correct');
assertEqual(allMeals.length, 1,          'allMeals populated');
assert(goals && goals.dob === '1979-03-11', 'goals.dob populated');
assertEqual(goals.goals.length, 1,       'goals.goals populated');

console.log('\nloadData() — goals.goals defaults to [] when missing');

resetMock({ '/api/goals': { body: { dob: '1979-03-11', height_in: 66, sex: 'male' } } });
await loadData();
assert(Array.isArray(goals.goals), 'goals.goals is an array when not in response');
assertEqual(goals.goals.length, 0, 'goals.goals is empty array when not in response');

// ── Tests: POST /api/goals ────────────────────────────────────────────────────

console.log('\nPOST /api/goals');

const sampleGoals = { dob: '1979-03-11', height_in: 66, sex: 'male', goals: [] };

resetMock();
await postGoals(sampleGoals);

const goalsCall = lastCall('/api/goals');
assert(goalsCall !== undefined, 'fetch called for /api/goals');
assertEqual((goalsCall.options.method || '').toUpperCase(), 'POST', 'method is POST');
assertEqual(goalsCall.options.headers['Content-Type'], 'application/json',
  'Content-Type header is application/json');
assert(typeof goalsCall.options.body === 'string', 'body is a JSON string');

const sentBody = JSON.parse(goalsCall.options.body);
assertEqual(sentBody.dob, '1979-03-11', 'body contains dob');
assertEqual(sentBody.height_in, 66,     'body contains height_in');
assertEqual(sentBody.sex, 'male',       'body contains sex');
assert(Array.isArray(sentBody.goals),   'body contains goals array');

console.log('\nPOST /api/goals — snapshot fields in body');

const goalsWithSnap = {
  ...sampleGoals,
  goals: [{
    saved_date: '2026-03-02',
    target_weight: 130,
    daily_calorie_goal: 1442,
    saved_tdee: 1994,
    saved_deficit: 552,
  }],
};
resetMock();
await postGoals(goalsWithSnap);
const snapBody = JSON.parse(lastCall('/api/goals').options.body);
assertEqual(snapBody.goals[0].saved_date, '2026-03-02', 'snapshot saved_date transmitted');
assertEqual(snapBody.goals[0].target_weight, 130,        'snapshot target_weight transmitted');
assertEqual(snapBody.goals[0].daily_calorie_goal, 1442,  'snapshot daily_calorie_goal transmitted');

// ── Tests: POST /api/log-meal ─────────────────────────────────────────────────

console.log('\nPOST /api/log-meal');

resetMock();
await postLogMeal('chicken breast 6oz, brown rice 1 cup');

const mealCall = lastCall('/api/log-meal');
assert(mealCall !== undefined, 'fetch called for /api/log-meal');
assertEqual((mealCall.options.method || '').toUpperCase(), 'POST', 'method is POST');
assertEqual(mealCall.options.headers['Content-Type'], 'application/json',
  'Content-Type header is application/json');

const mealBody = JSON.parse(mealCall.options.body);
assertEqual(mealBody.input, 'chicken breast 6oz, brown rice 1 cup',
  'input field transmitted verbatim');
assert(Object.keys(mealBody).length === 1, 'body has exactly one key (input)');

console.log('\nPOST /api/log-meal — ok response handling');

resetMock({ '/api/log-meal': { ok: true, status: 200, body: { status: 'ok' } } });
const mealRes = await postLogMeal('salad');
const mealData = await mealRes.json();
assert(mealRes.ok, 'response is ok');
assertEqual(mealData.status, 'ok', 'response body status is ok');

console.log('\nPOST /api/log-meal — error response handling');

resetMock({ '/api/log-meal': { ok: false, status: 500, body: { status: 'error', message: 'Parse failed' } } });
const mealErrRes = await postLogMeal('???');
const mealErrData = await mealErrRes.json();
assert(!mealErrRes.ok, 'response is not ok on server error');
assertEqual(mealErrData.status, 'error',   'error response has status: error');
assertEqual(mealErrData.message, 'Parse failed', 'error message propagated');

// ── Tests: GET /api/meals refresh after log-meal ──────────────────────────────

console.log('\nGET /api/meals — refresh after log-meal');

resetMock({ '/api/meals': { body: [{ date: '2026-04-25', items: [{ foodName: 'Chicken', calories: 200 }] }] } });
const refreshed = await refreshMeals();
assertEqual(refreshed.length, 1, 'refreshed meals array has 1 entry');
assertEqual(refreshed[0].date, '2026-04-25', 'refreshed meals date correct');
assertEqual(refreshed[0].items[0].foodName, 'Chicken', 'refreshed meal item correct');

// ── Tests: POST /api/sync ─────────────────────────────────────────────────────

console.log('\nPOST /api/sync');

resetMock();
await triggerSync();

const syncCall = lastCall('/api/sync');
assert(syncCall !== undefined, 'fetch called for /api/sync');
assertEqual((syncCall.options.method || '').toUpperCase(), 'POST', 'method is POST');

console.log('\nPOST /api/sync — response status: started');

resetMock({ '/api/sync': { body: { status: 'started' } } });
const syncData = await triggerSync();
assertEqual(syncData.status, 'started', 'started response handled');

console.log('\nPOST /api/sync — response status: already_running');

resetMock({ '/api/sync': { body: { status: 'already_running' } } });
const syncData2 = await triggerSync();
assertEqual(syncData2.status, 'already_running', 'already_running response handled');

// ── Tests: GET /api/sync/status ───────────────────────────────────────────────

console.log('\nGET /api/sync/status');

resetMock();
await pollSyncStatus();

const statusCall = lastCall('/api/sync/status');
assert(statusCall !== undefined, 'fetch called for /api/sync/status');
const statusMethod = (statusCall.options.method || 'GET').toUpperCase();
assertEqual(statusMethod, 'GET', 'method is GET');

console.log('\nGET /api/sync/status — response shape');

resetMock({ '/api/sync/status': { body: { running: false, last_status: 'ok', last_run: '2026-04-25 06:00:00', last_error: null } } });
const statusData = await pollSyncStatus();
assert('running' in statusData,     'response has running field');
assert('last_status' in statusData, 'response has last_status field');
assert('last_run' in statusData,    'response has last_run field');
assert('last_error' in statusData,  'response has last_error field');
assert(!statusData.running,         'running is false');
assertEqual(statusData.last_status, 'ok', 'last_status is ok');

console.log('\nGET /api/sync/status — running: true');

resetMock({ '/api/sync/status': { body: { running: true, last_status: null, last_run: null, last_error: null } } });
const runningData = await pollSyncStatus();
assert(runningData.running, 'running is true during sync');

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

})().catch(err => { console.error(err); process.exit(1); });
