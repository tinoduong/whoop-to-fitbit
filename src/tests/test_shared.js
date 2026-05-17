/**
 * Tests for shared.js pure logic functions: calcAge, calcBMR, calcTDEE,
 * getWeekStart, offsetDate, getMaintenanceFallback, getTargetIntakeForDate,
 * and isAlcoholicFoodItem (from meals.js).
 * Run with: node tests/test_shared.js
 */

'use strict';

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  ✓  ${name}`); passed++; }
  else { console.error(`  ✗  ${name}`); failed++; }
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

function assertClose(actual, expected, tolerance, name) {
  if (Math.abs(actual - expected) <= tolerance) { console.log(`  ✓  ${name}`); passed++; }
  else {
    console.error(`  ✗  ${name}`);
    console.error(`       expected: ${expected} ± ${tolerance}`);
    console.error(`       received: ${actual}`);
    failed++;
  }
}

function assertNull(value, name) { assertEqual(value, null, name); }

// ── Functions under test (verbatim from shared.js) ────────────────────────────

const KG_TO_LBS = 2.20462;
function kgToLbs(kg) { return +(kg * KG_TO_LBS).toFixed(1); }

const ACTIVITY_FACTOR = 1.375;

function calcAge(dobStr) {
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function calcBMR(weightLbs, heightIn, age, sex) {
  const weightKg = weightLbs / KG_TO_LBS;
  const heightCm = heightIn * 2.54;
  if (sex === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }
}

function calcTDEE(weightLbs, heightIn, age, sex) {
  return Math.round(calcBMR(weightLbs, heightIn, age, sex) * ACTIVITY_FACTOR);
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

let allWeight = [];
let goals = {};

function getMaintenanceFallback(date) {
  if (!allWeight.length || !goals.dob || !goals.height_in || !goals.sex) return null;

  const weekMonday = getWeekStart(date);
  let entry = null;
  for (let i = 1; i <= 52; i++) {
    const wStart = offsetDate(weekMonday, -7 * i);
    const wEnd = offsetDate(wStart, 6);
    const entries = allWeight.filter(w => w.date >= wStart && w.date <= wEnd);
    if (entries.length) {
      const avgKg = entries.reduce((s, w) => s + w.weight, 0) / entries.length;
      const avgFat = entries.some(w => w.fat != null)
        ? entries.filter(w => w.fat != null).reduce((s, w) => s + w.fat, 0) / entries.filter(w => w.fat != null).length
        : null;
      entry = { weight: avgKg, fat: avgFat };
      break;
    }
  }

  if (!entry) {
    const prior = allWeight.filter(w => w.date <= date);
    entry = prior.length ? prior[prior.length - 1] : allWeight[allWeight.length - 1];
  }

  const weightLbs = kgToLbs(entry.weight);
  const age = calcAge(goals.dob);
  const tdee = calcTDEE(weightLbs, goals.height_in, age, goals.sex);
  const lbm = entry.fat != null ? weightLbs * (1 - entry.fat / 100) : null;
  const proteinGoal = lbm ? Math.round(lbm * 1.2) : 110;
  return { tdee, proteinGoal };
}

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

function getTargetIntakeForDate(date, workoutCalories) {
  const snap = getGoalForDate(date);
  const isAfterClosedGoal = snap && snap.is_closed && snap.goal_date && date > snap.goal_date;
  if (!snap || isAfterClosedGoal) {
    const fb = getMaintenanceFallback(date);
    const tdee = fb ? fb.tdee : 2000;
    return { targetIntake: tdee + workoutCalories, tdee: fb ? tdee : null, deficit: 0, isMaintenance: true };
  }
  const tdee = snap.saved_tdee || null;
  const deficit = snap.saved_deficit || 0;
  if (tdee) {
    return { targetIntake: (tdee + workoutCalories) - deficit, tdee, deficit };
  }
  return {
    targetIntake: (snap.daily_calorie_goal || 2000) + workoutCalories,
    tdee: null,
    deficit: 0,
  };
}

// isAlcoholicFoodItem — verbatim from meals.js
const ALCOHOL_KEYWORDS_SUB = ['beer', 'wine', 'whiskey', 'vodka', 'liquor', 'cocktail', 'bourbon', 'tequila', 'lager', 'cider', 'champagne', 'sake', 'amaretto'];
const ALCOHOL_KEYWORDS_WB = ['ale', 'rum', 'gin'];
const NON_ALCOHOLIC_MARKERS = ['non-alcoholic', 'athletic upside dawn', 'upside dawn athletic', 'athletic brewing', 'fake beer'];
const COOKING_FRAGMENTS = ['sauce', 'vinegar', 'marinade', 'glaze', 'broth'];

function isAlcoholicFoodItem(foodName) {
  const n = foodName.toLowerCase();
  if (NON_ALCOHOLIC_MARKERS.some(m => n.includes(m))) return false;
  if (COOKING_FRAGMENTS.some(f => n.includes(f))) return false;
  if (ALCOHOL_KEYWORDS_SUB.some(kw => n.includes(kw))) return true;
  if (ALCOHOL_KEYWORDS_WB.some(kw => new RegExp(`\\b${kw}\\b`).test(n))) return true;
  return false;
}

// ── calcAge ───────────────────────────────────────────────────────────────────

console.log('\ncalcAge()');
{
  const thisYear = new Date().getFullYear();

  // Jan 1 birthday — always passed by the time any test runs
  const dobJan = `${thisYear - 30}-01-01`;
  assertEqual(calcAge(dobJan), 30, 'birthday already passed this year → full year counted');

  // Dec 31 birthday — never passed by the time any test runs (unless it's Dec 31)
  const dobDec = `${thisYear - 30}-12-31`;
  const today = new Date();
  const expectedDec = (today.getMonth() === 11 && today.getDate() === 31) ? 30 : 29;
  assertEqual(calcAge(dobDec), expectedDec, 'birthday not yet passed → year not counted');

  // Result is a non-negative integer
  assert(Number.isInteger(calcAge('1990-06-15')), 'returns an integer');
  assert(calcAge('1990-06-15') >= 0, 'returns non-negative value');
}

// ── calcBMR ───────────────────────────────────────────────────────────────────

console.log('\ncalcBMR()');
{
  // Male: 150 lbs, 70 in, age 30
  // weightKg = 150 / 2.20462 ≈ 68.039, heightCm = 177.8
  // BMR = 10*68.039 + 6.25*177.8 - 5*30 + 5 ≈ 1646.64
  const maleBMR = calcBMR(150, 70, 30, 'male');
  assertClose(maleBMR, 1646.64, 0.1, 'male BMR formula: 150 lbs, 70 in, age 30');

  // Female same params — male formula uses +5, female uses -161, difference = 166
  const femaleBMR = calcBMR(150, 70, 30, 'female');
  assertClose(femaleBMR, maleBMR - 166, 0.01, 'female BMR is 166 less than male (same inputs)');

  // Higher weight → higher BMR
  assert(calcBMR(180, 70, 30, 'male') > calcBMR(150, 70, 30, 'male'), 'heavier person has higher BMR');

  // Older age → lower BMR
  assert(calcBMR(150, 70, 40, 'male') < calcBMR(150, 70, 30, 'male'), 'older person has lower BMR');

  // Taller → higher BMR
  assert(calcBMR(150, 75, 30, 'male') > calcBMR(150, 70, 30, 'male'), 'taller person has higher BMR');
}

// ── calcTDEE ─────────────────────────────────────────────────────────────────

console.log('\ncalcTDEE()');
{
  const bmr = calcBMR(150, 70, 30, 'male');
  assertEqual(calcTDEE(150, 70, 30, 'male'), Math.round(bmr * 1.375), 'TDEE = round(BMR * 1.375)');
  assert(Number.isInteger(calcTDEE(150, 70, 30, 'male')), 'TDEE is an integer');
  assert(calcTDEE(150, 70, 30, 'male') > calcBMR(150, 70, 30, 'male'), 'TDEE > BMR');
}

// ── getWeekStart ──────────────────────────────────────────────────────────────

console.log('\ngetWeekStart()');
{
  assertEqual(getWeekStart('2026-05-18'), '2026-05-18', 'Monday returns itself');
  assertEqual(getWeekStart('2026-05-17'), '2026-05-11', 'Sunday returns prior Monday');
  assertEqual(getWeekStart('2026-05-20'), '2026-05-18', 'Wednesday returns its Monday');
  assertEqual(getWeekStart('2026-05-24'), '2026-05-18', 'Sunday (next week) returns its Monday');
  assertEqual(getWeekStart('2026-12-31'), '2026-12-28', 'Thursday near year-end returns correct Monday');
}

// ── offsetDate ────────────────────────────────────────────────────────────────

console.log('\noffsetDate()');
{
  assertEqual(offsetDate('2026-05-17', 3),  '2026-05-20', 'adds 3 days');
  assertEqual(offsetDate('2026-05-17', -3), '2026-05-14', 'subtracts 3 days');
  assertEqual(offsetDate('2026-05-17', 0),  '2026-05-17', 'zero offset returns same date');
  assertEqual(offsetDate('2026-12-30', 5),  '2027-01-04', 'crosses year boundary');
  assertEqual(offsetDate('2026-03-01', -1), '2026-02-28', 'crosses month boundary');
}

// ── getMaintenanceFallback ────────────────────────────────────────────────────

console.log('\ngetMaintenanceFallback()');
{
  // Returns null when required data is missing
  allWeight = []; goals = {};
  assertNull(getMaintenanceFallback('2026-05-17'), 'null when allWeight is empty');

  allWeight = [{ date: '2026-05-10', weight: 56, fat: 15 }];
  goals = {};
  assertNull(getMaintenanceFallback('2026-05-17'), 'null when goals meta is missing');

  // Uses prior week (not current week) for the date's TDEE
  // date=2026-05-17 (Sun) → weekStart=2026-05-11 → looks at i=1: May 4–10
  allWeight = [
    { date: '2026-05-05', weight: 56, fat: 15 }, // in prior week [May 4–10] ✓
    { date: '2026-05-06', weight: 57, fat: 16 }, // in prior week [May 4–10] ✓
    { date: '2026-05-17', weight: 55, fat: 14 }, // current week → ignored ✓
  ];
  goals = { dob: '1990-01-01', height_in: 70, sex: 'male', goals: [] };
  const fb = getMaintenanceFallback('2026-05-17');
  assert(fb !== null, 'returns result when prior week has data');
  const expectedAvgKg = (56 + 57) / 2;
  const expectedTDEE = calcTDEE(kgToLbs(expectedAvgKg), 70, calcAge('1990-01-01'), 'male');
  assertEqual(fb.tdee, expectedTDEE, 'TDEE computed from prior week average weight');
  assert(fb.proteinGoal > 0, 'proteinGoal is positive');

  // Falls back to most recent entry before date when no prior week has weight data
  allWeight = [{ date: '2026-01-15', weight: 60, fat: null }];
  goals = { dob: '1990-01-01', height_in: 70, sex: 'male', goals: [] };
  const fbFallback = getMaintenanceFallback('2026-05-17');
  assert(fbFallback !== null, 'falls back to most recent prior entry when no weekly data');
  assertEqual(fbFallback.proteinGoal, 110, 'proteinGoal defaults to 110 when no fat data');
}

// ── getTargetIntakeForDate ────────────────────────────────────────────────────

console.log('\ngetTargetIntakeForDate()');
{
  const ACTIVE_GOAL = {
    saved_date: '2026-03-01',
    goal_date: '2026-05-16',
    saved_tdee: 1994,
    saved_deficit: 552,
    daily_calorie_goal: 1442,
  };

  // Active goal: uses saved_tdee - saved_deficit
  goals = { dob: '1990-01-01', height_in: 70, sex: 'male', goals: [ACTIVE_GOAL] };
  allWeight = [];
  let r = getTargetIntakeForDate('2026-04-01', 0);
  assertEqual(r.targetIntake, 1442, 'active goal: targetIntake = tdee - deficit');
  assertEqual(r.tdee, 1994, 'active goal: saved tdee returned');
  assertEqual(r.deficit, 552, 'active goal: saved deficit returned');
  assert(r.isMaintenance !== true, 'active goal: not flagged as maintenance');

  // Workout calories are added on top
  r = getTargetIntakeForDate('2026-04-01', 300);
  assertEqual(r.targetIntake, 1742, 'active goal: workout calories added to target');

  // No saved_tdee → falls back to daily_calorie_goal
  goals = { dob: '1990-01-01', height_in: 70, sex: 'male', goals: [{
    ...ACTIVE_GOAL, saved_tdee: null, saved_deficit: 0, daily_calorie_goal: 1500,
  }]};
  r = getTargetIntakeForDate('2026-04-01', 0);
  assertEqual(r.targetIntake, 1500, 'no saved_tdee: falls back to daily_calorie_goal');

  const CLOSED_GOAL = { ...ACTIVE_GOAL, is_closed: true };

  // Closed goal — date on the goal_date itself: still uses saved values
  goals = { dob: '1990-01-01', height_in: 70, sex: 'male', goals: [CLOSED_GOAL] };
  allWeight = [{ date: '2026-05-05', weight: 56, fat: 15 }];
  r = getTargetIntakeForDate('2026-05-16', 0);
  assertEqual(r.targetIntake, 1442, 'closed goal on goal_date: uses saved values');
  assert(r.isMaintenance !== true, 'closed goal on goal_date: not maintenance mode');

  // Closed goal — date after goal_date: switches to maintenance TDEE, no deficit
  r = getTargetIntakeForDate('2026-05-17', 0);
  assert(r.isMaintenance === true, 'closed goal after end: isMaintenance flag set');
  assertEqual(r.deficit, 0, 'closed goal after end: deficit is 0');
  assert(r.targetIntake !== 1442, 'closed goal after end: not using stale goal target');

  // No goals at all: maintenance fallback
  goals = { dob: '1990-01-01', height_in: 70, sex: 'male', goals: [] };
  allWeight = [{ date: '2026-05-05', weight: 56, fat: 15 }];
  r = getTargetIntakeForDate('2026-05-17', 0);
  assert(r.isMaintenance === true, 'no goals: isMaintenance flag set');
  assertEqual(r.deficit, 0, 'no goals: deficit is 0');
}

// ── isAlcoholicFoodItem ───────────────────────────────────────────────────────

console.log('\nisAlcoholicFoodItem()');
{
  // Alcoholic — substring keywords
  assert(isAlcoholicFoodItem('beer'), 'beer → true');
  assert(isAlcoholicFoodItem('Beer'), 'Beer (capitalized) → true');
  assert(isAlcoholicFoodItem('red wine'), 'red wine → true');
  assert(isAlcoholicFoodItem('whiskey'), 'whiskey → true');
  assert(isAlcoholicFoodItem('vodka soda'), 'vodka soda → true');
  assert(isAlcoholicFoodItem('bourbon on the rocks'), 'bourbon → true');
  assert(isAlcoholicFoodItem('champagne'), 'champagne → true');
  assert(isAlcoholicFoodItem('hard cider'), 'hard cider → true');

  // Alcoholic — word-boundary keywords
  assert(isAlcoholicFoodItem('rum and coke'), 'rum and coke → true');
  assert(isAlcoholicFoodItem('gin and tonic'), 'gin and tonic → true');
  assert(isAlcoholicFoodItem('ginger ale'), 'ginger ale → true');

  // Non-alcoholic markers take full priority
  assert(!isAlcoholicFoodItem('non-alcoholic beer'), 'non-alcoholic beer → false');
  assert(!isAlcoholicFoodItem('athletic brewing'), 'athletic brewing → false');
  assert(!isAlcoholicFoodItem('athletic upside dawn'), 'athletic upside dawn → false');
  assert(!isAlcoholicFoodItem('fake beer'), 'fake beer → false');

  // Cooking fragments short-circuit before keyword matching
  assert(!isAlcoholicFoodItem('whiskey sauce'), 'whiskey sauce → false (cooking fragment)');
  assert(!isAlcoholicFoodItem('wine vinegar'), 'wine vinegar → false (cooking fragment)');
  assert(!isAlcoholicFoodItem('beer broth'), 'beer broth → false (cooking fragment)');
  assert(!isAlcoholicFoodItem('bourbon glaze'), 'bourbon glaze → false (cooking fragment)');

  // Word boundary prevents false positives on WB keywords
  assert(!isAlcoholicFoodItem('drumroll'), 'drumroll → false (rum not a whole word)');
  assert(!isAlcoholicFoodItem('ginger'), 'ginger → false (gin not a whole word)');
  assert(!isAlcoholicFoodItem('engine oil'), 'engine oil → false (gin not a whole word)');

  // Unrelated food
  assert(!isAlcoholicFoodItem('chicken breast'), 'chicken breast → false');
  assert(!isAlcoholicFoodItem('orange juice'), 'orange juice → false');
  assert(!isAlcoholicFoodItem('sparkling water'), 'sparkling water → false');
}

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
