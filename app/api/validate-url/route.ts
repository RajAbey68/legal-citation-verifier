import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const maxDuration = 60;

const NOTEBOOK_ID = '4af61e2f-a5c4-49c3-84d6-9926ac39e270';

const SOURCE_IDS: Record<string, string[]> = {
  sra: [
    'f61bc3cf-11f0-4d84-9431-571b158a2951',
    '4a93811e-ca14-4367-b15d-b040be2207a9',
    '8793eec6-3f09-43af-8cd9-1e10bd8026c6',
    '32a2222f-9f71-4db8-91d5-9e388d5bb02f',
    'ba7db6c8-3bc2-4316-8f42-01384ac3ee40',
    'a3e8d6f7-af5d-4243-8a4d-73b982914db0', // SRA Technology Guidance 2024
  ],
  fca: [
    '2b8f5b2a-3b99-4e22-aa9b-1b40a5771cc8',
    '571b906a-80d1-4b9b-9002-210b8b6ac2d8',
    'ea54aabb-17b3-4444-b403-590c3663a827',
    'fce4d0f3-b8cb-4423-b46f-cc206fe13ea3',
    '2e209923-fc4b-4eef-b90b-73ea3bb30063',
    '57899ed0-8d19-4b86-b746-f28bfff564af',
  ],
  eu: [
    'ed7f739f-fd05-40c1-8436-876f3409eafc',
    '61dbcb3c-539d-4cca-ab83-4a8d4b311764', // EUR-Lex AI Act full regulation
  ],
  lawgazette: ['471b5ebf-cfc1-487a-bf2c-3161379146f2'],
  ico: [
    '1feee333-7717-4e60-9750-6374ba3317bf', // ICO AI & Data Protection
    '58ab671f-7e2d-46ac-af68-b90984f5a498', // ICO Generative AI Hub
  ],
  lawsociety: [
    '786c220b-9f50-4311-9226-087a2611a01d', // Law Society — Succession, PII, Partnership
  ],
  iso: [
    '1170b5d7-8434-498f-b274-2b0bced54522', // ISO 9001:2015
    '47fc5ca3-d39f-4f79-b792-06fe633ece30', // ISO 42001:2023
  ],
  market: [
    '80667dd8-b4ca-4021-8073-56a45efeefcb', // Clio Legal Trends
    'c0b1d09a-7089-4761-bcf4-ecc8df2221f4', // Thomson Reuters / Clio / NHS Digital
  ],
  // Gatekeeper protocol docs — always included in verification
  _protocol: [
    '8637f37a-5e6a-442d-9549-c637608c0928', // VERIFICATION_PROTOCOL
    '4efc2631-1026-4c17-84d3-ce26e88cfb8e', // GATEKEEPER_RISKS
  ],
  legal_regulation: [
    '48add209-d24b-4767-b77e-bae0dcba95da', // Bar Standards Board
    'e69c0e47-c71f-4077-b181-42b88a008dc1', // Bar Council
    'eb7bc748-20dd-4140-bd1d-cf356cea0650', // CILEx Regulation
    '5793f39b-b8cb-4f3d-ac95-d9bc21ab9125', // Legal Services Board
    '26202196-e077-4f7d-bf5c-4f8e3c1ccfee', // Law Society Northern Ireland
  ],
  ncsc: [
    '0373999c-4a19-45ef-ab18-befaea7fc655', // NCSC AI Security Guidelines
    '153b8cac-a6c6-4637-888b-2e7e43658864', // NCSC Cyber Essentials
    'b8a3f484-a62a-490f-85e4-5df892f506d9', // NCSC Cloud Security Principles
  ],
  gov_uk: [
    'ef1b9912-5fda-4cfe-9fb0-e56438c20296', // Data Ethics Framework
    'd4af73f7-934f-49ae-88dd-4922cb422261', // Security Policy Framework
    '19fece01-c9c3-4d06-83d0-7fa196d74ed8', // Government Security Classifications
    '9d4cf3df-bdb6-4d06-a921-56175e41a5be', // ICO AI Risk Toolkit
    '73887cbb-2c8d-422f-b701-910d3fd1f4f1', // UK Gov AI Assurance + Data Ethics (text)
  ],
  bsi: [
    'af2e3896-512b-4934-b0e1-0c991732309f', // BSI Standards text (ISO 27001/27017/27018/27002/42001/PAS1885)
  ],
};

function extractGoogleDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]{20,})/);
  return match?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const { url, sources = ['sra', 'fca', 'eu', 'lawgazette', 'ico', 'lawsociety', 'iso', 'market', 'legal_regulation', 'ncsc', 'gov_uk', 'bsi'] } = await req.json();
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const docId = extractGoogleDocId(url);
  if (!docId) {
    return NextResponse.json(
      { error: 'Could not find a Google Doc ID in that URL. Make sure it is a docs.google.com/document link.' },
      { status: 400 }
    );
  }

  const sourceIds = (sources as string[]).flatMap((g) => SOURCE_IDS[g] ?? []);
  const mcpUrl = process.env.NOTEBOOKLM_MCP_URL!;

  const transport = new StreamableHTTPClientTransport(new URL(`${mcpUrl}/mcp`));
  const client = new Client({ name: 'legal-verifier', version: '1.0.0' });
  await client.connect(transport);

  // Step 1: temporarily add the Google Doc as a Drive source
  const addResult = await client.callTool({
    name: 'source_add',
    arguments: {
      notebook_id: NOTEBOOK_ID,
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
  const query = `You are a legal accuracy validator. A Google Doc has been added as a temporary source with ID ${tempSourceId ?? 'the most recently added source'}.

Read that document and validate its factual and regulatory claims against the authoritative UK legal sources (SRA, FCA, EU AI Act, Law Gazette) also in this notebook.

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
      notebook_id: NOTEBOOK_ID,
      query,
      source_ids: tempSourceId ? [...sourceIds, tempSourceId] : sourceIds,
    },
  });

  // Step 3: remove the temporary source
  if (tempSourceId) {
    await client.callTool({
      name: 'source_delete',
      arguments: { notebook_id: NOTEBOOK_ID, source_id: tempSourceId },
    }).catch(() => { /* non-fatal */ });
  }

  await client.close();

  const answer = Array.isArray(validateResult.content)
    ? validateResult.content.map((c: { text?: string }) => c.text ?? '').join('\n')
    : String(validateResult.content);

  return NextResponse.json({ answer, docId, url });
}
