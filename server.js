const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3300;
const DATA_FILE = path.join(__dirname, 'data.json');
const DEFAULT_GOAL_HOURS = 20;

// V cloudu (Render apod.) je lokalni souborovy system nestaly a maze se pri
// kazdem restartu - pokud jsou nastavene Upstash Redis promenne, data se
// misto souboru ukladaji tam, aby prezila restart/uspani sluzby.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_REDIS = !!(REDIS_URL && REDIS_TOKEN);
const REDIS_KEY = 'rovnatka-data';

function withDefaults(data) {
  if (!data.goalHours) data.goalHours = DEFAULT_GOAL_HOURS;
  return data;
}

async function loadData() {
  if (USE_REDIS) {
    const res = await fetch(`${REDIS_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json();
    if (json.result) {
      return withDefaults(JSON.parse(json.result));
    }
    return { days: {}, running: null, goalHours: DEFAULT_GOAL_HOURS };
  }
  try {
    return withDefaults(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch {
    return { days: {}, running: null, goalHours: DEFAULT_GOAL_HOURS };
  }
}

async function saveData(data) {
  if (USE_REDIS) {
    await fetch(`${REDIS_URL}/set/${REDIS_KEY}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      body: JSON.stringify(data),
    });
    return;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Appka pocita "den" vzdy podle ceskeho casu, bez ohledu na to, v jake
// casove zone bezi server (Render typicky bezi v UTC) - jinak by se vecerni
// noseni kolem pulnoci mohlo spatne priradit k jinemu datu.
const APP_TIMEZONE = 'Europe/Prague';

function dateKey(ms) {
  const map = {};
  for (const p of new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms))) {
    map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

// Prevede "hodiny na nastenych hodinach" v dane casove zone na epoch ms,
// spravne i pres prechod letniho/zimniho casu.
function zonedTimeToUtc(y, m, d, h, mi, s, timeZone) {
  const utcGuess = Date.UTC(y, m - 1, d, h, mi, s);
  const map = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcGuess))) {
    map[p.type] = p.value;
  }
  const hour = +map.hour === 24 ? 0 : +map.hour;
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, hour, +map.minute, +map.second);
  return utcGuess - (asUTC - utcGuess);
}

// Pulnoc (00:00 ceskeho casu) prvniho dne nasledujiciho po danem casovem razitku
function nextMidnight(ms) {
  const map = {};
  for (const p of new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms))) {
    map[p.type] = p.value;
  }
  const d = new Date(+map.year, +map.month - 1, +map.day);
  d.setDate(d.getDate() + 1);
  return zonedTimeToUtc(d.getFullYear(), d.getMonth() + 1, d.getDate(), 0, 0, 0, APP_TIMEZONE);
}

// Rozpocita interval [startMs, endMs) mezi jednotlive kalendarni dny
// a vrati mapu { "YYYY-MM-DD": pocetSekund }
function splitByDay(startMs, endMs) {
  const result = {};
  let cursor = startMs;
  while (cursor < endMs) {
    const segEnd = Math.min(endMs, nextMidnight(cursor));
    const key = dateKey(cursor);
    const secs = (segEnd - cursor) / 1000;
    result[key] = (result[key] || 0) + secs;
    cursor = segEnd;
  }
  return result;
}

function addElapsed(data, startMs, endMs) {
  const parts = splitByDay(startMs, endMs);
  for (const [key, secs] of Object.entries(parts)) {
    data.days[key] = (data.days[key] || 0) + secs;
  }
}

function buildStatus(data) {
  const now = Date.now();
  const today = dateKey(now);
  let liveExtra = {};
  if (data.running) {
    liveExtra = splitByDay(data.running.startedAt, now);
  }

  const todayBase = data.days[today] || 0;
  const todayLive = liveExtra[today] || 0;
  const todaySeconds = todayBase + todayLive;

  const history = Object.entries(data.days)
    .map(([date, seconds]) => ({ date, seconds }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    running: !!data.running,
    startedAt: data.running ? data.running.startedAt : null,
    now,
    todaySeconds,
    goalSeconds: data.goalHours * 3600,
    history,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/status' && req.method === 'GET') {
    const data = await loadData();
    sendJSON(res, 200, buildStatus(data));
    return;
  }

  if (req.url === '/api/start' && req.method === 'POST') {
    const data = await loadData();
    if (!data.running) {
      data.running = { startedAt: Date.now() };
      await saveData(data);
    }
    sendJSON(res, 200, buildStatus(data));
    return;
  }

  if (req.url === '/api/stop' && req.method === 'POST') {
    const data = await loadData();
    if (data.running) {
      addElapsed(data, data.running.startedAt, Date.now());
      data.running = null;
      await saveData(data);
    }
    sendJSON(res, 200, buildStatus(data));
    return;
  }

  if (req.url === '/api/goal' && req.method === 'POST') {
    const body = await readBody(req);
    let hours;
    try {
      hours = JSON.parse(body).hours;
    } catch {
      sendJSON(res, 400, { error: 'invalid body' });
      return;
    }
    hours = Number(hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      sendJSON(res, 400, { error: 'goal must be between 0 and 24 hours' });
      return;
    }
    const data = await loadData();
    data.goalHours = hours;
    await saveData(data);
    sendJSON(res, 200, buildStatus(data));
    return;
  }

  if (req.url === '/api/day' && req.method === 'POST') {
    const body = await readBody(req);
    let date, hours;
    try {
      ({ date, hours } = JSON.parse(body));
    } catch {
      sendJSON(res, 400, { error: 'invalid body' });
      return;
    }
    hours = Number(hours);
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      sendJSON(res, 400, { error: 'invalid date' });
      return;
    }
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      sendJSON(res, 400, { error: 'hours must be between 0 and 24' });
      return;
    }
    const data = await loadData();
    if (hours === 0) {
      delete data.days[date];
    } else {
      data.days[date] = hours * 3600;
    }
    // pokud se prave upravuje dnesek a casovac bezi, "checkpointneme" bezici
    // session k tomuto okamziku, aby uz odbehnuty cas nesplynul do noveho
    // rucne zadaneho souctu a nezapocital se pri pristim Stop podruhe
    if (data.running && date === dateKey(Date.now())) {
      data.running.startedAt = Date.now();
    }
    await saveData(data);
    sendJSON(res, 200, buildStatus(data));
    return;
  }

  if (req.url.startsWith('/api/')) {
    sendJSON(res, 404, { error: 'not found' });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Rovnatka timer bezi na http://localhost:${PORT}`);
});
