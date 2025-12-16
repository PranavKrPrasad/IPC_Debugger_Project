import React from 'react';

export default function CpuTimeline({ cpuTimeline = [] }) {
  if (!cpuTimeline.length) {
    return <div className="small">No CPU activity yet.</div>;
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {cpuTimeline.slice(-60).map((t, i) => (
          <div
            key={i}
            title={`Tick ${t.tick} → ${t.pid}`}
            style={{
              minWidth: 18,
              height: 28,
              borderRadius: 6,
              background: `hsl(${(parseInt(t.pid.slice(1)) * 70) % 360},70%,50%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#fff'
            }}
          >
            {t.pid}
          </div>
        ))}
      </div>
    </div>
  );
}
