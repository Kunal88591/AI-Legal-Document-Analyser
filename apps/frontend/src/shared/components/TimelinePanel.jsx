import React from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Clock3 } from 'lucide-react';

function TimelinePanel({ timeline, obligations }) {
  const events = timeline || [];
  const items = obligations || [];

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
            <CalendarClock className="h-4 w-4" /> Legal Timeline
          </div>
          <h2 className="mt-2 text-lg font-semibold text-white">Deadlines, renewals, payment windows, and obligations</h2>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Timeline Events</h3>
          {events.length ? events.map((event, index) => (
            <div key={`${event.label}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-4 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{event.label}</p>
                  <p className="mt-1 text-sm text-slate-300 break-words">{event.value}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${event.urgency === 'high' ? 'bg-rose-500/15 text-rose-300' : event.urgency === 'medium' ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
                  {event.urgency || 'normal'}
                </span>
              </div>
              {event.context ? <p className="mt-3 text-xs leading-6 text-slate-400 break-words">{event.context}</p> : null}
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
              No explicit dates were detected yet.
            </div>
          )}
        </div>

        <div className="space-y-3 min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Obligation Tracker</h3>
          {items.length ? items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white break-words">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-300 break-words">{item.deadline}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.status === 'urgent' ? 'bg-rose-500/15 text-rose-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
                  {item.status}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <Clock3 className="h-3.5 w-3.5" /> {item.urgency}
              </div>
              <p className="mt-2 text-xs leading-6 text-slate-400 break-words">{item.description}</p>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
              Obligations will appear after timeline extraction runs.
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

export default TimelinePanel;