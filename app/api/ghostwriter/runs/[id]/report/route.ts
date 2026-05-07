import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../../lib/supabase/server';

const CHAPTER_LABELS: Record<number, string> = {
  1: 'The_AI_Readiness_Audit',
  2: 'The_Pricing_Paradox',
  3: 'The_90-Day_Pilot',
  4: 'The_Safety_Scaffolding',
  5: 'The_Technology_Stack',
  6: 'The_Partnership_Conversation',
  7: 'The_Legal_Framework',
  8: 'The_Governance_Model',
  9: 'The_EU_AI_Act_Roadmap',
  10: 'The_Delivery_Engine',
  11: 'The_Change_Management',
  12: 'The_First_Year_Forward',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const service = createServiceClient();

  const { data: run } = await service
    .from('ghostwriter_runs')
    .select('chapter, filename')
    .eq('id', id)
    .single();

  const { data: stage } = await service
    .from('ghostwriter_stages')
    .select('output')
    .eq('run_id', id)
    .eq('stage', 'foureyes')
    .single();

  if (!stage?.output) {
    return NextResponse.json({ error: 'Report not yet generated' }, { status: 404 });
  }

  const chapter = run?.chapter ?? 0;
  const chapterLabel = CHAPTER_LABELS[chapter] ?? `Chapter_${chapter}`;
  const filename = `FourEyes_Ch${String(chapter).padStart(2, '0')}_${chapterLabel}.md`;

  return new Response(stage.output, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
