'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

type StageStatus = 'pending' | 'running' | 'complete' | 'error';

interface Stage {
  name: string;
  label: string;
  description: string;
  status: StageStatus;
  words?: number;
  error?: string;
}

const STAGES: Omit<Stage, 'status'>[] = [
  { name: 'gemini',     label: 'Citation Depth',  description: 'Classifies every claim Tier 1/2/3 and flags missing sources' },
  { name: 'perplexity', label: 'Perplexity',       description: 'Currency check — live web search, regulations still in force?' },
  { name: 'grok',       label: 'Grok',             description: 'Critical challenge — stress-tests practitioner claims' },
  { name: 'chatgpt',    label: 'ChatGPT',          description: 'Editorial pass — voice compliance, kill list, coherence' },
  { name: 'foureyes',   label: 'Four-Eyes',        description: 'Gate report — final compliance summary' },
];

const STATUS_ICON: Record<StageStatus, string> = {
  pending: '○',
  running: '◐',
  complete: '●',
  error: '✕',
};

const STATUS_COLOR: Record<StageStatus, string> = {
  pending:  'text-gray-300',
  running:  'text-blue-500 animate-pulse',
  complete: 'text-green-500',
  error:    'text-red-500',
};

const CHAPTER_LABELS: Record<number, string> = {
  1: 'The AI Readiness Audit',
  2: 'The Pricing Paradox',
  3: 'The 90-Day Pilot',
  4: 'The Safety Scaffolding',
  5: 'The Technology Stack',
  6: 'The Partnership Conversation',
  7: 'The Legal Framework',
  8: 'The Governance Model',
  9: 'The EU AI Act Roadmap',
  10: 'The Delivery Engine',
  11: 'The Change Management',
  12: 'The First Year Forward',
};

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const [stages, setStages] = useState<Stage[]>(
    STAGES.map((s) => ({ ...s, status: 'pending' }))
  );
  const [done, setDone] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [chapter, setChapter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const startedRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);

  // On mount: check existing run status first
  useEffect(() => {
    if (!id) return;

    fetch(`/api/ghostwriter/runs/${id}`)
      .then(r => r.json())
      .then(({ run, stages: savedStages }) => {
        if (!run) return;
        setChapter(run.chapter);

        const isFinished = run.status === 'complete' || run.status === 'blocked';

        if (isFinished && savedStages?.length) {
          // Restore completed stage states from DB — no SSE needed
          setStages(prev => prev.map(s => {
            const saved = savedStages.find((ss: { stage: string; status: string; output?: string }) => ss.stage === s.name);
            if (!saved) return s;
            return {
              ...s,
              status: saved.status as StageStatus,
              words: saved.output ? saved.output.split(/\s+/).length : undefined,
            };
          }));
          setDone(true);
          setBlocked(run.is_blocked ?? false);
          setLoading(false);
          return; // Don't open EventSource
        }

        setLoading(false);

        // Only open SSE stream if run hasn't completed yet
        if (startedRef.current) return;
        startedRef.current = true;

        const es = new EventSource(`/api/ghostwriter/runs/${id}/stream`);
        esRef.current = es;

        es.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.stage === 'start') return;
          if (msg.stage === 'done') {
            setDone(true);
            setBlocked(msg.isBlocked ?? false);
            es.close();
            return;
          }
          setStages(prev =>
            prev.map(s =>
              s.name === msg.stage
                ? { ...s, status: msg.status, words: msg.words, error: msg.error }
                : s
            )
          );
        };

        es.onerror = () => es.close();
      })
      .catch(() => setLoading(false));

    return () => esRef.current?.close();
  }, [id]);

  async function downloadReport() {
    const res = await fetch(`/api/ghostwriter/runs/${id}/report`);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="(.+?)"/);
    const filename = match?.[1] ?? `FourEyes-${id.slice(0, 8)}.md`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const chapterTitle = chapter ? CHAPTER_LABELS[chapter] : '';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <a href="/ghostwriter" className="text-sm text-gray-500 hover:text-gray-900">← Dashboard</a>
        <span className="text-gray-300">|</span>
        <div>
          <h1 className="text-base font-semibold text-gray-900">
            {chapter ? `Chapter ${chapter} — ${chapterTitle}` : 'Pipeline run'}
          </h1>
          <span className="font-mono text-xs text-gray-400">{id?.slice(0, 8)}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        {loading ? (
          <div className="text-center text-gray-400 py-20 text-sm">Loading…</div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
              {stages.map((stage) => (
                <div key={stage.name} className="px-6 py-5 flex items-start gap-4">
                  <span className={`text-xl mt-0.5 font-mono ${STATUS_COLOR[stage.status]}`}>
                    {STATUS_ICON[stage.status]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{stage.label}</p>
                      {stage.status === 'running' && (
                        <span className="text-xs text-blue-600 animate-pulse">Running…</span>
                      )}
                      {stage.status === 'complete' && stage.words !== undefined && (
                        <span className="text-xs text-gray-400">{stage.words.toLocaleString()} words</span>
                      )}
                      {stage.status === 'error' && (
                        <span className="text-xs text-red-500">{stage.error}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{stage.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {done && (
              <div className={`mt-6 rounded-xl border px-6 py-5 ${blocked ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                <p className={`text-sm font-semibold ${blocked ? 'text-red-700' : 'text-green-700'}`}>
                  {blocked ? '🔴 Pipeline blocked — review required before delivery' : '🟡 Pipeline complete — human gate required'}
                </p>
                <p className={`text-xs mt-1 ${blocked ? 'text-red-600' : 'text-green-600'}`}>
                  {blocked
                    ? 'Blocking conditions were detected. Review the Four-Eyes report.'
                    : 'No automatic blocks. Author must approve before chapter proceeds.'}
                </p>
                <button
                  onClick={downloadReport}
                  className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  ↓ Download Four-Eyes report{chapter ? ` — Ch ${chapter}` : ''}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
