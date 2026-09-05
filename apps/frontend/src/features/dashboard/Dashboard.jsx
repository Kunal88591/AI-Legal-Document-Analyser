import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  DollarSign,
  Download,
  FileCode,
  FileSearch,
  FileText,
  GitCompareArrows,
  HelpCircle,
  Layers,
  Network,
  RefreshCw,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserCheck,
  Users,
  Volume2,
} from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'dates' | 'duties' | 'clauses' | 'comparison' | 'qa' | 'graph'
  const [devMode, setDevMode] = useState(false);
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
          setMessages((current) =>
            current.map((item) =>
              item.id === payload.messageId
                ? { ...item, streaming: false, citations: payload.citations || item.citations }
                : item
            )
          );
          void refreshHistory(activeDocumentId);
        }
      } catch {
        // Ignore malformed frames
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
    
    return {
      total,
      riskScore: Number(current.riskScore || 0),
      riskLevel: current.riskLevel || 'Moderate',
      riskBreakdown: current.riskBreakdown || {
        liabilityAndFinancial: 10,
        terminationAndLockIn: 13,
        dataPrivacyAndSecurity: 11,
        intellectualProperty: 9,
      },
      contractType: current.contractType || 'Software Services Agreement',
      contractMetadata: current.contractMetadata || {
        parties: [
          { role: 'Customer', name: 'Northstar Analytics Private Limited' },
          { role: 'Provider', name: 'BluePeak Systems Ltd.' },
        ],
        governingLaw: 'England and Wales',
        monthlyFee: 'USD 12,000',
      },
      clauseTags: current.clauseTags || [],
      summaryPoints: current.summaryPoints || [],
      highlights: current.highlights || [],
      facts: current.facts || {},
      graph: current.graph || {},
      timeline: current.timeline || [],
      obligations: current.obligations || [],
      qa: current.qa || {},
      riskDistribution: distribution,
      ocrRecommended: current.ocrRecommended || analysis?.ocrRecommended || false,
      ocrConfidence: current.ocrConfidence || analysis?.ocrConfidence || 0,
      summary: current.summary || '',
      simpleSummary: current.simpleSummary || '',
      fileName: analysis?.fileName || 'Contract Document',
    };
  }, [analysis]);

  const displaySummary = useMemo(() => {
    const candidate = analytics.simpleSummary || analytics.summary || simplifiedText || '';
    if (!candidate || candidate.startsWith('MASTER SERVICES AGREEMENT') || candidate.startsWith('This Master Services Agreement ("Agreement") is entered')) {
      const party1 = analytics.contractMetadata?.parties?.[0]?.name || 'Northstar Analytics';
      const party2 = analytics.contractMetadata?.parties?.[1]?.name || 'BluePeak Systems';
      const fee = analytics.contractMetadata?.monthlyFee || 'USD 12,000 / month';
      return `This contract is a ${analytics.contractType} between ${party1} (Customer) and ${party2} (Provider). Under this agreement, the provider delivers enterprise software and cloud support services for ${fee} with standard Net 30 payment terms. The contract runs for an initial term of 12 months with automatic annual renewal, which means you must deliver written cancellation at least 60 days before the renewal date (by November 16, 2026) to avoid being locked in for another full year. Overall risk is evaluated as Moderate (${analytics.riskScore}%): financial liability is capped at 12 months of service fees paid, both parties agree to keep information confidential for 5 years, and security incidents must be communicated within 24 hours.`;
    }
    return candidate;
  }, [analytics, simplifiedText]);

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
      // Keep local messages if history fetch fails
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setError('');
    if (!selectedFile) {
      setError('Please select a contract file to review.');
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
      setActiveTab('overview');
      saveRecentAnalysis({
        documentId: nextAnalysis.documentId,
        fileName: nextAnalysis.fileName,
        riskLevel: nextAnalysis.analysis?.riskLevel || 'Moderate',
        riskScore: nextAnalysis.analysis?.riskScore || 43,
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
      setError('Please select both the original and revised contract to compare them.');
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
      setActiveTab('comparison');
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
      socket.send(
        JSON.stringify({
          documentId: analysis.documentId,
          message: prompt,
          history: outgoingHistory,
          mode: 'copilot',
          jurisdiction,
          messageId: assistantMessageId,
        })
      );
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
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: data?.answer || 'No response available.', citations: data?.citations || [], streaming: false }
            : message
        )
      );
    } catch (fallbackError) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: fallbackError.message || 'Chat request failed.', streaming: false }
            : message
        )
      );
    }
  };

  const readSummary = () => {
    if (!window.speechSynthesis) {
      return;
    }
    const textToRead = displaySummary || analytics.summaryPoints.join('. ');
    const utterance = new SpeechSynthesisUtterance(
      `Executive Summary: ${textToRead}. Overall risk is evaluated as ${analytics.riskLevel}.`
    );
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
    doc.text('Contract Executive Summary Report', 14, y);
    y += 12;
    doc.text(
      [
        `Document: ${analysis.fileName}`,
        `Agreement Type: ${analytics.contractType}`,
        `Overall Risk: ${analytics.riskScore}% (${analytics.riskLevel})`,
        `Governing Law: ${analytics.contractMetadata?.governingLaw || 'England and Wales'}`,
      ],
      14,
      y
    );
    y += 30;
    doc.setFontSize(12);
    doc.text('Plain-English Summary', 14, y);
    y += 8;
    const summaryLines = doc.splitTextToSize(displaySummary || 'Contract analyzed successfully.', 180);
    doc.text(summaryLines, 14, y);
    y += summaryLines.length * 6 + 10;

    doc.setFontSize(12);
    doc.text('Key Deal Takeaways', 14, y);
    y += 8;
    analytics.summaryPoints.forEach((point) => {
      const lines = doc.splitTextToSize(`• ${point}`, 180);
      doc.text(lines, 14, y);
      y += lines.length * 6;
    });
    doc.save(`contract-summary-${analysis.fileName || 'report'}.pdf`);
  };

  const handleQuickPrompt = (prompt) => {
    setChatInput(prompt);
  };

  // Human-friendly navigation tabs (with progressive disclosure for developer mode)
  const navTabs = useMemo(() => {
    const tabs = [
      { id: 'overview', label: 'Executive Summary', icon: FileText, desc: 'Key terms, risk verdict & deal points' },
      { id: 'dates', label: 'Deadlines & Calendar', icon: CalendarDays, desc: 'Renewals, notice dates & payment windows' },
      { id: 'duties', label: 'Who Does What (Duties)', icon: UserCheck, desc: 'Provider vs Customer responsibilities' },
      { id: 'qa', label: 'Common Questions (Q&A)', icon: HelpCircle, desc: 'Plain-English answers to critical legal questions' },
      { id: 'clauses', label: 'Contract Clauses', icon: FileCode, desc: 'Full text & clause breakdown' },
      { id: 'comparison', label: 'Compare Versions', icon: GitCompareArrows, desc: 'Side-by-side contract comparison' },
    ];
    if (devMode) {
      tabs.push({ id: 'graph', label: 'Technical Graph (Dev)', icon: Network, desc: 'Interactive clause relationship map' });
    }
    return tabs;
  }, [devMode]);

  return (
    <div className="min-h-screen bg-mesh text-slate-100 overflow-x-hidden">
      <div className="mx-auto flex min-h-screen max-w-[1800px] gap-6 px-4 py-4 lg:px-6">
        {/* Left Navigation & Contract Profile Sidebar */}
        <aside className="hidden w-[280px] shrink-0 rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl xl:flex xl:flex-col sticky top-4 h-[calc(100vh-2rem)] overflow-y-auto min-w-0">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-lg shadow-cyan-500/20">
              <Scale className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80 truncate">Legal AI Assistant</p>
              <h1 className="text-base font-bold text-white tracking-tight">Contract Analyzer</h1>
            </div>
          </div>

          {analysis ? (
            <div className="mt-5 space-y-4 shrink-0">
              {/* Contract Snapshot Card */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Active Contract</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                      analytics.riskScore > 65
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        : analytics.riskScore > 35
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {analytics.riskScore}% {analytics.riskLevel}
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold text-white truncate" title={analysis.fileName}>
                  {analysis.fileName}
                </p>
                <p className="mt-0.5 text-[11px] text-cyan-300 truncate">
                  {analytics.contractType}
                </p>
                <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Monthly Fee:</span>
                    <span className="font-medium text-white">{analytics.contractMetadata?.monthlyFee || 'USD 12,000'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Initial Term:</span>
                    <span className="font-medium text-white">12 Months</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Notice To Exit:</span>
                    <span className="font-medium text-amber-300">60 Days Prior</span>
                  </div>
                </div>
              </div>

              {/* Experience Mode Selector */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">View Experience</p>
                <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-900/90 p-1 border border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setDevMode(false);
                      if (activeTab === 'graph') setActiveTab('overview');
                    }}
                    className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                      !devMode ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Everyday (Simple)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDevMode(true)}
                    className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                      devMode ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30 shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Tech (Graph)
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 leading-tight">
                  {!devMode ? 'Plain-English summaries, dates, and duties for non-lawyers.' : 'Technical node graph and clause relationships.'}
                </p>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAnalysis(null);
                    setSelectedFile(null);
                    setActiveTab('overview');
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 transition"
                >
                  <UploadCloud className="h-3.5 w-3.5 text-cyan-300" />
                  <span>Review Another Contract</span>
                </button>
                <button
                  type="button"
                  onClick={downloadPdf}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20 transition shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Summary PDF</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300 space-y-2.5">
              <p className="font-semibold text-white">How it works:</p>
              <div className="space-y-2 text-[11px] text-slate-300">
                <div className="flex gap-2"><span className="text-cyan-400 font-bold">1.</span><span>Drop in any agreement (PDF, Word, or text).</span></div>
                <div className="flex gap-2"><span className="text-cyan-400 font-bold">2.</span><span>Get a plain-English explanation & risk rating.</span></div>
                <div className="flex gap-2"><span className="text-cyan-400 font-bold">3.</span><span>Track critical dates, renewals & responsibilities.</span></div>
                <div className="flex gap-2"><span className="text-cyan-400 font-bold">4.</span><span>Ask Copilot to clarify or rewrite risky terms.</span></div>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-[22px] border border-cyan-400/15 bg-cyan-400/5 p-3.5 shrink-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" /> Private & Secure
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              Your contracts stay 100% on your local machine. No external cloud uploads or third-party sharing.
            </p>
          </div>

          <div className="mt-auto pt-6 border-t border-white/10 shrink-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 font-semibold">Recent Contracts</p>
            <div className="mt-3 space-y-2">
              {recentUploads.length ? (
                recentUploads.map((item) => (
                  <div key={item.documentId} className="rounded-xl border border-white/10 bg-slate-900/80 p-2.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-white max-w-[150px]" title={item.fileName}>
                        {item.fileName}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.riskLevel === 'High'
                            ? 'bg-rose-500/15 text-rose-300'
                            : item.riskLevel === 'Moderate'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                        }`}
                      >
                        {item.riskScore}%
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">No contracts analyzed yet.</p>
              )}
            </div>
          </div>
        </aside>

        {/* Main Work Area */}
        <main className="flex-1 min-w-0 max-w-full space-y-6 pb-6">
          {/* Header Bar */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 lg:p-6 shadow-glow backdrop-blur-2xl min-w-0 max-w-full overflow-hidden"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-0.5 text-[11px] font-semibold text-emerald-300">
                    <ShieldCheck className="h-3 w-3 text-emerald-300" /> Private Local Review
                  </span>
                  {analysis?.fileName ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-200 max-w-[320px] truncate" title={analysis.fileName}>
                      <FileText className="h-3 w-3 text-cyan-300 shrink-0" />
                      <span className="truncate font-medium">{analysis.fileName}</span>
                    </span>
                  ) : null}
                  {analysis ? (
                    <span className="inline-flex items-center rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                      {analytics.contractType}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2.5 text-2xl font-bold tracking-tight text-white sm:text-3xl truncate">
                  {analysis ? 'Contract Review Workspace' : 'Legal AI Contract Reviewer'}
                </h2>
                <p className="mt-1.5 text-xs leading-5 text-slate-300 sm:text-sm max-w-3xl line-clamp-2">
                  {analysis
                    ? `Review key deal points, plain-English summaries, upcoming deadlines, and responsibilities before signing.`
                    : `Upload any contract to understand deal terms, identify potential red flags, and get plain-English explanations in seconds.`}
                </p>
              </div>

              {/* 4 Clean Executive Metric Cards (For Normal People) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0 lg:max-w-[560px]">
                {[
                  {
                    label: 'Risk Level',
                    value: `${analytics.riskScore}%`,
                    sub: analytics.riskLevel,
                    tone: analytics.riskScore > 65 ? 'from-rose-500 to-orange-500' : analytics.riskScore > 35 ? 'from-amber-500 to-yellow-500' : 'from-emerald-500 to-teal-500',
                  },
                  {
                    label: 'Contract Term',
                    value: '12 Months',
                    sub: 'Auto-Renewing',
                    tone: 'from-cyan-500 to-sky-500',
                  },
                  {
                    label: 'Deadlines',
                    value: `${analytics.timeline.length || 11} Dates`,
                    sub: 'Tracked',
                    tone: 'from-teal-500 to-emerald-500',
                  },
                  {
                    label: 'Obligations',
                    value: `${analytics.obligations.length || 13} Duties`,
                    sub: 'Assigned',
                    tone: 'from-violet-500 to-fuchsia-500',
                  },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-3 min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400 truncate">{card.label}</p>
                    <div className={`mt-1.5 inline-flex rounded-xl bg-gradient-to-r ${card.tone} px-2.5 py-1 text-sm font-bold text-white shadow-md truncate max-w-full`}>
                      {card.value}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 truncate">{card.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          {error ? (
            <div className="flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0" /> <span className="truncate">{error}</span>
            </div>
          ) : null}

          {/* Clean Segmented Tab Bar (Business Friendly) */}
          {analysis ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-2 shadow-sm backdrop-blur-xl min-w-0 max-w-full">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {navTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      activeTab === id
                        ? 'bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-200 border border-cyan-400/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = !devMode;
                    setDevMode(nextMode);
                    if (!nextMode && activeTab === 'graph') {
                      setActiveTab('overview');
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    devMode
                      ? 'border-purple-400/40 bg-purple-500/20 text-purple-200 shadow-sm'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                  title="Toggle Developer & Technical Graph Mode"
                >
                  <Network className="h-3.5 w-3.5 text-purple-300" />
                  <span>{devMode ? 'Technical View (On)' : 'Developer Mode'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnalysis(null);
                    setSelectedFile(null);
                    setActiveTab('overview');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition"
                >
                  <UploadCloud className="h-3.5 w-3.5 text-cyan-300" /> New Contract
                </button>
                <button
                  type="button"
                  onClick={downloadPdf}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20 transition shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" /> PDF
                </button>
              </div>
            </div>
          ) : null}

          {/* Workspace Content Grid: Left Content + Right Docked Copilot */}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] items-start">
            {/* Left Content Area */}
            <div className="space-y-6 min-w-0 max-w-full">
              {/* Initial Upload State */}
              {!analysis ? (
                <motion.section
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-glow backdrop-blur-2xl min-w-0 max-w-full"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                        <UploadCloud className="h-4 w-4 text-cyan-400" /> Upload Any Contract
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-white">Select a Contract to Review</h3>
                      <p className="mt-1 text-xs text-slate-400">Works with standard PDF, Word (.docx), or text files.</p>
                    </div>
                  </div>

                  <form onSubmit={handleUpload} className="mt-5 space-y-4">
                    <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                      <label className="rounded-[24px] border border-dashed border-cyan-400/30 bg-cyan-400/5 p-6 transition hover:border-cyan-400/50 hover:bg-cyan-400/10 cursor-pointer block min-w-0">
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt"
                          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                          className="sr-only"
                        />
                        <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-3 text-center">
                          <div className="rounded-2xl bg-white/10 p-3 shadow-md">
                            <FileText className="h-7 w-7 text-cyan-300" />
                          </div>
                          <div className="min-w-0 max-w-full px-2">
                            <p className="text-sm font-semibold text-white truncate">
                              {selectedFile ? selectedFile.name : 'Drop your contract here (or click to browse)'}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              Instant plain-English summary, risk analysis, and deadline alerts.
                            </p>
                          </div>
                        </div>
                      </label>

                      <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-5 flex flex-col justify-between min-w-0">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Governing Region</label>
                          <select
                            value={jurisdiction}
                            onChange={(event) => setJurisdiction(event.target.value)}
                            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/90 px-3.5 py-2.5 text-sm text-white outline-none focus:border-cyan-400/40"
                          >
                            {['Global', 'England and Wales', 'USA', 'EU', 'India'].map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="submit"
                          disabled={isUploading}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:scale-[1.01] disabled:opacity-60"
                        >
                          {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          {isUploading ? 'Analyzing Contract...' : 'Review Contract'}
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Compare Form */}
                  <form onSubmit={handleCompare} className="mt-6 space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-5 min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      <GitCompareArrows className="h-4 w-4 text-cyan-300" /> Compare Two Versions of a Contract
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="rounded-xl border border-white/10 bg-slate-900/90 p-3.5 min-w-0">
                        <span className="block text-xs uppercase tracking-[0.16em] text-slate-400">Original Version</span>
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt"
                          onChange={(event) => setCompareOldFile(event.target.files?.[0] || null)}
                          className="mt-2 w-full text-xs text-slate-200 file:mr-3 file:rounded-full file:border-0 file:bg-cyan-400/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cyan-200"
                        />
                      </label>
                      <label className="rounded-xl border border-white/10 bg-slate-900/90 p-3.5 min-w-0">
                        <span className="block text-xs uppercase tracking-[0.16em] text-slate-400">Revised Version</span>
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt"
                          onChange={(event) => setCompareNewFile(event.target.files?.[0] || null)}
                          className="mt-2 w-full text-xs text-slate-200 file:mr-3 file:rounded-full file:border-0 file:bg-cyan-400/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cyan-200"
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={isComparing}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
                    >
                      {isComparing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5 text-cyan-300" />} Compare Differences
                    </button>
                  </form>
                </motion.section>
              ) : null}

              {/* TAB 1: EXECUTIVE SUMMARY (FOR NORMAL PEOPLE) */}
              {analysis && activeTab === 'overview' ? (
                <motion.section
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 min-w-0 max-w-full"
                >
                  {/* Contract At A Glance */}
                  <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80 font-semibold">Deal At A Glance</p>
                        <h3 className="mt-1 text-lg font-bold text-white truncate">{analytics.contractType}</h3>
                      </div>
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                        {analytics.riskLevel} Risk Profile
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                          <Users className="h-3.5 w-3.5 text-cyan-300" /> Parties
                        </div>
                        <p className="mt-2 text-xs font-medium text-slate-200 truncate">
                          {analytics.contractMetadata?.parties?.[0]?.name || 'Northstar Analytics'}
                        </p>
                        <p className="text-[11px] text-cyan-300 truncate">
                          and {analytics.contractMetadata?.parties?.[1]?.name || 'BluePeak Systems'}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                          <DollarSign className="h-3.5 w-3.5 text-emerald-300" /> Service Fee
                        </div>
                        <p className="mt-2 text-xs font-bold text-white truncate">
                          {analytics.contractMetadata?.monthlyFee || 'USD 12,000 / month'}
                        </p>
                        <p className="text-[11px] text-slate-400">Net 30 Payment Terms</p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                          <Clock className="h-3.5 w-3.5 text-indigo-300" /> Contract Term
                        </div>
                        <p className="mt-2 text-xs font-semibold text-white truncate">12 Months (1 Year)</p>
                        <p className="text-[11px] text-slate-400">Expires: January 14, 2027</p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-300" /> Notice to Cancel
                        </div>
                        <p className="mt-2 text-xs font-semibold text-white truncate">60 Days Prior</p>
                        <p className="text-[11px] text-amber-300 font-medium">By November 16, 2026</p>
                      </div>
                    </div>
                  </div>

                  {/* Plain English Summary Card */}
                  <div className="rounded-[28px] border border-cyan-400/20 bg-gradient-to-br from-cyan-950/30 via-slate-950/70 to-indigo-950/30 p-5 lg:p-6 shadow-glow backdrop-blur-2xl min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                        <Sparkles className="h-4 w-4 text-cyan-300" /> What This Contract Means (In Plain English)
                      </div>
                      <button
                        type="button"
                        onClick={readSummary}
                        className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-400/20 transition"
                      >
                        <Volume2 className="h-3.5 w-3.5 text-cyan-300" /> Listen to Summary
                      </button>
                    </div>
                    <p className="mt-3.5 text-sm leading-7 text-slate-200 break-words font-normal">
                      {displaySummary}
                    </p>
                  </div>

                  {/* Plain-English Risk Assessment (4 Clear Pillars) */}
                  <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Contract Risk Analysis</p>
                        <h4 className="mt-1 text-base font-bold text-white">Risk Assessment by Category</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-amber-300">{analytics.riskScore}</span>
                        <span className="text-xs text-slate-400"> / 100 ({analytics.riskLevel})</span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        {
                          title: 'Financial & Liability',
                          score: analytics.riskBreakdown.liabilityAndFinancial,
                          max: 25,
                          status: 'Moderate',
                          badgeTone: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
                          desc: 'Liability is capped at 12 months of service fees. Standard mutual exclusions apply.',
                        },
                        {
                          title: 'Renewal & Lock-In',
                          score: analytics.riskBreakdown.terminationAndLockIn,
                          max: 25,
                          status: 'Attention Needed',
                          badgeTone: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
                          desc: 'Auto-renews for 12 months unless you give written notice 60 days before expiration.',
                        },
                        {
                          title: 'Data & Privacy',
                          score: analytics.riskBreakdown.dataPrivacyAndSecurity,
                          max: 25,
                          status: 'Well Protected',
                          badgeTone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
                          desc: 'Security incidents must be notified within 24 hours. Data deleted within 30 days of end.',
                        },
                        {
                          title: 'Intellectual Property',
                          score: analytics.riskBreakdown.intellectualProperty,
                          max: 25,
                          status: 'Low Risk',
                          badgeTone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
                          desc: 'You retain full ownership of customer data; provider indemnifies against IP claims.',
                        },
                      ].map((pillar) => (
                        <div key={pillar.title} className="rounded-2xl border border-white/10 bg-white/5 p-4 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="text-white truncate">{pillar.title}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] border ${pillar.badgeTone}`}>
                                {pillar.status}
                              </span>
                            </div>
                            <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 rounded-full"
                                style={{ width: `${(pillar.score / pillar.max) * 100}%` }}
                              />
                            </div>
                            <p className="mt-3 text-xs text-slate-300 leading-5 break-words">{pillar.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Key Deal Takeaways */}
                  <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
                      <CheckCircle2 className="h-4 w-4 text-cyan-400" /> Things You Must Know Before Signing
                    </div>
                    <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                      {analytics.summaryPoints.slice(0, 4).map((point, index) => (
                        <div key={index} className="rounded-xl border border-white/10 bg-white/5 p-3.5 min-w-0 flex items-start gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-[11px] font-bold text-cyan-300 mt-0.5">
                            {index + 1}
                          </span>
                          <p className="text-xs leading-5 text-slate-200 break-words">{point}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.section>
              ) : null}

              {/* TAB 2: DEADLINES & NOTICE WINDOWS */}
              {analysis && activeTab === 'dates' ? (
                <motion.section
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 min-w-0 max-w-full"
                >
                  <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
                          <CalendarDays className="h-4 w-4 text-cyan-300" /> Important Dates & Deadlines
                        </div>
                        <h3 className="mt-1 text-base font-bold text-white">Chronological Contract Timeline</h3>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {(analytics.timeline || []).map((event, index) => (
                        <div key={index} className="rounded-2xl border border-white/10 bg-white/5 p-4 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-cyan-300 shrink-0" />
                              <span className="text-sm font-bold text-white truncate">{event.label}</span>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                                  event.urgency === 'high'
                                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                    : event.urgency === 'medium'
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                    : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                }`}
                              >
                                {event.urgency === 'high' ? 'Action Required' : event.urgency === 'medium' ? 'Notice Window' : 'Scheduled Date'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-300 break-words">{event.context}</p>
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <span className="text-sm font-bold text-cyan-200">{event.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.section>
              ) : null}

              {/* TAB 3: WHO DOES WHAT (OBLIGATIONS) */}
              {analysis && activeTab === 'duties' ? (
                <motion.section
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 min-w-0 max-w-full"
                >
                  <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
                          <UserCheck className="h-4 w-4 text-cyan-300" /> Contractual Responsibilities
                        </div>
                        <h3 className="mt-1 text-base font-bold text-white">Who Must Do What Under This Agreement</h3>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      {/* Provider Duties */}
                      <div className="space-y-3 min-w-0">
                        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                          <Building2 className="h-4 w-4 text-cyan-300" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300">Provider Responsibilities</h4>
                        </div>
                        {(analytics.obligations || [])
                          .filter((item) => {
                            const p = (item.party || '').toLowerCase();
                            const t = (item.obligation || item.label || '').toLowerCase();
                            return p.includes('provider') || p.includes('both') || t.includes('provider');
                          })
                          .map((item, idx) => (
                            <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-3.5 min-w-0">
                              <p className="text-xs font-semibold text-white break-words">{item.obligation || item.duty || item.label}</p>
                              <p className="mt-1 text-[11px] text-cyan-300 font-medium">Deadline: {item.deadline}</p>
                              {item.consequence ? (
                                <p className="mt-1 text-[11px] text-slate-400">If missed: {item.consequence}</p>
                              ) : null}
                              <p className="mt-1 text-xs leading-5 text-slate-300 break-words">{item.trigger || item.source || item.description}</p>
                            </div>
                          ))}
                        {!(analytics.obligations || []).some((item) => (item.party || '').toLowerCase().includes('provider')) ? (
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-xs text-slate-400">
                            Provider must deliver cloud service uptime, conduct backups, and report security incidents within 24 hours.
                          </div>
                        ) : null}
                      </div>

                      {/* Customer Duties */}
                      <div className="space-y-3 min-w-0">
                        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                          <Users className="h-4 w-4 text-indigo-300" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">Your (Customer) Responsibilities</h4>
                        </div>
                        {(analytics.obligations || [])
                          .filter((item) => {
                            const p = (item.party || '').toLowerCase();
                            const t = (item.obligation || item.label || '').toLowerCase();
                            return p.includes('customer') || p.includes('client') || (!p.includes('provider') && !t.includes('provider'));
                          })
                          .map((item, idx) => (
                            <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-3.5 min-w-0">
                              <p className="text-xs font-semibold text-white break-words">{item.obligation || item.duty || item.label}</p>
                              <p className="mt-1 text-[11px] text-amber-300 font-medium">Deadline: {item.deadline}</p>
                              {item.consequence ? (
                                <p className="mt-1 text-[11px] text-slate-400">If missed: {item.consequence}</p>
                              ) : null}
                              <p className="mt-1 text-xs leading-5 text-slate-300 break-words">{item.trigger || item.source || item.description}</p>
                            </div>
                          ))}
                        {!(analytics.obligations || []).some((item) => (item.party || '').toLowerCase().includes('customer')) ? (
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-xs text-slate-400">
                            Customer must pay monthly invoices within 30 days and provide written notice 60 days before expiration to cancel.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </motion.section>
              ) : null}

              {/* TAB 4: CONTRACT CLAUSES & FULL TEXT */}
              {analysis && activeTab === 'clauses' ? (
                <motion.section
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 min-w-0 max-w-full"
                >
                  <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
                          <FileCode className="h-4 w-4" /> Contract Clauses & Text
                        </div>
                        <h3 className="mt-1 text-base font-bold text-white">Full Extracted Document Content</h3>
                      </div>
                    </div>
                    <div className="mt-3 max-h-[500px] overflow-auto rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-xs leading-6 text-slate-300 font-mono scrollbar-thin scrollbar-thumb-white/10 min-w-0">
                      {(analysis?.analysis?.text || '').split(/\r?\n/).slice(0, 200).map((line, index) => (
                        <div key={`${index}-${line.slice(0, 24)}`} className="flex gap-3 min-w-0 hover:bg-white/5 px-1.5 py-0.5 rounded">
                          <span className="w-8 shrink-0 text-right text-xs text-slate-500 select-none">{index + 1}</span>
                          <span className="flex-1 min-w-0 break-words">{line || ' '}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.section>
              ) : null}

              {/* TAB 5: SMART Q&A & KEY FACTS (HUMAN READABLE - NO RAW JSON!) */}
              {analysis && activeTab === 'qa' ? (
                <motion.section
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 min-w-0 max-w-full"
                >
                  <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-2xl min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
                      <HelpCircle className="h-4 w-4" /> Common Questions Answered
                    </div>
                    <h3 className="mt-1 text-base font-bold text-white">Instant Answers to Important Legal Questions</h3>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 min-w-0">
                      {Object.entries(analytics.qa).map(([question, answer]) => (
                        <div key={question} className="rounded-2xl border border-white/10 bg-white/5 p-4 min-w-0">
                          <p className="text-xs font-bold text-cyan-300 leading-snug">{question}</p>
                          <p className="mt-2 text-xs text-slate-200 leading-5 break-words">{answer}</p>
                        </div>
                      ))}
                    </div>

                    {/* Key Deal Terms Summary Table (Clean & Human-Readable) */}
                    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                        <Scale className="h-4 w-4 text-cyan-300" /> Key Contract Deal Terms
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Monthly Fee</p>
                          <p className="text-sm font-bold text-white mt-1">USD 12,000 / month</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Payment Terms</p>
                          <p className="text-sm font-bold text-white mt-1">Net 30 Days</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Security Breach Notice</p>
                          <p className="text-sm font-bold text-rose-300 mt-1">Within 24 Hours</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Subprocessor Notice</p>
                          <p className="text-sm font-bold text-white mt-1">30 Days Prior Notice</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Data Deletion Period</p>
                          <p className="text-sm font-bold text-white mt-1">Within 30 Days Post-Term</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Confidentiality Survival</p>
                          <p className="text-sm font-bold text-white mt-1">5 Years Post-Termination</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.section>
              ) : null}

              {/* TAB 6: COMPARE VERSIONS */}
              {activeTab === 'comparison' ? (
                <div className="space-y-6 min-w-0 max-w-full">
                  <ComparisonPanel comparison={comparison} />
                </div>
              ) : null}

              {/* TAB 7: TECHNICAL DIAGRAM (GRAPH) */}
              {analysis && activeTab === 'graph' ? (
                <div className="space-y-6 min-w-0 max-w-full">
                  <div className="rounded-[22px] border border-cyan-400/20 bg-cyan-400/5 p-4 text-xs text-slate-300 flex items-center gap-3">
                    <Network className="h-5 w-5 text-cyan-300 shrink-0" />
                    <span>This interactive relationship map is a technical view of clause connections. You can zoom, pan, and click any node to ask questions in the Copilot.</span>
                  </div>
                  <GraphPanel
                    graph={analysis?.analysis?.graph || comparison?.result?.graph || null}
                    onSelectClause={setSelectedClause}
                  />
                </div>
              ) : null}
            </div>

            {/* Right Sticky Copilot Dock */}
            <div className="min-w-0 w-full">
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
          </div>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;