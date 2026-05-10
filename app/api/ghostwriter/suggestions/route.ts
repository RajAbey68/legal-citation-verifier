import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface SuggestionRow {
  id: string;
  chapter_number: number;
  paragraph_index: number;
  original_text: string;
  suggested_text: string;
  classification: string;
  rationale: string | null;
  source_pipeline: string;
}

interface DecisionRow {
  id: string;
  suggestion_id: string;
  decision: string;
  edited_text: string | null;
  decided_by: string;
  decided_at: string;
  notes: string | null;
}

/**
 * GET /api/ghostwriter/suggestions?chapter=NN
 * Returns suggestions ordered by paragraph_index, each with the existing decision
 * (if any) joined in. Any authenticated whitelisted user may read.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { data: allowed } = await supabase
    .from('allowed_emails')
    .select('email')
    .eq('email', user.email)
    .maybeSingle();
  if (!allowed) {
    return NextResponse.json({ error: 'not_authorised' }, { status: 403 });
  }

  const chapter = req.nextUrl.searchParams.get('chapter');
  if (!chapter) {
    return NextResponse.json({ error: 'chapter query param required' }, { status: 400 });
  }
  const chapterNum = parseInt(chapter, 10);
  if (Number.isNaN(chapterNum) || chapterNum < 1 || chapterNum > 12) {
    return NextResponse.json({ error: 'chapter must be 1-12' }, { status: 400 });
  }

  const { data: suggestions, error: sErr } = await supabase
    .from('chapter_suggestions')
    .select('*')
    .eq('chapter_number', chapterNum)
    .order('paragraph_index');
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const list = (suggestions ?? []) as SuggestionRow[];
  if (list.length === 0) return NextResponse.json({ suggestions: [] });

  const ids = list.map((s) => s.id);
  const { data: decisions, error: dErr } = await supabase
    .from('chapter_decisions')
    .select('*')
    .in('suggestion_id', ids);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const byId = new Map<string, DecisionRow>();
  for (const d of (decisions ?? []) as DecisionRow[]) {
    byId.set(d.suggestion_id, d);
  }

  const joined = list.map((s) => ({
    ...s,
    decision: byId.get(s.id) ?? null,
  }));

  return NextResponse.json({ suggestions: joined });
}
