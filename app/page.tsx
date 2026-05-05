'use client';

import { useState, useRef } from 'react';

type Verdict = 'verified' | 'not_found' | 'partial';
type Mode = 'verify' | 'query' | 'validate';

interface VerifyResult {
  verdict?: Verdict;
  answer: string;
  claim?: string;
  question?: string;
  filename?: string;
  truncated?: boolean;
  error?: string;
}

interface UploadedDoc {
  title: string;
  sourceId: string | null;
  characters: number;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
}

const SOURCE_OPTIONS = [
  { id: 'sra', label: 'SRA (Code of Conduct, Transparency, Technology)' },
  { id: 'fca', label: 'FCA (AML/CTF, OPBAS, Financial Crime, MoU)' },
  { id: 'eu', label: 'EU AI Act 2024/1689 + EUR-Lex' },
  { id: 'lawgazette', label: 'Law Gazette (AI articles)' },
  { id: 'ico', label: 'ICO (AI & Data Protection, Generative AI Hub)' },
  { id: 'lawsociety', label: 'Law Society (Succession, PII, Partnership)' },
  { id: 'iso', label: 'ISO 9001:2015 & ISO 42001:2023 (AI Management)' },
  { id: 'market', label: 'Market Intelligence (Thomson Reuters, Clio Trends)' },
  { id: 'legal_regulation', label: 'Legal Regulation (BSB, CILEx, LSB, Law Soc NI)' },
  { id: 'ncsc', label: 'NCSC (AI Security, Cyber Essentials, Cloud)' },
  { id: 'gov_uk', label: 'UK Government (AI Assurance, Data Ethics, Security)' },
  { id: 'bsi', label: 'BSI Standards (ISO 27001, 27017, 27018, PAS 1885)' },
];

const VERDICT_CONFIG: Record<Verdict, { label: string; bg: string; border: string; icon: string }> = {
  verified: { label: 'VERIFIED', bg: 'bg-green-50', border: 'border-green-400', icon: '✓' },
  not_found: { label: 'NOT FOUND', bg: 'bg-red-50', border: 'border-red-400', icon: '✗' },
  partial: { label: 'PARTIAL', bg: 'bg-amber-50', border: 'border-amber-400', icon: '⚠' },
};

const EXAMPLE_CLAIMS = [
  'Law Gazette 2026: Only 7% of clients recall being told AI was used in their matter',
  'SRA Transparency Rules require firms to publish cost information prominently on their website',
];

export default function Home() {
  const [mode, setMode] = useState<Mode>('verify');
  const [input, setInput] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(['sra', 'fca', 'eu', 'lawgazette', 'ico', 'lawsociety', 'iso', 'market', 'legal_regulation', 'ncsc', 'gov_uk', 'bsi']);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<VerifyResult[]>([]);

  // Source library uploads (add to NotebookLM)
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate mode
  const [validateFile, setValidateFile] = useState<File | null>(null);
  const [validateDragOver, setValidateDragOver] = useState(false);
  const validateInputRef = useRef<HTMLInputElement>(null);
  const [gdocUrl, setGdocUrl] = useState('');

  function toggleSource(id: string) {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  async function uploadToLibrary(file: File) {
    const doc: UploadedDoc = { title: file.name, sourceId: null, characters: 0, status: 'uploading' };
    setUploadedDocs((prev) => [doc, ...prev]);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      setUploadedDocs((prev) =>
        prev.map((d) =>
          d.title === file.name && d.status === 'uploading'
            ? data.error
              ? { ...d, status: 'error', error: data.error }
              : { ...d, status: 'ready', sourceId: data.sourceId, characters: data.characters }
            : d
        )
      );
    } catch {
      setUploadedDocs((prev) =>
        prev.map((d) =>
          d.title === file.name && d.status === 'uploading'
            ? { ...d, status: 'error', error: 'Upload failed' }
            : d
        )
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (mode === 'validate') {
      if (!validateFile && !gdocUrl.trim()) return;
      setLoading(true);
      setResult(null);
      try {
        if (gdocUrl.trim()) {
          const res = await fetch('/api/validate-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: gdocUrl.trim(), sources: selectedSources }),
          });
          const data = await res.json();
          const entry = { answer: data.answer ?? data.error, filename: gdocUrl.trim() };
          setResult(entry);
          setHistory((prev) => [entry, ...prev.slice(0, 9)]);
        } else {
          const form = new FormData();
          form.append('file', validateFile!);
          form.append('sources', JSON.stringify(selectedSources));
          const res = await fetch('/api/validate-doc', { method: 'POST', body: form });
          const data = await res.json();
          setResult({ answer: data.answer ?? data.error, filename: data.filename, truncated: data.truncated });
          setHistory((prev) => [{ answer: data.answer, filename: data.filename }, ...prev.slice(0, 9)]);
        }
      } catch {
        setResult({ answer: '', error: 'Request failed — is the backend running?' });
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const endpoint = mode === 'verify' ? '/api/verify' : '/api/query';
      const body = mode === 'verify'
        ? { claim: input.trim(), sources: selectedSources }
        : { question: input.trim(), sources: selectedSources };
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data: VerifyResult = await res.json();
      setResult(data);
      setHistory((prev) => [data, ...prev.slice(0, 9)]);
    } catch {
      setResult({ answer: '', error: 'Request failed — is the backend running?' });
    } finally {
      setLoading(false);
    }
  }

  const verdictCfg = result?.verdict ? VERDICT_CONFIG[result.verdict] : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Legal Citation Verifier</h1>
            <p className="text-sm text-slate-500 mt-0.5">Powered by NotebookLM · UK Legal Sources</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {SOURCE_OPTIONS.map((s) => (
              <span key={s.id} className={`text-xs px-2 py-1 rounded-full border ${selectedSources.includes(s.id) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-slate-100 border-slate-300 text-slate-400'}`}>
                {s.id.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Mode toggle */}
        <div className="flex gap-1 bg-slate-200 rounded-lg p-1 w-fit">
          {([
            { id: 'verify', label: '✓ Verify Claim' },
            { id: 'query', label: '? Free Query' },
            { id: 'validate', label: '⊙ Validate Document' },
          ] as { id: Mode; label: string }[]).map((m) => (
            <button key={m.id} onClick={() => { setMode(m.id); setResult(null); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === m.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Source selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Check against sources</p>
          <div className="grid grid-cols-2 gap-2">
            {SOURCE_OPTIONS.map((s) => (
              <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={selectedSources.includes(s.id)} onChange={() => toggleSource(s.id)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                <span className="text-sm text-slate-700 group-hover:text-slate-900">{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* VALIDATE DOCUMENT mode */}
        {mode === 'validate' && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${validateDragOver ? 'border-blue-400 bg-blue-50' : validateFile ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-white hover:border-slate-400'}`}
              onClick={() => validateInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setValidateDragOver(true); }}
              onDragLeave={() => setValidateDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setValidateDragOver(false); const f = e.dataTransfer.files[0]; if (f) setValidateFile(f); }}
            >
              {validateFile ? (
                <div>
                  <p className="text-green-700 font-medium text-sm">📄 {validateFile.name}</p>
                  <p className="text-xs text-slate-500 mt-1">Click to change file</p>
                </div>
              ) : (
                <div>
                  <p className="text-slate-600 text-sm">Drop your document here to validate its accuracy</p>
                  <p className="text-xs text-slate-400 mt-1">.docx · .doc · .txt · .md · .rtf — checked against SRA, FCA, EU AI Act sources</p>
                  <p className="text-xs text-slate-400 mt-1">or paste a Google Doc URL below</p>
                </div>
              )}
              <input ref={validateInputRef} type="file" accept=".doc,.docx,.txt,.md,.rtf,.odt,.csv,.html"
                className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setValidateFile(f); }} />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 uppercase tracking-wide">or paste a Google Doc URL</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <input
              type="url"
              value={gdocUrl}
              onChange={(e) => { setGdocUrl(e.target.value); if (e.target.value) setValidateFile(null); }}
              placeholder="https://docs.google.com/document/d/..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button onClick={handleSubmit} disabled={loading || (!validateFile && !gdocUrl.trim()) || selectedSources.length === 0}
              className="w-full py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Validating document…' : 'Validate Document Against UK Legal Sources'}
            </button>
          </div>
        )}

        {/* VERIFY / QUERY mode */}
        {mode !== 'validate' && (
          <form onSubmit={handleSubmit}>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
              <textarea value={input} onChange={(e) => setInput(e.target.value)}
                placeholder={mode === 'verify' ? 'Paste a chapter claim to verify…' : 'Ask a free-form question about UK legal regulation…'}
                rows={4} className="w-full px-4 pt-4 pb-2 text-slate-800 placeholder-slate-400 resize-none outline-none text-sm" />
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <div className="flex gap-3">
                  {mode === 'verify' && EXAMPLE_CLAIMS.map((c, i) => (
                    <button key={i} type="button" onClick={() => setInput(c)}
                      className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2">
                      Example {i + 1}
                    </button>
                  ))}
                </div>
                <button type="submit" disabled={loading || !input.trim() || selectedSources.length === 0}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {loading ? 'Querying…' : mode === 'verify' ? 'Verify' : 'Ask'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Add to library panel (collapsed under verify/query) */}
        {mode !== 'validate' && (
          <details className="bg-white rounded-xl border border-slate-200">
            <summary className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700">
              Add documents to source library
            </summary>
            <div className="px-4 pb-4 space-y-3">
              <div
                className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400'}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); Array.from(e.dataTransfer.files).forEach(uploadToLibrary); }}
              >
                <p className="text-sm text-slate-600">Drop files to add as sources · <span className="text-blue-600 underline">browse</span></p>
                <p className="text-xs text-slate-400 mt-1">.doc · .docx · .gdoc · .txt · .md · .rtf and more</p>
                <input ref={fileInputRef} type="file" accept=".doc,.docx,.gdoc,.txt,.md,.rtf,.odt,.csv,.html" multiple
                  className="hidden" onChange={(e) => Array.from(e.target.files ?? []).forEach(uploadToLibrary)} />
              </div>
              {uploadedDocs.length > 0 && (
                <ul className="space-y-1">
                  {uploadedDocs.map((doc, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      {doc.status === 'uploading' && <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />}
                      {doc.status === 'ready' && <span className="text-green-600 shrink-0">✓</span>}
                      {doc.status === 'error' && <span className="text-red-500 shrink-0">✗</span>}
                      <span className={`truncate ${doc.status === 'error' ? 'text-red-600' : 'text-slate-600'}`}>
                        {doc.title}{doc.status === 'ready' ? ' — added' : doc.status === 'error' ? ` — ${doc.error}` : ' — uploading…'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-slate-600">
              {mode === 'validate' ? 'Validating document against UK legal sources — this takes 30–90 seconds…' : 'Querying NotebookLM — this takes 30–90 seconds…'}
            </p>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div className={`rounded-xl border-2 p-6 space-y-3 ${verdictCfg ? `${verdictCfg.bg} ${verdictCfg.border}` : 'bg-white border-slate-200'}`}>
            {result.filename && (
              <p className="text-xs font-medium text-slate-500">
                Validation report · {result.filename}
                {result.truncated && ' · (document excerpted — first 12,000 characters analysed)'}
              </p>
            )}
            {verdictCfg && (
              <div className="flex items-center gap-3">
                <span className="text-2xl">{verdictCfg.icon}</span>
                <span className={`text-sm font-bold tracking-wide ${result.verdict === 'verified' ? 'text-green-700' : result.verdict === 'not_found' ? 'text-red-700' : 'text-amber-700'}`}>
                  {verdictCfg.label}
                </span>
              </div>
            )}
            {result.error ? (
              <p className="text-red-600 text-sm">{result.error}</p>
            ) : (
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{result.answer}</div>
            )}
          </div>
        )}

        {/* History */}
        {history.length > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Recent queries</p>
            {history.slice(1).map((h, i) => {
              const cfg = h.verdict ? VERDICT_CONFIG[h.verdict] : null;
              return (
                <button key={i} onClick={() => setResult(h)}
                  className="w-full text-left bg-white rounded-lg border border-slate-200 px-4 py-3 hover:border-slate-300 transition-colors">
                  <div className="flex items-center gap-2">
                    {cfg && <span className="text-sm">{cfg.icon}</span>}
                    <span className="text-sm text-slate-700 truncate">{h.filename ? `📄 ${h.filename}` : h.claim || h.question}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
