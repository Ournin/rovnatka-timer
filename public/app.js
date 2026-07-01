const timerEl = document.getElementById('timer');
const toggleBtn = document.getElementById('toggleBtn');
const ringFill = document.getElementById('ringFill');
const ringPct = document.getElementById('ringPct');
const historyEl = document.getElementById('history');
const barChartEl = document.getElementById('barChart');
const goalBtn = document.getElementById('goalBtn');
const goalLabel = document.getElementById('goalLabel');
const goalModal = document.getElementById('goalModal');
const goalInput = document.getElementById('goalInput');
const goalSave = document.getElementById('goalSave');
const goalCancel = document.getElementById('goalCancel');
const statToday = document.getElementById('statToday');
const statStreak = document.getElementById('statStreak');
const statBestStreak = document.getElementById('statBestStreak');
const statTotal = document.getElementById('statTotal');

const RING_RADIUS = 95;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
ringFill.style.strokeDasharray = `${RING_CIRC} ${RING_CIRC}`;

let state = null;

function fmt(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function fmtHours(seconds) {
  return (seconds / 3600).toFixed(1) + ' h';
}

function todayKey() {
  return dateKeyFromDate(new Date());
}

function dateKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

function currentLiveSeconds() {
  if (!state) return 0;
  let seconds = state.todaySeconds;
  if (state.running) {
    seconds += (Date.now() - state.now) / 1000;
  }
  return seconds;
}

function computeStreaks(history, goalSeconds, liveToday) {
  const map = new Map(history.map((h) => [h.date, h.seconds]));
  const tKey = todayKey();
  map.set(tKey, liveToday);

  // aktualni serie: pocitame zpet od dneska, pokud dnes cil jeste neni splnen,
  // zacneme od vcerejska (dnesni den jeste neni u konce)
  let cursor = new Date();
  if ((map.get(tKey) || 0) < goalSeconds) {
    cursor = addDays(cursor, -1);
  }
  let current = 0;
  while (true) {
    const key = dateKeyFromDate(cursor);
    const secs = map.get(key) || 0;
    if (secs >= goalSeconds) {
      current++;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }

  // nejdelsi serie: projdeme vsechny znamej dny chronologicky, mezery = rozbita serie
  const dates = [...map.keys()].sort();
  let best = 0;
  let run = 0;
  let prevDate = null;
  for (const key of dates) {
    const secs = map.get(key) || 0;
    if (secs >= goalSeconds) {
      if (prevDate) {
        const expected = dateKeyFromDate(addDays(new Date(prevDate), 1));
        run = expected === key ? run + 1 : 1;
      } else {
        run = 1;
      }
      best = Math.max(best, run);
      prevDate = key;
    } else {
      run = 0;
      prevDate = null;
    }
  }

  return { current, best };
}

function renderBarChart(history, goalSeconds, liveToday) {
  const map = new Map(history.map((h) => [h.date, h.seconds]));
  const tKey = todayKey();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    const key = dateKeyFromDate(d);
    const seconds = key === tKey ? liveToday : (map.get(key) || 0);
    days.push({ key, seconds, isToday: key === tKey, label: String(d.getDate()) });
  }

  const maxSeconds = Math.max(goalSeconds, ...days.map((d) => d.seconds), 1);

  barChartEl.innerHTML = '';
  for (const day of days) {
    const col = document.createElement('div');
    col.className = 'bar-col';

    const bar = document.createElement('div');
    const pctHeight = Math.max(2, (day.seconds / maxSeconds) * 100);
    bar.className = 'bar' + (day.seconds >= goalSeconds ? ' done' : day.isToday ? ' today' : '');
    bar.style.height = pctHeight + '%';
    bar.title = `${day.key}: ${fmtHours(day.seconds)}`;

    const label = document.createElement('div');
    label.className = 'bar-day';
    label.textContent = day.label;

    col.appendChild(bar);
    col.appendChild(label);
    barChartEl.appendChild(col);
  }
}

function render() {
  if (!state) return;

  const liveSeconds = currentLiveSeconds();

  timerEl.textContent = fmt(liveSeconds);

  const pct = Math.min(100, (liveSeconds / state.goalSeconds) * 100);
  const offset = RING_CIRC - (pct / 100) * RING_CIRC;
  ringFill.style.strokeDashoffset = offset;
  ringFill.style.stroke = pct >= 100 ? '#facc15' : '#4ade80';
  ringPct.textContent = `${pct.toFixed(0)} %`;

  toggleBtn.textContent = state.running ? 'Stop' : 'Start';
  toggleBtn.classList.toggle('running', state.running);

  goalLabel.textContent = (state.goalSeconds / 3600).toFixed(state.goalSeconds % 3600 === 0 ? 0 : 1);

  const tKey = todayKey();
  historyEl.innerHTML = '';
  const sortedHistory = [...state.history].filter((h) => h.date !== tKey);
  const combined = [{ date: tKey, seconds: liveSeconds }, ...sortedHistory].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const entry of combined) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = entry.date === tKey ? `${entry.date} (dnes)` : entry.date;
    const value = document.createElement('span');
    value.textContent = fmtHours(entry.seconds);
    if (entry.seconds >= state.goalSeconds) {
      value.classList.add('done');
    } else if (entry.date === tKey) {
      value.classList.add('today');
    }
    li.appendChild(label);
    li.appendChild(value);
    historyEl.appendChild(li);
  }

  renderBarChart(state.history, state.goalSeconds, liveSeconds);

  const { current, best } = computeStreaks(state.history, state.goalSeconds, liveSeconds);
  statToday.textContent = fmtHours(liveSeconds);
  statStreak.textContent = `${current} 🔥`;
  statBestStreak.textContent = String(best);

  const totalSeconds = state.history.filter((h) => h.date !== tKey).reduce((sum, h) => sum + h.seconds, 0) + liveSeconds;
  statTotal.textContent = fmtHours(totalSeconds);
}

async function fetchStatus() {
  const res = await fetch('/api/status');
  state = await res.json();
  render();
}

async function toggle() {
  toggleBtn.disabled = true;
  const endpoint = state && state.running ? '/api/stop' : '/api/start';
  const res = await fetch(endpoint, { method: 'POST' });
  state = await res.json();
  toggleBtn.disabled = false;
  render();
}

function openGoalModal() {
  goalInput.value = (state.goalSeconds / 3600).toString();
  goalModal.classList.remove('hidden');
  goalInput.focus();
}

function closeGoalModal() {
  goalModal.classList.add('hidden');
}

async function saveGoal() {
  const hours = Number(goalInput.value);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return;
  const res = await fetch('/api/goal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hours }),
  });
  state = await res.json();
  closeGoalModal();
  render();
}

toggleBtn.addEventListener('click', toggle);
goalBtn.addEventListener('click', openGoalModal);
goalCancel.addEventListener('click', closeGoalModal);
goalSave.addEventListener('click', saveGoal);
goalModal.addEventListener('click', (e) => {
  if (e.target === goalModal) closeGoalModal();
});

fetchStatus();
setInterval(fetchStatus, 5000);
setInterval(render, 1000);
