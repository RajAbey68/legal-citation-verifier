import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_ACTIONS = ['KEEP', 'SWAP', 'REWRITE'] as const;
type Action = (typeof VALID_ACTIONS)[number];

interface PostBody {
  suggestion_id: string;
  action: Action;
  edited_text?: string;
  notes?: string;
}

/**
 * Save or update a decision on a chapter suggestion.
 * Requires authenticated session. The decided_by field is forced to the
 * authenticated user's email — clients cannot spoof it.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user?.email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Whitelist enforcement
  const { data: allowed } = await supabase
    .from('allowed_emails')
    .select('email')
    .eq('email', user.email)
    .maybeSingle();
  if (!allowed) {
    return NextResponse.json({ error: 'not_authorised' }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.suggestion_id) {
    return NextResponse.json({ error: 'suggestion_id required' }, { status: 400 });
  }
  if (!VALID_ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: `action must be one of ${VALID_ACTIONS.join(', ')}` }, { status: 400 });
  }
  if (body.action === 'REWRITE' && !body.edited_text?.trim()) {
    return NextResponse.json({ error: 'REWRITE requires edited_text' }, { status: 400 });
  }

  // Upsert: one decision per suggestion (table has UNIQUE on suggestion_id)
  const row = {
    suggestion_id: body.suggestion_id,
    decision: body.action,
    edited_text: body.action === 'REWRITE' ? body.edited_text!.trim() : null,
    decided_by: user.email,
    notes: body.notes ?? null,
    decided_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('chapter_decisions')
    .upsert(row, { onConflict: 'suggestion_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ decision: data });
}

/** GET ?chapter=NN — list decisions for a chapter (joined to its suggestions). */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const chapter = req.nextUrl.searchParams.get('chapter');
  if (!chapter) {
    return NextResponse.json({ error: 'chapter query param required' }, { status: 400 });
  }
  const chapterNum = parseInt(chapter, 10);
  if (Number.isNaN(chapterNum) || chapterNum < 1 || chapterNum > 12) {
    return NextResponse.json({ error: 'chapter must be 1-12' }, { status: 400 });
  }

  // Fetch suggestion ids for the chapter, then their decisions
  const { data: sugs, error: sugErr } = await supabase
    .from('chapter_suggestions')
    .select('id')
    .eq('chapter_number', chapterNum);
  if (sugErr) return NextResponse.json({ error: sugErr.message }, { status: 500 });

  const ids = (sugs ?? []).map((s: { id: string }) => s.id);
  if (ids.length === 0) return NextResponse.json({ decisions: [] });

  const { data: decisions, error } = await supabase
    .from('chapter_decisions')
    .select('*')
    .in('suggestion_id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ decisions: decisions ?? [] });
}
