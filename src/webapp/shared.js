// ===== SHARED GLOBALS =====

let allWorkouts = [];
let allMeals = [];
let allWeight = [];
let goals = {};
let allReports = [];
let weightChart = null;

let currentChartRange = 'month';
let currentChartPeriod = '';

let availableMonths = [];
let currentMonthIndex = 0;

let workoutsFiltered = [];
let workoutsPage = 1;
const WORKOUTS_PER_PAGE = 15;

let mealsFiltered = [];
let mealsPage = 1;
const MEALS_PER_PAGE = 7;

let workoutSummaryRange = 'month';
let workoutSummaryPeriod = '';
let mealsChartPeriod = '';

// ===== PERIOD HELPERS =====
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getAvailablePeriods(dates, rangeType) {
  if (rangeType === 'week') return [...new Set(dates.map(d => getWeekStart(d)))].sort().reverse();
  if (rangeType === 'month') return [...new Set(dates.map(d => d.slice(0, 7)))].sort().reverse();
  if (rangeType === 'year') return [...new Set(dates.map(d => d.slice(0, 4)))].sort().reverse();
  return [];
}

function formatPeriodLabel(period, rangeType) {
  if (rangeType === 'week') {
    const d = new Date(period + 'T00:00:00');
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' – ' + end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (rangeType === 'month') {
    const [y, m] = period.split('-');
    return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return period;
}

function getCurrentPeriodKey(rangeType) {
  const today = new Date().toISOString().slice(0, 10);
  if (rangeType === 'week') return getWeekStart(today);
  if (rangeType === 'month') return today.slice(0, 7);
  if (rangeType === 'year') return today.slice(0, 4);
  return '';
}

const KG_TO_LBS = 2.20462;
function kgToLbs(kg) { return +(kg * KG_TO_LBS).toFixed(1); }

// ===== URL HELPERS =====
function pushUrl(updates) {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(updates)) {
    if (v == null) params.delete(k);
    else params.set(k, String(v));
  }
  history.pushState(null, '', '?' + params.toString());
}

function replaceUrl(updates) {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(updates)) {
    if (v == null) params.delete(k);
    else params.set(k, String(v));
  }
  history.replaceState(null, '', '?' + params.toString());
}

function restoreFromUrl() {
  const p = new URLSearchParams(window.location.search);

  const tab = p.get('tab') || 'overview';
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + tab));

  const range = p.get('range') || 'month';
  const rperiod = p.get('rperiod') || '';
  if (range !== currentChartRange || rperiod !== currentChartPeriod) {
    currentChartRange = range;
    currentChartPeriod = rperiod;
    buildOverviewPeriodSelects();
    renderWeightChart();
    renderBodyCompRatioChart();
  }

  const month = p.get('month');
  if (month && availableMonths.includes(month) && availableMonths.indexOf(month) !== currentMonthIndex) {
    currentMonthIndex = availableMonths.indexOf(month);
    renderDailySummary();
  }

  const wrange = p.get('wrange') || 'month';
  const wrperiod = p.get('wrperiod') || '';
  if (wrange !== workoutSummaryRange || wrperiod !== workoutSummaryPeriod) {
    workoutSummaryRange = wrange;
    workoutSummaryPeriod = wrperiod;
    buildWorkoutPeriodSelects();
    renderWorkoutSummary();
    renderIntensityTrends();
  }

  const wpage = parseInt(p.get('wpage')) || 1;
  if (wpage !== workoutsPage) {
    workoutsPage = wpage;
    renderWorkouts();
  }

  const mrange = p.get('mrange') || 'month';
  const mrperiod = p.get('mrperiod') || '';
  if (mrange !== mealsChartRange || mrperiod !== mealsChartPeriod) {
    mealsChartRange = mrange;
    mealsChartPeriod = mrperiod;
    buildMealsPeriodSelects();
    const ps = document.getElementById('proteinChartSection');
    const cs = document.getElementById('calorieChartSection');
    if (ps) ps.remove();
    if (cs) cs.remove();
    renderProteinChart();
    renderCalorieChart();
  }

  const mpage = parseInt(p.get('mpage')) || 1;
  if (mpage !== mealsPage) {
    mealsPage = mpage;
    renderMeals();
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  await loadData();

  // Apply URL state to vars before first render
  const p = new URLSearchParams(window.location.search);
  if (p.get('range')) currentChartRange = p.get('range');
  if (p.get('rperiod')) currentChartPeriod = p.get('rperiod');
  if (p.get('wrange')) workoutSummaryRange = p.get('wrange');
  if (p.get('wrperiod')) workoutSummaryPeriod = p.get('wrperiod');
  if (p.get('wpage')) workoutsPage = parseInt(p.get('wpage')) || 1;
  if (p.get('mrange')) mealsChartRange = p.get('mrange');
  if (p.get('mrperiod')) mealsChartPeriod = p.get('mrperiod');
  if (p.get('mpage')) mealsPage = parseInt(p.get('mpage')) || 1;

  buildAvailableMonths();
  if (p.get('month') && availableMonths.includes(p.get('month'))) {
    currentMonthIndex = availableMonths.indexOf(p.get('month'));
  }

  renderOverview();
  workoutsFiltered = sortedWorkouts(allWorkouts);
  renderWorkouts();
  mealsFiltered = groupedMealDates(allMeals);
  renderMeals();
  renderGoals();
  renderReports();
  setupWorkoutFilters();
  setupMealFilters();
  setupGoalsForm();
  setupChartRangeBtns();
  setupMonthNav();
  setupDayModal();
  setupLogMealModal();

  // Apply tab from URL
  const tab = p.get('tab') || 'overview';
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + tab));
  replaceUrl({ tab });

  window.addEventListener('popstate', restoreFromUrl);
});

// ===== DATA LOADING =====
async function loadData() {
  const [workoutsRes, weightRes, mealsRes, goalsRes, reportsRes] = await Promise.all([
    fetch('/api/workouts'),
    fetch('/api/weight'),
    fetch('/api/meals'),
    fetch('/api/goals'),
    fetch('/api/reports'),
  ]);
  allWorkouts = await workoutsRes.json();
  allWeight = await weightRes.json();
  allMeals = await mealsRes.json();
  goals = await goalsRes.json();
  allReports = await reportsRes.json();
  if (!goals.goals) goals.goals = [];
}

async function reloadAllData() {
  await loadData();
  buildAvailableMonths();
  workoutsFiltered = sortedWorkouts(allWorkouts);
  mealsFiltered = groupedMealDates(allMeals);
}

// ===== GOAL SNAPSHOT HELPERS =====
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

// ===== NAV =====
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      pushUrl({ tab: btn.dataset.tab });
    });
  });
}

// ===== HELPERS =====
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDuration(startIso, endIso) {
  const diff = (new Date(endIso) - new Date(startIso)) / 1000;
  const m = Math.floor(diff / 60);
  const s = Math.floor(diff % 60);
  return `${m}m ${s}s`;
}

function getDateFromISO(isoStr) {
  return isoStr.substring(0, 10);
}

function getYearMonth(dateStr) {
  return dateStr.substring(0, 7);
}

function sportClass(sport) {
  const map = {
    running: 'sport-running',
    weightlifting: 'sport-weightlifting',
    hiit: 'sport-hiit',
    'snow-shoveling': 'sport-snow-shoveling',
  };
  return map[sport] || 'sport-other';
}

function sportLabel(sport) {
  const labels = {
    weightlifting: 'weights',
  };
  return labels[sport] || sport.replace(/-/g, ' ');
}

// ===== WEIGHT LOOKUP HELPERS =====
function getWeightForDate(date) {
  return allWeight.find(w => w.date === date) || null;
}

function getLastKnownWeightBeforeDate(date) {
  if (!allWeight.length) return null;
  let best = null;
  for (const w of allWeight) {
    if (w.date <= date) best = w;
    else break;
  }
  return best || allWeight[0];
}

// ===== DAILY MAP =====
function buildDailyMap() {
  const map = {};
  allMeals.forEach(meal => {
    const d = meal.date;
    if (!map[d]) map[d] = { totalCaloriesIn: 0, workouts: [], workoutCalories: 0 };
    map[d].totalCaloriesIn += meal.total_calories || 0;
  });
  allWorkouts.forEach(w => {
    const d = getDateFromISO(w.start_time);
    if (!map[d]) map[d] = { totalCaloriesIn: 0, workouts: [], workoutCalories: 0 };
    map[d].workouts.push(w);
    map[d].workoutCalories += w.calories || 0;
  });
  return map;
}

function getTargetIntakeForDate(date, workoutCalories) {
  const snap = getGoalForDate(date);
  if (!snap) {
    return { targetIntake: 2000 + workoutCalories, tdee: null, deficit: 0 };
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

// ===== AVAILABLE MONTHS =====
function buildAvailableMonths() {
  const monthSet = new Set();
  allMeals.forEach(m => monthSet.add(getYearMonth(m.date)));
  allWorkouts.forEach(w => monthSet.add(getYearMonth(getDateFromISO(w.start_time))));
  allWeight.forEach(w => monthSet.add(getYearMonth(w.date)));
  availableMonths = [...monthSet].sort();
  currentMonthIndex = availableMonths.length - 1;
}

function monthLabel(ym) {
  const [year, month] = ym.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ===== PAGINATION HELPER =====
function renderPagination(el, currentPage, totalPages, onPageChange) {
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let html = '';
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">&#8592;</button>`;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  pages.forEach(p => {
    if (p === '...') {
      html += `<span class="page-info">…</span>`;
    } else {
      html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
  });

  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">&#8594;</button>`;
  html += `<span class="page-info">${currentPage} / ${totalPages}</span>`;

  el.innerHTML = html;
  el.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => onPageChange(parseInt(btn.dataset.page)));
  });
}

// ===== MACRO PIE CHART =====
function renderMacroPie(canvasId, protein, carbs, fat) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  const ctx = canvas.getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Protein', 'Carbs', 'Fat'],
      datasets: [{
        data: [
          parseFloat(protein.toFixed(1)),
          parseFloat(carbs.toFixed(1)),
          parseFloat(fat.toFixed(1)),
        ],
        backgroundColor: ['#6c63ff', '#00d4aa', '#ff6b6b'],
        borderColor: '#1a1d27',
        borderWidth: 2,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: false,
      cutout: '55%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw}g`,
          },
          backgroundColor: '#1a1d27',
          borderColor: '#2e3250',
          borderWidth: 1,
          titleColor: '#e8eaf0',
          bodyColor: '#8b90a8',
        },
      },
    },
  });
}
