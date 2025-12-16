// backend/server.js
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const Simulator = require('./simulator');
const Database = require('better-sqlite3'); // 🔁 CHANGED
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(bodyParser.json());

/* ================= DATABASE ================= */
const DB_FILE = path.join(__dirname, 'events.sqlite3');
const db = new Database(DB_FILE); // 🔁 CHANGED

db.prepare(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time INTEGER,
    type TEXT,
    payload TEXT
  )
`).run();

/* ================= SIMULATOR ================= */
let demoTimer = null;

const sim = new Simulator(evt => {
  const record = {
    time: evt.time || Date.now(),
    type: evt.type,
    payload: evt.payload || {}
  };

  db.prepare(
    'INSERT INTO events(time,type,payload) VALUES(?,?,?)'
  ).run(
    record.time,
    record.type,
    JSON.stringify(record.payload)
  );

  broadcast({ kind: 'event', event: record });
});

/* ================= HELPERS ================= */
function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });
}

function broadcastState() {
  broadcast({ kind: 'snapshot', state: sim.getState() });
}

/* ================= API ================= */

/* ---- PROCESS ---- */
app.post('/api/process', (req, res) => {
  const p = sim.createProcess(
    req.body.name || `proc-${Date.now()}`,
    req.body.priority || 1
  );
  broadcastState();
  res.json({ ok: true, process: p });
});

/* ---- CHANNEL ---- */
app.post('/api/channel', (req, res) => {
  const ch = sim.createChannel(req.body || {});
  broadcastState();
  res.json({ ok: true, channel: ch });
});

/* ---- SEND MESSAGE ---- */
app.post('/api/send', (req, res) => {
  sim.sendMessage(req.body);
  broadcastState();
  res.json({ ok: true });
});

/* ---- CPU STEP ---- */
app.post('/api/step', (req, res) => {
  sim.step();
  broadcastState();
  res.json({ ok: true });
});

/* ---- AUTO DEADLOCK ---- */
app.post('/api/auto-deadlock', (req, res) => {
  sim.autoDeadlock();
  broadcastState();
  res.json({ ok: true });
});

/* ---- KILL PROCESS ---- */
app.post('/api/kill', (req, res) => {
  const { pid } = req.body;
  if (!pid) return res.status(400).json({ ok: false });
  const ok = sim.killProcess(pid);
  broadcastState();
  res.json({ ok });
});

/* ---- FORCE RELEASE LOCK ---- */
app.post('/api/releaseLock', (req, res) => {
  const { ownerPid, lockFullName } = req.body;
  const ok = sim.forceReleaseLock(ownerPid, lockFullName);
  broadcastState();
  res.json({ ok });
});

/* ---- WAIT-FOR GRAPH ---- */
app.get('/api/waitfor', (req, res) => {
  res.json({ ok: true, graph: sim.buildWaitForGraph() });
});

/* ---- FULL STATE ---- */
app.get('/api/state', (req, res) => {
  res.json(sim.getState());
});

/* ---- EVENTS (TIMELINE / CHARTS) ---- */
app.get('/api/events', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM events ORDER BY id DESC LIMIT 500')
    .all();
  res.json({ rows });
});

/* ---- TRUE BACKEND RESET ---- */
app.post('/api/reset', (req, res) => {
  sim.reset();
  db.prepare('DELETE FROM events').run();
  broadcastState();
  res.json({ ok: true });
});

/* ---- DEMO MODE (AUTO CPU RUN) ---- */
app.post('/api/demo/start', (req, res) => {
  if (demoTimer) return res.json({ ok: true });

  demoTimer = setInterval(() => {
    sim.step();
    broadcastState();
  }, 700);

  res.json({ ok: true });
});

app.post('/api/demo/stop', (req, res) => {
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = null;
  res.json({ ok: true });
});

/* ================= FRONTEND ================= */
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use('/', express.static(frontendDist));

/* ================= WEBSOCKET ================= */
wss.on('connection', ws => {
  ws.send(JSON.stringify({ kind: 'snapshot', state: sim.getState() }));
});

/* ================= START ================= */
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ IPC Debugger backend running on port ${PORT}`);
});
