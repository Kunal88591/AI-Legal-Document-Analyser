import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';
import { Orbit } from 'lucide-react';

const riskColors = {
  High: '#fb7185',
  Medium: '#f59e0b',
  Low: '#22c55e',
  Normal: '#38bdf8',
};

function GraphPanel({ graph, onSelectClause }) {
  const nodes = useMemo(() => graph?.nodes || [], [graph]);
  const edges = useMemo(() => graph?.edges || [], [graph]);

  const flowNodes = useMemo(() => nodes.map((node, index) => ({
    id: node.id,
    position: { x: (index % 3) * 280, y: Math.floor(index / 3) * 150 },
    data: { label: node.label, text: node.text, risk: node.risk },
    style: {
      borderRadius: 20,
      border: `1px solid ${riskColors[node.risk] || riskColors.Normal}33`,
      background: 'rgba(15, 23, 42, 0.95)',
      color: '#e2e8f0',
      padding: 14,
      width: 240,
      boxShadow: `0 0 0 1px ${riskColors[node.risk] || riskColors.Normal}11, 0 18px 50px rgba(0,0,0,0.35)`,
    },
  })), [nodes]);

  const flowEdges = useMemo(() => edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: true,
    style: { stroke: '#38bdf8', strokeWidth: 1.6 },
    labelStyle: { fill: '#94a3b8', fontSize: 11 },
  })), [edges]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl min-w-0 max-w-full overflow-hidden"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
            <Orbit className="h-4 w-4" /> Legal Graph
          </div>
          <h2 className="mt-2 text-lg font-semibold text-white">Clause dependency and obligation map</h2>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
          {nodes.length} nodes
        </div>
      </div>

      {flowNodes.length ? (
        <div className="h-[520px] w-full max-w-full overflow-hidden rounded-[24px] border border-white/10 bg-slate-900/80">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            onNodeClick={(_, node) => onSelectClause(node.data?.text || node.data?.label || '')}
            defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
          >
            <Background gap={22} size={1.2} color="rgba(148, 163, 184, 0.12)" />
            <MiniMap zoomable pannable />
            <Controls position="bottom-right" />
          </ReactFlow>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-slate-400">
          The graph will appear after a document is uploaded and analyzed.
        </div>
      )}
    </motion.section>
  );
}

export default GraphPanel;