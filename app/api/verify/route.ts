import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resolveOrg, resolveSourceIds, buildGatekeeperRules } from '../../../lib/org-config';
import { requireAuth } from '../../../lib/api-auth';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const {
    claim,
    sources,
    org_id,
  }: { claim?: string; sources?: string[]; org_id?: string } = await req.json();

  if (!claim) return NextResponse.json({ error: 'claim is required' }, { status: 400 });

  const org = resolveOrg(org_id);

  const authError = await requireAuth(org.orgId, req);
  if (authError) return authError;
  const selectedSources = sources ?? org.defaultSources;
  const sourceIds = resolveSourceIds(org, selectedSources);
  const gatekeeperRules = buildGatekeeperRules(org);

  const mcpUrl = process.env.NOTEBOOKLM_MCP_URL!;
  const transport = new StreamableHTTPClientTransport(new URL(`${mcpUrl}/mcp`));
  const client = new Client({ name: 'legal-verifier', version: '1.0.0' });
  await client.connect(transport);

  const result = await client.callTool({
    name: 'notebook_query',
    arguments: {
      notebook_id: org.notebookId,
      query: `You are a legal accuracy gatekeeper for ${org.label}. Apply these rules strictly:

RULES:
${gatekeeperRules}

Respond in exactly this format:
VERDICT: [VERIFIED | NOT_FOUND | PARTIAL]
CITATION: [verbatim quote and source name]
NOTES: [caveats — flag US-as-UK data, journalism-as-regulation, overclaims, or practitioner-as-regulatory-standard]

Claim: "${claim}"`,
      // source_ids omitted — notebook already contains only curated sources;
      // passing IDs causes INVALID_ARGUMENT on stateless cloud deployments
    },
  });

  await client.close();

  const answer = Array.isArray(result.content)
    ? result.content.map((c: { text?: string }) => c.text ?? '').join('\n')
    : String(result.content);

  const verdictMatch = answer.match(/VERDICT:\s*(VERIFIED|NOT_FOUND|PARTIAL)/i);
  const verdict = verdictMatch ? verdictMatch[1].toLowerCase() : 'partial';

  return NextResponse.json({ verdict, answer, claim, org_id: org.orgId });
}
