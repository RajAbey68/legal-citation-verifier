import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import mammoth from 'mammoth';
import { resolveOrg, resolveSourceIds } from '../../../lib/org-config';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const sourcesRaw = form.get('sources') as string | null;
  const orgId = form.get('org_id') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const org = resolveOrg(orgId);
  const sources: string[] = sourcesRaw ? JSON.parse(sourcesRaw) : org.defaultSources;
  const sourceIds = resolveSourceIds(org, sources);

  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  let docText = '';

  if (ext === '.gdoc') {
    return NextResponse.json(
      { error: 'For Google Docs validation, export the file as .docx first (File → Download → Word).' },
      { status: 400 }
    );
  }

  if (ext === '.doc' || ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    docText = result.value;
  } else {
    docText = buffer.toString('utf-8');
  }

  if (!docText.trim()) {
    return NextResponse.json({ error: 'File appears to be empty or unreadable' }, { status: 400 });
  }

  // Truncate very large documents to stay within token limits
  const MAX_CHARS = 12000;
  const truncated = docText.length > MAX_CHARS;
  const docExcerpt = truncated ? docText.slice(0, MAX_CHARS) + '\n\n[... document truncated for length ...]' : docText;

  const query = `You are a legal accuracy validator for ${org.label}. Below is a document submitted for validation.

Your job is to check the factual and regulatory claims in this document against the authoritative sources in this notebook.

For each significant claim you identify, respond with:
✓ ACCURATE — [claim summary] — [citation from sources]
✗ INACCURATE — [claim summary] — [what the sources actually say]
⚠ UNVERIFIABLE — [claim summary] — [not found in available sources]

After the claim-by-claim review, provide:
OVERALL ASSESSMENT: [1–2 sentences on the document's overall accuracy]
RISKS: [any regulatory or compliance risks in the document's statements]

---
DOCUMENT TO VALIDATE:
${docExcerpt}`;

  const mcpUrl = process.env.NOTEBOOKLM_MCP_URL!;
  const transport = new StreamableHTTPClientTransport(new URL(`${mcpUrl}/mcp`));
  const client = new Client({ name: 'legal-verifier', version: '1.0.0' });
  await client.connect(transport);

  const result = await client.callTool({
    name: 'notebook_query',
    arguments: {
      notebook_id: org.notebookId,
      query,
      source_ids: sourceIds,
    },
  });

  await client.close();

  const answer = Array.isArray(result.content)
    ? result.content.map((c: { text?: string }) => c.text ?? '').join('\n')
    : String(result.content);

  return NextResponse.json({
    answer,
    filename: file.name,
    truncated,
    charCount: docText.length,
    org_id: org.orgId,
  });
}
