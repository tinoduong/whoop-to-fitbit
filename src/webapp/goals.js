// ===== GOALS TAB =====

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

function avgDailyWorkoutCals() {
  if (!allWorkouts.length) return 0;
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
  const recent = allWorkouts.filter(w => new Date(w.start_time) >= cutoff);
  if (!recent.length) return 0;
  const totalCals = recent.reduce((s, w) => s + (w.calories || 0), 0);
  return Math.round(totalCals / 30);
}

// ===== WARNING SYSTEM =====

function checkGoalWarnings() {
  const warningEl = document.getElementById('goalWarning');
  if (!warningEl) return;

  const currentGoal = getCurrentGoal();
  if (!currentGoal || !currentGoal.goal_date) {
    warningEl.style.display = 'none';
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(currentGoal.goal_date + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 1);
  const daysLeft = Math.round((endDate - today) / (1000 * 60 * 60 * 24));

  if (daysLeft > 7) {
    warningEl.style.display = 'none';
    return;
  }

  const goalId = currentGoal.id;
  let icon, message;

  if (daysLeft <= 0) {
    icon = '🏁';
    message = `Your goal ended on <strong>${currentGoal.goal_date}</strong>. Ready to close it out?`;
    warningEl.style.display = 'flex';
    warningEl.innerHTML = `
      <span class="goal-warning-icon">${icon}</span>
      <span class="goal-warning-msg">${message}</span>
      <div class="goal-warning-actions">
        <button class="warning-btn" onclick="promptExtendGoal(${goalId})">Extend Goal</button>
        <button class="warning-btn warning-btn-close" onclick="closeGoal(${goalId})">Close Goal</button>
      </div>
    `;
    return;
  } else if (daysLeft <= 3) {
    icon = '⚠️';
    message = `<strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> remaining — goal ends ${currentGoal.goal_date}.`;
  } else {
    icon = '⏰';
    message = `<strong>${daysLeft} days</strong> until your goal ends on ${currentGoal.goal_date}. Start thinking about next steps.`;
  }

  warningEl.style.display = 'flex';
  warningEl.innerHTML = `
    <span class="goal-warning-icon">${icon}</span>
    <span class="goal-warning-msg">${message}</span>
    <div class="goal-warning-actions">
      <button class="warning-btn" onclick="promptExtendGoal(${goalId})">Extend Goal</button>
    </div>
  `;
}

function promptExtendGoal(goalId) {
  const current = getCurrentGoal();
  const currentEnd = current && current.goal_date ? current.goal_date : '';
  const raw = prompt(`Extend goal end date (current: ${currentEnd || 'not set'}). Enter new end date (YYYY-MM-DD):`, currentEnd);
  if (!raw || raw === currentEnd) return;

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) {
    alert('Invalid date. Please use YYYY-MM-DD format (e.g. 2026-05-31).');
    return;
  }
  const newDate = parsed.toISOString().substring(0, 10);

  fetch(`/api/goals/${goalId}/extend`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_end_date: newDate }),
  }).then(async res => {
    const data = await res.json();
    if (data.status === 'ok') {
      await reloadGoalsData();
      renderGoals();
    } else {
      alert(`Failed to extend goal: ${data.error || 'unknown error'}`);
    }
  }).catch(err => alert(`Error: ${err.message}`));
}

function closeGoal(goalId) {
  if (!confirm('Mark this goal as closed? It will move to Past Goals.')) return;
  fetch(`/api/goals/${goalId}/close`, { method: 'PUT' })
    .then(async res => {
      if (!res.ok) {
        alert(`Failed to close goal (server error ${res.status}). Try restarting the server.`);
        return;
      }
      const data = await res.json();
      if (data.status === 'ok') {
        await reloadGoalsData();
        renderGoals();
      } else {
        alert(`Failed to close goal: ${data.error || 'unknown error'}`);
      }
    }).catch(err => alert(`Error: ${err.message}`));
}

function reopenGoal(goalId) {
  fetch(`/api/goals/${goalId}/reopen`, { method: 'PUT' })
    .then(async res => {
      if (!res.ok) {
        alert(`Failed to reopen goal (server error ${res.status}). Try restarting the server.`);
        return;
      }
      const data = await res.json();
      if (data.status === 'ok') {
        await reloadGoalsData();
        renderGoals();
      } else {
        alert(`Failed to reopen goal: ${data.error || 'unknown error'}`);
      }
    }).catch(err => alert(`Error: ${err.message}`));
}

async function reloadGoalsData() {
  const [goalsRes, reportsRes] = await Promise.all([
    fetch('/api/goals'),
    fetch('/api/reports'),
  ]);
  goals = await goalsRes.json();
  allReports = await reportsRes.json();
  if (!goals.goals) goals.goals = [];
}

// ===== REPORT GENERATION =====

async function triggerGenerateReport(goalId) {
  const btn = document.querySelector(`[data-generate-report="${goalId}"]`);
  const statusEl = document.getElementById(`reportStatus-${goalId}`);

  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
  if (statusEl) statusEl.textContent = 'Calling Claude — this may take up to 60 seconds…';

  try {
    const res = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal_id: goalId }),
    });
    const data = await res.json();
    if (data.status === 'ok') {
      await reloadGoalsData();
      renderGoals();
    } else {
      if (statusEl) statusEl.textContent = `Error: ${data.message}`;
      if (btn) { btn.disabled = false; btn.textContent = 'Generate Report'; }
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = `Error: ${err.message}`;
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Report'; }
  }
}

// ===== SUMMARY LINE BUILDERS =====

function buildSummaryLine(summary) {
  if (!summary) return '—';
  const { goals_met, goals_total, weight_lost, weight_target, bf_lost, bf_target, bf_needed, end_bf_pct } = summary;

  const wMet = weight_lost != null && weight_target != null && weight_lost >= weight_target;
  const bfMet = end_bf_pct != null && bf_target != null && end_bf_pct <= bf_target;

  let parts = [`Goal Met: ${goals_met ?? '?'} of ${goals_total ?? '?'}`];

  if (weight_lost != null) {
    const wLabel = `Weight: lost ${Math.abs(weight_lost).toFixed(1)} lbs` +
      (weight_target != null ? ` (vs. ${Math.abs(weight_target).toFixed(1)} lbs needed)` : '') +
      ` <span class="${wMet ? 'met-label' : 'missed-label'}">${wMet ? 'MET' : 'MISSED'}</span>`;
    parts.push(wLabel);
  }

  if (bf_lost != null) {
    const bfLabel = `Body Fat: lost ${Math.abs(bf_lost).toFixed(1)}%` +
      (bf_needed != null ? ` (vs. ${Math.abs(bf_needed).toFixed(1)}% needed)` : '') +
      ` <span class="${bfMet ? 'met-label' : 'missed-label'}">${bfMet ? 'MET' : 'MISSED'}</span>`;
    parts.push(bfLabel);
  }

  return parts.join(' &nbsp;|&nbsp; ');
}

function buildSummaryLineFromGoal(goal) {
  const currentWeightEntry = allWeight.length ? allWeight[allWeight.length - 1] : null;
  const startWeightEntry = allWeight.find(w => w.date >= goal.saved_date) || null;

  const startLbs = startWeightEntry ? +(startWeightEntry.weight * KG_TO_LBS).toFixed(1) : null;
  const endLbs = currentWeightEntry ? +(currentWeightEntry.weight * KG_TO_LBS).toFixed(1) : null;
  const weightLost = startLbs && endLbs ? +(startLbs - endLbs).toFixed(1) : null;
  const weightTarget = goal.target_weight && startLbs ? +(startLbs - goal.target_weight).toFixed(1) : null;

  return buildSummaryLine({
    goals_met: null,
    goals_total: [goal.target_weight, goal.target_fat].filter(x => x != null).length,
    weight_lost: weightLost,
    weight_target: weightTarget,
    bf_lost: null,
    bf_target: goal.target_fat,
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ===== PAST GOALS =====

function renderPastGoals() {
  const section = document.getElementById('pastGoalsSection');
  const container = document.getElementById('pastGoalsList');
  if (!section || !container) return;

  const allGoalsList = goals.goals || [];
  const currentGoal = getCurrentGoal();
  const today = new Date().toISOString().substring(0, 10);

  const pastGoals = allGoalsList
    .filter(g => g !== currentGoal && g.goal_date && g.goal_date < today)
    .sort((a, b) => (b.saved_date > a.saved_date ? 1 : -1));

  if (pastGoals.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  container.innerHTML = pastGoals.map(goal => {
    const report = allReports.find(r => String(r.goal_id) === String(goal.id));
    const summaryLine = report ? buildSummaryLine(report.summary) : buildSummaryLineFromGoal(goal);

    return `
      <div class="past-goal-item card" id="past-goal-${goal.id}">
        <div class="past-goal-header" onclick="togglePastGoal(${goal.id})">
          <div class="past-goal-left">
            <span class="past-goal-dates">${goal.saved_date} → ${goal.goal_date}</span>
            <span class="past-goal-summary">${summaryLine}</span>
          </div>
          <div class="past-goal-right">
            ${goal.is_closed ? `<button class="report-gen-btn" onclick="event.stopPropagation(); reopenGoal(${goal.id})">Reopen Goal</button>` : ''}
            ${!report ? `<button class="report-gen-btn" data-generate-report="${goal.id}"
                onclick="event.stopPropagation(); triggerGenerateReport(${goal.id})">Generate Report</button>` : ''}
            <span class="past-goal-chevron" id="chevron-${goal.id}">▼</span>
          </div>
        </div>
        <div class="past-goal-body" id="past-goal-body-${goal.id}" style="display:none">
          ${report
            ? `<div class="report-view"><pre class="report-text">${escapeHtml(report.report)}</pre>
               <div class="report-meta">Generated ${report.generated_at}</div></div>`
            : `<div id="reportStatus-${goal.id}" class="report-status-msg"></div>
               <div class="empty-state" style="padding:32px">No report generated yet. Click "Generate Report" to analyze this goal period with Claude.</div>`
          }
        </div>
      </div>
    `;
  }).join('');
}

function togglePastGoal(goalId) {
  const body = document.getElementById(`past-goal-body-${goalId}`);
  const chevron = document.getElementById(`chevron-${goalId}`);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
}

// ===== TDEE PLAN =====

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
      const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
      const goalEnd = new Date(goal_date + 'T00:00:00'); goalEnd.setDate(goalEnd.getDate() + 1);
      const daysLeft = Math.max(0, Math.round((goalEnd - todayMidnight) / (1000 * 60 * 60 * 24)));
      const currentLbs = allWeight.length ? kgToLbs(allWeight[allWeight.length - 1].weight) : null;
      const lbsLeft = currentLbs && target_weight ? (currentLbs - target_weight).toFixed(1) : '—';
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
        <div class="tdee-stat"><div class="stat-label">BMR (at rest)</div><div class="stat-value">${bmr || '—'}</div><div class="stat-sub">kcal/day if sedentary</div></div>
        <div class="tdee-stat highlight"><div class="stat-label">TDEE (baseline)</div><div class="stat-value">${tdee}</div><div class="stat-sub">kcal/day (lightly active)</div></div>
        <div class="tdee-stat" style="border-color:${deficitColor}"><div class="stat-label">Daily Deficit</div><div class="stat-value" style="color:${deficitColor}">${deficit > 0 ? deficit : 0} kcal</div><div class="stat-sub">${weeklyLoss > 0 ? weeklyLoss + ' lbs/week' : 'At goal!'}</div></div>
        <div class="tdee-stat highlight-green"><div class="stat-label">Target Daily Intake</div><div class="stat-value">${targetIntake > 0 ? targetIntake : '—'}</div><div class="stat-sub">kcal/day (+ workout cals)</div></div>
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
    <div style="font-size:0.75rem;color:var(--accent);margin-bottom:12px">⚠️ Preview only — hit Save to lock these numbers in.</div>
    <div class="tdee-grid">
      <div class="tdee-stat"><div class="stat-label">BMR (at rest)</div><div class="stat-value">${bmr}</div><div class="stat-sub">kcal/day if sedentary</div></div>
      <div class="tdee-stat highlight"><div class="stat-label">TDEE (baseline)</div><div class="stat-value">${tdee}</div><div class="stat-sub">kcal/day (lightly active)</div></div>
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
      <div class="tdee-stat" style="border-color:${deficitColor}"><div class="stat-label">Daily Deficit</div><div class="stat-value" style="color:${deficitColor}">${deficit} kcal</div><div class="stat-sub">${(deficit * 7 / 3500).toFixed(2)} lbs/week</div></div>
      <div class="tdee-stat highlight-green"><div class="stat-label">Target Daily Intake</div><div class="stat-value">${targetIntake > 0 ? targetIntake : '—'}</div><div class="stat-sub">kcal/day (+ workout cals)</div></div>
    `;
  } else {
    previewHtml += `<div class="tdee-stat highlight-green"><div class="stat-label">Effective Daily Budget</div><div class="stat-value">${tdee}</div><div class="stat-sub">set target weight + date for deficit</div></div>`;
  }

  previewHtml += `</div>`;
  container.innerHTML = previewHtml;
}

// ===== GOAL PROGRESS =====

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
        <div class="progress-label"><span>⚖️ Weight: ${latestLbs} lbs → Goal: ${targetLbs} lbs</span><span>${pct.toFixed(0)}%</span></div>
        <div class="progress-bar-bg"><div class="progress-bar-fill weight" style="width:${pct}%"></div></div>
        <div class="progress-note">Started at ${firstLbs} lbs · Currently ${direction} · ${diffLabel}</div>
      </div>
    `;
  } else {
    html += `<div class="progress-item"><div class="progress-note">Set a target weight in Goals to track progress.</div></div>`;
  }

  if (currentGoal && currentGoal.target_fat && latest.fat != null && first.fat != null) {
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
        <div class="progress-label"><span>💪 Body Fat: ${currentF.toFixed(2)}% → Goal: ${targetF}%</span><span>${pct.toFixed(0)}%</span></div>
        <div class="progress-bar-bg"><div class="progress-bar-fill fat" style="width:${pct}%"></div></div>
        <div class="progress-note">Started at ${startF.toFixed(2)}% · ${diffLabel}</div>
      </div>
    `;
  } else {
    html += `<div class="progress-item"><div class="progress-note">Set a target body fat % in Goals to track progress.</div></div>`;
  }

  const weightLost = +(firstLbs - latestLbs).toFixed(1);
  const weightLostPct = firstLbs > 0 ? +((weightLost / firstLbs) * 100).toFixed(1) : 0;
  const fatLost = (first.fat != null && latest.fat != null) ? +(first.fat - latest.fat).toFixed(2) : null;
  const startingFatLbs = first.fat != null ? +(first.fat / 100 * firstLbs).toFixed(1) : null;
  const fatLostLbs = (fatLost != null) ? +((first.fat / 100 * firstLbs) - (latest.fat / 100 * latestLbs)).toFixed(1) : null;
  const fatLostPct = (fatLostLbs != null && startingFatLbs > 0) ? +((fatLostLbs / startingFatLbs) * 100).toFixed(1) : 0;
  const weightToGoal = currentGoal?.target_weight ? +(latestLbs - currentGoal.target_weight).toFixed(1) : null;
  const fatToGoal = currentGoal?.target_fat ? +(latest.fat - currentGoal.target_fat).toFixed(2) : null;

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const todayMidnightMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  let daysRunning = null, daysLeft = null, totalDays = null;
  if (currentGoal?.saved_date) {
    daysRunning = Math.max(0, Math.round((todayMidnightMs - new Date(currentGoal.saved_date).getTime()) / MS_PER_DAY));
  }
  if (currentGoal?.goal_date) {
    const goalEndMs = new Date(currentGoal.goal_date + 'T00:00:00').getTime() + MS_PER_DAY;
    daysLeft = Math.max(0, Math.round((goalEndMs - todayMidnightMs) / MS_PER_DAY));
    if (daysRunning !== null) totalDays = daysRunning + daysLeft;
  }

  const daysRunningHtml = daysRunning !== null ? `
    <div class="tdee-stat">
      <div class="stat-label">Days Running</div>
      <div class="stat-value">${daysRunning}</div>
      <div class="stat-sub">${currentGoal.saved_date ? 'since ' + formatDate(currentGoal.saved_date) : ''}</div>
    </div>` : '';

  const daysLeftHtmlProgress = daysLeft !== null ? `
    <div class="tdee-stat" style="border-color:${daysLeft === 0 ? 'var(--green)' : 'var(--border)'}">
      <div class="stat-label">Days Left</div>
      <div class="stat-value" style="color:${daysLeft === 0 ? 'var(--green)' : 'inherit'}">${daysLeft === 0 ? '✓ Done' : daysLeft}</div>
      <div class="stat-sub">${totalDays !== null ? 'of ' + totalDays + ' total days' : 'until ' + currentGoal.goal_date}</div>
    </div>` : '';

  html += `
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.07em;color:#8b90a8;margin-bottom:10px">Summary</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${daysRunningHtml}
        ${daysLeftHtmlProgress}
        <div class="tdee-stat">
          <div class="stat-label">Total weight lost</div>
          <div class="stat-value" style="color:${weightLost >= 0 ? 'var(--green)' : 'var(--red)'}">${weightLost >= 0 ? '-' : '+'}${Math.abs(weightLost)} lbs</div>
          <div class="stat-sub">${Math.abs(weightLostPct)}% of starting weight</div>
        </div>
        <div class="tdee-stat">
          <div class="stat-label">Weight to goal</div>
          <div class="stat-value">${weightToGoal !== null ? (weightToGoal > 0 ? weightToGoal + ' lbs left' : '✓ Reached') : '—'}</div>
          <div class="stat-sub">${currentGoal?.target_weight ? 'goal: ' + currentGoal.target_weight + ' lbs' : 'no goal set'}</div>
        </div>
        <div class="tdee-stat">
          <div class="stat-label">Total fat lost</div>
          <div class="stat-value" style="color:${fatLostLbs != null ? (fatLostLbs >= 0 ? 'var(--green)' : 'var(--red)') : 'inherit'}">${fatLostLbs != null ? (fatLostLbs >= 0 ? '-' : '+') + Math.abs(fatLostLbs) + ' lbs' : '—'}</div>
          <div class="stat-sub">${fatLostLbs != null ? Math.abs(fatLostPct) + '% of starting fat mass' : 'no fat data'}</div>
        </div>
        <div class="tdee-stat">
          <div class="stat-label">Fat to goal</div>
          <div class="stat-value">${fatToGoal !== null ? (fatToGoal > 0 ? fatToGoal + '% left' : '✓ Reached') : '—'}</div>
          <div class="stat-sub">${currentGoal?.target_fat ? 'goal: ' + currentGoal.target_fat + '%' : 'no goal set'}</div>
        </div>
      </div>
    </div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:0.78rem;color:#8b90a8">
      📅 Latest: ${formatDate(latest.date)} &nbsp;·&nbsp; ${latestLbs} lbs ${latest.fat != null ? `&nbsp;·&nbsp; ${latest.fat.toFixed(2)}% fat` : ''}&nbsp;·&nbsp; BMI ${latest.bmi}
    </div>
  `;

  container.innerHTML = html;
}

// ===== MAIN RENDER =====

function renderGoals() {
  const currentGoal = getCurrentGoal();
  document.getElementById('targetWeight').value = currentGoal ? (currentGoal.target_weight || '') : '';
  document.getElementById('targetFat').value = currentGoal ? (currentGoal.target_fat || '') : '';
  if (currentGoal && currentGoal.goal_date) document.getElementById('goalDate').value = currentGoal.goal_date;
  if (goals.dob) document.getElementById('dob').value = goals.dob;
  if (goals.height_in) document.getElementById('heightIn').value = goals.height_in;
  if (goals.sex) document.getElementById('sex').value = goals.sex;

  checkGoalWarnings();
  renderGoalProgress();
  renderTDEEPlan();
  renderPastGoals();
}

// ===== FORM SETUP =====

function setupGoalsForm() {
  document.getElementById('goalsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tw = document.getElementById('targetWeight').value;
    const tf = document.getElementById('targetFat').value;
    const gd = document.getElementById('goalDate').value;
    const dob = document.getElementById('dob').value;
    const heightIn = document.getElementById('heightIn').value;
    const sex = document.getElementById('sex').value;

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

    // Reload so new goal file's id is reflected
    await reloadGoalsData();

    const msg = document.getElementById('goalsSaved');
    msg.textContent = '✓ Saved!';
    setTimeout(() => { msg.textContent = ''; }, 2000);

    renderWeightChart();
    renderDailySummary();
    renderGoals();
  });
}
