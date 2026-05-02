// ===== REPORTS TAB =====

function renderReports() {
  const container = document.getElementById('reportsList');
  if (!container) return;

  if (!allReports.length) {
    container.innerHTML = '<div class="card"><div class="empty-state" style="padding:40px">No reports yet. Click "+ New Report" to generate one.</div></div>';
    return;
  }

  const sorted = [...allReports].sort((a, b) => (b.generated_at > a.generated_at ? 1 : -1));

  container.innerHTML = sorted.map(report => {
    const goal = (goals.goals || []).find(g => String(g.id) === String(report.goal_id));
    const label = goal
      ? `Goal: ${report.goal_start} → ${report.goal_end}`
      : `${report.goal_start} → ${report.goal_end}`;
    const summaryLine = report.summary ? buildSummaryLine(report.summary) : '';

    const filename = report._filename || '';
    return `
      <div class="past-goal-item card" id="report-item-${report.generated_at}">
        <div class="past-goal-header" onclick="toggleReportItem('${report.generated_at}')">
          <div class="past-goal-left">
            <span class="past-goal-dates">${label}</span>
            ${summaryLine ? `<span class="past-goal-summary">${summaryLine}</span>` : ''}
          </div>
          <div class="past-goal-right">
            <span style="font-size:0.75rem;color:#8b90a8">Generated ${report.generated_at}</span>
            ${filename ? `<button class="report-delete-btn" onclick="event.stopPropagation(); deleteReport('${escapeHtml(filename)}')" title="Delete report">✕</button>` : ''}
            <span class="past-goal-chevron" id="report-chevron-${report.generated_at}">▼</span>
          </div>
        </div>
        <div class="past-goal-body" id="report-body-${report.generated_at}" style="display:none">
          <div class="report-view">
            <pre class="report-text">${escapeHtml(report.report)}</pre>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function deleteReport(filename) {
  if (!confirm('Delete this report? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/reports/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    if (res.ok) {
      await reloadGoalsData();
      renderReports();
    } else {
      alert('Failed to delete report.');
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function toggleReportItem(key) {
  const body = document.getElementById(`report-body-${key}`);
  const chevron = document.getElementById(`report-chevron-${key}`);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
}

// ===== MODAL =====

function openReportModal() {
  const modal = document.getElementById('reportModal');
  const goalRow = document.getElementById('reportModalGoalRow');
  const useGoalCb = document.getElementById('reportUseGoal');
  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  const status = document.getElementById('reportModalStatus');

  status.textContent = '';
  document.getElementById('reportModalSubmit').disabled = false;
  document.getElementById('reportModalSubmit').textContent = 'Generate';

  const today = new Date().toISOString().substring(0, 10);
  const currentGoal = getCurrentGoal();
  const goalInFlight = currentGoal && currentGoal.goal_date && currentGoal.goal_date >= today;

  if (goalInFlight) {
    goalRow.style.display = 'block';
    useGoalCb.checked = true;
    startInput.value = currentGoal.saved_date;
    startInput.disabled = true;
    endInput.value = today;
  } else {
    goalRow.style.display = 'none';
    useGoalCb.checked = false;
    startInput.value = '';
    startInput.disabled = false;
    endInput.value = today;
  }

  modal.style.display = 'flex';
}

function closeReportModal() {
  document.getElementById('reportModal').style.display = 'none';
}

function onReportUseGoalToggle() {
  const useGoal = document.getElementById('reportUseGoal').checked;
  const startInput = document.getElementById('reportStartDate');
  const currentGoal = getCurrentGoal();

  if (useGoal && currentGoal) {
    startInput.value = currentGoal.saved_date;
    startInput.disabled = true;
  } else {
    startInput.value = '';
    startInput.disabled = false;
  }
}

async function submitReportModal() {
  const useGoal = document.getElementById('reportUseGoal').checked;
  const startDate = document.getElementById('reportStartDate').value;
  const endDate = document.getElementById('reportEndDate').value;
  const status = document.getElementById('reportModalStatus');
  const btn = document.getElementById('reportModalSubmit');

  if (!startDate || !endDate) {
    status.textContent = 'Please select both a start and end date.';
    return;
  }
  if (endDate < startDate) {
    status.textContent = 'End date must be after start date.';
    return;
  }

  const currentGoal = getCurrentGoal();
  const goalId = useGoal && currentGoal ? currentGoal.id : null;

  btn.disabled = true;
  btn.textContent = 'Generating…';
  status.textContent = 'Calling Claude — this may take up to 60 seconds…';

  try {
    const res = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date: startDate, end_date: endDate, goal_id: goalId }),
    });
    const data = await res.json();
    if (data.status === 'ok') {
      closeReportModal();
      await reloadGoalsData();
      renderReports();
    } else {
      status.textContent = `Error: ${data.message}`;
      btn.disabled = false;
      btn.textContent = 'Generate';
    }
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    btn.disabled = false;
    btn.textContent = 'Generate';
  }
}
