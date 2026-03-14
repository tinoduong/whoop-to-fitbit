// ===== FITNESS DASHBOARD APP =====

let allWorkouts = [];
let allMeals = [];
let allWeight = [];
let goals = {};
let weightChart = null;

// Chart range state
let currentChartRange = 'month';

// Daily summary month state
let availableMonths = [];
let currentMonthIndex = 0;

// Pagination state
let workoutsFiltered = [];
let workoutsPage = 1;
const WORKOUTS_PER_PAGE = 15;

let mealsFiltered = [];
let mealsPage = 1;
const MEALS_PER_PAGE = 7; // days per page

// kg -> lbs
const KG_TO_LBS = 2.20462;
function kgToLbs(kg) { return +(kg * KG_TO_LBS).toFixed(1); }

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  await loadData();
  buildAvailableMonths();
  renderOverview();
  workoutsFiltered = sortedWorkouts(allWorkouts);
  renderWorkouts();
  mealsFiltered = groupedMealDates(allMeals);
  renderMeals();
  renderGoals();
  setupWorkoutFilters();
  setupMealFilters();
  setupGoalsForm();
  setupChartRangeBtns();
  setupMonthNav();
  setupDayModal();
  setupLogMealModal();
});

// ===== DATA LOADING =====
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
}

// ===== NAV =====
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
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
  return dateStr.substring(0, 7); // "2026-03"
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

// ===== AVAILABLE MONTHS =====
function buildAvailableMonths() {
  const monthSet = new Set();
  allMeals.forEach(m => monthSet.add(getYearMonth(m.date)));
  allWorkouts.forEach(w => monthSet.add(getYearMonth(getDateFromISO(w.start_time))));
  allWeight.forEach(w => monthSet.add(getYearMonth(w.date)));
  availableMonths = [...monthSet].sort();
  // Default to latest month
  currentMonthIndex = availableMonths.length - 1;
}

function monthLabel(ym) {
  const [year, month] = ym.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ===== OVERVIEW =====
function renderOverview() {
  renderWeightChart();
  renderDailySummary();
}

// ===== CHART RANGE =====
function setupChartRangeBtns() {
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChartRange = btn.dataset.range;
      renderWeightChart();
    });
  });
}

function filterWeightByRange(range) {
  if (!allWeight.length) return allWeight;
  const now = new Date(allWeight[allWeight.length - 1].date + 'T00:00:00');
  let cutoff;
  if (range === 'week') {
    cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
  } else if (range === 'month') {
    cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);
  } else if (range === 'year') {
    cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1);
  } else {
    return allWeight;
  }
  return allWeight.filter(w => new Date(w.date + 'T00:00:00') >= cutoff);
}

function renderWeightChart() {
  const ctx = document.getElementById('weightChart').getContext('2d');
  const filtered = filterWeightByRange(currentChartRange);

  const labels = filtered.map(w => w.date);
  const weightData = filtered.map(w => kgToLbs(w.weight));
  const fatData = filtered.map(w => w.fat);

  const datasets = [
    {
      label: 'Weight (lbs)',
      data: weightData,
      borderColor: '#6c63ff',
      backgroundColor: 'rgba(108,99,255,0.1)',
      tension: 0.3,
      yAxisID: 'yWeight',
      pointRadius: 4,
      pointHoverRadius: 6,
    },
    {
      label: 'Body Fat (%)',
      data: fatData,
      borderColor: '#00d4aa',
      backgroundColor: 'rgba(0,212,170,0.1)',
      tension: 0.3,
      yAxisID: 'yFat',
      pointRadius: 4,
      pointHoverRadius: 6,
    },
  ];

  if (goals.target_weight) {
    datasets.push({
      label: 'Goal Weight (lbs)',
      data: labels.map(() => goals.target_weight),
      borderColor: 'rgba(108,99,255,0.4)',
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      yAxisID: 'yWeight',
    });
  }
  if (goals.target_fat) {
    datasets.push({
      label: 'Goal Fat (%)',
      data: labels.map(() => goals.target_fat),
      borderColor: 'rgba(0,212,170,0.4)',
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      yAxisID: 'yFat',
    });
  }

  if (weightChart) weightChart.destroy();

  weightChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#e8eaf0', font: { size: 12 } } },
        tooltip: {
          backgroundColor: '#1a1d27',
          borderColor: '#2e3250',
          borderWidth: 1,
          titleColor: '#e8eaf0',
          bodyColor: '#8b90a8',
        },
      },
      scales: {
        x: {
          ticks: { color: '#8b90a8', maxRotation: 45 },
          grid: { color: 'rgba(46,50,80,0.5)' },
        },
        yWeight: {
          type: 'linear',
          position: 'left',
          ticks: { color: '#6c63ff' },
          grid: { color: 'rgba(46,50,80,0.5)' },
          title: { display: true, text: 'Weight (lbs)', color: '#6c63ff' },
        },
        yFat: {
          type: 'linear',
          position: 'right',
          ticks: { color: '#00d4aa' },
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Body Fat (%)', color: '#00d4aa' },
        },
      },
    },
  });
}

// ===== MONTH NAV =====
function setupMonthNav() {
  document.getElementById('prevMonth').addEventListener('click', () => {
    if (currentMonthIndex > 0) {
      currentMonthIndex--;
      renderDailySummary();
    }
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    if (currentMonthIndex < availableMonths.length - 1) {
      currentMonthIndex++;
      renderDailySummary();
    }
  });
}

function renderDailySummary() {
  const container = document.getElementById('dailySummary');
  const label = document.getElementById('currentMonthLabel');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');

  const ym = availableMonths[currentMonthIndex];
  label.textContent = ym ? monthLabel(ym) : '';
  prevBtn.disabled = currentMonthIndex <= 0;
  nextBtn.disabled = currentMonthIndex >= availableMonths.length - 1;

  if (!ym) {
    container.innerHTML = '<div class="empty-state">No data available</div>';
    return;
  }

  const dailyMap = buildDailyMap();

  // Compute TDEE and daily deficit needed for per-day target calculation
  let baseTDEE = 0;
  let dailyDeficitNeeded = 0;
  if (goals.dob && goals.height_in && allWeight.length) {
    const age = calcAge(goals.dob);
    const latestLbs = kgToLbs(allWeight[allWeight.length - 1].weight);
    baseTDEE = calcTDEE(latestLbs, goals.height_in, age, goals.sex || 'male');
    if (goals.target_weight && goals.goal_date) {
      const today = new Date();
      const goalDate = new Date(goals.goal_date);
      const daysLeft = Math.max(1, Math.round((goalDate - today) / (1000 * 60 * 60 * 24)));
      const lbsToLose = latestLbs - goals.target_weight;
      if (lbsToLose > 0) {
        dailyDeficitNeeded = Math.round((lbsToLose * 3500) / daysLeft);
      }
    }
  }

  // Generate every day in the month regardless of data
  const [ymYear, ymMonth] = ym.split('-').map(Number);
  const daysInMonth = new Date(ymYear, ymMonth, 0).getDate();
  const sortedDates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    sortedDates.push(`${ym}-${String(d).padStart(2, '0')}`);
  }

  // Build a helper to compute per-day data
  function getDayData(date) {
    const day = dailyMap[date] || { totalCaloriesIn: 0, workouts: [], workoutCalories: 0 };
    const hasMeals = day.totalCaloriesIn > 0;
    const hasWorkout = day.workouts.length > 0;
    const sportNames = [...new Set(day.workouts.map(w => w.sport_name))];
    const targetIntake = baseTDEE > 0
      ? (baseTDEE + day.workoutCalories) - dailyDeficitNeeded
      : (goals.daily_calorie_goal || 2000) + day.workoutCalories;
    const delta = targetIntake - day.totalCaloriesIn;
    const metGoal = hasMeals && delta >= 0;
    return { day, hasMeals, hasWorkout, sportNames, targetIntake, delta, metGoal };
  }

  // Group sortedDates into calendar weeks (Sun–Sat)
  const firstDate = new Date(sortedDates[0] + 'T00:00:00');
  const lastDate = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');

  // Start from the Sunday of the first week
  const startSunday = new Date(firstDate);
  startSunday.setDate(firstDate.getDate() - firstDate.getDay());

  // End on the Saturday of the last week
  const endSaturday = new Date(lastDate);
  endSaturday.setDate(lastDate.getDate() + (6 - lastDate.getDay()));

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Build weeks array
  const weeks = [];
  let cur = new Date(startSunday);
  while (cur <= endSaturday) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(cur.toISOString().substring(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  // Header row
  let html = `<div class="cal-header">${DAY_NAMES.map(d => `<div class="cal-hdr-cell">${d}</div>`).join('')}<div class="cal-hdr-cell cal-week-summary-hdr">Week</div></div>`;

  html += weeks.map(week => {
    const weekDayCells = week.map(date => {
      const inMonth = getYearMonth(date) === ym;
      const d = new Date(date + 'T00:00:00');
      const dayNum = d.getDate();

      if (!inMonth) {
        return `<div class="cal-cell cal-cell-out"></div>`;
      }

      const { day, hasMeals, hasWorkout, sportNames, targetIntake, delta, metGoal } = getDayData(date);
      const cardClass = hasMeals ? (metGoal ? 'met' : 'missed') : '';

      let inner = `<div class="cal-day-num">${dayNum}</div>`;
      if (hasMeals) {
        inner += `<div class="cal-goal-line">🎯 ${targetIntake}</div>`;
        inner += `<div class="cal-cals">🍽 ${day.totalCaloriesIn}</div>`;
        inner += `<div class="cal-delta ${metGoal ? 'under' : 'over'}">${delta >= 0 ? '▼' + delta : '▲' + Math.abs(delta)}</div>`;
      } else {
        inner += `<div class="cal-goal-line">🎯 ${targetIntake}</div>`;
        inner += `<div class="cal-no-data">no meals</div>`;
      }
      if (hasWorkout) {
        inner += `<div class="cal-workout">🏃 ${sportNames.join(', ')}</div>`;
      }

      return `<div class="cal-cell ${cardClass}" title="${date}" onclick="openDayModal('${date}')" style="cursor:pointer">${inner}</div>`;
    }).join('');

    // Weekly summary
    const weekDaysInMonth = week.filter(d => getYearMonth(d) === ym);
    const weekMealDays = weekDaysInMonth.filter(d => (dailyMap[d] || {}).totalCaloriesIn > 0);
    const todayStr = new Date().toISOString().substring(0, 10);

    const weekSunday = week[0];
    const weekSaturday = week[6];
    const weekEnd = weekSaturday > todayStr ? todayStr : weekSaturday;

    const weekWeightEntries = allWeight.filter(w => w.date >= weekSunday && w.date <= weekEnd);
    let weightDeltaHtml = '';
    if (weekWeightEntries.length >= 2) {
      const startW = kgToLbs(weekWeightEntries[0].weight);
      const endW = kgToLbs(weekWeightEntries[weekWeightEntries.length - 1].weight);
      const wDelta = +(endW - startW).toFixed(1);
      const wColor = wDelta <= 0 ? 'var(--green)' : 'var(--red)';
      weightDeltaHtml = `<div class="week-sum-weight" style="color:${wColor}">${wDelta > 0 ? '+' : ''}${wDelta} lbs</div>`;
    } else if (weekWeightEntries.length === 1) {
      weightDeltaHtml = `<div class="week-sum-weight" style="color:var(--text-muted)">${kgToLbs(weekWeightEntries[0].weight)} lbs</div>`;
    }

    let weeklySummaryHtml = '';
    if (weekMealDays.length > 0) {
      const weekTotalIn = weekMealDays.reduce((s, d) => s + (dailyMap[d].totalCaloriesIn || 0), 0);
      const weekTotalTarget = weekMealDays.reduce((s, d) => {
        const { targetIntake } = getDayData(d);
        return s + targetIntake;
      }, 0);
      const weekDelta = weekTotalTarget - weekTotalIn;
      const weekMet = weekDelta >= 0;
      weeklySummaryHtml = `
        <div class="cal-week-summary ${weekMet ? 'week-met' : 'week-missed'}">
          <div class="week-sum-label">${weekMealDays.length}d logged</div>
          <div class="week-sum-goal">🎯 ${weekTotalTarget}</div>
          <div class="week-sum-ate">🍽 ${weekTotalIn}</div>
          <div class="week-sum-delta ${weekMet ? 'under' : 'over'}">${weekMet ? '▼' + weekDelta : '▲' + Math.abs(weekDelta)}</div>
          ${weightDeltaHtml}
          <div class="week-sum-status">${weekMet ? '✅' : '⚠️'}</div>
        </div>
      `;
    } else {
      weeklySummaryHtml = `<div class="cal-week-summary week-empty">${weightDeltaHtml || '—'}</div>`;
    }

    return `<div class="cal-row">${weekDayCells}<div class="cal-week-col">${weeklySummaryHtml}</div></div>`;
  }).join('');

  container.innerHTML = `<div class="cal-grid">${html}</div>`;
}

// ===== WORKOUTS =====
function sortedWorkouts(workouts) {
  return [...workouts].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
}

function renderWorkouts() {
  const tbody = document.getElementById('workoutsBody');
  const paginationEl = document.getElementById('workoutsPagination');

  // Populate sport filter (always from allWorkouts)
  const sportFilter = document.getElementById('workoutSportFilter');
  const sports = [...new Set(allWorkouts.map(w => w.sport_name))].sort();
  const currentSport = sportFilter.value;
  sportFilter.innerHTML = '<option value="">All Sports</option>' +
    sports.map(s => `<option value="${s}" ${s === currentSport ? 'selected' : ''}>${s.replace(/-/g, ' ')}</option>`).join('');

  if (workoutsFiltered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No workouts found</td></tr>';
    paginationEl.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(workoutsFiltered.length / WORKOUTS_PER_PAGE);
  if (workoutsPage > totalPages) workoutsPage = totalPages;
  const start = (workoutsPage - 1) * WORKOUTS_PER_PAGE;
  const pageItems = workoutsFiltered.slice(start, start + WORKOUTS_PER_PAGE);

  tbody.innerHTML = pageItems.map(w => {
    const date = getDateFromISO(w.start_time);
    const dist = w.distance_meter != null ? w.distance_meter.toFixed(1) : '—';
    return `
      <tr>
        <td>${formatDate(date)}</td>
        <td><span class="sport-tag ${sportClass(w.sport_name)}">${w.sport_name.replace(/-/g, ' ')}</span></td>
        <td>${formatTime(w.start_time)}</td>
        <td>${formatDuration(w.start_time, w.end_time)}</td>
        <td>${w.avg_heart_rate} bpm</td>
        <td>${w.calories} kcal</td>
        <td>${dist}</td>
      </tr>
    `;
  }).join('');

  renderPagination(paginationEl, workoutsPage, totalPages, (p) => {
    workoutsPage = p;
    renderWorkouts();
  });
}

function setupWorkoutFilters() {
  document.getElementById('workoutFilterBtn').addEventListener('click', applyWorkoutFilters);
  document.getElementById('workoutResetBtn').addEventListener('click', () => {
    document.getElementById('workoutSearch').value = '';
    document.getElementById('workoutSportFilter').value = '';
    document.getElementById('workoutDateFrom').value = '';
    document.getElementById('workoutDateTo').value = '';
    workoutsFiltered = sortedWorkouts(allWorkouts);
    workoutsPage = 1;
    renderWorkouts();
  });
  document.getElementById('workoutSearch').addEventListener('input', applyWorkoutFilters);
}

function applyWorkoutFilters() {
  const search = document.getElementById('workoutSearch').value.toLowerCase();
  const sport = document.getElementById('workoutSportFilter').value;
  const dateFrom = document.getElementById('workoutDateFrom').value;
  const dateTo = document.getElementById('workoutDateTo').value;

  workoutsFiltered = sortedWorkouts(allWorkouts.filter(w => {
    const date = getDateFromISO(w.start_time);
    if (search && !w.sport_name.toLowerCase().includes(search)) return false;
    if (sport && w.sport_name !== sport) return false;
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;
    return true;
  }));
  workoutsPage = 1;
  renderWorkouts();
}

// ===== MEALS =====
function groupedMealDates(meals) {
  const byDate = {};
  meals.forEach(meal => {
    if (!byDate[meal.date]) byDate[meal.date] = [];
    byDate[meal.date].push(meal);
  });
  return Object.keys(byDate).sort().reverse().map(date => ({ date, meals: byDate[date] }));
}

function renderMeals() {
  const container = document.getElementById('mealsContainer');
  const paginationEl = document.getElementById('mealsPagination');

  if (mealsFiltered.length === 0) {
    container.innerHTML = '<div class="card"><div class="empty-state">No meals found</div></div>';
    paginationEl.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(mealsFiltered.length / MEALS_PER_PAGE);
  if (mealsPage > totalPages) mealsPage = totalPages;
  const start = (mealsPage - 1) * MEALS_PER_PAGE;
  const pageItems = mealsFiltered.slice(start, start + MEALS_PER_PAGE);

  container.innerHTML = pageItems.map(({ date, meals: dayMeals }) => {
    const totalCals = dayMeals.reduce((s, m) => s + (m.total_calories || 0), 0);
    const totalProtein = dayMeals.reduce((s, m) => s + (m.total_protein || 0), 0);

    const mealsHtml = dayMeals.map(meal => {
      const typeClass = `meal-${meal.meal_type}`;
      const items = meal.items || [];
      const totalCarbs = items.reduce((s, i) => s + (i.totalCarbohydrate || 0), 0);
      const totalFat = items.reduce((s, i) => s + (i.totalFat || 0), 0);
      const protein = meal.total_protein || 0;
      const itemChips = items.map(item =>
        `<span class="meal-item-chip">${item.foodName}<span class="item-cals">${item.calories} kcal</span></span>`
      ).join('');

      const chartId = `macro-pie-${meal.id || (date + '-' + meal.meal_type + '-' + Math.random().toString(36).slice(2))}`;
      setTimeout(() => renderMacroPie(chartId, protein, totalCarbs, totalFat), 0);

      return `
        <div class="meal-entry">
          <div class="meal-entry-header">
            <span class="meal-type-label ${typeClass}">${meal.meal_type}</span>
            <span class="meal-cals">${meal.total_calories} kcal</span>
          </div>
          <div class="meal-description">${meal.raw_description}</div>
          <div class="meal-items">${itemChips}</div>
          <div class="meal-entry-bottom">
            <div class="meal-macros">
              <span class="macro-p">P: ${protein.toFixed(1)}g</span>
              <span class="macro-c">C: ${totalCarbs.toFixed(1)}g</span>
              <span class="macro-f">F: ${totalFat.toFixed(1)}g</span>
            </div>
            <div class="meal-pie-wrap">
              <canvas id="${chartId}" width="80" height="80"></canvas>
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="meal-day-group">
        <div class="meal-day-header">
          <h4>${formatDate(date)}</h4>
          <div class="day-totals">
            <span>🍽 ${totalCals} kcal</span>
            <span class="macro-p">P: ${totalProtein.toFixed(1)}g</span>
          </div>
        </div>
        <div class="meal-day-body">${mealsHtml}</div>
      </div>
    `;
  }).join('');

  renderPagination(paginationEl, mealsPage, totalPages, (p) => {
    mealsPage = p;
    renderMeals();
  });
}

function setupMealFilters() {
  document.getElementById('mealFilterBtn').addEventListener('click', applyMealFilters);
  document.getElementById('mealResetBtn').addEventListener('click', () => {
    document.getElementById('mealSearch').value = '';
    document.getElementById('mealTypeFilter').value = '';
    document.getElementById('mealDateFrom').value = '';
    document.getElementById('mealDateTo').value = '';
    mealsFiltered = groupedMealDates(allMeals);
    mealsPage = 1;
    renderMeals();
  });
  document.getElementById('mealSearch').addEventListener('input', applyMealFilters);
}

function applyMealFilters() {
  const search = document.getElementById('mealSearch').value.toLowerCase();
  const type = document.getElementById('mealTypeFilter').value;
  const dateFrom = document.getElementById('mealDateFrom').value;
  const dateTo = document.getElementById('mealDateTo').value;

  const filtered = allMeals.filter(meal => {
    if (type && meal.meal_type !== type) return false;
    if (dateFrom && meal.date < dateFrom) return false;
    if (dateTo && meal.date > dateTo) return false;
    if (search) {
      const inDesc = meal.raw_description.toLowerCase().includes(search);
      const inItems = (meal.items || []).some(i => i.foodName.toLowerCase().includes(search));
      if (!inDesc && !inItems) return false;
    }
    return true;
  });

  mealsFiltered = groupedMealDates(filtered);
  mealsPage = 1;
  renderMeals();
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
  // Destroy existing chart on this canvas if any
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

// ===== DAY MODAL =====
function setupDayModal() {
  // Inject modal HTML into the page if not already present
  if (!document.getElementById('dayModal')) {
    const modalEl = document.createElement('div');
    modalEl.id = 'dayModal';
    modalEl.className = 'day-modal-overlay';
    modalEl.style.display = 'none';
    modalEl.innerHTML = `
      <div class="day-modal" id="dayModalInner">
        <button class="day-modal-close" id="dayModalCloseBtn">✕</button>
        <div id="dayModalContent"></div>
      </div>
    `;
    document.body.appendChild(modalEl);

    // Inject modal CSS
    const style = document.createElement('style');
    style.textContent = `
      .day-modal-overlay {
        position: fixed; inset: 0; z-index: 1000;
        background: rgba(10, 11, 20, 0.88);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
      }
      .day-modal {
        background: #1a1d27;
        border: 1px solid #2e3250;
        border-radius: 16px;
        width: min(760px, 95vw);
        max-height: 88vh;
        overflow-y: auto;
        padding: 28px 32px;
        position: relative;
        scrollbar-width: thin;
        scrollbar-color: #2e3250 transparent;
      }
      .day-modal::-webkit-scrollbar { width: 6px; }
      .day-modal::-webkit-scrollbar-track { background: transparent; }
      .day-modal::-webkit-scrollbar-thumb { background: #2e3250; border-radius: 3px; }
      .day-modal-close {
        position: absolute; top: 16px; right: 20px;
        background: transparent; border: none;
        color: #8b90a8; font-size: 18px; cursor: pointer;
        padding: 4px 8px; line-height: 1; border-radius: 6px;
        transition: color 0.15s, background 0.15s;
      }
      .day-modal-close:hover { color: #e8eaf0; background: rgba(255,255,255,0.06); }
      .day-modal h2 { margin: 0 0 20px; font-size: 1.2rem; color: #e8eaf0; padding-right: 32px; }
      .day-modal-section { margin-bottom: 24px; }
      .day-modal-section:last-child { margin-bottom: 0; }
      .day-modal-section h3 {
        font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.09em;
        color: #8b90a8; margin: 0 0 10px;
        padding-bottom: 8px; border-bottom: 1px solid #2e3250;
      }
      .day-modal-workout-row {
        display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
        background: rgba(108,99,255,0.06); border: 1px solid rgba(108,99,255,0.15);
        border-radius: 10px; padding: 10px 14px; margin-bottom: 8px;
      }
      .day-modal-workout-row span { font-size: 0.83rem; color: #c8cbdf; }
      .day-modal-empty { color: #8b90a8; font-size: 0.85rem; padding: 8px 0; }
      .modal-day-macro-row {
        display: flex; align-items: center; gap: 20px;
        background: rgba(108,99,255,0.05); border: 1px solid rgba(108,99,255,0.14);
        border-radius: 10px; padding: 14px 18px; margin-bottom: 14px;
      }
      .modal-macro-info { display: flex; flex-direction: column; gap: 5px; }
      .modal-macro-info .modal-macro-title {
        font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.07em;
        color: #8b90a8; margin-bottom: 4px;
      }
      .modal-macro-info span { font-size: 0.84rem; }
      .modal-meal-entry {
        display: flex; align-items: center; gap: 16px;
        background: rgba(255,255,255,0.02); border: 1px solid #2e3250;
        border-radius: 10px; padding: 12px 16px; margin-bottom: 8px;
      }
      .modal-meal-entry:last-child { margin-bottom: 0; }
      .modal-meal-entry-info { flex: 1; min-width: 0; }
      .modal-meal-entry-header {
        display: flex; align-items: center; gap: 10px; margin-bottom: 4px;
      }
      .modal-meal-entry-header strong { font-size: 0.9rem; color: #e8eaf0; }
      .modal-meal-desc { font-size: 0.8rem; color: #8b90a8; margin-bottom: 6px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .modal-meal-macros { display: flex; gap: 10px; }
      .modal-meal-macros span { font-size: 0.8rem; }
      /* Layout tweak for meal entries in meals tab */
      .meal-entry-bottom {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-top: 6px;
      }
      .meal-pie-wrap { flex-shrink: 0; }

      /* ===== LOG MEAL MODAL ===== */
      .log-meal-btn {
        background: linear-gradient(135deg, #6c63ff, #5a52d5);
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 7px 14px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        letter-spacing: 0.03em;
        transition: opacity 0.15s;
        white-space: nowrap;
      }
      .log-meal-btn:hover { opacity: 0.85; }

      .log-meal-overlay {
        position: fixed; inset: 0; z-index: 1100;
        background: rgba(10, 11, 20, 0.9);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
      }
      .log-meal-modal {
        background: #1a1d27;
        border: 1px solid #2e3250;
        border-radius: 16px;
        width: min(520px, 95vw);
        padding: 28px 32px;
        position: relative;
      }
      .log-meal-modal h2 {
        margin: 0 0 6px;
        font-size: 1.1rem;
        color: #e8eaf0;
        padding-right: 28px;
      }
      .log-meal-modal .log-meal-hint {
        font-size: 0.78rem;
        color: #8b90a8;
        margin: 0 0 16px;
      }
      .log-meal-modal textarea {
        width: 100%;
        box-sizing: border-box;
        background: #12131e;
        border: 1px solid #2e3250;
        border-radius: 10px;
        color: #e8eaf0;
        font-size: 0.88rem;
        font-family: inherit;
        padding: 12px 14px;
        resize: vertical;
        min-height: 90px;
        outline: none;
        transition: border-color 0.15s;
      }
      .log-meal-modal textarea:focus { border-color: #6c63ff; }
      .log-meal-modal textarea:disabled { opacity: 0.5; }
      .log-meal-actions {
        display: flex; align-items: center; justify-content: flex-end;
        gap: 10px; margin-top: 14px;
      }
      .log-meal-cancel-btn {
        background: transparent;
        border: 1px solid #2e3250;
        color: #8b90a8;
        border-radius: 8px;
        padding: 7px 14px;
        font-size: 0.82rem;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }
      .log-meal-cancel-btn:hover { border-color: #8b90a8; color: #e8eaf0; }
      .log-meal-submit-btn {
        background: linear-gradient(135deg, #6c63ff, #5a52d5);
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 7px 18px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .log-meal-submit-btn:hover:not(:disabled) { opacity: 0.85; }
      .log-meal-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .log-meal-progress {
        margin-top: 14px;
        display: flex;
        gap: 0;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #2e3250;
      }
      .log-meal-step {
        flex: 1;
        text-align: center;
        padding: 8px 4px;
        font-size: 0.75rem;
        color: #8b90a8;
        background: #12131e;
        border-right: 1px solid #2e3250;
        transition: background 0.2s, color 0.2s;
      }
      .log-meal-step:last-child { border-right: none; }
      .log-meal-step.active {
        background: rgba(108,99,255,0.15);
        color: #6c63ff;
        font-weight: 600;
      }
      .log-meal-step.done {
        background: rgba(0,212,170,0.1);
        color: #00d4aa;
      }
      .log-meal-error {
        margin-top: 12px;
        padding: 10px 14px;
        background: rgba(255,107,107,0.1);
        border: 1px solid rgba(255,107,107,0.3);
        border-radius: 8px;
        color: #ff6b6b;
        font-size: 0.8rem;
      }
      .log-meal-modal-close {
        position: absolute; top: 16px; right: 20px;
        background: transparent; border: none;
        color: #8b90a8; font-size: 18px; cursor: pointer;
        padding: 4px 8px; line-height: 1; border-radius: 6px;
        transition: color 0.15s, background 0.15s;
      }
      .log-meal-modal-close:hover { color: #e8eaf0; background: rgba(255,255,255,0.06); }
    `;
    document.head.appendChild(style);
  }

  // Event listeners
  document.getElementById('dayModalCloseBtn').addEventListener('click', closeDayModal);
  document.getElementById('dayModal').addEventListener('click', e => {
    if (e.target === document.getElementById('dayModal')) closeDayModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDayModal();
  });
}

function closeDayModal() {
  const modal = document.getElementById('dayModal');
  if (modal) modal.style.display = 'none';
}

function openDayModal(date) {
  const dailyMap = buildDailyMap();
  const day = dailyMap[date] || { totalCaloriesIn: 0, workouts: [], workoutCalories: 0 };
  const dayMeals = allMeals.filter(m => m.date === date);

  // Aggregate day-level macros
  const totalProtein = dayMeals.reduce((s, m) => s + (m.total_protein || 0), 0);
  const totalCarbs   = dayMeals.reduce((s, m) =>
    s + (m.items || []).reduce((si, i) => si + (i.totalCarbohydrate || 0), 0), 0);
  const totalFat     = dayMeals.reduce((s, m) =>
    s + (m.items || []).reduce((si, i) => si + (i.totalFat || 0), 0), 0);

  // Compute target intake for the day
  let baseTDEE = 0;
  let dailyDeficitNeeded = 0;
  if (goals.dob && goals.height_in && allWeight.length) {
    const age = calcAge(goals.dob);
    const latestLbs = kgToLbs(allWeight[allWeight.length - 1].weight);
    baseTDEE = calcTDEE(latestLbs, goals.height_in, age, goals.sex || 'male');
    if (goals.target_weight && goals.goal_date) {
      const today = new Date();
      const goalDate = new Date(goals.goal_date);
      const daysLeft = Math.max(1, Math.round((goalDate - today) / (1000 * 60 * 60 * 24)));
      const lbsToLose = latestLbs - goals.target_weight;
      if (lbsToLose > 0) {
        dailyDeficitNeeded = Math.round((lbsToLose * 3500) / daysLeft);
      }
    }
  }
  const targetIntake = baseTDEE > 0
    ? (baseTDEE + day.workoutCalories) - dailyDeficitNeeded
    : (goals.daily_calorie_goal || 2000) + day.workoutCalories;
  const delta = targetIntake - day.totalCaloriesIn;
  const metGoal = day.totalCaloriesIn > 0 && delta >= 0;

  // Workouts section
  const workoutsHtml = day.workouts.length
    ? day.workouts.map(w => `
        <div class="day-modal-workout-row">
          <span><span class="sport-tag ${sportClass(w.sport_name)}">${w.sport_name.replace(/-/g, ' ')}</span></span>
          <span>⏱ ${formatDuration(w.start_time, w.end_time)}</span>
          <span>❤️ ${w.avg_heart_rate} bpm avg</span>
          <span>🔥 ${w.calories} kcal</span>
          ${w.distance_meter != null ? `<span>📍 ${(w.distance_meter / 1609.34).toFixed(2)} mi</span>` : ''}
        </div>`).join('')
    : `<div class="day-modal-empty">No workouts logged</div>`;

  // Per-meal rows with individual pie charts
  const dayPieId = `modal-day-pie-${date}`;
  const mealsHtml = dayMeals.length
    ? dayMeals.map((meal, idx) => {
        const items = meal.items || [];
        const mCarbs = items.reduce((s, i) => s + (i.totalCarbohydrate || 0), 0);
        const mFat   = items.reduce((s, i) => s + (i.totalFat || 0), 0);
        const mProt  = meal.total_protein || 0;
        const pieId  = `modal-meal-pie-${date}-${idx}`;
        setTimeout(() => renderMacroPie(pieId, mProt, mCarbs, mFat), 0);
        return `
          <div class="modal-meal-entry">
            <canvas id="${pieId}" width="72" height="72" style="flex-shrink:0"></canvas>
            <div class="modal-meal-entry-info">
              <div class="modal-meal-entry-header">
                <span class="meal-type-label meal-${meal.meal_type}">${meal.meal_type}</span>
                <strong>${meal.total_calories} kcal</strong>
              </div>
              <div class="modal-meal-desc" title="${meal.raw_description}">${meal.raw_description}</div>
              <div class="modal-meal-macros">
                <span class="macro-p">P: ${mProt.toFixed(1)}g</span>
                <span class="macro-c">C: ${mCarbs.toFixed(1)}g</span>
                <span class="macro-f">F: ${mFat.toFixed(1)}g</span>
              </div>
            </div>
          </div>`;
      }).join('')
    : `<div class="day-modal-empty">No meals logged</div>`;

  const calStatus = day.totalCaloriesIn > 0
    ? `<span style="color:${metGoal ? '#00d4aa' : '#ff6b6b'};margin-left:10px;font-size:0.85rem">
        ${metGoal ? '▼ ' + delta + ' under' : '▲ ' + Math.abs(delta) + ' over'} target
       </span>`
    : '';

  document.getElementById('dayModalContent').innerHTML = `
    <h2>📅 ${formatDate(date)}</h2>

    <div class="day-modal-section">
      <h3>🏋️ Workouts · ${day.workoutCalories} kcal burned</h3>
      ${workoutsHtml}
    </div>

    <div class="day-modal-section">
      <h3>🍽 Nutrition · ${day.totalCaloriesIn} kcal consumed · 🎯 ${targetIntake} target ${calStatus}</h3>
      ${dayMeals.length ? `
        <div class="modal-day-macro-row">
          <canvas id="${dayPieId}" width="96" height="96" style="flex-shrink:0"></canvas>
          <div class="modal-macro-info">
            <div class="modal-macro-title">Day Total Macros</div>
            <span class="macro-p">Protein: ${totalProtein.toFixed(1)}g</span>
            <span class="macro-c">Carbs: ${totalCarbs.toFixed(1)}g</span>
            <span class="macro-f">Fat: ${totalFat.toFixed(1)}g</span>
          </div>
        </div>` : ''}
      ${mealsHtml}
    </div>
  `;

  document.getElementById('dayModal').style.display = 'flex';

  // Render day-level pie after DOM update
  if (dayMeals.length) {
    setTimeout(() => renderMacroPie(dayPieId, totalProtein, totalCarbs, totalFat), 0);
  }
}

// ===== LOG MEAL MODAL =====
function setupLogMealModal() {
  // Inject the modal HTML
  if (!document.getElementById('logMealOverlay')) {
    const el = document.createElement('div');
    el.id = 'logMealOverlay';
    el.className = 'log-meal-overlay';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="log-meal-modal" id="logMealModal">
        <button class="log-meal-modal-close" id="logMealCloseBtn">✕</button>
        <h2>🍽 Log a Meal</h2>
        <p class="log-meal-hint">
          Describe your meal naturally — type, items, quantities, and date if not today.<br>
          e.g. "dinner: 6oz grilled salmon, 1 cup rice, steamed broccoli"<br>
          or "update lunch today to add a cookie"
        </p>
        <textarea id="logMealInput" placeholder="dinner: grilled chicken, roasted potatoes, glass of wine" rows="4"></textarea>
        <div id="logMealProgress" class="log-meal-progress" style="display:none">
          <div class="log-meal-step" id="lmStep1">1 · Parsing</div>
          <div class="log-meal-step" id="lmStep2">2 · Uploading</div>
          <div class="log-meal-step" id="lmStep3">3 · Done</div>
        </div>
        <div id="logMealError" class="log-meal-error" style="display:none"></div>
        <div class="log-meal-actions">
          <button class="log-meal-cancel-btn" id="logMealCancelBtn">Cancel</button>
          <button class="log-meal-submit-btn" id="logMealSubmitBtn">Log Meal</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
  }

  // Inject the "+ Log Meal" button into the meals tab filter bar
  // Looks for the meals filter row; appends button after the reset button
  const mealResetBtn = document.getElementById('mealResetBtn');
  if (mealResetBtn && !document.getElementById('openLogMealBtn')) {
    const btn = document.createElement('button');
    btn.id = 'openLogMealBtn';
    btn.className = 'log-meal-btn';
    btn.textContent = '+ Log Meal';
    btn.addEventListener('click', openLogMealModal);
    mealResetBtn.parentNode.insertBefore(btn, mealResetBtn.nextSibling);
  }

  // Wire up modal controls
  document.getElementById('logMealCloseBtn').addEventListener('click', closeLogMealModal);
  document.getElementById('logMealCancelBtn').addEventListener('click', closeLogMealModal);
  document.getElementById('logMealOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('logMealOverlay')) closeLogMealModal();
  });
  document.getElementById('logMealSubmitBtn').addEventListener('click', submitLogMeal);
  document.getElementById('logMealInput').addEventListener('keydown', e => {
    // Cmd/Ctrl+Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitLogMeal();
  });
}

function openLogMealModal() {
  const overlay = document.getElementById('logMealOverlay');
  const input = document.getElementById('logMealInput');
  const progress = document.getElementById('logMealProgress');
  const error = document.getElementById('logMealError');
  const submitBtn = document.getElementById('logMealSubmitBtn');

  // Reset state
  input.value = '';
  input.disabled = false;
  progress.style.display = 'none';
  error.style.display = 'none';
  submitBtn.disabled = false;
  submitBtn.textContent = 'Log Meal';
  ['lmStep1', 'lmStep2', 'lmStep3'].forEach(id => {
    document.getElementById(id).className = 'log-meal-step';
  });

  overlay.style.display = 'flex';
  setTimeout(() => input.focus(), 50);
}

function closeLogMealModal() {
  document.getElementById('logMealOverlay').style.display = 'none';
}

function setLogMealStep(step) {
  // step: 1 = parsing, 2 = uploading, 3 = done
  ['lmStep1', 'lmStep2', 'lmStep3'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (i + 1 < step) {
      el.className = 'log-meal-step done';
    } else if (i + 1 === step) {
      el.className = 'log-meal-step active';
    } else {
      el.className = 'log-meal-step';
    }
  });
}

async function submitLogMeal() {
  const input = document.getElementById('logMealInput');
  const progress = document.getElementById('logMealProgress');
  const error = document.getElementById('logMealError');
  const submitBtn = document.getElementById('logMealSubmitBtn');

  const userInput = input.value.trim();
  if (!userInput) {
    input.focus();
    return;
  }

  // Lock UI
  input.disabled = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging…';
  error.style.display = 'none';
  progress.style.display = 'flex';
  setLogMealStep(1);

  // Step 2 indicator fires after a short delay (Claude parsing typically takes 2-4s)
  const step2Timer = setTimeout(() => setLogMealStep(2), 3000);

  try {
    const res = await fetch('/api/log-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: userInput }),
    });

    clearTimeout(step2Timer);
    const data = await res.json();

    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || `Server error ${res.status}`);
    }

    // Success
    setLogMealStep(3);
    submitBtn.textContent = '✓ Logged';

    // Reload meals data and re-render after short delay
    setTimeout(async () => {
      const mealsRes = await fetch('/api/meals');
      allMeals = await mealsRes.json();
      buildAvailableMonths();
      mealsFiltered = groupedMealDates(allMeals);
      mealsPage = 1;
      renderMeals();
      renderDailySummary();
      closeLogMealModal();
    }, 800);

  } catch (err) {
    clearTimeout(step2Timer);
    progress.style.display = 'none';
    error.textContent = `Error: ${err.message}`;
    error.style.display = 'block';
    input.disabled = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log Meal';
  }
}

// ===== TDEE CALCULATIONS =====
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

const ACTIVITY_FACTOR = 1.375;

function calcTDEE(weightLbs, heightIn, age, sex) {
  return Math.round(calcBMR(weightLbs, heightIn, age, sex) * ACTIVITY_FACTOR);
}

function avgDailyWorkoutCals() {
  if (!allWorkouts.length) return 0;
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
  const recent = allWorkouts.filter(w => new Date(w.start_time) >= cutoff);
  if (!recent.length) return 0;
  const totalCals = recent.reduce((s, w) => s + (w.calories || 0), 0);
  return Math.round(totalCals / 30);
}

function renderTDEEPlan() {
  const container = document.getElementById('tdeeDetails');
  const dob = document.getElementById('dob').value;
  const heightIn = parseFloat(document.getElementById('heightIn').value);
  const sex = document.getElementById('sex').value;

  if (!dob || !heightIn) {
    container.innerHTML = '<div class="tdee-no-goal">Fill in your stats above to see your calorie plan.</div>';
    return;
  }

  const age = calcAge(dob);
  const latestWeight = allWeight.length ? kgToLbs(allWeight[allWeight.length - 1].weight) : null;
  if (!latestWeight) {
    container.innerHTML = '<div class="tdee-no-goal">No weight data available to calculate TDEE.</div>';
    return;
  }

  const tdee = calcTDEE(latestWeight, heightIn, age, sex);
  const bmr = Math.round(calcBMR(latestWeight, heightIn, age, sex));
  const effectiveTDEE = tdee;

  let html = `
    <div class="tdee-grid">
      <div class="tdee-stat">
        <div class="stat-label">BMR (at rest)</div>
        <div class="stat-value">${bmr}</div>
        <div class="stat-sub">kcal/day if sedentary</div>
      </div>
      <div class="tdee-stat highlight">
        <div class="stat-label">TDEE (baseline)</div>
        <div class="stat-value">${tdee}</div>
        <div class="stat-sub">kcal/day (lightly active)</div>
      </div>
      <div class="tdee-stat highlight-green">
        <div class="stat-label">Effective Daily Budget</div>
        <div class="stat-value">${effectiveTDEE}</div>
        <div class="stat-sub">kcal/day (your TDEE)</div>
      </div>
    </div>
  `;

  if (goals.target_weight && goals.goal_date) {
    const today = new Date();
    const goalDate = new Date(goals.goal_date);
    const daysLeft = Math.max(1, Math.round((goalDate - today) / (1000 * 60 * 60 * 24)));
    const currentLbs = latestWeight;
    const targetLbs = goals.target_weight;
    const lbsToLose = currentLbs - targetLbs;
    const totalCalDeficitNeeded = lbsToLose * 3500;
    const dailyDeficitNeeded = Math.round(totalCalDeficitNeeded / daysLeft);
    const targetDailyIntake = effectiveTDEE - dailyDeficitNeeded;
    const weeklyLoss = (dailyDeficitNeeded * 7 / 3500).toFixed(2);

    const feasible = dailyDeficitNeeded <= 1000;
    const deficitColor = feasible ? 'var(--green)' : 'var(--danger)';
    const warning = !feasible ? ' ⚠️ This deficit exceeds the safe limit of 1000 kcal/day. Consider extending your goal date.' : '';

    html += `
      <div class="tdee-grid">
        <div class="tdee-stat">
          <div class="stat-label">Days to Goal</div>
          <div class="stat-value">${daysLeft}</div>
          <div class="stat-sub">by ${goals.goal_date}</div>
        </div>
        <div class="tdee-stat">
          <div class="stat-label">Weight to Lose</div>
          <div class="stat-value">${lbsToLose > 0 ? lbsToLose.toFixed(1) : '0'} lbs</div>
          <div class="stat-sub">${currentLbs} → ${targetLbs} lbs</div>
        </div>
        <div class="tdee-stat" style="border-color:${deficitColor}">
          <div class="stat-label">Daily Deficit Needed</div>
          <div class="stat-value" style="color:${deficitColor}">${dailyDeficitNeeded > 0 ? dailyDeficitNeeded : 0} kcal</div>
          <div class="stat-sub">${weeklyLoss > 0 ? weeklyLoss + ' lbs/week' : 'At goal!'}</div>
        </div>
        <div class="tdee-stat" style="border-color:var(--accent2)">
          <div class="stat-label">Target Daily Intake</div>
          <div class="stat-value" style="color:var(--accent2)">${targetDailyIntake > 0 ? targetDailyIntake : '—'}</div>
          <div class="stat-sub">kcal/day (+ workout cals on active days)</div>
        </div>
      </div>
      <div class="tdee-breakdown">
        <strong>How this is calculated:</strong><br>
        Your TDEE of <strong>${tdee} kcal</strong> (Mifflin-St Jeor, lightly active) is your effective daily budget.<br>
        To lose <strong>${lbsToLose > 0 ? lbsToLose.toFixed(1) : 0} lbs</strong> in <strong>${daysLeft} days</strong>, you need a total deficit of <strong>${Math.round(totalCalDeficitNeeded)} kcal</strong> (3,500 kcal per lb of fat).<br>
        That means eating <strong>${targetDailyIntake > 0 ? targetDailyIntake : '—'} kcal/day</strong> — a deficit of <strong>${dailyDeficitNeeded > 0 ? dailyDeficitNeeded : 0} kcal/day</strong>. On workout days, add that day's burned calories to your intake target.${warning}
      </div>
    `;
  } else if (goals.target_weight && !goals.goal_date) {
    html += `<div class="tdee-no-goal">Set a Goal Date above to see your required daily deficit.</div>`;
  } else {
    html += `<div class="tdee-no-goal">Set a Target Weight and Goal Date to see your personalized calorie plan.</div>`;
  }

  container.innerHTML = html;
}

// ===== GOALS =====
function renderGoals() {
  document.getElementById('targetWeight').value = goals.target_weight || '';
  document.getElementById('targetFat').value = goals.target_fat || '';
  if (goals.goal_date) document.getElementById('goalDate').value = goals.goal_date;
  if (goals.dob) document.getElementById('dob').value = goals.dob;
  if (goals.height_in) document.getElementById('heightIn').value = goals.height_in;
  if (goals.sex) document.getElementById('sex').value = goals.sex;
  renderGoalProgress();
  renderTDEEPlan();
}

function renderGoalProgress() {
  const container = document.getElementById('goalProgress');

  if (allWeight.length === 0) {
    container.innerHTML = '<div class="empty-state">No weight data available</div>';
    return;
  }

  const latest = allWeight[allWeight.length - 1];
  const first = allWeight[0];
  const latestLbs = kgToLbs(latest.weight);
  const firstLbs = kgToLbs(first.weight);
  let html = '';

  if (goals.target_weight) {
    const targetLbs = goals.target_weight;
    const totalChange = Math.abs(firstLbs - targetLbs);
    const achieved = Math.abs(firstLbs - latestLbs);
    const pct = totalChange > 0 ? Math.min(100, (achieved / totalChange) * 100) : 100;
    const direction = targetLbs < firstLbs ? 'losing' : 'gaining';
    const diff = (latestLbs - targetLbs).toFixed(1);
    const diffLabel = diff > 0 ? `${diff} lbs above goal` : `${Math.abs(diff)} lbs below goal`;

    html += `
      <div class="progress-item">
        <div class="progress-label">
          <span>⚖️ Weight: ${latestLbs} lbs → Goal: ${targetLbs} lbs</span>
          <span>${pct.toFixed(0)}%</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill weight" style="width:${pct}%"></div>
        </div>
        <div class="progress-note">Started at ${firstLbs} lbs · Currently ${direction} · ${diffLabel}</div>
      </div>
    `;
  } else {
    html += `<div class="progress-item"><div class="progress-note">Set a target weight in Goals to track progress.</div></div>`;
  }

  if (goals.target_fat) {
    const startF = first.fat;
    const currentF = latest.fat;
    const targetF = goals.target_fat;
    const totalChange = Math.abs(startF - targetF);
    const achieved = Math.abs(startF - currentF);
    const pct = totalChange > 0 ? Math.min(100, (achieved / totalChange) * 100) : 100;
    const diff = (currentF - targetF).toFixed(2);
    const diffLabel = diff > 0 ? `${diff}% above goal` : `${Math.abs(diff)}% below goal`;

    html += `
      <div class="progress-item">
        <div class="progress-label">
          <span>💪 Body Fat: ${currentF.toFixed(2)}% → Goal: ${targetF}%</span>
          <span>${pct.toFixed(0)}%</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill fat" style="width:${pct}%"></div>
        </div>
        <div class="progress-note">Started at ${startF.toFixed(2)}% · ${diffLabel}</div>
      </div>
    `;
  } else {
    html += `<div class="progress-item"><div class="progress-note">Set a target body fat % in Goals to track progress.</div></div>`;
  }

  html += `
    <div class="progress-item" style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border)">
      <div class="progress-label"><span>📅 Latest Reading: ${formatDate(latest.date)}</span></div>
      <div class="progress-note">Weight: ${latestLbs} lbs &nbsp;|&nbsp; Body Fat: ${latest.fat.toFixed(2)}% &nbsp;|&nbsp; BMI: ${latest.bmi}</div>
    </div>
  `;

  container.innerHTML = html;
}

function setupGoalsForm() {
  document.getElementById('goalsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tw = document.getElementById('targetWeight').value;
    const tf = document.getElementById('targetFat').value;
    const gd = document.getElementById('goalDate').value;
    const dob = document.getElementById('dob').value;
    const heightIn = document.getElementById('heightIn').value;
    const sex = document.getElementById('sex').value;

    let dailyCalorieGoal = 2000;
    if (dob && heightIn && tw && gd && allWeight.length) {
      const age = calcAge(dob);
      const latestLbs = kgToLbs(allWeight[allWeight.length - 1].weight);
      const tdee = calcTDEE(latestLbs, parseFloat(heightIn), age, sex);
      const effectiveTDEE = tdee;
      const today = new Date();
      const goalDate = new Date(gd);
      const daysLeft = Math.max(1, Math.round((goalDate - today) / (1000 * 60 * 60 * 24)));
      const lbsToLose = latestLbs - parseFloat(tw);
      if (lbsToLose > 0) {
        const dailyDeficit = Math.round((lbsToLose * 3500) / daysLeft);
        dailyCalorieGoal = Math.max(1200, effectiveTDEE - dailyDeficit);
      } else {
        dailyCalorieGoal = effectiveTDEE;
      }
    }

    goals = {
      target_weight: tw ? parseFloat(tw) : null,
      target_fat: tf ? parseFloat(tf) : null,
      goal_date: gd || null,
      dob: dob || null,
      height_in: heightIn ? parseFloat(heightIn) : null,
      sex: sex || 'male',
      daily_calorie_goal: dailyCalorieGoal,
    };

    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goals),
    });

    const msg = document.getElementById('goalsSaved');
    msg.textContent = '✓ Saved!';
    setTimeout(() => { msg.textContent = ''; }, 2000);

    renderWeightChart();
    renderDailySummary();
    renderGoalProgress();
    renderTDEEPlan();
  });
}