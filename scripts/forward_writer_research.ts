#!/usr/bin/env npx tsx
/**
 * Forward Writer Research — LinkedIn Sales Navigator via PhantomBuster
 * =====================================================================
 * Finds top foreword writer candidates for "The Digital Law Firm"
 * (Law Society Publishing, Q4 2026).
 *
 * Book authors:
 *   - Rajiv Abeysinghe  (AI/automation)
 *   - Darren Sylvester  (practice management)
 *   - Nick Lockett      (legal tech governance)
 *   - Sushila Nair      (security/governance)
 *
 * PRE-FLIGHT (one-time setup):
 *   1. Add PHANTOMBUSTER_API_KEY_BOOK  to .env.local
 *   2. Add PHANTOMBUSTER_AGENT_ID_BOOK to .env.local
 *      (LinkedIn Sales Navigator Search Export phantom)
 *
 * Usage:
 *   cd /Users/arajiv/legal-citation-verifier/frontend
 *   npx tsx scripts/forward_writer_research.ts           # live run
 *   npx tsx scripts/forward_writer_research.ts --dry-run # validate env only
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const PB_API_KEY  = process.env.PHANTOMBUSTER_API_KEY_BOOK;
const PB_AGENT_ID = process.env.PHANTOMBUSTER_AGENT_ID_BOOK;
const PB_BASE     = 'https://api.phantombuster.com/api/v2';

const REPORTS_DIR = path.join(
  process.env.HOME!,
  'Downloads',
  'Digital_Law_Firm_Chapters',
  'reports',
);
const GDRIVE_DIR = path.join(
  process.env.HOME!,
  'Library/CloudStorage/GoogleDrive-rajabey68@gmail.com/My Drive/Digital Law firms/First Author Review',
);
const OUTPUT_FILENAME = 'forward_writer_candidates.md';

const DRY_RUN = process.argv.includes('--dry-run');

// ─────────────────────────────────────────────────────────────────────────────
// Three Sales Navigator search pools
// ─────────────────────────────────────────────────────────────────────────────
const SEARCH_URL_A =
  'https://www.linkedin.com/sales/search/people?query=(recentSearchParam:(id:1,doLogHistory:true),filters:List((type:CURRENT_TITLE,values:List((id:8,text:Chief Executive Officer,selectionType:INCLUDED),(id:6,text:Director,selectionType:INCLUDED),(id:26,text:Managing Partner,selectionType:INCLUDED))),  (type:GEOGRAPHY,values:List((id:101165590,text:United Kingdom,selectionType:INCLUDED))),  (type:INDUSTRY,values:List((id:10,text:Legal Services,selectionType:INCLUDED)))))&keywords=legal+technology+AI';

const SEARCH_URL_B =
  'https://www.linkedin.com/sales/search/people?query=(filters:List((type:CURRENT_TITLE,values:List((id:8,text:CEO,selectionType:INCLUDED),(id:26,text:Managing Partner,selectionType:INCLUDED),(id:10,text:President,selectionType:INCLUDED))),  (type:GEOGRAPHY,values:List((id:101165590,text:United Kingdom,selectionType:INCLUDED))),  (type:INDUSTRY,values:List((id:10,text:Legal Services,selectionType:INCLUDED)))))&keywords=legal+AI+author';

const SEARCH_URL_C =
  'https://www.linkedin.com/sales/search/people?query=(filters:List((type:CURRENT_COMPANY,values:List((id:163383,text:The Law Society,selectionType:INCLUDED),(id:2985024,text:Solicitors Regulation Authority,selectionType:INCLUDED),(id:10928987,text:LawTech UK,selectionType:INCLUDED))),  (type:GEOGRAPHY,values:List((id:101165590,text:United Kingdom,selectionType:INCLUDED)))))';

const SEARCH_URLS = [SEARCH_URL_A, SEARCH_URL_B, SEARCH_URL_C];

// ─────────────────────────────────────────────────────────────────────────────
// PhantomBuster API helpers (patterns from LeadSynch phantomService.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Launch the phantom with all three search URLs joined by newline. */
async function launchPhantom(): Promise<string> {
  const res = await fetch(`${PB_BASE}/agents/launch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Phantombuster-Key': PB_API_KEY!,
    },
    body: JSON.stringify({
      id: PB_AGENT_ID,
      argument: {
        identityId: '7009363458112544',
        searches: SEARCH_URLS.join('\n'),
        numberOfResultsPerSearch: 50,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`PhantomBuster launch failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { containerId: string };
  return data.containerId;
}

/** Poll containers/fetch-output every 15 s, timeout after 10 min. */
async function pollUntilFinished(containerId: string): Promise<void> {
  const POLL_INTERVAL_MS = 15_000;
  const TIMEOUT_MS       = 10 * 60 * 1000;
  const start            = Date.now();

  while (Date.now() - start < TIMEOUT_MS) {
    const res = await fetch(`${PB_BASE}/containers/fetch-output?id=${containerId}`, {
      headers: { 'X-Phantombuster-Key': PB_API_KEY! },
    });

    if (!res.ok) {
      throw new Error(`Status poll failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { status?: string; output?: string };
    const status = data.status ?? 'unknown';
    process.stdout.write(`  [poll] status=${status}\n`);

    if (status === 'finished') return;

    if (status === 'failed' || status === 'error') {
      console.error('  Container output:');
      console.error(data.output ?? '(no output)');
      throw new Error(`Phantom execution failed (status=${status})`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error('Phantom timed out after 10 minutes');
}

/** Extract the S3 JSON URL from container output and fetch results. */
async function fetchResults(containerId: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${PB_BASE}/containers/fetch-output?id=${containerId}`, {
    headers: { 'X-Phantombuster-Key': PB_API_KEY! },
  });

  if (!res.ok) {
    throw new Error(`fetch-output failed: ${res.status}`);
  }

  const data = (await res.json()) as { output?: string };
  const output = data.output ?? '';

  // LeadSynch pattern: "JSON saved at https://....json"
  const s3Match = output.match(/saved at (https:\/\/[^\s\r\n]+\.json)/);
  if (!s3Match) {
    console.warn('  No S3 JSON URL found in output. Raw output tail:');
    console.warn(output.slice(-500));
    return [];
  }

  const s3Url = s3Match[1];
  console.log(`  S3 URL: ${s3Url}`);

  const s3Res = await fetch(s3Url);
  if (!s3Res.ok) {
    throw new Error(`S3 fetch failed: ${s3Res.status}`);
  }

  const json = await s3Res.json();
  return Array.isArray(json) ? json : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

interface Candidate {
  name: string;
  title: string;
  company: string;
  linkedinUrl: string;
  location: string;
  connections: number;
  score: number;
  whyIdeal: string;
}

/** Score a raw profile record according to the spec. */
function scoreProfile(raw: Record<string, unknown>): Candidate {
  const str = (v: unknown): string =>
    typeof v === 'string' ? v : '';

  const name        = str(raw.fullName ?? raw.full_name ?? raw.name ??
                          ((str(raw.firstName) + ' ' + str(raw.lastName)).trim()));
  const titleRaw    = str(raw.title ?? raw.jobTitle ?? raw.job_title ?? raw.headline);
  const titleLower  = titleRaw.toLowerCase();
  const company     = str(raw.company ?? raw.companyName ?? raw.currentCompany);
  const compLower   = company.toLowerCase();
  const linkedinUrl = str(raw.linkedInUrl ?? raw.profileUrl ?? raw.linkedin_url ?? raw.url);
  const location    = str(raw.location ?? raw.locationName ?? raw.city);
  const locLower    = location.toLowerCase();
  const connections = parseInt(str(raw.connectionsCount ?? raw.connections ?? '0'), 10) || 0;

  let score = 0;
  const reasons: string[] = [];

  // +3 if company is Law Society / SRA / LawTech UK / Legal Services Board
  const authorityOrgs = [
    'law society',
    'solicitors regulation authority',
    'sra',
    'lawtech uk',
    'legal services board',
  ];
  if (authorityOrgs.some((o) => compLower.includes(o))) {
    score += 3;
    reasons.push('Regulatory/LawTech body');
  }

  // +2 if headline/title contains "author" or "published"
  if (titleLower.includes('author') || titleLower.includes('published')) {
    score += 2;
    reasons.push('Published author');
  }

  // +2 if title contains CEO/President/Chair/Managing Partner
  if (
    titleLower.includes('ceo') ||
    titleLower.includes('chief executive') ||
    titleLower.includes('president') ||
    titleLower.includes('chair') ||
    titleLower.includes('managing partner')
  ) {
    score += 2;
    reasons.push('CEO/President/Chair/Managing Partner');
  }

  // +1 if title contains Director/Partner
  if (titleLower.includes('director') || titleLower.includes('partner')) {
    score += 1;
    reasons.push('Director/Partner seniority');
  }

  // +1 if headline mentions AI / legal technology / lawtech
  if (
    titleLower.includes('ai') ||
    titleLower.includes('artificial intelligence') ||
    titleLower.includes('legal technology') ||
    titleLower.includes('legal tech') ||
    titleLower.includes('lawtech')
  ) {
    score += 1;
    reasons.push('AI/legal technology focus');
  }

  // +1 if connections >= 500
  if (connections >= 500) {
    score += 1;
    reasons.push('500+ connections');
  }

  // -2 if location not UK
  const isUk =
    locLower.includes('united kingdom') ||
    locLower.includes('england') ||
    locLower.includes('scotland') ||
    locLower.includes('wales') ||
    locLower.includes('northern ireland') ||
    locLower.includes('london') ||
    locLower.includes(', uk') ||
    locLower.endsWith(' uk');
  if (location && !isUk) {
    score -= 2;
    reasons.push('-2 non-UK location');
  }

  const whyIdeal = reasons.length > 0 ? reasons.join('; ') : 'UK legal professional';

  return {
    name,
    title: titleRaw,
    company,
    linkedinUrl,
    location,
    connections,
    score,
    whyIdeal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report builder
// ─────────────────────────────────────────────────────────────────────────────
function buildReport(candidates: Candidate[]): string {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  const tableRows = candidates
    .map((c, i) => {
      const urlCell = c.linkedinUrl ? `[Profile](${c.linkedinUrl})` : '—';
      return `| ${i + 1} | ${c.name} | ${c.title} | ${c.company} | ${c.score} | ${urlCell} | ${c.whyIdeal} |`;
    })
    .join('\n');

  return `# Foreword Writer Candidates — The Digital Law Firm
Generated: ${ts}
Book: The Digital Law Firm (Law Society Publishing, Q4 2026)
Authors: Rajiv Abeysinghe (AI/automation), Darren Sylvester (practice management), Nick Lockett (legal tech governance), Sushila Nair (security/governance)

---

## Top 15 Candidates

| Rank | Name | Title | Organisation | Score | LinkedIn URL | Why ideal |
|------|------|-------|--------------|-------|-------------|-----------|
${tableRows}

---

## Scoring Methodology

| Criterion | Points |
|-----------|--------|
| Company is Law Society / SRA / LawTech UK / Legal Services Board | +3 |
| Headline/title contains "author" or "published" | +2 |
| Title contains CEO / President / Chair / Managing Partner | +2 |
| Title contains Director / Partner | +1 |
| Headline mentions AI / legal technology / lawtech | +1 |
| Connections >= 500 | +1 |
| Location not UK | -2 |

---

## Next Steps

1. Review profiles and confirm top 3 choices with all four authors
2. Check for existing relationships with any author before cold outreach
3. Draft personalised outreach email matching foreword writer to strongest author overlap
4. Approach via LinkedIn InMail or mutual connection introduction

---

*Generated by forward_writer_research.ts — Digital Law Firm ghostwriter pipeline*
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('━━━ Forward Writer Research — The Digital Law Firm ━━━━━━━━━━━━');

  // Validate env vars
  if (!PB_API_KEY) {
    console.error('ERROR: PHANTOMBUSTER_API_KEY_BOOK is not set.');
    console.error('  Add it to /Users/arajiv/legal-citation-verifier/frontend/.env.local');
    process.exit(1);
  }
  if (!PB_AGENT_ID) {
    console.error('ERROR: PHANTOMBUSTER_AGENT_ID_BOOK is not set.');
    console.error('  Create a "LinkedIn Sales Navigator Search Export" phantom at phantombuster.com');
    console.error('  and add its numeric ID to .env.local');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('Env OK:');
    console.log(`  PHANTOMBUSTER_API_KEY_BOOK  = ${PB_API_KEY.slice(0, 6)}...`);
    console.log(`  PHANTOMBUSTER_AGENT_ID_BOOK = ${PB_AGENT_ID}`);
    console.log(`  Search pools: ${SEARCH_URLS.length}`);
    console.log('Ready to launch');
    return;
  }

  // Ensure output directories exist
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Launch phantom (single launch, all three URLs joined by newline)
  console.log(`Launching phantom ${PB_AGENT_ID} with ${SEARCH_URLS.length} search pools…`);
  const containerId = await launchPhantom();
  console.log(`Container ID: ${containerId}`);

  // Poll until finished
  console.log('Polling every 15s (timeout 10 min)…');
  await pollUntilFinished(containerId);
  console.log('Phantom finished. Fetching results…');

  // Fetch and parse results
  const rawResults = await fetchResults(containerId);
  console.log(`Raw profiles received: ${rawResults.length}`);

  if (rawResults.length === 0) {
    console.error(
      'No results returned. Check the LinkedIn session cookie in your phantom settings.',
    );
    process.exit(1);
  }

  // Score, deduplicate, sort, take top 15
  const scored = rawResults
    .map((r) => scoreProfile(r as Record<string, unknown>))
    .filter((c) => c.name.trim().length > 0);

  const seen = new Set<string>();
  const deduped = scored.filter((c) => {
    const key = c.linkedinUrl || c.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => b.score - a.score);
  const top15 = deduped.slice(0, 15);

  // Print table to console
  console.log('\n┌─ Top 15 Foreword Writer Candidates ───────────────────────────┐');
  top15.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. [${String(c.score).padStart(2)}] ${c.name} — ${c.title}`);
    if (c.company) console.log(`       ${c.company}`);
  });
  console.log('└────────────────────────────────────────────────────────────────┘\n');

  // Build and save report
  const report = buildReport(top15);

  const localPath = path.join(REPORTS_DIR, OUTPUT_FILENAME);
  fs.writeFileSync(localPath, report, 'utf-8');
  console.log(`Report saved: ${localPath}`);

  // Save to Google Drive
  try {
    fs.mkdirSync(GDRIVE_DIR, { recursive: true });
    const gdrivePath = path.join(GDRIVE_DIR, OUTPUT_FILENAME);
    fs.writeFileSync(gdrivePath, report, 'utf-8');
    console.log(`Report saved: ${gdrivePath}`);
  } catch (err) {
    console.warn(`Could not write to Google Drive (may not be mounted): ${err}`);
  }

  console.log('\n━━━ Done ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
