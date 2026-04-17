// ===== WORKOUTS TAB =====

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
    .workout-summary-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .workout-summary-grid { display: flex; gap: 10px; flex-wrap: wrap; }
    .workout-summary-stat { background: rgba(108,99,255,0.07); border: 1px solid rgba(108,99,255,0.15); border-radius: 10px; padding: 10px 16px; min-width: 110px; }
    .wss-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.07em; color: #8b90a8; margin-bottom: 3px; }
    .wss-value { font-size: 1.25rem; font-weight: 600; color: #e8eaf0; }
    .wss-sub { font-size: 0.72rem; color: #8b90a8; margin-top: 1px; }
    .workout-summary-empty { color: #8b90a8; font-size: 0.85rem; padding: 8px 0 16px; }
    .workout-summary-range-toggle { display: flex; gap: 4px; flex-shrink: 0; }
    .workout-summary-range-btn { background: transparent; border: 1px solid rgba(139,144,168,0.3); color: #8b90a8; border-radius: 6px; padding: 5px 12px; font-size: 0.78rem; cursor: pointer; transition: all 0.15s; }
    .workout-summary-range-btn:hover { border-color: #6c63ff; color: #e8eaf0; }
    .workout-summary-range-btn.active { background: rgba(108,99,255,0.15); border-color: #6c63ff; color: #6c63ff; font-weight: 600; }
    .zone-sparkbar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; gap: 1px; width: 80px; }
    .zone-sparkbar-seg { height: 100%; border-radius: 1px; }
    .strain-bar-wrap { display: flex; align-items: center; gap: 7px; }
    .strain-bar-track { flex: 1; min-width: 48px; height: 4px; background: rgba(139,144,168,0.2); border-radius: 2px; overflow: hidden; }
    .strain-bar-fill { height: 100%; border-radius: 2px; background: #6c63ff; }
    .strain-bar-num { font-size: 0.82rem; font-weight: 600; color: #e8eaf0; min-width: 28px; }
    .workout-count-badge { display: inline-block; font-size: 11px; font-weight: 500; padding: 1px 7px; border-radius: 10px; background: rgba(108,99,255,0.12); color: #9c96ff; vertical-align: middle; margin-left: 3px; }
  `;
  document.head.appendChild(style);
}

function setupWorkoutSummaryToggle() {
  document.querySelectorAll('.workout-summary-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.workout-summary-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      workoutSummaryRange = btn.dataset.range;
      pushUrl({ wrange: workoutSummaryRange });
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
    replaceUrl({ wpage: p > 1 ? p : null });
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
