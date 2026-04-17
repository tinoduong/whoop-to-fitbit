// ===== MEALS TAB =====

let proteinChart = null;
let calorieChart = null;
let mealsChartRange = '30d';

function injectMealsChartStyles() {
  if (document.getElementById('mealsChartStyles')) return;
  const style = document.createElement('style');
  style.id = 'mealsChartStyles';
  style.textContent = `
    #mealChartsHeader { margin-bottom: 0; }
    .meals-chart-range-toggle { display: flex; gap: 4px; }
    .meals-range-btn { background: transparent; border: 1px solid rgba(139,144,168,0.3); color: #8b90a8; border-radius: 6px; padding: 5px 12px; font-size: 0.78rem; cursor: pointer; transition: all 0.15s; }
    .meals-range-btn:hover { border-color: #6c63ff; color: #e8eaf0; }
    .meals-range-btn.active { background: rgba(108,99,255,0.15); border-color: #6c63ff; color: #6c63ff; font-weight: 600; }
  `;
  document.head.appendChild(style);
}

function setupMealsChartRangeToggle() {
  const existing = document.getElementById('mealChartsHeader');
  if (existing) return;

  injectMealsChartStyles();

  const mealsTab = document.getElementById('tab-meals');
  const headerEl = document.createElement('div');
  headerEl.id = 'mealChartsHeader';
  headerEl.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;padding:0 4px';
  headerEl.innerHTML = `
    <div class="meals-chart-range-toggle">
      <button class="meals-range-btn" data-range="7d">1 week</button>
      <button class="meals-range-btn active" data-range="30d">1 month</button>
      <button class="meals-range-btn" data-range="1y">1 year</button>
      <button class="meals-range-btn" data-range="all">All time</button>
    </div>
  `;
  const sectionHeader = mealsTab.querySelector('.section-header');
  if (sectionHeader) {
    sectionHeader.insertAdjacentElement('afterend', headerEl);
  } else {
    mealsTab.insertBefore(headerEl, mealsTab.firstElementChild);
  }

  headerEl.querySelectorAll('.meals-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      headerEl.querySelectorAll('.meals-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mealsChartRange = btn.dataset.range;
      const ps = document.getElementById('proteinChartSection');
      const cs = document.getElementById('calorieChartSection');
      if (ps) ps.remove();
      if (cs) cs.remove();
      renderProteinChart();
      renderCalorieChart();
    });
  });
}

function injectProteinChartStyles() {
  if (document.getElementById('proteinChartStyles')) return;
  const style = document.createElement('style');
  style.id = 'proteinChartStyles';
  style.textContent = `
    #proteinChartSection { margin-bottom: 24px; }
    #calorieChartSection { margin-bottom: 24px; }
    .protein-chart-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .protein-chart-title { font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #8b90a8; }
    .protein-chart-range-toggle { display: flex; gap: 4px; }
    .protein-range-btn { background: transparent; border: 1px solid rgba(139,144,168,0.3); color: #8b90a8; border-radius: 6px; padding: 4px 11px; font-size: 0.76rem; cursor: pointer; transition: all 0.15s; }
    .protein-range-btn:hover { border-color: #6c63ff; color: #e8eaf0; }
    .protein-range-btn.active { background: rgba(108,99,255,0.15); border-color: #6c63ff; color: #6c63ff; font-weight: 600; }
    .protein-chart-metrics { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .protein-metric { background: rgba(108,99,255,0.07); border: 1px solid rgba(108,99,255,0.15); border-radius: 10px; padding: 8px 14px; min-width: 100px; }
    .protein-metric-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: #8b90a8; margin-bottom: 2px; }
    .protein-metric-value { font-size: 1.1rem; font-weight: 600; color: #e8eaf0; }
    .protein-metric-sub { font-size: 0.7rem; color: #8b90a8; margin-top: 1px; }
    .calorie-range-btn { background: transparent; border: 1px solid rgba(139,144,168,0.3); color: #8b90a8; border-radius: 6px; padding: 4px 11px; font-size: 0.76rem; cursor: pointer; transition: all 0.15s; }
    .calorie-range-btn:hover { border-color: #6c63ff; color: #e8eaf0; }
    .calorie-range-btn.active { background: rgba(108,99,255,0.15); border-color: #6c63ff; color: #6c63ff; font-weight: 600; }
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
  else return allMeals;
  return allMeals.filter(m => new Date(m.date + 'T00:00:00') >= cutoff);
}

function renderProteinChart() {
  injectProteinChartStyles();

  if (!document.getElementById('proteinChartSection')) {
    const mealsTab = document.getElementById('tab-meals');
    const mealChartsHeader = document.getElementById('mealChartsHeader');
    const section = document.createElement('div');
    section.id = 'proteinChartSection';
    section.className = 'card';
    section.style.padding = '20px 24px';
    if (mealChartsHeader && mealChartsHeader.nextSibling) {
      mealsTab.insertBefore(section, mealChartsHeader.nextSibling);
    } else {
      mealsTab.appendChild(section);
    }
  }

  const section = document.getElementById('proteinChartSection');
  const { goal: proteinGoal, floor: proteinFloor } = getProteinGoals();
  const filtered = getMealsForProteinRange(mealsChartRange);

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
  const tt = { backgroundColor: '#1a1d27', borderColor: '#2e3250', borderWidth: 1, titleColor: '#e8eaf0', bodyColor: '#8b90a8' };

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

// ===== CALORIE VS GOAL CHART =====
function getMealsForCalorieRange(range) {
  if (!allMeals.length) return allMeals;
  const now = new Date();
  const cutoff = new Date(now);
  if (range === '7d') cutoff.setDate(cutoff.getDate() - 7);
  else if (range === '30d') cutoff.setDate(cutoff.getDate() - 30);
  else if (range === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1);
  else return allMeals;
  return allMeals.filter(m => new Date(m.date + 'T00:00:00') >= cutoff);
}

function renderCalorieChart() {
  injectProteinChartStyles();

  if (!document.getElementById('calorieChartSection')) {
    const proteinSection = document.getElementById('proteinChartSection');
    if (!proteinSection) return;
    const section = document.createElement('div');
    section.id = 'calorieChartSection';
    section.className = 'card';
    section.style.padding = '20px 24px';
    proteinSection.insertAdjacentElement('afterend', section);
  }

  const section = document.getElementById('calorieChartSection');
  const filtered = getMealsForCalorieRange(mealsChartRange);
  const dailyMap = buildDailyMap();

  const byDate = {};
  filtered.forEach(meal => {
    if (!byDate[meal.date]) byDate[meal.date] = 0;
    byDate[meal.date] += meal.total_calories || 0;
  });
  const dates = Object.keys(byDate).sort();

  const intakeVals = dates.map(d => Math.round(byDate[d]));
  const goalVals = dates.map(d => {
    const woCals = (dailyMap[d] || {}).workoutCalories || 0;
    return getTargetIntakeForDate(d, woCals).targetIntake;
  });

  const daysLogged = dates.length;
  const avgIntake = daysLogged ? Math.round(intakeVals.reduce((a, b) => a + b, 0) / daysLogged) : 0;
  const avgGoal = daysLogged ? Math.round(goalVals.reduce((a, b) => a + b, 0) / daysLogged) : 0;
  const daysUnder = intakeVals.filter((v, i) => v <= goalVals[i]).length;
  const pctUnder = daysLogged ? Math.round((daysUnder / daysLogged) * 100) : 0;
  const avgDelta = daysLogged
    ? Math.round(intakeVals.reduce((s, v, i) => s + (v - goalVals[i]), 0) / daysLogged)
    : 0;

  const tickColor = '#8b90a8';
  const gridColor = 'rgba(139,144,168,0.12)';
  const tt = { backgroundColor: '#1a1d27', borderColor: '#2e3250', borderWidth: 1, titleColor: '#e8eaf0', bodyColor: '#8b90a8' };

  section.innerHTML = `
    <div class="protein-chart-header">
      <div class="protein-chart-title">Daily Calories vs Goal</div>
    </div>
    <div class="protein-chart-metrics">
      <div class="protein-metric">
        <div class="protein-metric-label">Avg intake</div>
        <div class="protein-metric-value">${avgIntake.toLocaleString()}</div>
        <div class="protein-metric-sub">${daysLogged} day${daysLogged !== 1 ? 's' : ''} logged</div>
      </div>
      <div class="protein-metric">
        <div class="protein-metric-label">Avg goal</div>
        <div class="protein-metric-value">${avgGoal.toLocaleString()}</div>
        <div class="protein-metric-sub">workout-adjusted</div>
      </div>
      <div class="protein-metric">
        <div class="protein-metric-label">Days under goal</div>
        <div class="protein-metric-value">${daysUnder} / ${daysLogged}</div>
        <div class="protein-metric-sub">${pctUnder}% compliance</div>
      </div>
      <div class="protein-metric">
        <div class="protein-metric-label">Avg delta</div>
        <div class="protein-metric-value" style="color:${avgDelta <= 0 ? '#00d4aa' : '#ff6b6b'}">${avgDelta > 0 ? '+' : ''}${avgDelta.toLocaleString()}</div>
        <div class="protein-metric-sub">kcal vs goal</div>
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:8px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:#8b90a8">
        <div style="width:10px;height:10px;border-radius:2px;background:#6c63ff"></div>Calories consumed
      </div>
      <div style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:#8b90a8">
        <div style="width:22px;height:2px;border-top:2px dashed #EF9F27;"></div>Daily goal (workout-adjusted)
      </div>
      <div style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:#8b90a8">
        <div style="width:10px;height:10px;border-radius:2px;background:rgba(0,212,170,0.25)"></div>Under goal
      </div>
      <div style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:#8b90a8">
        <div style="width:10px;height:10px;border-radius:2px;background:rgba(255,107,107,0.25)"></div>Over goal
      </div>
    </div>
    <div style="position:relative;width:100%;height:220px">
      <canvas id="calorieGoalChart"></canvas>
    </div>
  `;

  if (calorieChart) calorieChart.destroy();

  const labels = dates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const columnShadePlugin = {
    id: 'columnShade',
    beforeDraw(chart) {
      const { ctx, scales: { x, y }, chartArea } = chart;
      ctx.save();
      intakeVals.forEach((val, i) => {
        const xCenter = x.getPixelForValue(i);
        const colHalfW = i < intakeVals.length - 1
          ? (x.getPixelForValue(i + 1) - xCenter) / 2
          : (xCenter - x.getPixelForValue(i - 1)) / 2;
        const underGoal = val <= goalVals[i];
        ctx.fillStyle = underGoal ? 'rgba(0,212,170,0.07)' : 'rgba(255,107,107,0.07)';
        ctx.fillRect(xCenter - colHalfW, chartArea.top, colHalfW * 2, chartArea.bottom - chartArea.top);
      });
      ctx.restore();
    }
  };

  calorieChart = new Chart(document.getElementById('calorieGoalChart'), {
    type: 'line',
    plugins: [columnShadePlugin],
    data: {
      labels,
      datasets: [
        {
          label: 'Calories consumed',
          data: intakeVals,
          borderColor: '#6c63ff',
          backgroundColor: 'rgba(108,99,255,0.06)',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: intakeVals.map((v, i) => v <= goalVals[i] ? '#00d4aa' : '#ff6b6b'),
          pointBorderColor: intakeVals.map((v, i) => v <= goalVals[i] ? '#00d4aa' : '#ff6b6b'),
          spanGaps: false,
          fill: false,
          order: 1,
        },
        {
          label: 'Daily goal',
          data: goalVals,
          borderColor: '#EF9F27',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          tension: 0.2,
          fill: false,
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
          ...tt,
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'Daily goal') return ` Goal: ${ctx.raw.toLocaleString()} kcal`;
              return ` Ate: ${ctx.raw.toLocaleString()} kcal`;
            },
            afterBody: items => {
              const ate = items.find(i => i.dataset.label === 'Calories consumed')?.raw;
              const goal = items.find(i => i.dataset.label === 'Daily goal')?.raw;
              if (ate == null || goal == null) return '';
              const diff = ate - goal;
              return diff <= 0
                ? `  ▼ ${Math.abs(diff).toLocaleString()} kcal under`
                : `  ▲ ${diff.toLocaleString()} kcal over`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 20 },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: tickColor, font: { size: 11 }, callback: v => v.toLocaleString() },
          grid: { color: gridColor },
          title: { display: true, text: 'kcal', color: tickColor, font: { size: 11 } },
        }
      }
    }
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
  setupMealsChartRangeToggle();
  renderProteinChart();
  renderCalorieChart();
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
