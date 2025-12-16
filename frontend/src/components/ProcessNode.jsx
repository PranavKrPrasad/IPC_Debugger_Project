import React from 'react';

const STATE_META = {
  ready: {
    color: '#22c55e',
    bg: '#052e16',
    icon: '⏸'
  },
  running: {
    color: '#3b82f6',
    bg: '#020617',
    icon: '▶'
  },
  blocked: {
    color: '#ef4444',
    bg: '#2a0a0a',
    icon: '⏳'
  },
  terminated: {
    color: '#9ca3af',
    bg: '#111827',
    icon: '⛔'
  }
};

export default function ProcessNode({ p, onKill }) {
  const meta = STATE_META[p.state] || STATE_META.ready;
  const cpuPercent = Math.min((p.cpu || 0) * 10, 100);

  return (
    <div
      className={`process-card ${p.state}`}
      style={{
        padding: 16,
        borderRadius: 14,
        background: '#020617',
        border: `1px solid ${meta.color}40`,
        marginBottom: 14,
        boxShadow:
          p.state === 'running'
            ? `0 0 22px ${meta.color}55`
            : '0 8px 18px rgba(0,0,0,0.6)',
        transition: 'all .25s ease'
      }}
    >
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <strong style={{ fontSize: 15, color: '#e5e7eb' }}>{p.pid}</strong>
          <span style={{ color: '#9ca3af' }}> — {p.name}</span>
        </div>

        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            color: meta.color,
            background: meta.bg,
            border: `1px solid ${meta.color}55`
          }}
        >
          {meta.icon} {p.state.toUpperCase()}
        </span>
      </div>

      {/* PRIORITY */}
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
        Priority: <strong style={{ color: '#e5e7eb' }}>{p.priority ?? 1}</strong>
      </div>

      {/* CPU BAR */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: '#64748b' }}>CPU Usage</div>
        <div
          style={{
            height: 7,
            borderRadius: 999,
            background: '#020617',
            overflow: 'hidden',
            marginTop: 5,
            border: '1px solid #1e293b'
          }}
        >
          <div
            style={{
              width: `${cpuPercent}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${meta.color}, #ffffff)`,
              transition: 'width .4s ease'
            }}
          />
        </div>
      </div>

      {/* LOCKS */}
      {p.heldLocks?.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#e5e7eb' }}>
          🔒 <strong>Locks:</strong>{' '}
          {p.heldLocks.map(l => (
            <span
              key={l}
              style={{
                marginRight: 6,
                padding: '3px 10px',
                borderRadius: 999,
                background: '#020617',
                color: '#38bdf8',
                border: '1px solid #38bdf855',
                fontSize: 11
              }}
            >
              {l}
            </span>
          ))}
        </div>
      )}

      {/* WAITING */}
      {p.waitingFor && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: '#fca5a5'
          }}
        >
          ⏳ Waiting for {p.waitingFor.type}:{' '}
          {p.waitingFor.channelId}
          {p.waitingFor.lockName ? `:${p.waitingFor.lockName}` : ''}
        </div>
      )}

      {/* ACTIONS */}
      <div style={{ marginTop: 14, textAlign: 'right' }}>
        <button
          onClick={() => onKill?.(p.pid)}
          style={{
            background: 'transparent',
            color: '#fca5a5',
            border: '1px solid #7f1d1d',
            padding: '5px 14px',
            fontSize: 12,
            borderRadius: 999,
            cursor: 'pointer',
            transition: 'all .2s'
          }}
          onMouseEnter={e => {
            e.target.style.background = '#7f1d1d';
            e.target.style.color = '#fee2e2';
          }}
          onMouseLeave={e => {
            e.target.style.background = 'transparent';
            e.target.style.color = '#fca5a5';
          }}
        >
          ❌ Kill
        </button>
      </div>
    </div>
  );
}
