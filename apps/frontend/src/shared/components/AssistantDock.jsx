import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Send, Sparkles, ShieldAlert, FileText, Wand2 } from 'lucide-react';

const QUICK_PROMPTS = [
  'summarize this clause',
  'is this risky?',
  'rewrite safer version',
  'explain in simple language',
];

function AssistantDock({
  messages,
  input,
  onInputChange,
  onSend,
  isConnected,
  selectedClause,
  onQuickPrompt,
}) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45 }}
      className="flex h-full min-h-[760px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 shadow-glow backdrop-blur-2xl"
    >
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
              <Bot className="h-4 w-4" /> AI Legal Copilot
            </div>
            <p className="mt-1 text-sm text-slate-300">Chat with the document using local RAG and clause citations.</p>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-semibold ${isConnected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
            {isConnected ? 'Live' : 'Offline'}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onQuickPrompt(prompt)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {selectedClause ? (
        <div className="border-b border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
            <FileText className="h-4 w-4" /> Selected Clause
          </div>
          <p className="line-clamp-5 text-slate-300">{selectedClause}</p>
        </div>
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`rounded-[22px] border px-4 py-3 ${message.role === 'user' ? 'border-cyan-400/20 bg-cyan-400/10' : 'border-white/10 bg-white/5'}`}
            >
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <span>{message.role === 'user' ? 'You' : 'Copilot'}</span>
                {message.streaming ? (
                  <span className="inline-flex items-center gap-2 text-cyan-300">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                    typing
                  </span>
                ) : null}
              </div>
              <div className="prose prose-invert max-w-none prose-p:my-2 prose-headings:mb-2 prose-headings:mt-4 prose-code:rounded prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-cyan-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || ' '}</ReactMarkdown>
              </div>
              {message.citations?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.citations.map((citation, index) => (
                    <span key={`${message.id}-${index}`} className="rounded-full border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-cyan-200">
                      [{citation.label || 'Clause'} {citation.lineStart || ''}{citation.lineEnd ? `-${citation.lineEnd}` : ''}]
                    </span>
                  ))}
                </div>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          <ShieldAlert className="h-4 w-4 text-cyan-300" /> Ask anything about the uploaded contract
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
          className="flex items-end gap-3"
        >
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Ask for a summary, risk review, clause rewrite, or explanation..."
            rows={3}
            className="flex-1 resize-none rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40"
          />
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-4 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:scale-[1.02]"
          >
            <Send className="mr-2 h-4 w-4" /> Send
          </button>
        </form>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{isConnected ? 'Streaming enabled with WebSocket.' : 'Using REST fallback until the socket reconnects.'}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 transition hover:bg-white/10"
            onClick={() => onQuickPrompt('summarize this clause')}
          >
            <Wand2 className="h-3.5 w-3.5" /> Quick prompt
          </button>
        </div>
      </div>
    </motion.aside>
  );
}

export default AssistantDock;