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

// Workout summary range state
let workoutSummaryRange = '30d';

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
  // Ensure goals.goals is always an array
  if (!goals.goals) goals.goals = [];
}

// ===== GOAL SNAPSHOT HELPERS =====

// Returns the goal snapshot active on a given date (closest saved_date <= date).
// Falls back to the earliest snapshot if none precede the date.
function getGoalForDate(date) {
  const snapshots = goals.goals || [];
  if (!snapshots.length) return null;
  let best = null;
  for (const g of snapshots) {
    if (g.saved_date <= date) {
      if (!best || g.saved_date > best.saved_date) best = g;
    }
  }
  // If no snapshot precedes this date, use the earliest one
  if (!best) {
    best = snapshots.reduce((a, b) => a.saved_date < b.saved_date ? a : b);
  }
  return best;
}

// Returns the most recent goal snapshot (for current UI state)
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

// ===== FROZEN GOAL SNAPSHOT =====
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

  const weightTrend = linReg(weightData);
  const fatTrend = linReg(fatData);

  // Build set of Monday date strings from the label range
  const mondayPlugin = {
    id: 'mondayLines',
    afterDraw(chart) {
      const { ctx: c, scales: { x }, chartArea: { top, bottom } } = chart;
      c.save();
      c.strokeStyle = 'rgba(220, 60, 60, 0.35)';
      c.lineWidth = 1;
      c.setLineDash([3, 5]);
      labels.forEach((dateStr, i) => {
        const d = new Date(dateStr + 'T00:00:00');
        if (d.getDay() === 1) { // Monday
          const xPos = x.getPixelForValue(i);
          c.beginPath();
          c.moveTo(xPos, top);
          c.lineTo(xPos, bottom);
          c.stroke();
        }
      });
      c.restore();
    }
  };

  const currentGoal = getCurrentGoal();

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
      label: 'Weight trend',
      data: weightTrend,
      borderColor: 'rgba(108,99,255,0.5)',
      borderDash: [5, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0,
      yAxisID: 'yWeight',
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
    {
      label: 'Body Fat trend',
      data: fatTrend,
      borderColor: 'rgba(0,212,170,0.5)',
      borderDash: [5, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0,
      yAxisID: 'yFat',
    },
  ];

  if (currentGoal && currentGoal.target_weight) {
    datasets.push({
      label: 'Goal Weight (lbs)',
      data: labels.map(() => currentGoal.target_weight),
      borderColor: 'rgba(108,99,255,0.4)',
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      yAxisID: 'yWeight',
    });
  }
  if (currentGoal && currentGoal.target_fat) {
    datasets.push({
      label: 'Goal Fat (%)',
      data: labels.map(() => currentGoal.target_fat),
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
    plugins: [mondayPlugin],
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
          filter: item => !item.dataset.label.includes('trend'),
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

  const [ymYear, ymMonth] = ym.split('-').map(Number);
  const daysInMonth = new Date(ymYear, ymMonth, 0).getDate();
  const sortedDates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    sortedDates.push(`${ym}-${String(d).padStart(2, '0')}`);
  }

  function getDayData(date) {
    const day = dailyMap[date] || { totalCaloriesIn: 0, workouts: [], workoutCalories: 0 };
    const hasMeals = day.totalCaloriesIn > 0;
    const hasWorkout = day.workouts.length > 0;
    const sportNames = [...new Set(day.workouts.map(w => w.sport_name))];
    const { targetIntake } = getTargetIntakeForDate(date, day.workoutCalories);
    const delta = targetIntake - day.totalCaloriesIn;
    const metGoal = hasMeals && delta >= 0;
    return { day, hasMeals, hasWorkout, sportNames, targetIntake, delta, metGoal };
  }

  const firstDate = new Date(sortedDates[0] + 'T00:00:00');
  const lastDate = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');

  const startMonday = new Date(firstDate);
  startMonday.setDate(firstDate.getDate() - ((firstDate.getDay() + 6) % 7));

  const lastDow = lastDate.getDay();
  const endSunday = new Date(lastDate);
  endSunday.setDate(lastDate.getDate() + ((7 - lastDow) % 7));

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const weeks = [];
  let cur = new Date(startMonday);
  while (cur <= endSunday) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(cur.toISOString().substring(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  let html = `<div class="cal-header">${DAY_NAMES.map(d => `<div class="cal-hdr-cell">${d}</div>`).join('')}<div class="cal-hdr-cell cal-week-summary-hdr">Week</div></div>`;

  html += weeks.map(week => {
    const weekDayCells = week.map(date => {
      const inMonth = getYearMonth(date) === ym;
      const d = new Date(date + 'T00:00:00');
      const dayNum = d.getDate();

      if (!inMonth) {
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
        return `<div class="cal-cell cal-cell-out ${cardClass}" title="${date}" onclick="openDayModal('${date}')" style="cursor:pointer;opacity:0.45">${inner}</div>`;
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

    const weekMealDays = week.filter(d => (dailyMap[d] || {}).totalCaloriesIn > 0);
    const todayStr = new Date().toISOString().substring(0, 10);

    const weekMonday = week[0];
    const weekSunday = week[6];
    const weekEnd = weekSunday > todayStr ? todayStr : weekSunday;

    const weekWeightEntries = allWeight.filter(w => w.date >= weekMonday && w.date <= weekEnd);
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

    return `<div class="cal-row">${weekDayCells}<div class="cal-week-col" onclick="openWeekModal('${weekMonday}')" style="cursor:pointer">${weeklySummaryHtml}</div></div>`;
  }).join('');

  container.innerHTML = `<div class="cal-grid">${html}</div>`;
}

// ===== WORKOUTS =====
function sortedWorkouts(workouts) {
  return [...workouts].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
}

// ===== INTENSITY TRENDS =====
let strainChart = null;
let zoneWeekChart = null;
let zoneModeWeekly = 'mins';

function linReg(ys) {
  const n = ys.length;
  if (n < 2) return ys.map(v => v);
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += ys[i]; sxy += i * ys[i]; sx2 += i * i; }
  const m = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  const b = (sy - m * sx) / n;
  return ys.map((_, i) => Math.round((m * i + b) * 100) / 100);
}

function getISOWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return mon.toISOString().substring(0, 10);
}

function buildWeeklyZoneData(workouts) {
  const weekMap = {};
  workouts.forEach(w => {
    const weekKey = getISOWeekLabel(getDateFromISO(w.start_time));
    if (!weekMap[weekKey]) weekMap[weekKey] = { z1: 0, z2: 0, z3: 0, z4: 0, totalMins: 0 };
    const zd = w.zone_durations || {};
    const toMin = ms => Math.round((ms || 0) / 60000);
    weekMap[weekKey].z1 += toMin(zd.zone_one_milli);
    weekMap[weekKey].z2 += toMin(zd.zone_two_milli);
    weekMap[weekKey].z3 += toMin(zd.zone_three_milli);
    weekMap[weekKey].z4 += toMin(zd.zone_four_milli) + toMin(zd.zone_five_milli);
    const dur = (new Date(w.end_time) - new Date(w.start_time)) / 60000;
    weekMap[weekKey].totalMins += Math.round(dur);
  });
  const keys = Object.keys(weekMap).sort();
  return { keys, weekMap };
}

function renderIntensityTrends() {
  const container = document.getElementById('intensityTrendsSection');
  if (!container) return;

  const rangeWorkouts = getWorkoutsForSummaryRange();
  const sorted = sortedWorkouts(rangeWorkouts).reverse();

  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:16px 0">No workout data for this period</div>';
    return;
  }

  const tickColor = '#8b90a8';
  const gridColor = 'rgba(139,144,168,0.12)';
  const tt = { backgroundColor: '#1a1d27', borderColor: '#2e3250', borderWidth: 1, titleColor: '#e8eaf0', bodyColor: '#8b90a8' };

  // ---- STRAIN CHART ----
  const strainByDate = {};
  sorted.forEach(w => {
    if (w.strain == null) return;
    const date = getDateFromISO(w.start_time);
    if (strainByDate[date] == null || w.strain > strainByDate[date]) {
      strainByDate[date] = w.strain;
    }
  });
  const strainDates = Object.keys(strainByDate).sort();
  const strainLabels = strainDates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const strainVals = strainDates.map(d => Math.round(strainByDate[d] * 10) / 10);
  const strainTrend = linReg(strainVals);

  const avgStrain = strainVals.length ? (strainVals.reduce((a, b) => a + b, 0) / strainVals.length).toFixed(1) : '—';
  const peakStrain = strainVals.length ? Math.max(...strainVals).toFixed(1) : '—';
  const peakIdx = strainVals.indexOf(Math.max(...strainVals));
  const peakLabel = strainLabels[peakIdx] || '—';
  const highStrainDays = strainVals.filter(s => s >= 13).length;
  const trendSlope = strainVals.length >= 2 ? (strainTrend[strainTrend.length - 1] - strainTrend[0]).toFixed(1) : null;
  const trendColor = trendSlope > 0 ? '#1D9E75' : trendSlope < 0 ? '#E24B4A' : '#8b90a8';
  const trendLabel = trendSlope > 0 ? `+${trendSlope}` : trendSlope;

  container.innerHTML = `
    <div class="intensity-section">
      <div class="intensity-section-label">Strain over time</div>
      <div class="intensity-metric-row">
        <div class="intensity-metric">
          <div class="intensity-metric-label">Avg strain</div>
          <div class="intensity-metric-value">${avgStrain}</div>
          <div class="intensity-metric-sub">${strainVals.length} day${strainVals.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="intensity-metric">
          <div class="intensity-metric-label">Peak</div>
          <div class="intensity-metric-value">${peakStrain}</div>
          <div class="intensity-metric-sub">${peakLabel}</div>
        </div>
        <div class="intensity-metric">
          <div class="intensity-metric-label">Trend</div>
          <div class="intensity-metric-value" style="color:${trendColor}">${trendLabel !== null ? trendLabel : '—'}</div>
          <div class="intensity-metric-sub">overall direction</div>
        </div>
        <div class="intensity-metric">
          <div class="intensity-metric-label">High strain days</div>
          <div class="intensity-metric-value">${highStrainDays}</div>
          <div class="intensity-metric-sub">strain &gt; 13</div>
        </div>
      </div>
      <div class="intensity-legend">
        <div class="intensity-legend-item"><div class="intensity-legend-dot" style="background:#7F77DD;border-radius:50%"></div>Strain</div>
        <div class="intensity-legend-item"><div style="width:22px;height:2px;border-top:2px dashed #5DCAA5;margin-right:2px"></div>Trend</div>
      </div>
      <div style="position:relative;width:100%;height:220px"><canvas id="strainTrendChart"></canvas></div>
    </div>

    <div class="intensity-section">
      <div class="intensity-section-label">Weekly zone minutes</div>
      <div class="intensity-zone-toggle-row">
        <button class="intensity-zone-btn active" id="zoneBtnMins">Minutes</button>
        <button class="intensity-zone-btn" id="zoneBtnPct">% of workout</button>
      </div>
      <div class="intensity-metric-row" id="zoneMetricRow"></div>
      <div class="intensity-legend">
        <div class="intensity-legend-item"><div class="intensity-legend-dot" style="background:#5DCAA5"></div>Z1 easy</div>
        <div class="intensity-legend-item"><div class="intensity-legend-dot" style="background:#EF9F27"></div>Z2 aerobic</div>
        <div class="intensity-legend-item"><div class="intensity-legend-dot" style="background:#E24B4A"></div>Z3 threshold</div>
        <div class="intensity-legend-item"><div class="intensity-legend-dot" style="background:#993556"></div>Z4+ max</div>
      </div>
      <div style="position:relative;width:100%;height:260px"><canvas id="zoneWeeklyChart"></canvas></div>
    </div>
  `;

  // Strain chart
  if (strainChart) strainChart.destroy();
  strainChart = new Chart(document.getElementById('strainTrendChart'), {
    type: 'line',
    data: {
      labels: strainLabels,
      datasets: [
        {
          label: 'Strain',
          data: strainVals,
          borderColor: '#7F77DD',
          borderWidth: 2,
          backgroundColor: 'rgba(127,119,221,0.07)',
          tension: 0.3,
          fill: true,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#7F77DD',
          pointBorderColor: '#7F77DD',
          order: 1,
        },
        {
          label: 'Trend',
          data: strainTrend,
          borderColor: '#5DCAA5',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          tension: 0,
          order: 0,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tt, callbacks: {
            label: ctx => ctx.dataset.label === 'Trend'
              ? ` Trend: ${ctx.raw.toFixed(1)}`
              : ` Strain: ${ctx.raw.toFixed(1)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: tickColor, font: { size: 11 }, maxRotation: 45 }, grid: { color: gridColor } },
        y: {
          min: 0, max: 21, ticks: { color: tickColor, font: { size: 11 } }, grid: { color: gridColor },
          title: { display: true, text: 'strain (0–21)', color: tickColor, font: { size: 11 } }
        }
      }
    }
  });

  // Zone weekly chart
  const { keys: weekKeys, weekMap } = buildWeeklyZoneData(sorted);
  const weekLabels = weekKeys.map(k => {
    const d = new Date(k + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const wZ1 = weekKeys.map(k => weekMap[k].z1);
  const wZ2 = weekKeys.map(k => weekMap[k].z2);
  const wZ3 = weekKeys.map(k => weekMap[k].z3);
  const wZ4 = weekKeys.map(k => weekMap[k].z4);
  const wTot = weekKeys.map(k => weekMap[k].totalMins);

  const wZ1p = weekKeys.map((k, i) => wTot[i] > 0 ? Math.round(wZ1[i] / wTot[i] * 100) : 0);
  const wZ2p = weekKeys.map((k, i) => wTot[i] > 0 ? Math.round(wZ2[i] / wTot[i] * 100) : 0);
  const wZ3p = weekKeys.map((k, i) => wTot[i] > 0 ? Math.round(wZ3[i] / wTot[i] * 100) : 0);
  const wZ4p = weekKeys.map((k, i) => wTot[i] > 0 ? Math.round(wZ4[i] / wTot[i] * 100) : 0);

  const totZ1 = wZ1.reduce((a, b) => a + b, 0);
  const totZ2 = wZ2.reduce((a, b) => a + b, 0);
  const totZ3 = wZ3.reduce((a, b) => a + b, 0);
  const totZ4 = wZ4.reduce((a, b) => a + b, 0);
  const totAll = totZ1 + totZ2 + totZ3 + totZ4;

  function updateZoneMetrics() {
    const row = document.getElementById('zoneMetricRow');
    if (!row) return;
    if (zoneModeWeekly === 'mins') {
      row.innerHTML = `
        <div class="intensity-metric"><div class="intensity-metric-label">Z1 easy</div><div class="intensity-metric-value">${totZ1}</div><div class="intensity-metric-sub">mins total</div></div>
        <div class="intensity-metric"><div class="intensity-metric-label">Z2 aerobic</div><div class="intensity-metric-value">${totZ2}</div><div class="intensity-metric-sub">mins total</div></div>
        <div class="intensity-metric"><div class="intensity-metric-label">Z3 threshold</div><div class="intensity-metric-value">${totZ3}</div><div class="intensity-metric-sub">mins total</div></div>
        <div class="intensity-metric"><div class="intensity-metric-label">Z4+ max</div><div class="intensity-metric-value">${totZ4}</div><div class="intensity-metric-sub">mins total</div></div>
      `;
    } else {
      row.innerHTML = `
        <div class="intensity-metric"><div class="intensity-metric-label">Z1 easy</div><div class="intensity-metric-value">${totAll ? Math.round(totZ1 / totAll * 100) : 0}%</div><div class="intensity-metric-sub">of all workout time</div></div>
        <div class="intensity-metric"><div class="intensity-metric-label">Z2 aerobic</div><div class="intensity-metric-value">${totAll ? Math.round(totZ2 / totAll * 100) : 0}%</div><div class="intensity-metric-sub">of all workout time</div></div>
        <div class="intensity-metric"><div class="intensity-metric-label">Z3 threshold</div><div class="intensity-metric-value">${totAll ? Math.round(totZ3 / totAll * 100) : 0}%</div><div class="intensity-metric-sub">of all workout time</div></div>
        <div class="intensity-metric"><div class="intensity-metric-label">Z4+ max</div><div class="intensity-metric-value">${totAll ? Math.round(totZ4 / totAll * 100) : 0}%</div><div class="intensity-metric-sub">of all workout time</div></div>
      `;
    }
  }
  updateZoneMetrics();

  if (zoneWeekChart) zoneWeekChart.destroy();
  zoneWeekChart = new Chart(document.getElementById('zoneWeeklyChart'), {
    type: 'bar',
    data: {
      labels: weekLabels,
      datasets: [
        { label: 'Z1 easy', data: wZ1, backgroundColor: '#5DCAA5', stack: 'z', borderRadius: 0 },
        { label: 'Z2 aerobic', data: wZ2, backgroundColor: '#EF9F27', stack: 'z', borderRadius: 0 },
        { label: 'Z3 threshold', data: wZ3, backgroundColor: '#E24B4A', stack: 'z', borderRadius: 0 },
        { label: 'Z4+ max', data: wZ4, backgroundColor: '#993556', stack: 'z', borderRadius: 2 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tt, callbacks: {
            label: ctx => zoneModeWeekly === 'mins'
              ? ` ${ctx.dataset.label}: ${ctx.raw} mins`
              : ` ${ctx.dataset.label}: ${ctx.raw}%`,
            footer: items => zoneModeWeekly === 'mins'
              ? `Total: ${items.reduce((s, i) => s + i.raw, 0)} mins`
              : `Total: ${items.reduce((s, i) => s + i.raw, 0)}%`
          }
        }
      },
      scales: {
        x: { stacked: true, ticks: { color: tickColor, font: { size: 11 } }, grid: { display: false } },
        y: {
          stacked: true,
          ticks: { color: tickColor, font: { size: 11 }, callback: v => zoneModeWeekly === 'mins' ? v + 'm' : v + '%' },
          grid: { color: gridColor },
          title: { display: true, text: 'minutes', color: tickColor, font: { size: 11 } }
        }
      }
    }
  });

  function switchZoneMode(mode) {
    zoneModeWeekly = mode;
    const mins = zoneModeWeekly === 'mins';
    zoneWeekChart.data.datasets[0].data = mins ? wZ1 : wZ1p;
    zoneWeekChart.data.datasets[1].data = mins ? wZ2 : wZ2p;
    zoneWeekChart.data.datasets[2].data = mins ? wZ3 : wZ3p;
    zoneWeekChart.data.datasets[3].data = mins ? wZ4 : wZ4p;
    zoneWeekChart.options.scales.y.max = mins ? undefined : 100;
    zoneWeekChart.options.scales.y.title.text = mins ? 'minutes' : '% of workout time';
    zoneWeekChart.update();
    updateZoneMetrics();
    document.getElementById('zoneBtnMins').classList.toggle('active', mins);
    document.getElementById('zoneBtnPct').classList.toggle('active', !mins);
  }

  document.getElementById('zoneBtnMins').addEventListener('click', () => switchZoneMode('mins'));
  document.getElementById('zoneBtnPct').addEventListener('click', () => switchZoneMode('pct'));
}

function injectWorkoutSummaryStyles() {
  if (document.getElementById('workoutSummaryStyles')) return;
  const style = document.createElement('style');
  style.id = 'workoutSummaryStyles';
  style.textContent = `
    .workout-summary-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .workout-summary-grid {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .workout-summary-stat {
      background: rgba(108,99,255,0.07);
      border: 1px solid rgba(108,99,255,0.15);
      border-radius: 10px;
      padding: 10px 16px;
      min-width: 110px;
    }
    .wss-label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #8b90a8;
      margin-bottom: 3px;
    }
    .wss-value {
      font-size: 1.25rem;
      font-weight: 600;
      color: #e8eaf0;
    }
    .wss-sub {
      font-size: 0.72rem;
      color: #8b90a8;
      margin-top: 1px;
    }
    .workout-summary-empty {
      color: #8b90a8;
      font-size: 0.85rem;
      padding: 8px 0 16px;
    }
    .workout-summary-range-toggle {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .workout-summary-range-btn {
      background: transparent;
      border: 1px solid rgba(139,144,168,0.3);
      color: #8b90a8;
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 0.78rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .workout-summary-range-btn:hover {
      border-color: #6c63ff;
      color: #e8eaf0;
    }
    .workout-summary-range-btn.active {
      background: rgba(108,99,255,0.15);
      border-color: #6c63ff;
      color: #6c63ff;
      font-weight: 600;
    }
    .zone-sparkbar {
      display: flex;
      height: 6px;
      border-radius: 3px;
      overflow: hidden;
      gap: 1px;
      width: 80px;
    }
    .zone-sparkbar-seg {
      height: 100%;
      border-radius: 1px;
    }
    .strain-bar-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .strain-bar-track {
      flex: 1;
      min-width: 48px;
      height: 4px;
      background: rgba(139,144,168,0.2);
      border-radius: 2px;
      overflow: hidden;
    }
    .strain-bar-fill {
      height: 100%;
      border-radius: 2px;
      background: #6c63ff;
    }
    .strain-bar-num {
      font-size: 0.82rem;
      font-weight: 600;
      color: #e8eaf0;
      min-width: 28px;
    }
    .workout-count-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      padding: 1px 7px;
      border-radius: 10px;
      background: rgba(108,99,255,0.12);
      color: #9c96ff;
      vertical-align: middle;
      margin-left: 3px;
    }
  `;
  document.head.appendChild(style);
}

function setupWorkoutSummaryToggle() {
  document.querySelectorAll('.workout-summary-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.workout-summary-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      workoutSummaryRange = btn.dataset.range;
      renderWorkoutSummary();
      renderIntensityTrends();
    });
  });
}

function getWorkoutsForSummaryRange() {
  if (workoutSummaryRange === 'all') return allWorkouts;
  const now = new Date();
  const cutoff = new Date(now);
  if (workoutSummaryRange === '7d') cutoff.setDate(cutoff.getDate() - 7);
  if (workoutSummaryRange === '30d') cutoff.setDate(cutoff.getDate() - 30);
  if (workoutSummaryRange === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1);
  return allWorkouts.filter(w => new Date(w.start_time) >= cutoff);
}

function renderWorkoutSummary() {
  const container = document.getElementById('workoutSummaryBar');
  if (!container) return;

  const workouts = getWorkoutsForSummaryRange();

  if (workouts.length === 0) {
    container.innerHTML = `<div class="workout-summary-empty">No workouts in this period</div>`;
    return;
  }

  const totalCals = workouts.reduce((s, w) => s + (w.calories || 0), 0);
  const avgStrain = workouts.reduce((s, w) => s + (w.strain || 0), 0) / workouts.length;
  const avgHR = Math.round(workouts.reduce((s, w) => s + (w.avg_heart_rate || 0), 0) / workouts.length);
  const uniqueDays = new Set(workouts.map(w => getDateFromISO(w.start_time))).size;

  container.innerHTML = `
    <div class="workout-summary-grid">
      <div class="workout-summary-stat">
        <div class="wss-label">Workouts</div>
        <div class="wss-value">${workouts.length}</div>
        <div class="wss-sub">${uniqueDays} day${uniqueDays !== 1 ? 's' : ''}</div>
      </div>
      <div class="workout-summary-stat">
        <div class="wss-label">Calories burned</div>
        <div class="wss-value">${totalCals.toLocaleString()}</div>
        <div class="wss-sub">kcal total</div>
      </div>
      <div class="workout-summary-stat">
        <div class="wss-label">Avg strain</div>
        <div class="wss-value">${avgStrain.toFixed(1)}</div>
        <div class="wss-sub">out of 21</div>
      </div>
      <div class="workout-summary-stat">
        <div class="wss-label">Avg HR</div>
        <div class="wss-value">${avgHR}</div>
        <div class="wss-sub">bpm</div>
      </div>
    </div>
  `;
}

function renderWorkouts() {
  const tbody = document.getElementById('workoutsBody');
  const paginationEl = document.getElementById('workoutsPagination');

  if (!document.getElementById('workoutTabHeader')) {
    injectWorkoutSummaryStyles();
    const tableContainer = document.querySelector('#tab-workouts .table-container') ||
      document.querySelector('#tab-workouts table')?.parentElement;
    if (tableContainer) {
      if (!document.getElementById('intensityTrendsStyles')) {
        const style = document.createElement('style');
        style.id = 'intensityTrendsStyles';
        style.textContent = `
          .intensity-section { margin-bottom: 2rem; }
          .intensity-section-label { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #8b90a8; margin-bottom: 10px; }
          .intensity-metric-row { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin-bottom: 12px; }
          .intensity-metric { background: rgba(108,99,255,0.07); border: 1px solid rgba(108,99,255,0.15); border-radius: 10px; padding: 10px 14px; }
          .intensity-metric-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #8b90a8; margin-bottom: 3px; }
          .intensity-metric-value { font-size: 1.2rem; font-weight: 600; color: #e8eaf0; }
          .intensity-metric-sub { font-size: 0.72rem; color: #8b90a8; margin-top: 1px; }
          .intensity-legend { display: flex; gap: 14px; margin-bottom: 8px; flex-wrap: wrap; }
          .intensity-legend-item { display: flex; align-items: center; gap: 5px; font-size: 0.75rem; color: #8b90a8; }
          .intensity-legend-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
          .intensity-zone-toggle-row { display: flex; gap: 4px; margin-bottom: 12px; }
          .intensity-zone-btn { background: transparent; border: 1px solid rgba(139,144,168,0.3); color: #8b90a8; border-radius: 6px; padding: 5px 12px; font-size: 0.78rem; cursor: pointer; transition: all 0.15s; }
          .intensity-zone-btn:hover { border-color: #6c63ff; color: #e8eaf0; }
          .intensity-zone-btn.active { background: rgba(108,99,255,0.15); border-color: #6c63ff; color: #6c63ff; font-weight: 600; }
          .workout-tab-divider { border: none; border-top: 1px solid rgba(46,50,80,0.6); margin: 0 0 1.5rem; }
        `;
        document.head.appendChild(style);
      }

      const headerEl = document.createElement('div');
      headerEl.id = 'workoutTabHeader';
      headerEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap">
          <div class="workout-summary-range-toggle">
            <button class="workout-summary-range-btn" data-range="7d">1 week</button>
            <button class="workout-summary-range-btn active" data-range="30d">1 month</button>
            <button class="workout-summary-range-btn" data-range="1y">1 year</button>
            <button class="workout-summary-range-btn" data-range="all">All time</button>
          </div>
        </div>
        <div id="workoutSummaryBar"></div>
        <div id="intensityTrendsSection" style="margin-top:20px"></div>
        <hr class="workout-tab-divider" style="margin-top:2rem">
      `;
      tableContainer.parentElement.insertBefore(headerEl, tableContainer);
      setupWorkoutSummaryToggle();
    }
    renderWorkoutSummary();
    renderIntensityTrends();
  } else {
    renderWorkoutSummary();
  }

  const sportFilter = document.getElementById('workoutSportFilter');
  const sports = [...new Set(allWorkouts.map(w => w.sport_name))].sort();
  const currentSport = sportFilter.value;
  sportFilter.innerHTML = '<option value="">All Sports</option>' +
    sports.map(s => `<option value="${s}" ${s === currentSport ? 'selected' : ''}>${s.replace(/-/g, ' ')}</option>`).join('');

  if (workoutsFiltered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No workouts found</td></tr>';
    paginationEl.innerHTML = '';
    return;
  }

  const workoutsByDate = {};
  workoutsFiltered.forEach(w => {
    const d = getDateFromISO(w.start_time);
    if (!workoutsByDate[d]) workoutsByDate[d] = [];
    workoutsByDate[d].push(w);
  });
  const dayKeys = Object.keys(workoutsByDate).sort().reverse();

  const totalPages = Math.ceil(dayKeys.length / WORKOUTS_PER_PAGE);
  if (workoutsPage > totalPages) workoutsPage = totalPages;
  const start = (workoutsPage - 1) * WORKOUTS_PER_PAGE;
  const pageDays = dayKeys.slice(start, start + WORKOUTS_PER_PAGE);

  tbody.innerHTML = pageDays.map(date => {
    const dayWorkouts = workoutsByDate[date];

    let totalDurMs = 0, totalCals = 0, totalDist = 0;
    let sumAvgHR = 0, maxHR = 0;
    let sumStrain = 0, strainCount = 0;
    let z0 = 0, z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0;

    dayWorkouts.forEach(w => {
      totalDurMs += (new Date(w.end_time) - new Date(w.start_time));
      totalCals += w.calories || 0;
      totalDist += w.distance_meter || 0;
      sumAvgHR += w.avg_heart_rate || 0;
      if ((w.max_heart_rate || 0) > maxHR) maxHR = w.max_heart_rate;
      if (w.strain != null) { sumStrain += w.strain; strainCount++; }
      const zd = w.zone_durations || {};
      z0 += zd.zone_zero_milli || 0;
      z1 += zd.zone_one_milli || 0;
      z2 += zd.zone_two_milli || 0;
      z3 += zd.zone_three_milli || 0;
      z4 += zd.zone_four_milli || 0;
      z5 += zd.zone_five_milli || 0;
    });

    const totalMins = Math.round(totalDurMs / 60000);
    const avgHR = Math.round(sumAvgHR / dayWorkouts.length);
    const avgStrain = strainCount ? sumStrain / strainCount : null;

    const durStr = totalMins >= 60
      ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`
      : `${totalMins}m`;

    const seen = new Set();
    const sportTags = dayWorkouts
      .filter(w => { if (seen.has(w.sport_name)) return false; seen.add(w.sport_name); return true; })
      .map(w => `<span class="sport-tag ${sportClass(w.sport_name)}">${w.sport_name.replace(/-/g, ' ')}</span>`)
      .join('');
    const countBadge = dayWorkouts.length > 1
      ? `<span class="workout-count-badge">${dayWorkouts.length}</span>`
      : '';

    const zTotal = z0 + z1 + z2 + z3 + z4 + z5;
    let zoneBarHtml = '—';
    if (zTotal > 0) {
      const segs = [
        { val: z0, color: '#888780' },
        { val: z1, color: '#5DCAA5' },
        { val: z2, color: '#EF9F27' },
        { val: z3, color: '#E24B4A' },
        { val: z4, color: '#993556' },
        { val: z5, color: '#6c63ff' },
      ].filter(s => s.val > 0);
      const segHtml = segs.map(s =>
        `<div class="zone-sparkbar-seg" style="flex:${s.val};background:${s.color}"></div>`
      ).join('');
      zoneBarHtml = `<div class="zone-sparkbar">${segHtml}</div>`;
    }

    let strainHtml = '—';
    if (avgStrain != null) {
      const pct = Math.min(100, (avgStrain / 21) * 100).toFixed(1);
      strainHtml = `
        <div class="strain-bar-wrap">
          <span class="strain-bar-num">${avgStrain.toFixed(1)}</span>
          <div class="strain-bar-track">
            <div class="strain-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>`;
    }

    const distStr = totalDist > 200 ? (totalDist / 1609.34).toFixed(2) + ' mi' : '—';

    return `
      <tr>
        <td>${formatDate(date)}</td>
        <td>${sportTags}${countBadge}</td>
        <td>${durStr}</td>
        <td>${avgHR} / <span style="color:#8b90a8">${maxHR || '—'}</span></td>
        <td>${totalCals} kcal</td>
        <td>${distStr}</td>
        <td>${strainHtml}</td>
        <td>${zoneBarHtml}</td>
      </tr>`;
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
// ===== PROTEIN CHART =====
let proteinChart = null;
let proteinChartRange = '30d';

function injectProteinChartStyles() {
  if (document.getElementById('proteinChartStyles')) return;
  const style = document.createElement('style');
  style.id = 'proteinChartStyles';
  style.textContent = `
    #proteinChartSection {
      margin-bottom: 24px;
    }
    .protein-chart-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .protein-chart-title {
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #8b90a8;
    }
    .protein-chart-range-toggle {
      display: flex;
      gap: 4px;
    }
    .protein-range-btn {
      background: transparent;
      border: 1px solid rgba(139,144,168,0.3);
      color: #8b90a8;
      border-radius: 6px;
      padding: 4px 11px;
      font-size: 0.76rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .protein-range-btn:hover { border-color: #6c63ff; color: #e8eaf0; }
    .protein-range-btn.active {
      background: rgba(108,99,255,0.15);
      border-color: #6c63ff;
      color: #6c63ff;
      font-weight: 600;
    }
    .protein-chart-metrics {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .protein-metric {
      background: rgba(108,99,255,0.07);
      border: 1px solid rgba(108,99,255,0.15);
      border-radius: 10px;
      padding: 8px 14px;
      min-width: 100px;
    }
    .protein-metric-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #8b90a8;
      margin-bottom: 2px;
    }
    .protein-metric-value {
      font-size: 1.1rem;
      font-weight: 600;
      color: #e8eaf0;
    }
    .protein-metric-sub {
      font-size: 0.7rem;
      color: #8b90a8;
      margin-top: 1px;
    }
  `;
  document.head.appendChild(style);
}

function getProteinGoals() {
  const snap = getCurrentGoal();
  const goal = (snap && snap.saved_protein_goal) || 135;
  const floor = goal ? Math.round(goal / 1.2) : 110;
  return { goal, floor };
}

function getMealsForProteinRange(range) {
  if (!allMeals.length) return allMeals;
  const now = new Date();
  const cutoff = new Date(now);
  if (range === '7d') cutoff.setDate(cutoff.getDate() - 7);
  else if (range === '30d') cutoff.setDate(cutoff.getDate() - 30);
  else if (range === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1);
  else return allMeals; // 'all'
  return allMeals.filter(m => new Date(m.date + 'T00:00:00') >= cutoff);
}

function renderProteinChart() {
  injectProteinChartStyles();

  if (!document.getElementById('proteinChartSection')) {
    const mealsTab = document.getElementById('tab-meals');
    const filterBar = mealsTab.querySelector('.filter-bar') || mealsTab.firstElementChild;
    const section = document.createElement('div');
    section.id = 'proteinChartSection';
    section.className = 'card';
    section.style.padding = '20px 24px';
    mealsTab.insertBefore(section, filterBar);
  }

  const section = document.getElementById('proteinChartSection');
  const { goal: proteinGoal, floor: proteinFloor } = getProteinGoals();
  const filtered = getMealsForProteinRange(proteinChartRange);

  const byDate = {};
  filtered.forEach(meal => {
    if (!byDate[meal.date]) byDate[meal.date] = 0;
    byDate[meal.date] += meal.total_protein || 0;
  });
  const dates = Object.keys(byDate).sort();
  const proteinVals = dates.map(d => Math.round(byDate[d] * 10) / 10);

  const daysLogged = dates.length;
  const avg = daysLogged ? (proteinVals.reduce((a, b) => a + b, 0) / daysLogged).toFixed(1) : '—';
  const metGoalDays = proteinGoal ? proteinVals.filter(v => v >= proteinGoal).length : 0;
  const pctMet = daysLogged ? Math.round((metGoalDays / daysLogged) * 100) : 0;
  const peak = daysLogged ? Math.max(...proteinVals).toFixed(1) : '—';
  const withinRangeDays = proteinFloor ? proteinVals.filter(v => v >= proteinFloor).length : 0;
  const pctWithinRange = daysLogged ? Math.round((withinRangeDays / daysLogged) * 100) : 0;

  section.innerHTML = `
    <div class="protein-chart-header">
      <div class="protein-chart-title">Daily Protein</div>
      <div class="protein-chart-range-toggle">
        <button class="protein-range-btn ${proteinChartRange === '7d' ? 'active' : ''}" data-range="7d">1 week</button>
        <button class="protein-range-btn ${proteinChartRange === '30d' ? 'active' : ''}" data-range="30d">1 month</button>
        <button class="protein-range-btn ${proteinChartRange === '1y' ? 'active' : ''}" data-range="1y">1 year</button>
        <button class="protein-range-btn ${proteinChartRange === 'all' ? 'active' : ''}" data-range="all">All time</button>
      </div>
    </div>
    <div class="protein-chart-metrics">
      <div class="protein-metric">
        <div class="protein-metric-label">Avg protein</div>
        <div class="protein-metric-value">${avg}g</div>
        <div class="protein-metric-sub">${daysLogged} day${daysLogged !== 1 ? 's' : ''} logged</div>
      </div>
      <div class="protein-metric">
        <div class="protein-metric-label">Target hit</div>
        <div class="protein-metric-value">${proteinGoal ? `${metGoalDays}/${daysLogged}` : '—'}</div>
        <div class="protein-metric-sub">${proteinGoal ? `${pctMet}% of days ≥ ${proteinGoal}g` : 'no goal set'}</div>
      </div>
      <div class="protein-metric">
        <div class="protein-metric-label">Within range</div>
        <div class="protein-metric-value">${proteinGoal ? `${withinRangeDays}/${daysLogged}` : '—'}</div>
        <div class="protein-metric-sub">${proteinGoal ? `${pctWithinRange}% of days ≥ ${proteinFloor}g` : 'no goal set'}</div>
      </div>
      <div class="protein-metric">
        <div class="protein-metric-label">Peak day</div>
        <div class="protein-metric-value">${peak}g</div>
        <div class="protein-metric-sub">single day high</div>
      </div>
    </div>
    <div class="protein-chart-legend" style="display:flex;gap:16px;margin-bottom:8px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:#8b90a8">
        <div style="width:10px;height:10px;border-radius:2px;background:#00d4aa"></div>≥ target (${proteinGoal ?? '—'}g)
      </div>
      <div style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:#8b90a8">
        <div style="width:10px;height:10px;border-radius:2px;background:#6c63ff"></div>≥ floor (${proteinFloor ?? '—'}g)
      </div>
      <div style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:#8b90a8">
        <div style="width:10px;height:10px;border-radius:2px;background:#ff6b6b"></div>below floor
      </div>
    </div>
    <div style="position:relative;width:100%;height:200px">
      <canvas id="proteinBarChart"></canvas>
    </div>
  `;

  section.querySelectorAll('.protein-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      proteinChartRange = btn.dataset.range;
      renderProteinChart();
    });
  });

  if (proteinChart) proteinChart.destroy();

  const labels = dates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const barColors = proteinVals.map(v =>
    !proteinGoal ? 'rgba(108,99,255,0.65)' :
      v >= proteinGoal ? 'rgba(0,212,170,0.75)' :
        v >= proteinFloor ? 'rgba(108,99,255,0.65)' :
          'rgba(255,107,107,0.55)'
  );
  const barBorders = proteinVals.map(v =>
    !proteinGoal ? '#6c63ff' :
      v >= proteinGoal ? '#00d4aa' :
        v >= proteinFloor ? '#6c63ff' :
          '#ff6b6b'
  );

  const tickColor = '#8b90a8';
  const gridColor = 'rgba(139,144,168,0.12)';
  const tt = {
    backgroundColor: '#1a1d27',
    borderColor: '#2e3250',
    borderWidth: 1,
    titleColor: '#e8eaf0',
    bodyColor: '#8b90a8',
  };

  const datasets = [
    {
      label: 'Protein (g)',
      data: proteinVals,
      backgroundColor: barColors,
      borderColor: barBorders,
      borderWidth: 1,
      borderRadius: 3,
      order: 2,
    },
  ];

  if (proteinGoal) {
    datasets.push({
      label: `Target (${proteinGoal}g)`,
      data: dates.map(() => proteinGoal),
      type: 'line',
      borderColor: 'rgba(0,212,170,0.8)',
      borderWidth: 1.5,
      borderDash: [5, 4],
      pointRadius: 0,
      fill: false,
      order: 0,
    });
  }

  if (proteinFloor) {
    datasets.push({
      label: `Floor (${proteinFloor}g)`,
      data: dates.map(() => proteinFloor),
      type: 'line',
      borderColor: 'rgba(255,107,107,0.7)',
      borderWidth: 1.5,
      borderDash: [3, 4],
      pointRadius: 0,
      fill: false,
      order: 1,
    });
  }

  proteinChart = new Chart(document.getElementById('proteinBarChart'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tt,
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label.startsWith('Target')) return ` Target: ${proteinGoal}g`;
              if (ctx.dataset.label.startsWith('Floor')) return ` Floor: ${proteinFloor}g`;
              return ` Protein: ${ctx.raw}g`;
            },
            afterBody: items => {
              if (!proteinGoal) return '';
              const val = items.find(i => i.dataset.label === 'Protein (g)')?.raw;
              if (val == null) return '';
              const diff = val - proteinGoal;
              return diff >= 0
                ? `  ✓ ${diff.toFixed(1)}g over target`
                : `  ✗ ${Math.abs(diff).toFixed(1)}g under target`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 20 },
          grid: { color: gridColor },
        },
        y: {
          min: 0,
          ticks: { color: tickColor, font: { size: 11 }, callback: v => v + 'g' },
          grid: { color: gridColor },
          title: { display: true, text: 'protein (g)', color: tickColor, font: { size: 11 } },
        },
      },
    },
  });
}

function groupedMealDates(meals) {
  const byDate = {};
  meals.forEach(meal => {
    if (!byDate[meal.date]) byDate[meal.date] = [];
    byDate[meal.date].push(meal);
  });
  return Object.keys(byDate).sort().reverse().map(date => ({ date, meals: byDate[date] }));
}

function renderMeals() {
  renderProteinChart();
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
    const totalCarbs = dayMeals.reduce((s, m) =>
      s + (m.items || []).reduce((si, i) => si + (i.totalCarbohydrate || 0), 0), 0);
    const totalFat = dayMeals.reduce((s, m) =>
      s + (m.items || []).reduce((si, i) => si + (i.totalFat || 0), 0), 0);

    const summaryPieId = `day-summary-pie-${date}`;

    const mealsHtml = dayMeals.map(meal => {
      const typeClass = `meal-${meal.meal_type}`;
      const items = meal.items || [];
      const mealCarbs = items.reduce((s, i) => s + (i.totalCarbohydrate || 0), 0);
      const mealFat = items.reduce((s, i) => s + (i.totalFat || 0), 0);
      const protein = meal.total_protein || 0;
      const itemChips = items.map(item =>
        `<span class="meal-item-chip">${item.foodName}<span class="item-cals">${item.calories} kcal · ${(item.protein).toFixed(1)}g p</span></span>`
      ).join('');

      const chartId = `macro-pie-${meal.id || (date + '-' + meal.meal_type + '-' + Math.random().toString(36).slice(2))}`;
      setTimeout(() => renderMacroPie(chartId, protein, mealCarbs, mealFat), 0);

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
              <span class="macro-c">C: ${mealCarbs.toFixed(1)}g</span>
              <span class="macro-f">F: ${mealFat.toFixed(1)}g</span>
            </div>
            <div class="meal-pie-wrap">
              <canvas id="${chartId}" width="80" height="80"></canvas>
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="meal-day-group" id="meal-group-${date}">
        <div class="meal-day-header meal-day-toggle" onclick="toggleMealDay('${date}')" title="Click to expand/collapse">
          <div class="meal-day-toggle-left">
            <span class="meal-day-chevron" id="chevron-${date}">▶</span>
            <h4>${formatDate(date)}</h4>
          </div>
          <div class="meal-day-summary-right">
            <div class="meal-day-summary-macros">
              <span class="macro-p">P: ${totalProtein.toFixed(1)}g</span>
              <span class="macro-c">C: ${totalCarbs.toFixed(1)}g</span>
              <span class="macro-f">F: ${totalFat.toFixed(1)}g</span>
              <span class="meal-day-total-cals">🍽 ${totalCals} kcal</span>
            </div>
            <div class="meal-day-pie-wrap">
              <canvas id="${summaryPieId}" width="52" height="52"></canvas>
            </div>
          </div>
        </div>
        <div class="meal-day-body meal-day-collapsible" id="meal-body-${date}" style="display:none">
          ${mealsHtml}
        </div>
      </div>
    `;
  }).join('');

  pageItems.forEach(({ date, meals: dayMeals }) => {
    const p = dayMeals.reduce((s, m) => s + (m.total_protein || 0), 0);
    const c = dayMeals.reduce((s, m) =>
      s + (m.items || []).reduce((si, i) => si + (i.totalCarbohydrate || 0), 0), 0);
    const f = dayMeals.reduce((s, m) =>
      s + (m.items || []).reduce((si, i) => si + (i.totalFat || 0), 0), 0);
    setTimeout(() => renderMacroPie(`day-summary-pie-${date}`, p, c, f), 0);
  });

  renderPagination(paginationEl, mealsPage, totalPages, (p) => {
    mealsPage = p;
    renderMeals();
  });
}

function toggleMealDay(date) {
  const body = document.getElementById(`meal-body-${date}`);
  const chevron = document.getElementById(`chevron-${date}`);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  chevron.textContent = isOpen ? '▶' : '▼';
  chevron.classList.toggle('chevron-open', !isOpen);
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
      .meal-entry-bottom {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-top: 6px;
      }
      .meal-pie-wrap { flex-shrink: 0; }
      .day-modal-body-comp-row {
        display: flex; gap: 12px; flex-wrap: wrap;
        background: rgba(0,212,170,0.05); border: 1px solid rgba(0,212,170,0.15);
        border-radius: 10px; padding: 12px 16px;
      }
      .day-modal-body-comp-stat {
        display: flex; flex-direction: column; gap: 2px; min-width: 90px;
      }
      .day-modal-body-comp-stat .bcs-label {
        font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.07em;
        color: #8b90a8;
      }
      .day-modal-body-comp-stat .bcs-value {
        font-size: 1rem; font-weight: 600; color: #e8eaf0;
      }
      .day-modal-body-comp-stat .bcs-sub {
        font-size: 0.75rem; color: #8b90a8;
      }
      .day-modal-body-comp-stat .bcs-value.exact { color: #00d4aa; }
      .day-modal-body-comp-stat .bcs-value.estimated { color: #c8cbdf; }
      .day-modal.week-modal {
        width: min(860px, 95vw);
      }
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
  const inner = document.getElementById('dayModalInner');
  if (inner) inner.classList.remove('week-modal');
}

function openDayModal(date) {
  const inner = document.getElementById('dayModalInner');
  inner.classList.remove('week-modal');

  const dailyMap = buildDailyMap();
  const day = dailyMap[date] || { totalCaloriesIn: 0, workouts: [], workoutCalories: 0 };
  const dayMeals = allMeals.filter(m => m.date === date);

  const totalProtein = dayMeals.reduce((s, m) => s + (m.total_protein || 0), 0);
  const totalCarbs = dayMeals.reduce((s, m) =>
    s + (m.items || []).reduce((si, i) => si + (i.totalCarbohydrate || 0), 0), 0);
  const totalFat = dayMeals.reduce((s, m) =>
    s + (m.items || []).reduce((si, i) => si + (i.totalFat || 0), 0), 0);

  const { targetIntake } = getTargetIntakeForDate(date, day.workoutCalories);
  const delta = targetIntake - day.totalCaloriesIn;
  const metGoal = day.totalCaloriesIn > 0 && delta >= 0;

  const exactWeightEntry = getWeightForDate(date);
  const weightEntry = exactWeightEntry || getLastKnownWeightBeforeDate(date);
  const isExactReading = !!exactWeightEntry;

  let bodyCompHtml = '';
  if (weightEntry) {
    const lbs = kgToLbs(weightEntry.weight);
    const fat = weightEntry.fat != null ? weightEntry.fat.toFixed(2) : null;
    const bmi = weightEntry.bmi != null ? weightEntry.bmi : null;
    const valueClass = isExactReading ? 'exact' : 'estimated';
    const sourceLabel = isExactReading
      ? 'Aria scale reading'
      : `Last known · ${formatDate(weightEntry.date)}`;

    bodyCompHtml = `
      <div class="day-modal-body-comp-row">
        <div class="day-modal-body-comp-stat">
          <div class="bcs-label">Weight</div>
          <div class="bcs-value ${valueClass}">${lbs} lbs</div>
          <div class="bcs-sub">${sourceLabel}</div>
        </div>
        ${fat != null ? `
        <div class="day-modal-body-comp-stat">
          <div class="bcs-label">Body Fat</div>
          <div class="bcs-value ${valueClass}">${fat}%</div>
          <div class="bcs-sub">${isExactReading ? 'Aria scale reading' : `Last known · ${formatDate(weightEntry.date)}`}</div>
        </div>` : ''}
        ${bmi != null ? `
        <div class="day-modal-body-comp-stat">
          <div class="bcs-label">BMI</div>
          <div class="bcs-value ${valueClass}">${bmi}</div>
          <div class="bcs-sub">${isExactReading ? 'Aria scale reading' : `Last known · ${formatDate(weightEntry.date)}`}</div>
        </div>` : ''}
      </div>
    `;
  } else {
    bodyCompHtml = `<div class="day-modal-empty">No weight data available</div>`;
  }

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

  const dayPieId = `modal-day-pie-${date}`;
  const mealsHtml = dayMeals.length
    ? dayMeals.map((meal, idx) => {
      const items = meal.items || [];
      const mCarbs = items.reduce((s, i) => s + (i.totalCarbohydrate || 0), 0);
      const mFat = items.reduce((s, i) => s + (i.totalFat || 0), 0);
      const mProt = meal.total_protein || 0;
      const pieId = `modal-meal-pie-${date}-${idx}`;
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
      <h3>⚖️ Body Composition</h3>
      ${bodyCompHtml}
    </div>

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

  if (dayMeals.length) {
    setTimeout(() => renderMacroPie(dayPieId, totalProtein, totalCarbs, totalFat), 0);
  }
}

// ===== WEEK MODAL =====
function openWeekModal(weekMonday) {
  const inner = document.getElementById('dayModalInner');
  inner.classList.add('week-modal');

  const weekDates = [];
  const start = new Date(weekMonday + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    weekDates.push(d.toISOString().substring(0, 10));
  }

  const todayStr = new Date().toISOString().substring(0, 10);
  const weekSunday = weekDates[6];
  const weekEnd = weekSunday > todayStr ? todayStr : weekSunday;
  const dailyMap = buildDailyMap();

  const daysWithMeals = weekDates.filter(d => (dailyMap[d] || {}).totalCaloriesIn > 0);
  const totalCaloriesIn = daysWithMeals.reduce((s, d) => s + dailyMap[d].totalCaloriesIn, 0);
  const totalTarget = daysWithMeals.reduce((s, d) => {
    const woCals = (dailyMap[d] || {}).workoutCalories || 0;
    const { targetIntake } = getTargetIntakeForDate(d, woCals);
    return s + targetIntake;
  }, 0);
  const weekDelta = totalTarget - totalCaloriesIn;
  const weekMet = weekDelta >= 0;

  const allWeekWorkouts = weekDates.flatMap(d => (dailyMap[d] || {}).workouts || []);
  const workoutDays = [...new Set(allWeekWorkouts.map(w => getDateFromISO(w.start_time)))];
  const totalWorkoutCals = allWeekWorkouts.reduce((s, w) => s + (w.calories || 0), 0);

  const weekWeightEntries = allWeight.filter(w => w.date >= weekMonday && w.date <= weekEnd);
  let weightHtml = '<div class="day-modal-empty">No weight data this week</div>';
  if (weekWeightEntries.length >= 2) {
    const startW = weekWeightEntries[0];
    const endW = weekWeightEntries[weekWeightEntries.length - 1];
    const wDelta = +(kgToLbs(endW.weight) - kgToLbs(startW.weight)).toFixed(1);
    const fDelta = +(endW.fat - startW.fat).toFixed(2);
    const wColor = wDelta <= 0 ? 'var(--green)' : 'var(--red)';
    const fColor = fDelta <= 0 ? 'var(--green)' : 'var(--red)';
    weightHtml = `
      <div class="tdee-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="tdee-stat">
          <div class="stat-label">Start Weight</div>
          <div class="stat-value">${kgToLbs(startW.weight)} lbs</div>
          <div class="stat-sub">${formatDate(startW.date)}</div>
        </div>
        <div class="tdee-stat">
          <div class="stat-label">End Weight</div>
          <div class="stat-value">${kgToLbs(endW.weight)} lbs</div>
          <div class="stat-sub">${formatDate(endW.date)}</div>
        </div>
        <div class="tdee-stat" style="border-color:${wColor}">
          <div class="stat-label">Weight Δ</div>
          <div class="stat-value" style="color:${wColor}">${wDelta > 0 ? '+' : ''}${wDelta} lbs</div>
          <div class="stat-sub">${endW.fat?.toFixed(2)}% fat now</div>
        </div>
        <div class="tdee-stat" style="border-color:${fColor}">
          <div class="stat-label">Body Fat Δ</div>
          <div class="stat-value" style="color:${fColor}">${fDelta > 0 ? '+' : ''}${fDelta}%</div>
          <div class="stat-sub">${startW.fat?.toFixed(2)}% → ${endW.fat?.toFixed(2)}%</div>
        </div>
      </div>
    `;
  } else if (weekWeightEntries.length === 1) {
    const w = weekWeightEntries[0];
    weightHtml = `
      <div class="tdee-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="tdee-stat">
          <div class="stat-label">Weight</div>
          <div class="stat-value">${kgToLbs(w.weight)} lbs</div>
          <div class="stat-sub">${formatDate(w.date)}</div>
        </div>
        <div class="tdee-stat">
          <div class="stat-label">Body Fat</div>
          <div class="stat-value">${w.fat?.toFixed(2)}%</div>
          <div class="stat-sub">single reading this week</div>
        </div>
      </div>
    `;
  }

  const workoutsHtml = allWeekWorkouts.length
    ? allWeekWorkouts
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .map(w => `
          <div class="day-modal-workout-row">
            <span style="color:var(--text-muted);min-width:70px">${formatDate(getDateFromISO(w.start_time))}</span>
            <span><span class="sport-tag ${sportClass(w.sport_name)}">${w.sport_name.replace(/-/g, ' ')}</span></span>
            <span>⏱ ${formatDuration(w.start_time, w.end_time)}</span>
            <span>❤️ ${w.avg_heart_rate} bpm</span>
            <span>🔥 ${w.calories} kcal</span>
            ${w.distance_meter != null ? `<span>📍 ${(w.distance_meter / 1609.34).toFixed(2)} mi</span>` : ''}
          </div>`).join('')
    : '<div class="day-modal-empty">No workouts this week</div>';

  const dayRowsHtml = weekDates.map(date => {
    if (date > todayStr) return '';
    const day = dailyMap[date] || { totalCaloriesIn: 0, workouts: [], workoutCalories: 0 };
    const hasAnyData = day.totalCaloriesIn > 0 || day.workouts.length > 0;
    if (!hasAnyData) return '';
    const woCals = day.workoutCalories;
    const { targetIntake } = getTargetIntakeForDate(date, woCals);
    const d = targetIntake - day.totalCaloriesIn;
    const met = day.totalCaloriesIn > 0 && d >= 0;
    const sports = [...new Set(day.workouts.map(w => w.sport_name))];
    return `
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:7px 6px;color:var(--text-muted);font-size:0.82rem;white-space:nowrap">${formatDate(date)}</td>
        <td style="padding:7px 6px;text-align:right;font-size:0.84rem">${day.totalCaloriesIn > 0 ? day.totalCaloriesIn : '—'}</td>
        <td style="padding:7px 6px;text-align:right;font-size:0.84rem">${day.totalCaloriesIn > 0 ? targetIntake : '—'}</td>
        <td style="padding:7px 6px;text-align:right;font-size:0.84rem;color:${day.totalCaloriesIn > 0 ? (met ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)'}">
          ${day.totalCaloriesIn > 0 ? (d >= 0 ? '▼' + d : '▲' + Math.abs(d)) : '—'}
        </td>
        <td style="padding:7px 6px;text-align:right;font-size:0.82rem;color:var(--text-muted)">${woCals > 0 ? '🔥 ' + woCals : '—'}</td>
        <td style="padding:7px 6px;font-size:0.8rem">${sports.map(s => `<span class="sport-tag ${sportClass(s)}">${s.replace(/-/g, ' ')}</span>`).join(' ') || '—'}</td>
      </tr>
    `;
  }).join('');

  const weekLabel = `${formatDate(weekMonday)} – ${formatDate(weekSunday)}`;

  document.getElementById('dayModalContent').innerHTML = `
    <h2>📆 Week of ${weekLabel}</h2>

    <div class="day-modal-section">
      <h3>🍽 Calories · ${daysWithMeals.length} days logged</h3>
      <div class="tdee-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:${daysWithMeals.length ? '14px' : '0'}">
        <div class="tdee-stat">
          <div class="stat-label">Total Consumed</div>
          <div class="stat-value">${totalCaloriesIn || '—'}</div>
          <div class="stat-sub">kcal across ${daysWithMeals.length} day${daysWithMeals.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="tdee-stat">
          <div class="stat-label">Total Target</div>
          <div class="stat-value">${totalTarget || '—'}</div>
          <div class="stat-sub">kcal (deficit-adjusted)</div>
        </div>
        <div class="tdee-stat" style="border-color:${daysWithMeals.length ? (weekMet ? 'var(--green)' : 'var(--red)') : 'var(--border)'}">
          <div class="stat-label">Weekly ${weekMet ? 'Surplus' : 'Overage'}</div>
          <div class="stat-value" style="color:${daysWithMeals.length ? (weekMet ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)'}">
            ${daysWithMeals.length ? (weekMet ? '▼' : '▲') + ' ' + Math.abs(weekDelta) : '—'}
          </div>
          <div class="stat-sub">${daysWithMeals.length ? 'kcal ' + (weekMet ? 'under' : 'over') + ' budget' : 'no meals logged'}</div>
        </div>
      </div>
      ${daysWithMeals.length > 0 ? `
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:6px;font-size:0.75rem;color:var(--text-muted);font-weight:500">Day</th>
              <th style="text-align:right;padding:6px;font-size:0.75rem;color:var(--text-muted);font-weight:500">Ate</th>
              <th style="text-align:right;padding:6px;font-size:0.75rem;color:var(--text-muted);font-weight:500">Target</th>
              <th style="text-align:right;padding:6px;font-size:0.75rem;color:var(--text-muted);font-weight:500">Δ</th>
              <th style="text-align:right;padding:6px;font-size:0.75rem;color:var(--text-muted);font-weight:500">Burned</th>
              <th style="padding:6px;font-size:0.75rem;color:var(--text-muted);font-weight:500">Workouts</th>
            </tr>
          </thead>
          <tbody>${dayRowsHtml}</tbody>
        </table>
      ` : ''}
    </div>

    <div class="day-modal-section">
      <h3>🏋️ Workouts · ${workoutDays.length} day${workoutDays.length !== 1 ? 's' : ''} · ${totalWorkoutCals} kcal burned</h3>
      ${workoutsHtml}
    </div>

    <div class="day-modal-section">
      <h3>⚖️ Weight & Body Composition</h3>
      ${weightHtml}
    </div>
  `;

  document.getElementById('dayModal').style.display = 'flex';
}

// ===== LOG MEAL MODAL =====
function setupLogMealModal() {
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

  const mealResetBtn = document.getElementById('mealResetBtn');
  if (mealResetBtn && !document.getElementById('openLogMealBtn')) {
    const btn = document.createElement('button');
    btn.id = 'openLogMealBtn';
    btn.className = 'log-meal-btn';
    btn.textContent = '+ Log Meal';
    btn.addEventListener('click', openLogMealModal);
    mealResetBtn.parentNode.insertBefore(btn, mealResetBtn.nextSibling);
  }

  document.getElementById('logMealCloseBtn').addEventListener('click', closeLogMealModal);
  document.getElementById('logMealCancelBtn').addEventListener('click', closeLogMealModal);
  document.getElementById('logMealOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('logMealOverlay')) closeLogMealModal();
  });
  document.getElementById('logMealSubmitBtn').addEventListener('click', submitLogMeal);
  document.getElementById('logMealInput').addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitLogMeal();
  });
}

function openLogMealModal() {
  const overlay = document.getElementById('logMealOverlay');
  const input = document.getElementById('logMealInput');
  const progress = document.getElementById('logMealProgress');
  const error = document.getElementById('logMealError');
  const submitBtn = document.getElementById('logMealSubmitBtn');

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

  input.disabled = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging…';
  error.style.display = 'none';
  progress.style.display = 'flex';
  setLogMealStep(1);

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

    setLogMealStep(3);
    submitBtn.textContent = '✓ Logged';

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
  const currentGoal = getCurrentGoal();

  if (currentGoal && currentGoal.saved_tdee) {
    const { saved_tdee: tdee, saved_bmr: bmr, saved_deficit: deficit,
            saved_target_intake: targetIntake, saved_date: savedDate,
            saved_weight_lbs: savedLbs, goal_date, target_weight } = currentGoal;
    const savedDateFmt = savedDate ? formatDate(savedDate) : 'unknown date';
    const weeklyLoss = deficit > 0 ? (deficit * 7 / 3500).toFixed(2) : '0';
    const feasible = deficit <= 1000;
    const deficitColor = feasible ? 'var(--green)' : 'var(--danger)';
    const warning = !feasible ? ' ⚠️ Deficit exceeds 1000 kcal/day — consider extending your goal date.' : '';

    let daysLeftHtml = '';
    if (goal_date) {
      const daysLeft = Math.max(0, Math.round((new Date(goal_date) - new Date()) / (1000 * 60 * 60 * 24)));
      const currentLbs = allWeight.length ? kgToLbs(allWeight[allWeight.length - 1].weight) : null;
      const lbsLeft = currentLbs && target_weight
        ? (currentLbs - target_weight).toFixed(1)
        : '—';

      daysLeftHtml = `
        <div class="tdee-stat">
          <div class="stat-label">Days Remaining</div>
          <div class="stat-value">${daysLeft}</div>
          <div class="stat-sub">to ${goal_date}</div>
        </div>
        <div class="tdee-stat">
          <div class="stat-label">Lbs Left to Goal</div>
          <div class="stat-value">${lbsLeft > 0 ? lbsLeft : '0'} lbs</div>
          <div class="stat-sub">as of latest weight</div>
        </div>
      `;
    }

    // Show goal history if more than one snapshot
    const snapshots = (goals.goals || []).slice().sort((a, b) => a.saved_date > b.saved_date ? -1 : 1);
    const historyHtml = snapshots.length > 1 ? `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
        <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.07em;color:#8b90a8;margin-bottom:8px">Goal History</div>
        ${snapshots.map((s, i) => `
          <div style="display:flex;gap:12px;align-items:baseline;font-size:0.8rem;color:${i === 0 ? '#e8eaf0' : '#8b90a8'};padding:3px 0">
            <span style="min-width:80px">${s.saved_date}</span>
            <span>${s.saved_target_intake} kcal/day</span>
            <span>·</span>
            <span>${s.saved_deficit} deficit</span>
            <span>·</span>
            <span>goal: ${s.target_weight} lbs by ${s.goal_date || '—'}</span>
            ${i === 0 ? '<span style="color:#6c63ff;font-size:0.7rem;margin-left:4px">current</span>' : ''}
          </div>
        `).join('')}
      </div>
    ` : '';

    container.innerHTML = `
      <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px">
        📌 Locked in on ${savedDateFmt} at ${savedLbs} lbs — re-save Goals to recalculate.
      </div>
      <div class="tdee-grid">
        <div class="tdee-stat">
          <div class="stat-label">BMR (at rest)</div>
          <div class="stat-value">${bmr || '—'}</div>
          <div class="stat-sub">kcal/day if sedentary</div>
        </div>
        <div class="tdee-stat highlight">
          <div class="stat-label">TDEE (baseline)</div>
          <div class="stat-value">${tdee}</div>
          <div class="stat-sub">kcal/day (lightly active)</div>
        </div>
        <div class="tdee-stat" style="border-color:${deficitColor}">
          <div class="stat-label">Daily Deficit</div>
          <div class="stat-value" style="color:${deficitColor}">${deficit > 0 ? deficit : 0} kcal</div>
          <div class="stat-sub">${weeklyLoss > 0 ? weeklyLoss + ' lbs/week' : 'At goal!'}</div>
        </div>
        <div class="tdee-stat highlight-green">
          <div class="stat-label">Target Daily Intake</div>
          <div class="stat-value">${targetIntake > 0 ? targetIntake : '—'}</div>
          <div class="stat-sub">kcal/day (+ workout cals)</div>
        </div>
        ${daysLeftHtml}
      </div>
      <div class="tdee-breakdown">
        <strong>How this is calculated:</strong><br>
        TDEE of <strong>${tdee} kcal</strong> (Mifflin-St Jeor, lightly active) minus a daily deficit of
        <strong>${deficit} kcal</strong> = <strong>${targetIntake} kcal/day</strong> base target.
        On workout days, add that day's burned calories to your target.${warning}
      </div>
      ${historyHtml}
    `;
    return;
  }

  // Preview mode (no saved goal yet)
  const dob = goals.dob || document.getElementById('dob').value;
  const heightIn = goals.height_in || parseFloat(document.getElementById('heightIn').value);
  const sex = goals.sex || document.getElementById('sex').value;

  if (!dob || !heightIn) {
    container.innerHTML = '<div class="tdee-no-goal">Fill in your stats above and hit Save to lock in your calorie plan.</div>';
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
  const tw = parseFloat(document.getElementById('targetWeight').value);
  const gd = document.getElementById('goalDate').value;

  let previewHtml = `
    <div style="font-size:0.75rem;color:var(--accent);margin-bottom:12px">
      ⚠️ Preview only — hit Save to lock these numbers in.
    </div>
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
  `;

  if (tw && gd) {
    const today = new Date();
    const goalDate = new Date(gd);
    const daysLeft = Math.max(1, Math.round((goalDate - today) / (1000 * 60 * 60 * 24)));
    const lbsToLose = latestWeight - tw;
    const deficit = lbsToLose > 0 ? Math.round((lbsToLose * 3500) / daysLeft) : 0;
    const targetIntake = tdee - deficit;
    const feasible = deficit <= 1000;
    const deficitColor = feasible ? 'var(--green)' : 'var(--danger)';
    previewHtml += `
      <div class="tdee-stat" style="border-color:${deficitColor}">
        <div class="stat-label">Daily Deficit</div>
        <div class="stat-value" style="color:${deficitColor}">${deficit} kcal</div>
        <div class="stat-sub">${(deficit * 7 / 3500).toFixed(2)} lbs/week</div>
      </div>
      <div class="tdee-stat highlight-green">
        <div class="stat-label">Target Daily Intake</div>
        <div class="stat-value">${targetIntake > 0 ? targetIntake : '—'}</div>
        <div class="stat-sub">kcal/day (+ workout cals)</div>
      </div>
    `;
  } else {
    previewHtml += `
      <div class="tdee-stat highlight-green">
        <div class="stat-label">Effective Daily Budget</div>
        <div class="stat-value">${tdee}</div>
        <div class="stat-sub">set target weight + date for deficit</div>
      </div>
    `;
  }

  previewHtml += `</div>`;
  container.innerHTML = previewHtml;
}

// ===== GOALS =====
function renderGoals() {
  const currentGoal = getCurrentGoal();

  document.getElementById('targetWeight').value = currentGoal ? (currentGoal.target_weight || '') : '';
  document.getElementById('targetFat').value = currentGoal ? (currentGoal.target_fat || '') : '';
  if (currentGoal && currentGoal.goal_date) document.getElementById('goalDate').value = currentGoal.goal_date;
  if (goals.dob) document.getElementById('dob').value = goals.dob;
  if (goals.height_in) document.getElementById('heightIn').value = goals.height_in;
  if (goals.sex) document.getElementById('sex').value = goals.sex;
  renderGoalProgress();
  renderTDEEPlan();
}

function renderGoalProgress() {
  const container = document.getElementById('goalProgress');
  const currentGoal = getCurrentGoal();

  if (allWeight.length === 0) {
    container.innerHTML = '<div class="empty-state">No weight data available</div>';
    return;
  }

  const latest = allWeight[allWeight.length - 1];
  const first = allWeight[0];
  const latestLbs = kgToLbs(latest.weight);
  const firstLbs = kgToLbs(first.weight);
  let html = '';

  if (currentGoal && currentGoal.target_weight) {
    const targetLbs = currentGoal.target_weight;
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

  if (currentGoal && currentGoal.target_fat) {
    const startF = first.fat;
    const currentF = latest.fat;
    const targetF = currentGoal.target_fat;
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

    // Update top-level profile fields
    goals.dob = dob || goals.dob;
    goals.height_in = heightIn ? parseFloat(heightIn) : goals.height_in;
    goals.sex = sex || goals.sex || 'male';
    if (!goals.goals) goals.goals = [];

    let savedTDEE = null, savedBMR = null, savedDeficit = 0, savedTargetIntake = null;
    let savedWeightLbs = null, savedProteinGoal = 135;
    const savedDate = new Date().toISOString().substring(0, 10);

    if (dob && heightIn && allWeight.length) {
      const age = calcAge(dob);
      const latestLbs = kgToLbs(allWeight[allWeight.length - 1].weight);
      savedWeightLbs = latestLbs;
      savedTDEE = calcTDEE(latestLbs, parseFloat(heightIn), age, sex);
      savedBMR = Math.round(calcBMR(latestLbs, parseFloat(heightIn), age, sex));

      const currentFat = allWeight[allWeight.length - 1].fat;
      const savedLBM = currentFat != null ? savedWeightLbs * (1 - currentFat / 100) : null;
      savedProteinGoal = savedLBM ? Math.round(savedLBM * 1.2) : 110;

      if (tw && gd) {
        const today = new Date();
        const goalDate = new Date(gd);
        const daysLeft = Math.max(1, Math.round((goalDate - today) / (1000 * 60 * 60 * 24)));
        const lbsToLose = latestLbs - parseFloat(tw);
        if (lbsToLose > 0) {
          savedDeficit = Math.round((lbsToLose * 3500) / daysLeft);
          savedTargetIntake = Math.max(1200, savedTDEE - savedDeficit);
        } else {
          savedDeficit = 0;
          savedTargetIntake = savedTDEE;
        }
      } else {
        savedTargetIntake = savedTDEE;
      }
    }

    // Append new snapshot to goals array
    const newSnapshot = {
      saved_date: savedDate,
      saved_weight_lbs: savedWeightLbs,
      target_weight: tw ? parseFloat(tw) : null,
      target_fat: tf ? parseFloat(tf) : null,
      goal_date: gd || null,
      saved_tdee: savedTDEE,
      saved_bmr: savedBMR,
      saved_deficit: savedDeficit,
      saved_target_intake: savedTargetIntake,
      saved_protein_goal: savedProteinGoal,
      daily_calorie_goal: savedTargetIntake || 2000,
    };

    goals.goals.push(newSnapshot);

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