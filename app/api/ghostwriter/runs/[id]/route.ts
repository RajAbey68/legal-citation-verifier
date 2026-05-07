import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const service = createServiceClient();

  const { data: run, error } = await service
    .from('ghostwriter_runs')
    .select('id, chapter, filename, word_count, status, is_blocked, completed_at')
    .eq('id', id)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const { data: stages } = await service
    .from('ghostwriter_stages')
    .select('stage, status, output, tokens_in, tokens_out')
    .eq('run_id', id);

  return NextResponse.json({ run, stages: stages ?? [] });
}
