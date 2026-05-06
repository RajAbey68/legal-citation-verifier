import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resolveOrg, resolveSourceIds } from '../../../lib/org-config';
import { requireAuth } from '../../../lib/api-auth';

export const maxDuration = 60;

function extractGoogleDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]{20,})/);
  return match?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const {
    url,
    sources,
    org_id,
  }: { url?: string; sources?: string[]; org_id?: string } = await req.json();

  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const docId = extractGoogleDocId(url);
  if (!docId) {
    return NextResponse.json(
      { error: 'Could not find a Google Doc ID in that URL. Make sure it is a docs.google.com/document link.' },
      { status: 400 }
    );
  }

  const org = resolveOrg(org_id);

  const authError = await requireAuth(org.orgId, req);
  if (authError) return authError;
  const selectedSources = sources ?? org.defaultSources;
  const sourceIds = resolveSourceIds(org, selectedSources);

  const mcpUrl = process.env.NOTEBOOKLM_MCP_URL!;
  const transport = new StreamableHTTPClientTransport(new URL(`${mcpUrl}/mcp`));
  const client = new Client({ name: 'legal-verifier', version: '1.0.0' });
  await client.connect(transport);

  // Step 1: temporarily add the Google Doc as a Drive source
  const addResult = await client.callTool({
    name: 'source_add',
    arguments: {
      notebook_id: org.notebookId,
      source_type: 'drive',
      document_id: docId,
      title: `[TEMP VALIDATION] ${docId}`,
    },
  });

  const addText = Array.isArray(addResult.content)
    ? addResult.content.map((c: { text?: string }) => c.text ?? '').join('\n')
    : String(addResult.content);

  const tempSourceId = addText.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)?.[0];

  // Step 2: validate the doc content against regulatory sources
  const query = `You are a legal accuracy validator for ${org.label}. A Google Doc has been added as a temporary source with ID ${tempSourceId ?? 'the most recently added source'}.

Read that document and validate its factual and regulatory claims against the authoritative sources also in this notebook.

For each significant claim in the document, respond with:
✓ ACCURATE — [claim summary] — [citation from authoritative sources]
✗ INACCURATE — [claim summary] — [what the sources actually say]
⚠ UNVERIFIABLE — [claim summary] — [not found in available sources]

After the claim-by-claim review provide:
OVERALL ASSESSMENT: [1–2 sentences on the document's overall accuracy]
RISKS: [any regulatory or compliance risks in the document's statements]`;

  const validateResult = await client.callTool({
    name: 'notebook_query',
    arguments: {
      notebook_id: org.notebookId,
      query,
      // source_ids omitted — see verify/route.ts for rationale
    },
  });

  // Step 3: remove the temporary source
  if (tempSourceId) {
    await client.callTool({
      name: 'source_delete',
      arguments: { notebook_id: org.notebookId, source_id: tempSourceId },
    }).catch(() => { /* non-fatal */ });
  }

  await client.close();

  const answer = Array.isArray(validateResult.content)
    ? validateResult.content.map((c: { text?: string }) => c.text ?? '').join('\n')
    : String(validateResult.content);

  return NextResponse.json({ answer, docId, url, org_id: org.orgId });
}
