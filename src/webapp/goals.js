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
        <div class="progress-label"><span>⚖️ Weight: ${latestLbs} lbs → Goal: ${targetLbs} lbs</span><span>${pct.toFixed(0)}%</span></div>
        <div class="progress-bar-bg"><div class="progress-bar-fill weight" style="width:${pct}%"></div></div>
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
  const fatLost = +(first.fat - latest.fat).toFixed(2);
  const fatLostPct = first.fat > 0 ? +((fatLost / first.fat) * 100).toFixed(1) : 0;
  const weightToGoal = currentGoal?.target_weight ? +(latestLbs - currentGoal.target_weight).toFixed(1) : null;
  const fatToGoal = currentGoal?.target_fat ? +(latest.fat - currentGoal.target_fat).toFixed(2) : null;

  html += `
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.07em;color:#8b90a8;margin-bottom:10px">Summary</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
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
          <div class="stat-value" style="color:${fatLost >= 0 ? 'var(--green)' : 'var(--red)'}">${fatLost >= 0 ? '-' : '+'}${Math.abs(fatLost)}%</div>
          <div class="stat-sub">${Math.abs(fatLostPct)}% reduction</div>
        </div>
        <div class="tdee-stat">
          <div class="stat-label">Fat to goal</div>
          <div class="stat-value">${fatToGoal !== null ? (fatToGoal > 0 ? fatToGoal + '% left' : '✓ Reached') : '—'}</div>
          <div class="stat-sub">${currentGoal?.target_fat ? 'goal: ' + currentGoal.target_fat + '%' : 'no goal set'}</div>
        </div>
      </div>
    </div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:0.78rem;color:#8b90a8">
      📅 Latest: ${formatDate(latest.date)} &nbsp;·&nbsp; ${latestLbs} lbs &nbsp;·&nbsp; ${latest.fat.toFixed(2)}% fat &nbsp;·&nbsp; BMI ${latest.bmi}
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

    const msg = document.getElementById('goalsSaved');
    msg.textContent = '✓ Saved!';
    setTimeout(() => { msg.textContent = ''; }, 2000);

    renderWeightChart();
    renderDailySummary();
    renderGoalProgress();
    renderTDEEPlan();
  });
}
