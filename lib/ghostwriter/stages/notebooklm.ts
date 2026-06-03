/**
 * Stage 0 — NotebookLM Citation Verification
 * ============================================
 * Queries the "The Digital Law Firm- HyperAutomation" NotebookLM notebook
 * (184 verified Tier 1 sources) to pre-verify every factual claim in the chapter
 * BEFORE the LLM reviewers run.
 *
 * This is the ground truth layer. If a stat is in this notebook it is verified.
 * If it is not, it is genuinely unverified and a real RISK-3.
 *
 * The MCP server must be running locally:
 *   ~/notebooklm-mcp/server.py (via Launch Agent or manual start)
 * and NOTEBOOKLM_MCP_URL must be set in .env.local.
 */

import { execSync } from 'child_process';
import type { StageResult } from './gemini';

/** NotebookLM notebook ID for The Digital Law Firm source library */
const DLF_NOTEBOOK_ID = '4af61e2f-a5c4-49c3-84d6-9926ac39e270';
const MCP_URL = process.env.NOTEBOOKLM_MCP_URL ?? 'https://mtv-hwy-correlation-simplified.trycloudflare.com';

export interface NotebookLMVerification {
  verifiedClaims: VerifiedClaim[];
  unverifiedClaims: string[];
  misattributedClaims: MisattributedClaim[];
  summary: string;
  stageResult: StageResult;
}

export interface VerifiedClaim {
  claim: string;
  source: string;
  verified: boolean;
  note?: string;
}

export interface MisattributedClaim {
  claim: string;
  correction: string;
}

/**
 * Extract all factual claims (statistics, percentages, named reports) from a chapter draft.
 * Returns a list of quoted claims to verify.
 */
function extractClaimsForVerification(draft: string): string[] {
  const claims: string[] = [];

  // Extract percentage claims
  const pctMatches = draft.match(/\d+%[^.!?\n]{0,100}/g) ?? [];
  claims.push(...pctMatches.slice(0, 20));

  // Extract named report references
  const reportMatches = draft.match(/(?:LEAP|Clio|SRA|Law Society|Thomson Reuters|Legal Futures|Wolters Kluwer)[^.!?\n]{0,150}/g) ?? [];
  claims.push(...reportMatches.slice(0, 15));

  // Extract monetary/numerical claims
  const numMatches = draft.match(/£[\d,.]+(?:\s+(?:billion|million|thousand))?[^.!?\n]{0,80}/g) ?? [];
  claims.push(...numMatches.slice(0, 10));

  return [...new Set(claims)].slice(0, 30); // deduplicate, cap at 30
}

/**
 * Query NotebookLM — tries three transports in order:
 * 1. HTTP MCP server (tunnel or localhost:8484)
 * 2. Local CLI (`notebooklm ask`) — always available if auth is fresh
 * 3. Graceful fallback string (pipeline continues without citation check)
 */
async function queryNotebookLM(query: string): Promise<string> {
  // Transport 1: HTTP MCP (tunnel or local)
  const urls = [MCP_URL, 'http://localhost:8484'];
  for (const base of urls) {
    try {
      const res = await fetch(`${base}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'notebooklm_ask',
          arguments: { question: query, notebook_id: DLF_NOTEBOOK_ID },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = await res.json() as { content?: Array<{ text?: string }> };
        const text = data?.content?.[0]?.text;
        if (text) return text;
      }
    } catch {
      // try next transport
    }
  }

  // Transport 2: Local CLI
  try {
    const nlmBin = `${process.env.HOME}/bin/notebooklm`;
    const result = execSync(
      `${nlmBin} use ${DLF_NOTEBOOK_ID} && ${nlmBin} ask ${JSON.stringify(query)}`,
      { timeout: 120_000, encoding: 'utf-8', env: { ...process.env, PATH: `${process.env.HOME}/bin:${process.env.PATH}` } }
    );
    return result.trim();
  } catch (cliErr) {
    return `[NotebookLM unavailable: CLI error — ${cliErr instanceof Error ? cliErr.message.slice(0, 200) : String(cliErr)}]`;
  }
}

/**
 * Stage 0: Verify all factual claims in the chapter against the NotebookLM source library.
 * Returns a structured verification report that is passed to the Four-Eyes synthesiser.
 */
export async function runNotebookLMVerification(
  chapter: number,
  draft: string,
): Promise<NotebookLMVerification> {
  const startMs = Date.now();
  const claims = extractClaimsForVerification(draft);

  if (claims.length === 0) {
    return {
      verifiedClaims: [],
      unverifiedClaims: [],
      misattributedClaims: [],
      summary: 'No quantitative claims found for verification.',
      stageResult: { output: 'No claims to verify.', tokensIn: 0, tokensOut: 0, costGbp: 0 },
    };
  }

  // Batch all claims into a single query to avoid multiple round-trips
  const batchQuery = `For Chapter ${chapter} of The Digital Law Firm book, please verify the following factual claims against the source library. For each claim, state: VERIFIED (with source name and date), UNVERIFIED (not in sources), or MISATTRIBUTED (stat exists but attributed to wrong source/context).

Claims to verify:
${claims.map((c, i) => `${i + 1}. "${c.trim()}"`).join('\n')}

Return each as: [VERIFIED|UNVERIFIED|MISATTRIBUTED] | Claim summary | Source or correction`;

  const response = await queryNotebookLM(batchQuery);
  const elapsed = Date.now() - startMs;

  // Parse the structured response
  const verifiedClaims: VerifiedClaim[] = [];
  const unverifiedClaims: string[] = [];
  const misattributedClaims: MisattributedClaim[] = [];

  for (const line of response.split('\n')) {
    if (line.startsWith('VERIFIED')) {
      const parts = line.split('|');
      verifiedClaims.push({
        claim: parts[1]?.trim() ?? '',
        source: parts[2]?.trim() ?? '',
        verified: true,
      });
    } else if (line.startsWith('UNVERIFIED')) {
      const parts = line.split('|');
      unverifiedClaims.push(parts[1]?.trim() ?? '');
    } else if (line.startsWith('MISATTRIBUTED')) {
      const parts = line.split('|');
      misattributedClaims.push({
        claim: parts[1]?.trim() ?? '',
        correction: parts[2]?.trim() ?? '',
      });
    }
  }

  const summary = `NotebookLM Stage 0 — Chapter ${chapter} citation check (${elapsed}ms):
✅ Verified against source library: ${verifiedClaims.length}
❌ Not found in sources (genuine RISK-3): ${unverifiedClaims.length}
⚠️  Misattributed (stat real, source wrong): ${misattributedClaims.length}

Raw verification output:
${response}`;

  return {
    verifiedClaims,
    unverifiedClaims,
    misattributedClaims,
    summary,
    stageResult: {
      output: summary,
      tokensIn: 0, // NotebookLM doesn't expose token counts
      tokensOut: 0,
      costGbp: 0,  // NotebookLM is included in your Google subscription
    },
  };
}
