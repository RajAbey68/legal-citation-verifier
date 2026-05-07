'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

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

export default function NewRunPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [chapter, setChapter] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }
    setLoading(true);
    setError('');

    const form = new FormData();
    form.append('chapter', String(chapter));
    form.append('file', file);

    const res = await fetch('/api/ghostwriter/runs', { method: 'POST', body: form });
    const json = await res.json();

    if (!res.ok) { setError(json.error ?? 'Upload failed.'); setLoading(false); return; }
    router.push(`/ghostwriter/${json.runId}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm w-full max-w-lg p-8">
        <a href="/ghostwriter" className="text-sm text-gray-500 hover:text-gray-900">← Dashboard</a>
        <h1 className="text-xl font-semibold text-gray-900 mt-4 mb-6">New pipeline run</h1>

        <form onSubmit={submit} className="space-y-6">
          {/* Chapter selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Chapter</label>
            <select
              value={chapter}
              onChange={(e) => setChapter(parseInt(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {Object.entries(CHAPTER_LABELS).map(([n, label]) => (
                <option key={n} value={n}>Ch {n} — {label}</option>
              ))}
            </select>
          </div>

          {/* File drop zone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Draft document</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.doc,.txt,.md"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-2xl mb-2">📄</p>
                  <p className="text-sm text-gray-600">Drop your .docx draft here, or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">.docx, .doc, .txt, .md</p>
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || !file}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {loading ? 'Uploading…' : 'Start pipeline →'}
          </button>
        </form>
      </div>
    </div>
  );
}
