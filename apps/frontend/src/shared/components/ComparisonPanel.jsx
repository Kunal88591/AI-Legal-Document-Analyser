import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { GitCompareArrows, ArrowUpRight, ArrowDownRight, TriangleAlert } from 'lucide-react';

function ComparisonPanel({ comparison }) {
  const result = comparison?.result || comparison || null;

  const labels = useMemo(() => result?.labels || [], [result]);
  const oldText = result?.oldText || result?.originalText || '';
  const newText = result?.newText || result?.revisedText || '';

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
            <GitCompareArrows className="h-4 w-4" /> Contract Comparison
          </div>
          <h2 className="mt-2 text-lg font-semibold text-white">Semantic clause diff and risk-change engine</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <span key={label} className={`rounded-full px-3 py-1 text-xs font-semibold ${label === 'Risk Increased' ? 'bg-rose-500/15 text-rose-300' : label === 'Risk Reduced' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {result ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Summary</p>
              <p className="mt-2 text-sm text-slate-200">{result.summary || 'No summary available.'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Risk Delta</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                {result.riskDelta > 0 ? <ArrowUpRight className="h-4 w-4 text-rose-300" /> : result.riskDelta < 0 ? <ArrowDownRight className="h-4 w-4 text-emerald-300" /> : <TriangleAlert className="h-4 w-4 text-amber-300" />}
                {result.riskDelta || 0}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Change Count</p>
              <p className="mt-2 text-sm text-slate-200">{result.changeCount || 0} clause-level changes detected</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto max-w-full rounded-[24px] border border-white/10 bg-slate-900/80 scrollbar-thin scrollbar-thumb-white/10">
            <div className="min-w-[640px]">
              <ReactDiffViewer
                oldValue={oldText || result.oldVersion || ''}
                newValue={newText || result.newVersion || ''}
                splitView
                compareMethod={DiffMethod.WORDS}
                hideLineNumbers={false}
                useDarkTheme
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Matched Clauses</p>
              <p className="mt-2 text-2xl font-semibold text-white">{result.matchedClauses?.length || 0}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Added / Removed</p>
              <p className="mt-2 text-2xl font-semibold text-white">{result.addedClauses?.length || 0} / {result.removedClauses?.length || 0}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Critical Changes</p>
              <p className="mt-2 text-2xl font-semibold text-white">{result.criticalChanges?.length || 0}</p>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-slate-400">
          Upload two contracts to compare clause changes, liability shifts, payment edits, and risk changes.
        </div>
      )}
    </motion.section>
  );
}

export default ComparisonPanel;