import Link from 'next/link';
import { createClient, createServiceClient } from '../../lib/supabase/server';

interface Run {
  id: string;
  chapter: number;
  filename: string | null;
  word_count: number | null;
  status: string;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  is_blocked: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-gray-100 text-gray-600',
  running:  'bg-blue-100 text-blue-700',
  complete: 'bg-green-100 text-green-700',
  blocked:  'bg-red-100 text-red-700',
};

export default async function GhostwriterDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const service = createServiceClient();
  const { data: runs } = await (service as ReturnType<typeof createServiceClient>)
    .from('ghostwriter_runs')
    .select('id, chapter, filename, word_count, status, created_by, created_at, completed_at, is_blocked')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✍️</span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Ghostwriter</h1>
            <p className="text-xs text-gray-500">The Digital Law Firm — multi-LLM review pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <Link
            href="/ghostwriter/new"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            + New run
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Pipeline runs</h2>

        {!runs?.length ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">📄</p>
            <p className="text-sm">No runs yet. Upload a chapter draft to start.</p>
            <Link href="/ghostwriter/new" className="mt-4 inline-block text-sm text-gray-900 underline">
              Start first run →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Chapter</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">File</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Words</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">By</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Started</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(runs as Run[]).map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">Ch {run.chapter}</td>
                    <td className="px-4 py-3 text-gray-600 truncate max-w-[180px]">{run.filename ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{run.word_count?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[run.status] ?? STATUS_STYLES.pending}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-[140px]">{run.created_by?.split('@')[0] ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(run.created_at).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-3">
                      <Link href={`/ghostwriter/${run.id}`} className="text-gray-900 hover:underline font-medium">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
