// backend/simulator.js
// Advanced Simulator: Deadlocks, CPU Scheduling, RAG, Reset, Auto-Demo + CPU Timeline

class Simulator {
  constructor(onEvent) {
    this.emit = onEvent || (() => {});
    this.reset();
  }

  /* ================= RESET ================= */
  reset() {
    this.processes = {};
    this.channels = {};
    this.nextPid = 1;
    this.nextCid = 1;

    this.readyQueue = [];
    this.runningPid = null;

    this.timeSlice = 2;
    this.tick = 0;

    // ✅ CPU TIMELINE (Gantt data)
    this.cpuTimeline = []; // [{ tick, pid }]

    this.emit({ type: 'sim.reset', time: Date.now() });
  }

  /* ================= PROCESS ================= */
  createProcess(name, priority = 1) {
    const pid = `P${this.nextPid++}`;
    const p = {
      pid,
      name,
      priority,
      state: 'ready',
      cpu: 0,
      heldLocks: new Set(),
      waitingFor: null
    };

    this.processes[pid] = p;
    this.readyQueue.push(pid);

    this.emit({
      type: 'process.created',
      payload: this._sp(p),
      time: Date.now()
    });

    return p;
  }

  killProcess(pid) {
    const p = this.processes[pid];
    if (!p) return false;

    [...p.heldLocks].forEach(l => this.forceReleaseLock(pid, l));

    delete this.processes[pid];
    this.readyQueue = this.readyQueue.filter(x => x !== pid);
    if (this.runningPid === pid) this.runningPid = null;

    this.emit({
      type: 'process.killed',
      payload: { pid },
      time: Date.now()
    });

    return true;
  }

  /* ================= CHANNEL ================= */
  createChannel({ type = 'pipe', bufferSize = 5, name } = {}) {
    const cid = `C${this.nextCid++}`;
    const ch = {
      cid,
      type,
      name: name || `${type}-${cid}`,
      buffer: [],
      bufferSize,
      locks: {},
      memory: type === 'shared' ? {} : undefined
    };

    this.channels[cid] = ch;

    this.emit({
      type: 'channel.created',
      payload: ch,
      time: Date.now()
    });

    return ch;
  }

  /* ================= LOCKS ================= */
  acquireLock(pid, channelId, lockName) {
    const p = this.processes[pid];
    const ch = this.channels[channelId];
    if (!p || !ch) return false;

    if (!ch.locks[lockName]) {
      ch.locks[lockName] = { owner: null, waiters: [] };
    }

    const L = ch.locks[lockName];

    if (!L.owner) {
      L.owner = pid;
      p.heldLocks.add(`${channelId}:${lockName}`);

      this.emit({
        type: 'lock.acquired',
        payload: { pid, resource: `${channelId}:${lockName}` },
        time: Date.now()
      });

      return true;
    }

    if (!L.waiters.includes(pid)) L.waiters.push(pid);

    p.state = 'blocked';
    p.waitingFor = { type: 'lock', channelId, lockName };

    this.emit({
      type: 'lock.waiting',
      payload: { pid, owner: L.owner, resource: `${channelId}:${lockName}` },
      time: Date.now()
    });

    return false;
  }

  forceReleaseLock(ownerPid, full) {
    const [channelId, lockName] = full.split(':');
    const ch = this.channels[channelId];
    const L = ch?.locks?.[lockName];
    if (!L || L.owner !== ownerPid) return false;

    L.owner = null;
    this.processes[ownerPid]?.heldLocks.delete(full);

    if (L.waiters.length) {
      const next = L.waiters.shift();
      L.owner = next;

      const p = this.processes[next];
      if (p) {
        p.heldLocks.add(full);
        p.state = 'ready';
        p.waitingFor = null;
        this.readyQueue.push(next);
      }

      this.emit({
        type: 'lock.granted',
        payload: { from: ownerPid, to: next, resource: full },
        time: Date.now()
      });
    }

    return true;
  }

  /* ================= MESSAGE ================= */
  sendMessage({ from, to, channelId, payload }) {
    const ch = this.channels[channelId];
    if (!ch) return;

    if (ch.buffer.length >= ch.bufferSize) {
      const p = this.processes[from];
      if (p) {
        p.state = 'blocked';
        p.waitingFor = { type: 'channel', channelId };
      }
      return;
    }

    ch.buffer.push({ from, to, payload, ts: Date.now() });

    this.emit({
      type: 'message.sent',
      payload: { from, to, channelId },
      time: Date.now()
    });
  }

  /* ================= CPU SCHEDULING ================= */
  step() {
    this.tick++;

    // Dispatch
    if (!this.runningPid && this.readyQueue.length) {
      this.runningPid = this.readyQueue.shift();
      this.processes[this.runningPid].state = 'running';

      this.emit({
        type: 'cpu.dispatch',
        payload: { pid: this.runningPid },
        time: Date.now()
      });
    }

    // Execute
    if (this.runningPid) {
      const p = this.processes[this.runningPid];
      p.cpu++;

      // ✅ RECORD CPU TIMELINE
      this.cpuTimeline.push({
        tick: this.tick,
        pid: this.runningPid
      });
      if (this.cpuTimeline.length > 200) {
      this.cpuTimeline.shift();
      }

      if (p.cpu % this.timeSlice === 0) {
        p.state = 'ready';
        this.readyQueue.push(this.runningPid);

        this.emit({
          type: 'cpu.preempt',
          payload: { pid: this.runningPid },
          time: Date.now()
        });

        this.runningPid = null;
      }
    }

    this.detectDeadlocks();

    this.emit({
      type: 'cpu.tick',
      payload: { tick: this.tick },
      time: Date.now()
    });
  }

  /* ================= RESOURCE ALLOCATION GRAPH ================= */
  buildWaitForGraph() {
    const nodes = Object.keys(this.processes);
    const edges = [];

    Object.values(this.processes).forEach(p => {
      if (p.waitingFor?.type === 'lock') {
        const { channelId, lockName } = p.waitingFor;
        const owner = this.channels[channelId]?.locks?.[lockName]?.owner;
        if (owner) {
          edges.push({
            from: p.pid,
            to: owner,
            reason: `waiting for ${channelId}:${lockName}`
          });
        }
      }
    });

    return { nodes, edges };
  }

  /* ================= DEADLOCK ================= */
  detectDeadlocks() {
    const { nodes, edges } = this.buildWaitForGraph();
    const adj = {};
    nodes.forEach(n => (adj[n] = []));
    edges.forEach(e => adj[e.from].push(e.to));

    const visited = {};
    const stack = {};
    const cycles = [];

    const dfs = (v, path = []) => {
      visited[v] = true;
      stack[v] = true;
      path.push(v);

      for (const w of adj[v]) {
        if (!visited[w]) dfs(w, [...path]);
        else if (stack[w]) {
          const cycle = path.slice(path.indexOf(w));
          if (!cycles.some(c => c.join() === cycle.join())) {
            cycles.push(cycle);
          }
        }
      }
      stack[v] = false;
    };

    nodes.forEach(n => !visited[n] && dfs(n));

    if (cycles.length) {
      this.emit({
        type: 'deadlock.detected',
        payload: { cycles, graph: { nodes, edges } },
        time: Date.now()
      });
    }
  }

  /* ================= AUTO DEADLOCK ================= */
  autoDeadlock() {
    const p1 = this.createProcess('Auto-A', 1);
    const p2 = this.createProcess('Auto-B', 1);
    const c = this.createChannel({ type: 'shared' });

    this.acquireLock(p1.pid, c.cid, 'L1');
    this.acquireLock(p2.pid, c.cid, 'L2');
    this.acquireLock(p1.pid, c.cid, 'L2');
    this.acquireLock(p2.pid, c.cid, 'L1');
  }

  /* ================= STATE ================= */
  getState() {
    const procs = {};
    Object.values(this.processes).forEach(
      p => (procs[p.pid] = this._sp(p))
    );

    return {
      processes: procs,
      channels: this.channels,
      cpuTimeline: this.cpuTimeline, // ✅ EXPOSED
      tick: this.tick
    };
  }

  _sp(p) {
    return { ...p, heldLocks: [...p.heldLocks] };
  }
}

module.exports = Simulator;
