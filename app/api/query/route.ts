import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resolveOrg, resolveSourceIds } from '../../../lib/org-config';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const {
    question,
    sources,
    org_id,
  }: { question?: string; sources?: string[]; org_id?: string } = await req.json();

  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 });

  const org = resolveOrg(org_id);
  const selectedSources = sources ?? org.defaultSources;
  const sourceIds = resolveSourceIds(org, selectedSources);

  const mcpUrl = process.env.NOTEBOOKLM_MCP_URL!;
  const transport = new StreamableHTTPClientTransport(new URL(`${mcpUrl}/mcp`));
  const client = new Client({ name: 'legal-verifier', version: '1.0.0' });
  await client.connect(transport);

  const result = await client.callTool({
    name: 'notebook_query',
    arguments: {
      notebook_id: org.notebookId,
      query: question,
      source_ids: sourceIds,
    },
  });

  await client.close();

  const answer = Array.isArray(result.content)
    ? result.content.map((c: { text?: string }) => c.text ?? '').join('\n')
    : String(result.content);

  return NextResponse.json({ answer, question, org_id: org.orgId });
}
