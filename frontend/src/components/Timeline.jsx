import React, { useState, useMemo } from 'react';

const EVENT_STYLE = {
  'process.created': { color: '#22c55e', icon: '🟢', group: 'process' },
  'process.killed': { color: '#ef4444', icon: '❌', group: 'process' },
  'channel.created': { color: '#38bdf8', icon: '📦', group: 'channel' },

  'lock.acquired': { color: '#60a5fa', icon: '🔒', group: 'lock' },
  'lock.waiting': { color: '#fb923c', icon: '⏳', group: 'lock' },
  'lock.granted': { color: '#4ade80', icon: '🔓', group: 'lock' },

  'cpu.dispatch': { color: '#a78bfa', icon: '🧠', group: 'cpu' },
  'cpu.preempt': { color: '#c084fc', icon: '⏸', group: 'cpu' },
  'cpu.tick': { color: '#94a3b8', icon: '⏱', group: 'cpu' },

  'deadlock.detected': { color: '#ff4d4f', icon: '🔥', group: 'deadlock' },
  'sim.reset': { color: '#64748b', icon: '🔄', group: 'system' }
};

const FILTERS = ['all', 'cpu', 'lock', 'deadlock', 'process', 'system'];

export default function Timeline({ events }) {
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState('all');

  const zoomIn = () => setZoom(z => Math.min(z + 0.15, 2));
  const zoomOut = () => setZoom(z => Math.max(z - 0.15, 0.6));

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter(e => EVENT_STYLE[e.type]?.group === filter);
  }, [events, filter]);

  return (
    <div>
      {/* CONTROLS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button
              key={f}
              className="btn"
              style={{
                fontSize: 11,
                opacity: filter === f ? 1 : 0.6,
                borderColor: filter === f ? '#38bdf8' : undefined
              }}
              onClick={() => setFilter(f)}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" onClick={zoomOut}>−</button>
          <button className="btn" onClick={zoomIn}>＋</button>
        </div>
      </div>

      {/* TIMELINE */}
      <div
        style={{
          maxHeight: 280,
          overflowY: 'auto',
          borderRadius: 12,
          background: 'linear-gradient(180deg,#020617,#020617)',
          padding: 10,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          boxShadow: 'inset 0 0 18px rgba(56,189,248,0.08)'
        }}
      >
        {filteredEvents.length === 0 && (
          <div className="small">No events to display.</div>
        )}

        {filteredEvents.map((e, i) => {
          const meta = EVENT_STYLE[e.type] || {
            color: '#94a3b8',
            icon: '•'
          };

          const isDeadlock = e.type === 'deadlock.detected';

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '6px 10px',
                marginBottom: 6,
                borderLeft: `4px solid ${meta.color}`,
                background: isDeadlock
                  ? 'rgba(239,68,68,0.12)'
                  : 'rgba(255,255,255,0.03)',
                borderRadius: 10,
                fontSize: 12,
                boxShadow: isDeadlock
                  ? '0 0 18px rgba(239,68,68,0.35)'
                  : 'none'
              }}
            >
              <div style={{ color: meta.color }}>{meta.icon}</div>

              <div>
                <div style={{ fontWeight: 700, color: meta.color }}>
                  {e.type}
                </div>

                {e.payload && (
                  <div className="small" style={{ color: '#cbd5f5' }}>
                    {JSON.stringify(e.payload).slice(0, 120)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
