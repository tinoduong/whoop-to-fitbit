// ===== OVERVIEW TAB =====

(function injectSyncStyles() {
  if (document.getElementById('syncBtnStyles')) return;
  const s = document.createElement('style');
  s.id = 'syncBtnStyles';
  s.textContent = `
    .sync-btn { background: transparent; border: 1px solid rgba(139,144,168,0.3); color: #8b90a8; border-radius: 6px; padding: 6px 14px; font-size: 0.82rem; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
    .sync-btn:hover:not(:disabled) { border-color: #6c63ff; color: #e8eaf0; }
    .sync-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .sync-btn.syncing { border-color: #6c63ff; color: #6c63ff; }
    .sync-btn.done { border-color: #00d4aa; color: #00d4aa; }
    .sync-btn.error { border-color: #ff6b6b; color: #ff6b6b; }
  `;
  document.head.appendChild(s);
})();

async function triggerSync() {
  const btn = document.getElementById('syncBtn');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.className = 'sync-btn syncing';
  btn.textContent = '↻ Syncing…';

  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (data.status === 'already_running') {
      btn.textContent = '↻ Already running…';
    } else {
      btn.textContent = '↻ Syncing…';
      pollSyncStatus(btn);
      return;
    }
  } catch (e) {
    btn.className = 'sync-btn error';
    btn.textContent = '↻ Error';
  }

  setTimeout(() => resetSyncBtn(btn), 3000);
}

function pollSyncStatus(btn) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch('/api/sync/status');
      const data = await res.json();
      if (!data.running) {
        clearInterval(interval);
        if (data.last_status === 'ok') {
          btn.className = 'sync-btn done';
          btn.textContent = '✓ Synced';
          await reloadAllData();
          renderOverview();
        } else {
          btn.className = 'sync-btn error';
          btn.textContent = '↻ Failed';
          if (data.last_status) btn.title = data.last_status;
          console.error('Sync failed:', data.last_status, data.last_error);
        }
        setTimeout(() => resetSyncBtn(btn), 3000);
      }
    } catch (e) {
      clearInterval(interval);
      btn.className = 'sync-btn error';
      btn.textContent = '↻ Error';
      setTimeout(() => resetSyncBtn(btn), 3000);
    }
  }, 2000);
}

function resetSyncBtn(btn) {
  btn.disabled = false;
  btn.className = 'sync-btn';
  btn.textContent = '↻ Sync';
}

function renderOverview() {
  renderWeightChart();
  renderBodyCompRatioChart();
  renderDailySummary();
}

// ===== CHART RANGE =====
function setupChartRangeBtns() {
  if (document.getElementById('overviewRangeHeader')) return;

  if (!document.getElementById('overviewRangeStyles')) {
    const style = document.createElement('style');
    style.id = 'overviewRangeStyles';
    style.textContent = `
      .overview-range-toggle { display: flex; gap: 4px; }
      .overview-range-btn { background: transparent; border: 1px solid rgba(139,144,168,0.3); color: #8b90a8; border-radius: 6px; padding: 5px 12px; font-size: 0.78rem; cursor: pointer; transition: all 0.15s; }
      .overview-range-btn:hover { border-color: #6c63ff; color: #e8eaf0; }
      .overview-range-btn.active { background: rgba(108,99,255,0.15); border-color: #6c63ff; color: #6c63ff; font-weight: 600; }
    `;
    document.head.appendChild(style);
  }

  const overviewTab = document.getElementById('tab-overview');
  const headerEl = document.createElement('div');
  headerEl.id = 'overviewRangeHeader';
  headerEl.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;padding:0 4px';
  headerEl.innerHTML = `
    <div class="overview-range-toggle">
      <button class="overview-range-btn" data-range="week">1 week</button>
      <button class="overview-range-btn active" data-range="month">1 month</button>
      <button class="overview-range-btn" data-range="year">1 year</button>
      <button class="overview-range-btn" data-range="all">All time</button>
    </div>
  `;
  const sectionHeader = overviewTab.querySelector('.section-header');
  if (sectionHeader) {
    sectionHeader.insertAdjacentElement('afterend', headerEl);
  } else {
    overviewTab.insertBefore(headerEl, overviewTab.firstElementChild);
  }

  headerEl.querySelectorAll('.overview-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      headerEl.querySelectorAll('.overview-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChartRange = btn.dataset.range;
      pushUrl({ range: currentChartRange });
      renderWeightChart();
      renderBodyCompRatioChart();
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
        if (d.getDay() === 1) {
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
          ticks: {
            color: '#8b90a8',
            maxRotation: 45,
            callback(value, index) {
              const dateStr = labels[index];
              if (!dateStr) return '';
              const d = new Date(dateStr + 'T00:00:00');
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            },
          },
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
      pushUrl({ month: availableMonths[currentMonthIndex] });
      renderDailySummary();
    }
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    if (currentMonthIndex < availableMonths.length - 1) {
      currentMonthIndex++;
      pushUrl({ month: availableMonths[currentMonthIndex] });
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

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

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
          inner += `<div class="cal-workout">🏃 ${sportNames.map(sportLabel).join(', ')}</div>`;
        }
        const isToday = date === todayStr;
        return `<div class="cal-cell cal-cell-out ${cardClass}${isToday ? ' cal-today' : ''}" title="${date}" onclick="openDayModal('${date}')" style="cursor:pointer;opacity:0.45">${inner}</div>`;
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
        inner += `<div class="cal-workout">🏃 ${sportNames.map(sportLabel).join(', ')}</div>`;
      }

      const isToday = date === todayStr;
      return `<div class="cal-cell ${cardClass}${isToday ? ' cal-today' : ''}" title="${date}" onclick="openDayModal('${date}')" style="cursor:pointer">${inner}</div>`;
    }).join('');

    const weekMealDays = week.filter(d => (dailyMap[d] || {}).totalCaloriesIn > 0);

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
      .day-modal-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(10, 11, 20, 0.88); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; }
      .day-modal { background: #1a1d27; border: 1px solid #2e3250; border-radius: 16px; width: min(760px, 95vw); max-height: 88vh; overflow-y: auto; padding: 28px 32px; position: relative; scrollbar-width: thin; scrollbar-color: #2e3250 transparent; }
      .day-modal::-webkit-scrollbar { width: 6px; }
      .day-modal::-webkit-scrollbar-track { background: transparent; }
      .day-modal::-webkit-scrollbar-thumb { background: #2e3250; border-radius: 3px; }
      .day-modal-close { position: absolute; top: 16px; right: 20px; background: transparent; border: none; color: #8b90a8; font-size: 18px; cursor: pointer; padding: 4px 8px; line-height: 1; border-radius: 6px; transition: color 0.15s, background 0.15s; }
      .day-modal-close:hover { color: #e8eaf0; background: rgba(255,255,255,0.06); }
      .day-modal h2 { margin: 0 0 20px; font-size: 1.2rem; color: #e8eaf0; padding-right: 32px; }
      .day-modal-section { margin-bottom: 24px; }
      .day-modal-section:last-child { margin-bottom: 0; }
      .day-modal-section h3 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.09em; color: #8b90a8; margin: 0 0 10px; padding-bottom: 8px; border-bottom: 1px solid #2e3250; }
      .day-modal-workout-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; background: rgba(108,99,255,0.06); border: 1px solid rgba(108,99,255,0.15); border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; }
      .day-modal-workout-row span { font-size: 0.83rem; color: #c8cbdf; }
      .day-modal-empty { color: #8b90a8; font-size: 0.85rem; padding: 8px 0; }
      .modal-day-macro-row { display: flex; align-items: center; gap: 20px; background: rgba(108,99,255,0.05); border: 1px solid rgba(108,99,255,0.14); border-radius: 10px; padding: 14px 18px; margin-bottom: 14px; }
      .modal-macro-info { display: flex; flex-direction: column; gap: 5px; }
      .modal-macro-info .modal-macro-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.07em; color: #8b90a8; margin-bottom: 4px; }
      .modal-macro-info span { font-size: 0.84rem; }
      .modal-meal-entry { display: flex; align-items: center; gap: 16px; background: rgba(255,255,255,0.02); border: 1px solid #2e3250; border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; }
      .modal-meal-entry:last-child { margin-bottom: 0; }
      .modal-meal-entry-info { flex: 1; min-width: 0; }
      .modal-meal-entry-header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
      .modal-meal-entry-header strong { font-size: 0.9rem; color: #e8eaf0; }
      .modal-meal-desc { font-size: 0.8rem; color: #8b90a8; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .modal-meal-macros { display: flex; gap: 10px; }
      .modal-meal-macros span { font-size: 0.8rem; }
      .meal-entry-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 6px; }
      .meal-pie-wrap { flex-shrink: 0; }
      .day-modal-body-comp-row { display: flex; gap: 12px; flex-wrap: wrap; background: rgba(0,212,170,0.05); border: 1px solid rgba(0,212,170,0.15); border-radius: 10px; padding: 12px 16px; }
      .day-modal-body-comp-stat { display: flex; flex-direction: column; gap: 2px; min-width: 90px; }
      .day-modal-body-comp-stat .bcs-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.07em; color: #8b90a8; }
      .day-modal-body-comp-stat .bcs-value { font-size: 1rem; font-weight: 600; color: #e8eaf0; }
      .day-modal-body-comp-stat .bcs-sub { font-size: 0.75rem; color: #8b90a8; }
      .day-modal-body-comp-stat .bcs-value.exact { color: #00d4aa; }
      .day-modal-body-comp-stat .bcs-value.estimated { color: #c8cbdf; }
      .day-modal.week-modal { width: min(860px, 95vw); }
      .log-meal-btn { background: linear-gradient(135deg, #6c63ff, #5a52d5); color: #fff; border: none; border-radius: 8px; padding: 7px 14px; font-size: 0.82rem; font-weight: 600; cursor: pointer; letter-spacing: 0.03em; transition: opacity 0.15s; white-space: nowrap; }
      .log-meal-btn:hover { opacity: 0.85; }
      .log-meal-overlay { position: fixed; inset: 0; z-index: 1100; background: rgba(10, 11, 20, 0.9); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; }
      .log-meal-modal { background: #1a1d27; border: 1px solid #2e3250; border-radius: 16px; width: min(520px, 95vw); padding: 28px 32px; position: relative; }
      .log-meal-modal h2 { margin: 0 0 6px; font-size: 1.1rem; color: #e8eaf0; padding-right: 28px; }
      .log-meal-modal .log-meal-hint { font-size: 0.78rem; color: #8b90a8; margin: 0 0 16px; }
      .log-meal-modal textarea { width: 100%; box-sizing: border-box; background: #12131e; border: 1px solid #2e3250; border-radius: 10px; color: #e8eaf0; font-size: 0.88rem; font-family: inherit; padding: 12px 14px; resize: vertical; min-height: 90px; outline: none; transition: border-color 0.15s; }
      .log-meal-modal textarea:focus { border-color: #6c63ff; }
      .log-meal-modal textarea:disabled { opacity: 0.5; }
      .log-meal-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 14px; }
      .log-meal-cancel-btn { background: transparent; border: 1px solid #2e3250; color: #8b90a8; border-radius: 8px; padding: 7px 14px; font-size: 0.82rem; cursor: pointer; transition: border-color 0.15s, color 0.15s; }
      .log-meal-cancel-btn:hover { border-color: #8b90a8; color: #e8eaf0; }
      .log-meal-submit-btn { background: linear-gradient(135deg, #6c63ff, #5a52d5); color: #fff; border: none; border-radius: 8px; padding: 7px 18px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
      .log-meal-submit-btn:hover:not(:disabled) { opacity: 0.85; }
      .log-meal-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .log-meal-progress { margin-top: 14px; display: flex; gap: 0; border-radius: 8px; overflow: hidden; border: 1px solid #2e3250; }
      .log-meal-step { flex: 1; text-align: center; padding: 8px 4px; font-size: 0.75rem; color: #8b90a8; background: #12131e; border-right: 1px solid #2e3250; transition: background 0.2s, color 0.2s; }
      .log-meal-step:last-child { border-right: none; }
      .log-meal-step.active { background: rgba(108,99,255,0.15); color: #6c63ff; font-weight: 600; }
      .log-meal-step.done { background: rgba(0,212,170,0.1); color: #00d4aa; }
      .log-meal-error { margin-top: 12px; padding: 10px 14px; background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3); border-radius: 8px; color: #ff6b6b; font-size: 0.8rem; }
      .log-meal-modal-close { position: absolute; top: 16px; right: 20px; background: transparent; border: none; color: #8b90a8; font-size: 18px; cursor: pointer; padding: 4px 8px; line-height: 1; border-radius: 6px; transition: color 0.15s, background 0.15s; }
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
        <div class="tdee-stat"><div class="stat-label">Start Weight</div><div class="stat-value">${kgToLbs(startW.weight)} lbs</div><div class="stat-sub">${formatDate(startW.date)}</div></div>
        <div class="tdee-stat"><div class="stat-label">End Weight</div><div class="stat-value">${kgToLbs(endW.weight)} lbs</div><div class="stat-sub">${formatDate(endW.date)}</div></div>
        <div class="tdee-stat" style="border-color:${wColor}"><div class="stat-label">Weight Δ</div><div class="stat-value" style="color:${wColor}">${wDelta > 0 ? '+' : ''}${wDelta} lbs</div><div class="stat-sub">${endW.fat?.toFixed(2)}% fat now</div></div>
        <div class="tdee-stat" style="border-color:${fColor}"><div class="stat-label">Body Fat Δ</div><div class="stat-value" style="color:${fColor}">${fDelta > 0 ? '+' : ''}${fDelta}%</div><div class="stat-sub">${startW.fat?.toFixed(2)}% → ${endW.fat?.toFixed(2)}%</div></div>
      </div>
    `;
  } else if (weekWeightEntries.length === 1) {
    const w = weekWeightEntries[0];
    weightHtml = `
      <div class="tdee-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="tdee-stat"><div class="stat-label">Weight</div><div class="stat-value">${kgToLbs(w.weight)} lbs</div><div class="stat-sub">${formatDate(w.date)}</div></div>
        <div class="tdee-stat"><div class="stat-label">Body Fat</div><div class="stat-value">${w.fat?.toFixed(2)}%</div><div class="stat-sub">single reading this week</div></div>
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
        <div class="tdee-stat"><div class="stat-label">Total Consumed</div><div class="stat-value">${totalCaloriesIn || '—'}</div><div class="stat-sub">kcal across ${daysWithMeals.length} day${daysWithMeals.length !== 1 ? 's' : ''}</div></div>
        <div class="tdee-stat"><div class="stat-label">Total Target</div><div class="stat-value">${totalTarget || '—'}</div><div class="stat-sub">kcal (deficit-adjusted)</div></div>
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

// ===== BODY COMPOSITION RATIO CHART =====
let bodyCompRatioChartInstance = null;

function renderBodyCompRatioChart() {
  const canvas = document.getElementById('bodyCompRatioChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (bodyCompRatioChartInstance) {
    bodyCompRatioChartInstance.destroy();
    bodyCompRatioChartInstance = null;
  }

  const valid = filterWeightByRange(currentChartRange)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(e => e.weight != null && e.fat != null);
  if (valid.length < 2) return;

  const base = valid[0];
  const baseWeightLbs = kgToLbs(base.weight);
  const baseFatMass = baseWeightLbs * (base.fat / 100);
  const baseLeanMass = baseWeightLbs * (1 - base.fat / 100);

  const labels = valid.map(e => e.date);
  const fatLostPcts = valid.map(entry => {
    const weightLbs = kgToLbs(entry.weight);
    const fatMass = weightLbs * (entry.fat / 100);
    return Math.round(((baseFatMass - fatMass) / baseFatMass) * 1000) / 10;
  });
  const leanLostPcts = valid.map(entry => {
    const weightLbs = kgToLbs(entry.weight);
    const leanMass = weightLbs * (1 - entry.fat / 100);
    return Math.round(((baseLeanMass - leanMass) / baseLeanMass) * 1000) / 10;
  });

  const betweenLinesPlugin = {
    id: 'recompBetweenLines',
    beforeDatasetsDraw(chart) {
      const { ctx: c, scales: { x, yPct }, chartArea } = chart;
      const fat = chart.data.datasets[0].data;
      const lean = chart.data.datasets[1].data;
      if (!fat.length || !lean.length) return;
      c.save();
      for (let i = 0; i < fat.length - 1; i++) {
        if (fat[i] == null || lean[i] == null || fat[i + 1] == null || lean[i + 1] == null) continue;
        const x0 = x.getPixelForValue(i);
        const x1 = x.getPixelForValue(i + 1);
        const fatY0 = yPct.getPixelForValue(fat[i]);
        const fatY1 = yPct.getPixelForValue(fat[i + 1]);
        const leanY0 = yPct.getPixelForValue(lean[i]);
        const leanY1 = yPct.getPixelForValue(lean[i + 1]);
        const fatAbove = fat[i] > lean[i];
        c.fillStyle = fatAbove ? 'rgba(29,158,117,0.10)' : 'rgba(226,75,74,0.08)';
        c.beginPath();
        c.moveTo(x0, fatY0);
        c.lineTo(x1, fatY1);
        c.lineTo(x1, leanY1);
        c.lineTo(x0, leanY0);
        c.closePath();
        c.fill();
      }
      c.restore();
    },
  };

  bodyCompRatioChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Fat loss %',
          data: fatLostPcts,
          borderColor: '#E24B4A',
          backgroundColor: 'transparent',
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          fill: false,
          spanGaps: true,
          yAxisID: 'yPct',
        },
        {
          label: 'Muscle loss %',
          data: leanLostPcts,
          borderColor: '#1D9E75',
          backgroundColor: 'transparent',
          borderDash: [6, 4],
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          fill: false,
          spanGaps: true,
          yAxisID: 'yPct',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: item => item.datasetIndex === 0
              ? `Fat loss: ${item.parsed.y.toFixed(1)}%`
              : `Muscle loss: ${item.parsed.y.toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#8b90a8',
            maxRotation: 45,
            callback(value, index) {
              const dateStr = labels[index];
              if (!dateStr) return '';
              const d = new Date(dateStr + 'T00:00:00');
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            },
          },
          grid: { color: 'rgba(46,50,80,0.5)' },
        },
        yPct: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Fat loss % / Muscle loss %', color: '#8b90a8' },
          ticks: {
            color: '#8b90a8',
            callback: value => `${value.toFixed(1)}%`,
          },
          grid: { color: 'rgba(46,50,80,0.5)' },
          afterDataLimits(scale) {
            const range = scale.max - scale.min;
            const pad = range * 0.15 || 1;
            scale.min -= pad;
            scale.max += pad;
          },
        },
      },
    },
    plugins: [betweenLinesPlugin, {
      id: 'recompZeroLine',
      afterDatasetsDraw(chart) {
        const { ctx: c, scales: { x, yPct }, chartArea: { left, right } } = chart;
        const yPos = yPct.getPixelForValue(0);
        if (yPos < chart.chartArea.top || yPos > chart.chartArea.bottom) return;
        c.save();
        c.beginPath();
        c.setLineDash([4, 4]);
        c.strokeStyle = 'rgba(136,135,128,0.5)';
        c.lineWidth = 1;
        c.moveTo(left, yPos);
        c.lineTo(right, yPos);
        c.stroke();
        c.setLineDash([]);
        c.restore();
      },
    }],
  });
}
