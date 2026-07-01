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
const dayModal = document.getElementById('dayModal');
const dayModalSub = document.getElementById('dayModalSub');
const dayHoursInput = document.getElementById('dayHoursInput');
const dayMinutesInput = document.getElementById('dayMinutesInput');
const daySave = document.getElementById('daySave');
const dayCancel = document.getElementById('dayCancel');
const editTodayBtn = document.getElementById('editTodayBtn');
const editTodayLabel = document.getElementById('editTodayLabel');
const statToday = document.getElementById('statToday');
const statStreak = document.getElementById('statStreak');
const statBestStreak = document.getElementById('statBestStreak');
const statTotal = document.getElementById('statTotal');
const remainingLabel = document.getElementById('remainingLabel');
const calendarGrid = document.getElementById('calendarGrid');
const calLabel = document.getElementById('calLabel');
const calPrev = document.getElementById('calPrev');
const calNext = document.getElementById('calNext');

const RING_RADIUS = 95;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
ringFill.style.strokeDasharray = `${RING_CIRC} ${RING_CIRC}`;

let state = null;
const today0 = new Date();
let calendarView = { year: today0.getFullYear(), month: today0.getMonth() };

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

function fmtRemaining(remainingSeconds) {
  if (remainingSeconds <= 0) return 'Cíl splněn! 🎉';
  const h = Math.floor(remainingSeconds / 3600);
  const m = Math.round((remainingSeconds % 3600) / 60);
  if (h === 0) return `Zbývá ${m} min do cíle`;
  if (m === 0) return `Zbývá ${h} h do cíle`;
  return `Zbývá ${h} h ${m} min do cíle`;
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

const MONTH_NAMES = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];

function renderCalendar(history, goalSeconds, liveToday) {
  const map = new Map(history.map((h) => [h.date, h.seconds]));
  const tKey = todayKey();
  map.set(tKey, liveToday);

  const { year, month } = calendarView;
  calLabel.textContent = `${MONTH_NAMES[month]} ${year}`;

  const realToday = new Date();
  calNext.disabled = year === realToday.getFullYear() && month === realToday.getMonth();

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // pondeli = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  calendarGrid.innerHTML = '';
  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell cal-empty';
    calendarGrid.appendChild(empty);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKeyFromDate(new Date(year, month, day));
    const seconds = map.get(key) || 0;
    const cell = document.createElement('button');
    cell.className = 'cal-cell';
    if (seconds >= goalSeconds) {
      cell.classList.add('done');
    } else if (key === tKey) {
      cell.classList.add('today');
    } else if (seconds > 0) {
      cell.classList.add('partial');
    }
    cell.textContent = String(day);
    cell.title = `${key}: ${fmtHours(seconds)}`;
    cell.addEventListener('click', () => openDayModal(key, seconds));
    calendarGrid.appendChild(cell);
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

  const remaining = state.goalSeconds - liveSeconds;
  remainingLabel.textContent = fmtRemaining(remaining);
  remainingLabel.classList.toggle('done', remaining <= 0);

  toggleBtn.textContent = state.running ? 'Stop' : 'Start';
  toggleBtn.classList.toggle('running', state.running);

  const todayTotalMinutes = Math.round(liveSeconds / 60);
  editTodayLabel.textContent = `${Math.floor(todayTotalMinutes / 60)}h ${todayTotalMinutes % 60}min`;

  goalLabel.textContent = (state.goalSeconds / 3600).toFixed(state.goalSeconds % 3600 === 0 ? 0 : 1);

  const tKey = todayKey();
  historyEl.innerHTML = '';
  const sortedHistory = [...state.history].filter((h) => h.date !== tKey);
  const combined = [{ date: tKey, seconds: liveSeconds }, ...sortedHistory].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const entry of combined) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'day-label';
    label.textContent = entry.date === tKey ? `${entry.date} (dnes)` : entry.date;

    const valueWrap = document.createElement('span');
    valueWrap.className = 'day-value';

    const value = document.createElement('span');
    value.textContent = fmtHours(entry.seconds);
    if (entry.seconds >= state.goalSeconds) {
      value.classList.add('done');
    } else if (entry.date === tKey) {
      value.classList.add('today');
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✏️';
    editBtn.title = 'Upravit tento den';
    editBtn.addEventListener('click', () => openDayModal(entry.date, entry.seconds));

    valueWrap.appendChild(value);
    valueWrap.appendChild(editBtn);
    li.appendChild(label);
    li.appendChild(valueWrap);
    historyEl.appendChild(li);
  }

  renderBarChart(state.history, state.goalSeconds, liveSeconds);
  renderCalendar(state.history, state.goalSeconds, liveSeconds);

  const { current, best } = computeStreaks(state.history, state.goalSeconds, liveSeconds);
  statToday.textContent = fmtHours(liveSeconds);
  statStreak.textContent = `${current} 🔥`;
  statBestStreak.textContent = String(best);

  const totalSeconds = state.history.filter((h) => h.date !== tKey).reduce((sum, h) => sum + h.seconds, 0) + liveSeconds;
  statTotal.textContent = fmtHours(totalSeconds);
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    state = await res.json();
    render();
  } catch {
    // vypadek site/spanku serveru - dalsi pokus prijde za 5s, cas se mezitim
    // pocita lokalne z posledniho známeho stavu, takze se nic neztratí
  }
}

async function toggle() {
  toggleBtn.disabled = true;
  try {
    const endpoint = state && state.running ? '/api/stop' : '/api/start';
    const res = await fetch(endpoint, { method: 'POST' });
    state = await res.json();
    render();
  } catch {
    alert('Nepodařilo se spojit se serverem, zkus to prosím znovu.');
  } finally {
    toggleBtn.disabled = false;
  }
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

let editingDate = null;

function openDayModal(date, currentSeconds) {
  editingDate = date;
  dayModalSub.textContent = `Kolik hodin jsi nosil rovnátka v den ${date}?`;
  const totalMinutes = Math.round(currentSeconds / 60);
  dayHoursInput.value = Math.floor(totalMinutes / 60);
  dayMinutesInput.value = totalMinutes % 60;
  dayModal.classList.remove('hidden');
  dayHoursInput.focus();
}

function closeDayModal() {
  dayModal.classList.add('hidden');
  editingDate = null;
}

async function saveDay() {
  const h = Number(dayHoursInput.value) || 0;
  const m = Number(dayMinutesInput.value) || 0;
  const hours = h + m / 60;
  if (!editingDate || !Number.isFinite(hours) || hours < 0 || hours > 24) return;
  try {
    const res = await fetch('/api/day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: editingDate, hours }),
    });
    state = await res.json();
    closeDayModal();
    render();
  } catch {
    alert('Nepodařilo se uložit, zkus to prosím znovu.');
  }
}

toggleBtn.addEventListener('click', toggle);
editTodayBtn.addEventListener('click', () => openDayModal(todayKey(), currentLiveSeconds()));
goalBtn.addEventListener('click', openGoalModal);
goalCancel.addEventListener('click', closeGoalModal);
goalSave.addEventListener('click', saveGoal);
goalModal.addEventListener('click', (e) => {
  if (e.target === goalModal) closeGoalModal();
});
dayCancel.addEventListener('click', closeDayModal);
daySave.addEventListener('click', saveDay);
dayModal.addEventListener('click', (e) => {
  if (e.target === dayModal) closeDayModal();
});
calPrev.addEventListener('click', () => {
  calendarView.month -= 1;
  if (calendarView.month < 0) {
    calendarView.month = 11;
    calendarView.year -= 1;
  }
  render();
});
calNext.addEventListener('click', () => {
  if (calNext.disabled) return;
  calendarView.month += 1;
  if (calendarView.month > 11) {
    calendarView.month = 0;
    calendarView.year += 1;
  }
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

fetchStatus();
setInterval(fetchStatus, 5000);
setInterval(render, 1000);
