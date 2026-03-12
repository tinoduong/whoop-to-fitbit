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

  // Filter to current month
  const sortedDates = Object.keys(dailyMap)
    .filter(d => getYearMonth(d) === ym)
    .sort();

  if (sortedDates.length === 0) {
    container.innerHTML = '<div class="empty-state">No data for this month</div>';
    return;
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
  // Find the Sunday on or before the first date in the month
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
        inner += `<div class="cal-cals">${day.totalCaloriesIn} kcal</div>`;
        inner += `<div class="cal-delta ${metGoal ? 'under' : 'over'}">${delta >= 0 ? '▼' + delta : '▲' + Math.abs(delta)}</div>`;
      } else {
        inner += `<div class="cal-no-data">—</div>`;
      }
      if (hasWorkout) {
        inner += `<div class="cal-workout">🏃 ${sportNames.join(', ')}</div>`;
      }

      return `<div class="cal-cell ${cardClass}" title="${date}">${inner}</div>`;
    }).join('');

    // Weekly summary: calorie delta + weight delta (Sun to Sat, or Sun to today)
    const weekDaysInMonth = week.filter(d => getYearMonth(d) === ym);
    const weekMealDays = weekDaysInMonth.filter(d => (dailyMap[d] || {}).totalCaloriesIn > 0);
    const todayStr = new Date().toISOString().substring(0, 10);

    // Weight delta: find weight on Sunday (or nearest after) and Saturday (or nearest before / today)
    const weekSunday = week[0];
    const weekSaturday = week[6];
    const weekEnd = weekSaturday > todayStr ? todayStr : weekSaturday;

    // Find closest weight entry on or after Sunday within the week
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
          <div class="week-sum-delta">${weekMet ? '▼' + weekDelta : '▲' + Math.abs(weekDelta)} kcal</div>
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
      const itemChips = items.map(item =>
        `<span class="meal-item-chip">${item.foodName}<span class="item-cals">${item.calories} kcal</span></span>`
      ).join('');

      return `
        <div class="meal-entry">
          <div class="meal-entry-header">
            <span class="meal-type-label ${typeClass}">${meal.meal_type}</span>
            <span class="meal-cals">${meal.total_calories} kcal</span>
          </div>
          <div class="meal-description">${meal.raw_description}</div>
          <div class="meal-items">${itemChips}</div>
          <div class="meal-macros">
            <span class="macro-p">P: ${meal.total_protein.toFixed(1)}g</span>
            <span class="macro-c">C: ${totalCarbs.toFixed(1)}g</span>
            <span class="macro-f">F: ${totalFat.toFixed(1)}g</span>
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

  // Show page numbers with ellipsis
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

// ===== TDEE CALCULATIONS =====
// Mifflin-St Jeor BMR, then multiply by activity factor
// Height in inches -> cm: * 2.54
// Weight in lbs -> kg: / 2.20462
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

// Lightly active (1-3 days/week exercise) = 1.375
// We'll use 1.375 as baseline since user exercises regularly
const ACTIVITY_FACTOR = 1.375;

function calcTDEE(weightLbs, heightIn, age, sex) {
  return Math.round(calcBMR(weightLbs, heightIn, age, sex) * ACTIVITY_FACTOR);
}

// Average workout calories burned per day over last 30 days
function avgDailyWorkoutCals() {
  if (!allWorkouts.length) return 0;
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
  const recent = allWorkouts.filter(w => new Date(w.start_time) >= cutoff);
  if (!recent.length) return 0;
  const totalCals = recent.reduce((s, w) => s + (w.calories || 0), 0);
  // Count distinct workout days
  const days = new Set(recent.map(w => getDateFromISO(w.start_time))).size;
  // Spread over 30 days
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
  // Effective daily budget = TDEE only (no avg workout calories added)
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

  // Goal-based deficit calculation
  if (goals.target_weight && goals.goal_date) {
    const today = new Date();
    const goalDate = new Date(goals.goal_date);
    const daysLeft = Math.max(1, Math.round((goalDate - today) / (1000 * 60 * 60 * 24)));
    const currentLbs = latestWeight;
    const targetLbs = goals.target_weight;
    const lbsToLose = currentLbs - targetLbs;
    // 1 lb of fat ≈ 3500 kcal
    const totalCalDeficitNeeded = lbsToLose * 3500;
    const dailyDeficitNeeded = Math.round(totalCalDeficitNeeded / daysLeft);
    // Target daily intake = TDEE + that day's workout calories (shown as baseline here; per-day shown in daily summary)
    const targetDailyIntake = effectiveTDEE - dailyDeficitNeeded;
    const weeklyLoss = (dailyDeficitNeeded * 7 / 3500).toFixed(2);

    const feasible = dailyDeficitNeeded <= 1000; // >1000 kcal/day deficit is unsafe
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

  // Weight progress (goals stored in lbs)
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

  // Fat progress
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

    // Derive a daily calorie goal from TDEE - deficit if we have enough info
    let dailyCalorieGoal = 2000;
    if (dob && heightIn && tw && gd && allWeight.length) {
      const age = calcAge(dob);
      const latestLbs = kgToLbs(allWeight[allWeight.length - 1].weight);
      const tdee = calcTDEE(latestLbs, parseFloat(heightIn), age, sex);
      // Effective budget = TDEE only
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
