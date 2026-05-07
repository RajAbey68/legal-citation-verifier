import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase/server';
import { createClient } from '../../../../lib/supabase/server';
import mammoth from 'mammoth';

export const maxDuration = 60;

export async function GET() {
  const service = createServiceClient();
  const { data, error } = await service
    .from('ghostwriter_runs')
    .select('id, chapter, filename, word_count, status, created_by, created_at, completed_at, is_blocked')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const chapter = parseInt(formData.get('chapter') as string);
  const file = formData.get('file') as File | null;

  if (!chapter || chapter < 1 || chapter > 12) {
    return NextResponse.json({ error: 'chapter must be 1–12' }, { status: 400 });
  }

  let draftText = '';
  let filename = '';
  let wordCount = 0;

  if (file) {
    filename = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());
    if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
      const result = await mammoth.extractRawText({ buffer });
      draftText = result.value;
    } else {
      draftText = buffer.toString('utf-8');
    }
    wordCount = draftText.trim().split(/\s+/).length;
  }

  if (!draftText.trim()) {
    return NextResponse.json({ error: 'No text content found in file' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: run, error } = await service
    .from('ghostwriter_runs')
    .insert({
      chapter,
      filename,
      word_count: wordCount,
      draft_text: draftText,
      status: 'pending',
      created_by: user.email,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runId: run.id, wordCount });
}
