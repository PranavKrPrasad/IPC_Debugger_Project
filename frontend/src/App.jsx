import React, { useEffect, useState, useRef } from 'react';
import ProcessNode from './components/ProcessNode';
import ChannelPanel from './components/ChannelPanel';
import Timeline from './components/Timeline';
import WaitForGraph from './components/WaitForGraph';
import CpuTimeline from './components/CpuTimeline';

export default function App() {
  const [state, setState] = useState({ processes: {}, channels: {} });
  const [events, setEvents] = useState([]);
  const [cpuTimeline, setCpuTimeline] = useState([]);

  // demo / replay
  const [recording, setRecording] = useState(false);
  const [recordedEvents, setRecordedEvents] = useState([]);
  const [replaying, setReplaying] = useState(false);
  const replayTimerRef = useRef(null);

  const wsRef = useRef(null);

  /* ---------- FETCH STATE ---------- */
  const refreshState = async () => {
    try {
      const s = await (await fetch('/api/state')).json();
      setState(s);

      // ✅ ADDITION 1: sync CPU timeline from backend snapshot
      if (s.cpuTimeline) {
        setCpuTimeline(s.cpuTimeline);
      }
    } catch {
      console.error('State fetch failed');
    }
  };

  /* ---------- WEBSOCKET ---------- */
  useEffect(() => {
    refreshState();

    const ws = new WebSocket(
      (location.protocol === 'https:' ? 'wss://' : 'ws://') + 'localhost:4000'
    );

    wsRef.current = ws;

    ws.onmessage = (m) => {
      if (replaying) return;

      const data = JSON.parse(m.data);

      if (data.kind === 'snapshot') {
        setState(data.state);

        // ✅ ADDITION 1 (duplicate-safe): keep CPU Gantt in sync
        if (data.state.cpuTimeline) {
          setCpuTimeline(data.state.cpuTimeline);
        }
      }

      if (data.kind === 'event') {
        setEvents(e => [data.event, ...e].slice(0, 400));

        // (existing logic untouched)
        if (data.event.type === 'cpu.tick' && data.event.payload?.pid) {
          setCpuTimeline(tl => [
            ...tl,
            {
              tick: data.event.payload.tick,
              pid: data.event.payload.pid
            }
          ]);
        }

        if (recording) {
          setRecordedEvents(r => [...r, data.event]);
        }
      }
    };

    return () => ws.close();
  }, [recording, replaying]);

  /* ---------- ACTIONS ---------- */
  const createProcess = async () => {
    await fetch('/api/process', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'proc-' + Date.now(),
        priority: Math.ceil(Math.random() * 5)
      })
    });
  };

  const createChannel = async (type) => {
    await fetch('/api/channel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, bufferSize: 5 })
    });
  };

  const send = async () => {
    const pids = Object.keys(state.processes);
    const cids = Object.keys(state.channels);

    if (pids.length < 2 || cids.length < 1) {
      alert('Create at least 2 processes and 1 channel');
      return;
    }

    await fetch('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from: pids[0],
        to: pids[1],
        channelId: cids[0],
        payload: { msg: 'hello', value: Math.random() }
      })
    });
  };

  const step = () => fetch('/api/step', { method: 'POST' });
  const autoDeadlock = () => fetch('/api/auto-deadlock', { method: 'POST' });
  const startDemo = () => fetch('/api/demo/start', { method: 'POST' });
  const stopDemo = () => fetch('/api/demo/stop', { method: 'POST' });

  const killProcess = async (pid) => {
    if (!window.confirm(`Kill process ${pid}?`)) return;
    await fetch('/api/kill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pid })
    });
  };

  /* ---------- RECORD / REPLAY ---------- */
  const startRecording = () => {
    setRecordedEvents([]);
    setCpuTimeline([]);
    setRecording(true);
  };

  const stopRecording = () => setRecording(false);

  const replayRecording = () => {
    if (!recordedEvents.length) return alert('No recording found');

    setReplaying(true);
    setEvents([]);
    setCpuTimeline([]);

    let i = 0;
    replayTimerRef.current = setInterval(() => {
      if (i >= recordedEvents.length) {
        clearInterval(replayTimerRef.current);
        setReplaying(false);
        return;
      }

      const ev = recordedEvents[i++];
      setEvents(e => [ev, ...e]);

      if (ev.type === 'cpu.tick' && ev.payload?.pid) {
        setCpuTimeline(tl => [
          ...tl,
          { tick: ev.payload.tick, pid: ev.payload.pid }
        ]);
      }
    }, 350);
  };

  /* ---------- RESET ---------- */
  const resetBackend = async () => {
    if (!window.confirm('Reset entire simulation?')) return;
    await fetch('/api/reset', { method: 'POST' });
    setState({ processes: {}, channels: {} });
    setEvents([]);
    setCpuTimeline([]);
    setRecordedEvents([]);
    setReplaying(false);
  };

  /* ---------- DEADLOCK RESOLUTION ---------- */
  async function onSelectCycle(action) {
    if (action.type === 'killLowest') {
      let lowest = null;
      let lowPri = Infinity;

      for (const pid of action.cycle.nodes) {
        const p = state.processes[pid];
        if (p && p.priority < lowPri) {
          lowPri = p.priority;
          lowest = pid;
        }
      }
      if (lowest) await killProcess(lowest);
    }

    if (action.type === 'forceRelease') {
      const edge = action.cycle.edges.find(e => e.reason?.includes('lock'));
      if (!edge) return;

      const match = edge.reason.match(/(C\d+:[^\s]+)/);
      await fetch('/api/releaseLock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ownerPid: edge.to,
          lockFullName: match?.[1]
        })
      });
    }
  }

  /* ---------- UI ---------- */
  return (
    <div className="app">
      <div className="header">
        <h1>
          IPC Debugger — Wait-For Graph
          {recording && <span style={{ color: '#ef4444' }}> ● REC</span>}
          {replaying && <span style={{ color: '#38bdf8' }}> ▶ REPLAY</span>}
        </h1>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" onClick={createProcess}>Create Process</button>
          <button className="btn" onClick={() => createChannel('shared')}>SharedMem</button>
          <button className="btn" onClick={() => createChannel('mq')}>MessageQ</button>
          <button className="btn" onClick={send}>Send</button>
          <button className="btn" onClick={step}>Step</button>
          <button className="btn warn" onClick={autoDeadlock}>Auto Deadlock</button>
          <button className="btn" onClick={startDemo}>▶ Demo</button>
          <button className="btn" onClick={stopDemo}>⏹ Stop</button>
          <button className="btn" onClick={startRecording}>● Record</button>
          <button className="btn" onClick={stopRecording}>■ Stop Rec</button>
          <button className="btn" onClick={replayRecording}>↺ Replay</button>
          <button className="btn danger" onClick={resetBackend}>Reset</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 480px', gap: 16, marginTop: 16 }}>
        <div>
          <div className="box">
            <h3>Processes</h3>
            {Object.values(state.processes).map(p => (
              <ProcessNode key={p.pid} p={p} onKill={killProcess} />
            ))}
          </div>

          {/* ✅ ADDITION 2: Channels panel */}
          <div className="box" style={{ marginTop: 12 }}>
            <h3>Channels</h3>
            {Object.values(state.channels).map(c => (
              <ChannelPanel key={c.cid} c={c} />
            ))}
          </div>

          <div className="box" style={{ marginTop: 12 }}>
            <h3>CPU Scheduling (Gantt)</h3>
            <CpuTimeline cpuTimeline={cpuTimeline} />
          </div>

          <div className="box" style={{ marginTop: 12 }}>
            <h3>Timeline</h3>
            <Timeline events={events.slice(0, 150)} />
          </div>
        </div>

        <div>
          <div className="box">
            <h3>Wait-For Graph</h3>
            <WaitForGraph onSelectCycle={onSelectCycle} />
          </div>
        </div>
      </div>
    </div>
  );
}
