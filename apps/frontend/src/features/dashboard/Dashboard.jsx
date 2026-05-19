import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import { scaleSequential } from 'd3';
import { AlertCircle, BarChart3, Bot, CalendarDays, ChevronRight, Download, FileSearch, FileText, Github, RefreshCw, ShieldAlert, Sparkles, UploadCloud } from 'lucide-react';
import { chatDocument, compareDocuments, buildWebSocketUrl, getHistory, uploadDocument } from '@/shared/services/apiClient';
import AssistantDock from '@/shared/components/AssistantDock';
import ComparisonPanel from '@/shared/components/ComparisonPanel';
import GraphPanel from '@/shared/components/GraphPanel';
import TimelinePanel from '@/shared/components/TimelinePanel';

const INITIAL_MESSAGES = [];

function Dashboard() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [jurisdiction, setJurisdiction] = useState('Global');
  const [analysis, setAnalysis] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [compareOldFile, setCompareOldFile] = useState(null);
  const [compareNewFile, setCompareNewFile] = useState(null);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [chatInput, setChatInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState('');
  const [socketState, setSocketState] = useState('offline');
  const [selectedClause, setSelectedClause] = useState('');
  const [simplifiedText, setSimplifiedText] = useState('');
  const [recentAnalyses, setRecentAnalyses] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('legal-recent-analyses') || '[]');
    } catch {
      return [];
    }
  });
  const socketRef = useRef(null);
  const activeDocumentId = analysis?.documentId || '';

  useEffect(() => {
    if (!activeDocumentId) {
      return undefined;
    }

    const socket = new WebSocket(buildWebSocketUrl());
    socketRef.current = socket;
    setSocketState('connecting');

    socket.onopen = () => setSocketState('connected');
    socket.onerror = () => setSocketState('offline');
    socket.onclose = () => setSocketState('offline');
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'chunk') {
          setMessages((current) => {
            const next = [...current];
            const assistantIndex = next.findIndex((item) => item.id === payload.messageId && item.role === 'assistant');
            if (assistantIndex >= 0) {
              next[assistantIndex] = {
                ...next[assistantIndex],
                content: `${next[assistantIndex].content || ''}${payload.chunk}`,
                citations: payload.citations || next[assistantIndex].citations,
                streaming: true,
              };
            }
            return next;
          });
        }
        if (payload.type === 'done') {
          setMessages((current) => current.map((item) => (item.id === payload.messageId ? { ...item, streaming: false, citations: payload.citations || item.citations } : item)));
          void refreshHistory(activeDocumentId);
        }
      } catch {
        // Ignore malformed frames from the local socket.
      }
    };

    return () => {
      try {
        socket.close();
      } catch {
        // noop
      }
    };
  }, [activeDocumentId]);

  const analytics = useMemo(() => {
    const current = analysis?.analysis || {};
    const distribution = current.clauseDistribution || {};
    const total = Math.max(1, Object.values(distribution).reduce((sum, value) => sum + Number(value || 0), 0));
    const heatScale = scaleSequential().domain([0, 100]).interpolator((value) => `rgba(56, 189, 248, ${0.14 + value / 250})`);
    return {
      total,
      riskScore: Number(current.riskScore || 0),
      riskLevel: current.riskLevel || 'Unknown',
      clauseTags: current.clauseTags || [],
      summaryPoints: current.summaryPoints || [],
      highlights: current.highlights || [],
      facts: current.facts || {},
      graph: current.graph || {},
      timeline: current.timeline || [],
      obligations: current.obligations || [],
      qa: current.qa || {},
      riskDistribution: distribution,
      heatScale,
      ocrRecommended: current.ocrRecommended || analysis?.ocrRecommended || false,
      ocrConfidence: current.ocrConfidence || analysis?.ocrConfidence || 0,
      summary: current.summary || '',
      simpleSummary: current.simpleSummary || '',
      fileName: analysis?.fileName || 'Document',
    };
  }, [analysis]);

  const recentUploads = useMemo(() => recentAnalyses.slice(0, 5), [recentAnalyses]);

  const saveRecentAnalysis = (entry) => {
    setRecentAnalyses((current) => {
      const next = [entry, ...current.filter((item) => item.documentId !== entry.documentId)].slice(0, 8);
      localStorage.setItem('legal-recent-analyses', JSON.stringify(next));
      return next;
    });
  };

  const refreshHistory = async (documentId) => {
    if (!documentId) {
      return;
    }
    try {
      const history = await getHistory(documentId);
      setMessages((history.turns || []).map((turn, index) => ({
        id: `${documentId}-${index}`,
        role: turn.role,
        content: turn.content,
        citations: turn.citations || [],
        streaming: false,
      })));
    } catch {
      // Keep local messages if history fetch fails.
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setError('');
    if (!selectedFile) {
      setError('Select a document to analyze.');
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('jurisdiction', jurisdiction);
      const response = await uploadDocument(formData);
      const nextAnalysis = response || {};
      setAnalysis(nextAnalysis);
      setSelectedClause(nextAnalysis.analysis?.summaryPoints?.[0] || '');
      setMessages([]);
      setSimplifiedText(nextAnalysis.analysis?.simpleSummary || '');
      saveRecentAnalysis({
        documentId: nextAnalysis.documentId,
        fileName: nextAnalysis.fileName,
        riskLevel: nextAnalysis.analysis?.riskLevel || 'Unknown',
        riskScore: nextAnalysis.analysis?.riskScore || 0,
        createdAt: new Date().toISOString(),
      });
      await refreshHistory(nextAnalysis.documentId);
    } catch (uploadError) {
      setError(uploadError.response?.data?.message || uploadError.message || 'Failed to analyze the document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCompare = async (event) => {
    event.preventDefault();
    if (!compareOldFile || !compareNewFile) {
      setError('Pick both an old and a new contract to compare them.');
      return;
    }
    setError('');
    setIsComparing(true);
    try {
      const formData = new FormData();
      formData.append('oldFile', compareOldFile);
      formData.append('newFile', compareNewFile);
      formData.append('jurisdiction', jurisdiction);
      const response = await compareDocuments(formData);
      setComparison(response);
    } catch (compareError) {
      setError(compareError.response?.data?.message || compareError.message || 'Contract comparison failed.');
    } finally {
      setIsComparing(false);
    }
  };

  const sendChat = async (rawPrompt) => {
    if (!rawPrompt.trim() || !analysis?.documentId) {
      return;
    }

    const prompt = selectedClause ? `${rawPrompt.trim()}\n\nRelevant clause:\n${selectedClause}` : rawPrompt.trim();
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      citations: [],
      streaming: false,
    };
    const assistantMessageId = crypto.randomUUID();
    const placeholder = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      citations: [],
      streaming: true,
    };

    const outgoingHistory = [...messages, userMessage].map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: new Date().toISOString(),
      citations: message.citations || [],
    }));

    setMessages((current) => [...current, userMessage, placeholder]);
    setChatInput('');

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        documentId: analysis.documentId,
        message: prompt,
        history: outgoingHistory,
        mode: 'copilot',
        jurisdiction,
        messageId: assistantMessageId,
      }));
      return;
    }

    try {
      const data = await chatDocument({
        documentId: analysis.documentId,
        message: prompt,
        history: outgoingHistory,
        mode: 'copilot',
        jurisdiction,
      });
      setMessages((current) => current.map((message) => (message.id === assistantMessageId ? { ...message, content: data?.answer || 'No response available.', citations: data?.citations || [], streaming: false } : message)));
    } catch (fallbackError) {
      setMessages((current) => current.map((message) => (message.id === assistantMessageId ? { ...message, content: fallbackError.message || 'Chat request failed.', streaming: false } : message)));
    }
  };

  const readSummary = () => {
    if (!window.speechSynthesis || !analytics.summaryPoints.length) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(`${analytics.summaryPoints.join('. ')}. Overall risk is ${analytics.riskLevel}.`);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const downloadPdf = () => {
    if (!analysis) {
      return;
    }
    const doc = new jsPDF();
    let y = 18;
    doc.setFillColor(6, 12, 30);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.text('AI Legal Intelligence Report', 14, y);
    y += 12;
    doc.setFontSize(11);
    doc.text([`File: ${analysis.fileName}`, `Risk: ${analytics.riskScore}% (${analytics.riskLevel})`, `Jurisdiction: ${jurisdiction}`, `OCR confidence: ${analytics.ocrConfidence}`], 14, y);
    y += 28;
    doc.setFontSize(12);
    doc.text('Summary Points', 14, y);
    y += 8;
    analytics.summaryPoints.forEach((point) => {
      const lines = doc.splitTextToSize(`- ${point}`, 180);
      doc.text(lines, 14, y);
      y += lines.length * 6;
    });
    doc.save('legal-intelligence-report.pdf');
  };

  const handleQuickPrompt = (prompt) => {
    setChatInput(prompt);
  };

  const heatCells = useMemo(() => {
    const risk = analytics.riskScore || 0;
    return Array.from({ length: 24 }, (_, index) => ({
      value: index < Math.ceil(risk / (100 / 24)) ? analytics.heatScale(risk) : 'rgba(255,255,255,0.05)',
    }));
  }, [analytics]);

  const dashboardTitle = analysis ? `${analysis.fileName} intelligence workspace` : 'AI Legal Intelligence Command Center';

  return (
    <div className="min-h-screen bg-mesh text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1800px] gap-6 px-4 py-4 lg:px-6">
        <aside className="hidden w-[300px] shrink-0 rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl xl:block">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-lg shadow-cyan-500/20">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">Legal Intelligence</p>
              <h1 className="text-lg font-semibold text-white">Analyzer Pro</h1>
            </div>
          </div>

          <nav className="mt-8 space-y-2 text-sm">
            {[
              ['Dashboard', BarChart3],
              ['Upload Center', UploadCloud],
              ['Copilot', Bot],
              ['Comparison', GitCompareIcon],
              ['Graph', FileSearch],
              ['Timeline', CalendarDays],
            ].map(([label, Icon]) => (
              <button key={label} type="button" className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-cyan-400/30 hover:bg-cyan-400/10">
                <span className="flex items-center gap-3"><Icon className="h-4 w-4 text-cyan-300" /> {label}</span>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </button>
            ))}
          </nav>

          <div className="mt-6 rounded-[24px] border border-cyan-400/10 bg-cyan-400/8 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
              <AlertCircle className="h-4 w-4" /> System Status
            </div>
            <p className="mt-3 text-sm text-slate-300">Local-only intelligence stack with fallback OCR, retrieval, comparison, and streaming chat.</p>
          </div>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Recent analyses</p>
            <div className="mt-3 space-y-3">
              {recentUploads.length ? recentUploads.map((item) => (
                <div key={item.documentId} className="rounded-2xl border border-white/10 bg-slate-900/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">{item.fileName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.riskLevel === 'High' ? 'bg-rose-500/15 text-rose-300' : item.riskLevel === 'Moderate' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                      {item.riskScore}%
                    </span>
                  </div>
                </div>
              )) : <p className="text-sm text-slate-500">No analyses yet.</p>}
            </div>
          </div>
        </aside>

        <main className="flex-1 space-y-6 pb-6">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-glow backdrop-blur-2xl"
          >
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-4xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
                  <ShieldAlert className="h-3.5 w-3.5" /> Free local AI stack only
                </div>
                <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">{dashboardTitle}</h2>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                  Upload contracts, compare revisions, inspect clause risk, explore the legal graph, track obligations, and chat with a local copilot powered by ChromaDB, Sentence Transformers, and optional Ollama.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[620px]">
                {[
                  { label: 'Risk Score', value: `${analytics.riskScore}%`, tone: 'from-rose-500 to-orange-500' },
                  { label: 'OCR Confidence', value: `${analytics.ocrConfidence}`, tone: 'from-cyan-500 to-sky-500' },
                  { label: 'Clause Tags', value: analytics.clauseTags.length, tone: 'from-violet-500 to-fuchsia-500' },
                  { label: 'Timeline Items', value: analytics.timeline.length, tone: 'from-emerald-500 to-teal-500' },
                ].map((card) => (
                  <div key={card.label} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{card.label}</p>
                    <div className={`mt-3 inline-flex rounded-2xl bg-gradient-to-r ${card.tone} px-3 py-2 text-lg font-semibold text-white shadow-lg`}>
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          {error ? (
            <div className="flex items-center gap-3 rounded-[22px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                    <UploadCloud className="h-4 w-4" /> Upload Center
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-white">Analyze, compare, and inspect locally</h3>
                </div>
                <button type="button" onClick={downloadPdf} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
                  <Download className="h-4 w-4" /> Export PDF
                </button>
              </div>

              <form onSubmit={handleUpload} className="mt-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                  <label className="rounded-[24px] border border-dashed border-cyan-400/20 bg-cyan-400/5 p-5 transition hover:border-cyan-400/40 hover:bg-cyan-400/10">
                    <input type="file" accept=".pdf,.docx,.txt" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} className="sr-only" />
                    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-3 text-center">
                      <div className="rounded-2xl bg-white/10 p-3">
                        <FileText className="h-6 w-6 text-cyan-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{selectedFile ? selectedFile.name : 'Drop a PDF, DOCX, or TXT contract here'}</p>
                        <p className="mt-1 text-xs text-slate-400">Files stay local and are processed by the Java and Python services on your machine.</p>
                      </div>
                    </div>
                  </label>

                  <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Jurisdiction</label>
                    <select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none">
                      {['Global', 'India', 'USA', 'EU'].map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <button type="submit" disabled={isUploading} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:scale-[1.01] disabled:opacity-60">
                      {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                      {isUploading ? 'Analyzing document...' : 'Analyze document'}
                    </button>
                  </div>
                </div>
              </form>

              <form onSubmit={handleCompare} className="mt-6 space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  <Github className="h-4 w-4" /> Contract comparison workspace
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="rounded-2xl border border-white/10 bg-slate-900/90 p-4">
                    <span className="block text-xs uppercase tracking-[0.18em] text-slate-400">Old contract</span>
                    <input type="file" accept=".pdf,.docx,.txt" onChange={(event) => setCompareOldFile(event.target.files?.[0] || null)} className="mt-3 w-full text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-400/15 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cyan-200" />
                  </label>
                  <label className="rounded-2xl border border-white/10 bg-slate-900/90 p-4">
                    <span className="block text-xs uppercase tracking-[0.18em] text-slate-400">New contract</span>
                    <input type="file" accept=".pdf,.docx,.txt" onChange={(event) => setCompareNewFile(event.target.files?.[0] || null)} className="mt-3 w-full text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-400/15 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cyan-200" />
                  </label>
                </div>
                <button type="submit" disabled={isComparing} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60">
                  {isComparing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />} Compare contracts
                </button>
              </form>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { title: 'Risk meter', value: `${analytics.riskScore}%`, caption: analytics.riskLevel, tone: analytics.riskScore > 69 ? 'rose' : analytics.riskScore > 39 ? 'amber' : 'emerald' },
                  { title: 'Summary mode', value: analysis ? 'Live' : 'Waiting', caption: analysis ? 'Document analyzed locally' : 'Upload to begin', tone: 'cyan' },
                  { title: 'Streaming chat', value: socketState, caption: 'WebSocket copilot channel', tone: 'indigo' },
                  { title: 'OCR path', value: analytics.ocrRecommended ? 'Enabled' : 'Not needed', caption: `${analytics.ocrConfidence} confidence`, tone: 'violet' },
                ].map((metric) => (
                  <div key={metric.title} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{metric.title}</p>
                    <p className={`mt-2 text-2xl font-semibold ${metric.tone === 'rose' ? 'text-rose-300' : metric.tone === 'amber' ? 'text-amber-300' : metric.tone === 'emerald' ? 'text-emerald-300' : metric.tone === 'indigo' ? 'text-indigo-300' : metric.tone === 'violet' ? 'text-violet-300' : 'text-cyan-300'}`}>{metric.value}</p>
                    <p className="mt-2 text-sm text-slate-400">{metric.caption}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {analytics.summaryPoints.slice(0, 4).map((point) => (
                  <div key={point} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-200">{point}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Risk heatmap</p>
                    <h4 className="mt-2 text-base font-semibold text-white">Clause intensity view</h4>
                  </div>
                  <button type="button" onClick={readSummary} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
                    <Bot className="h-4 w-4" /> Listen
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-6 gap-2 md:grid-cols-8 xl:grid-cols-12">
                  {heatCells.map((cell, index) => (
                    <div key={index} className="h-8 rounded-xl border border-white/5" style={{ background: cell.value }} />
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">The heatmap is generated locally with D3 scales from clause risk density.</p>
              </div>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Extracted text preview</p>
                <div className="mt-3 max-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm leading-7 text-slate-300">
                  {(analysis?.analysis?.text || '').split(/\r?\n/).slice(0, 120).map((line, index) => (
                    <div key={`${index}-${line.slice(0, 24)}`} className="flex gap-3">
                      <span className="w-8 shrink-0 text-right text-xs text-slate-500">{index + 1}</span>
                      <span className="flex-1">{line || ' '}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Plain-language summary</p>
                <p className="mt-3 text-sm leading-7 text-slate-200">{simplifiedText || analytics.simpleSummary || 'A simplified explanation will appear after analysis.'}</p>
              </div>
            </motion.section>

            <AssistantDock
              messages={messages}
              input={chatInput}
              onInputChange={setChatInput}
              onSend={() => sendChat(chatInput)}
              isConnected={socketState === 'connected'}
              selectedClause={selectedClause}
              onQuickPrompt={handleQuickPrompt}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <GraphPanel graph={analysis?.analysis?.graph || comparison?.result?.graph || null} onSelectClause={setSelectedClause} />
            <TimelinePanel timeline={analysis?.analysis?.timeline || []} obligations={analysis?.analysis?.obligations || []} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ComparisonPanel comparison={comparison} />
            <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                    <FileSearch className="h-4 w-4" /> Insights & QA
                  </div>
                  <h2 className="mt-2 text-lg font-semibold text-white">Clause facts, warnings, and smart Q&A</h2>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(analytics.qa).map(([question, answer]) => (
                  <div key={question} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{question}</p>
                    <p className="mt-2 text-sm text-slate-200">{answer}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                  <Sparkles className="h-4 w-4 text-cyan-300" /> Key extracted facts
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-900/80 p-4 text-xs leading-6 text-slate-300">{JSON.stringify(analytics.facts, null, 2)}</pre>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function GitCompareIcon(props) {
  return <BarChart3 {...props} />;
}

export default Dashboard;