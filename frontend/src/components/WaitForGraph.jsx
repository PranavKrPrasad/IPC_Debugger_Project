import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export default function WaitForGraph({ onSelectCycle }) {
  const fgRef = useRef(null);
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [cycles, setCycles] = useState([]);

  async function loadGraph() {
    try {
      const res = await fetch('/api/waitfor');
      const j = await res.json();
      if (!j?.ok) return;

      setGraph({
        nodes: j.graph.nodes.map(n => ({ id: n })),
        links: j.graph.edges.map(e => ({
          source: e.from,
          target: e.to,
          reason: e.reason
        }))
      });

      const evRes = await fetch('/api/events');
      const ev = await evRes.json();
      const deadlocks = ev.rows?.filter(r => r.type === 'deadlock.detected') || [];

      if (deadlocks.length) {
        const payload = JSON.parse(deadlocks[0].payload || '{}');

        // 🔐 NORMALIZE CYCLES (IMPORTANT FIX)
        const normalized = (payload.cycles || []).map(c =>
          Array.isArray(c)
            ? { nodes: c, edges: [] }
            : c
        );

        setCycles(normalized);
      } else {
        setCycles([]);
      }

      setTimeout(() => fgRef.current?.d3ReheatSimulation(), 50);
    } catch (err) {
      console.error('WaitForGraph error:', err);
    }
  }

  useEffect(() => {
    loadGraph();
    const t = setInterval(loadGraph, 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div style={{ height: 420 }}>
        {graph.nodes.length === 0 ? (
          <div className="small">No wait-for relationships yet.</div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            graphData={graph}
            nodeLabel="id"
            linkDirectionalArrowLength={6}
            linkColor={() => '#38bdf8'}
            nodeColor={() => '#a855f7'}
          />
        )}
      </div>

      {cycles.map((c, i) => (
        <div
          key={i}
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            border: '1px solid #ef4444',
            background: 'rgba(239,68,68,0.1)'
          }}
        >
          <strong>🔥 Deadlock {i + 1}</strong>
          <div className="small" style={{ marginTop: 4 }}>
            {(c.nodes || []).join(' → ')}
          </div>

          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={() => onSelectCycle?.({ type: 'killLowest', cycle: c })}
            >
              Kill lowest
            </button>

            <button
              className="btn"
              onClick={() => onSelectCycle?.({ type: 'forceRelease', cycle: c })}
            >
              Force release
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
