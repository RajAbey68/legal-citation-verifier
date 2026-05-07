#!/usr/bin/env npx tsx
/**
 * Forward Writer Research — LinkedIn via PhantomBuster
 * =====================================================
 * Searches LinkedIn for top 10 ideal foreword candidates for
 * "The Digital Law Firm" (Law Society Publishing, Q4 2026).
 *
 * PRE-FLIGHT (one-time setup):
 *   1. Add PHANTOMBUSTER_API_KEY_BOOK to .env.local
 *   2. Add PHANTOMBUSTER_AGENT_ID_BOOK to .env.local
 *      (LinkedIn Search Export phantom — see plan file for setup steps)
 *
 * Usage:
 *   cd /Users/arajiv/legal-citation-verifier/frontend
 *   npx tsx scripts/forward_writer_research.ts
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const PB_API_KEY = process.env.PHANTOMBUSTER_API_KEY_BOOK;
const PB_AGENT_ID = process.env.PHANTOMBUSTER_AGENT_ID_BOOK;
const PB_BASE = 'https://api.phantombuster.com/api/v2';

const REPORTS_DIR = path.join(process.env.HOME!, 'Downloads', 'Digital_Law_Firm_Chapters', 'reports');
const GDRIVE_DIR = path.join(
  process.env.HOME!,
  'Library/CloudStorage/GoogleDrive-rajabey68@gmail.com/My Drive/Digital Law firms/First Author Review',
);
const OUTPUT_FILENAME = 'forward_writer_candidates.md';

// ─────────────────────────────────────────────────────────────────────────────
// Search queries — three target pools
// These are LinkedIn keyword search URLs (standard search, no Sales Nav required)
// ─────────────────────────────────────────────────────────────────────────────
const SEARCH_QUERIES = [
  // Pool A: UK legal technology leaders
  'https://www.linkedin.com/search/results/people/?keywords=legal%20technology%20director%20UK&origin=GLOBAL_SEARCH_HEADER',
  // Pool B: Law firm AI / practice management
  'https://www.linkedin.com/search/results/people/?keywords=law%20firm%20AI%20managing%20partner%20UK&origin=GLOBAL_SEARCH_HEADER',
  // Pool C: LawTech / Law Society / SRA figures
  'https://www.linkedin.com/search/results/people/?keywords=lawtech%20UK%20legal%20innovation%20director&origin=GLOBAL_SEARCH_HEADER',
];

// ─────────────────────────────────────────────────────────────────────────────
// Scoring criteria for forward writer suitability
// ─────────────────────────────────────────────────────────────────────────────
interface Candidate {
  name: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  linkedinUrl: string;
  location: string;
  about: string;
  connections: number;
  score: number;
  scoreBreakdown: string[];
}

function scoreCandidate(raw: Record<string, string>): Candidate {
  const name = raw.fullName ?? raw.full_name ?? raw.name ?? `${raw.firstName ?? ''} ${raw.lastName ?? ''}`.trim();
  const title = (raw.title ?? raw.jobTitle ?? raw.headline ?? '').toLowerCase();
  const company = raw.company ?? raw.companyName ?? raw.currentCompany ?? '';
  const location = (raw.location ?? raw.locationName ?? '').toLowerCase();
  const about = (raw.summary ?? raw.about ?? raw.description ?? '').toLowerCase();
  const linkedinUrl = raw.linkedInUrl ?? raw.profileUrl ?? raw.url ?? '';
  const connections = parseInt(raw.connectionsCount ?? raw.connections ?? '0', 10) || 0;

  const breakdown: string[] = [];
  let score = 0;

  // UK-based (+2)
  if (location.includes('united kingdom') || location.includes('england') || location.includes('wales') ||
      location.includes('london') || location.includes('uk')) {
    score += 2;
    breakdown.push('+2 UK-based');
  }

  // Law Society / SRA / LawTech UK / Legal Geek / CLOC affiliation (+3)
  const authorityOrgs = ['law society', 'sra ', 'solicitors regulation', 'lawtech', 'legal geek', 'cloc'];
  if (authorityOrgs.some((o) => company.toLowerCase().includes(o) || title.includes(o) || about.includes(o))) {
    score += 3;
    breakdown.push('+3 Regulatory/LawTech affiliation');
  }

  // Published author or academic (+2)
  if (about.includes('author') || about.includes('published') || about.includes('wrote') ||
      title.includes('author') || about.includes('book')) {
    score += 2;
    breakdown.push('+2 Published author');
  }

  // 500+ connections (influence proxy) (+1)
  if (connections >= 500) {
    score += 1;
    breakdown.push('+1 500+ connections');
  }

  // AI / legal technology keywords in headline (+1)
  const aiKeywords = ['artificial intelligence', 'legal technology', 'legal tech', ' ai ', 'lawtech', 'legaltech', 'automation'];
  if (aiKeywords.some((k) => title.includes(k) || about.slice(0, 300).includes(k))) {
    score += 1;
    breakdown.push('+1 AI/legal technology focus');
  }

  // Senior title (+1)
  const seniorTitles = ['managing partner', 'chief', 'president', 'chair ', 'chairman', 'director', 'ceo', 'cto', 'clo ', 'general counsel', 'head of'];
  if (seniorTitles.some((t) => title.includes(t))) {
    score += 1;
    breakdown.push('+1 Senior title');
  }

  // Practice management or SRA compliance relevance (+1)
  const relevanceKeywords = ['practice management', 'compliance', 'governance', 'sra', 'regulation', 'professional services'];
  if (relevanceKeywords.some((k) => title.includes(k) || about.slice(0, 500).includes(k))) {
    score += 1;
    breakdown.push('+1 Practice management/compliance relevance');
  }

  return {
    name,
    firstName: raw.firstName ?? name.split(' ')[0] ?? '',
    lastName: raw.lastName ?? name.split(' ').slice(1).join(' ') ?? '',
    title: raw.title ?? raw.jobTitle ?? raw.headline ?? '',
    company,
    linkedinUrl,
    location: raw.location ?? raw.locationName ?? '',
    about: raw.summary ?? raw.about ?? '',
    connections,
    score,
    scoreBreakdown: breakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PhantomBuster API calls (pattern from LeadSynch/server/services/phantomService.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function launchPhantom(searchUrl: string): Promise<string> {
  const res = await fetch(`${PB_BASE}/agents/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Phantombuster-Key': PB_API_KEY! },
    body: JSON.stringify({ id: PB_AGENT_ID, argument: { searches: searchUrl, numberOfProfiles: 30 } }),
  });
  if (!res.ok) throw new Error(`PhantomBuster launch failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { containerId: string };
  return data.containerId;
}

async function pollStatus(containerId: string, timeoutMs = 600_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${PB_BASE}/containers/fetch?id=${containerId}`, {
      headers: { 'X-Phantombuster-Key': PB_API_KEY! },
    });
    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
    const data = await res.json() as { status: string };
    console.log(`    Status: ${data.status}`);
    if (data.status === 'finished') return;
    if (data.status === 'failed') throw new Error('Phantom execution failed');
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error('Phantom timed out after 10 minutes');
}

async function fetchResults(containerId: string): Promise<Record<string, string>[]> {
  // Strategy 1: containers/fetch-result-object (direct JSON)
  const res1 = await fetch(`${PB_BASE}/containers/fetch-result-object?id=${containerId}`, {
    headers: { 'X-Phantombuster-Key': PB_API_KEY! },
  });
  if (res1.ok) {
    const data = await res1.json() as Record<string, string>[];
    if (Array.isArray(data) && data.length > 0) return data;
  }

  // Strategy 2: Extract S3 URL from console output log (LeadSynch pattern)
  const res2 = await fetch(`${PB_BASE}/containers/fetch-output?id=${containerId}`, {
    headers: { 'X-Phantombuster-Key': PB_API_KEY! },
  });
  if (res2.ok) {
    const log = await res2.text();
    const s3Match = log.match(/JSON saved at (https:\/\/[^\s\r\n]+\.json)/);
    if (s3Match) {
      const s3Res = await fetch(s3Match[1]);
      if (s3Res.ok) return await s3Res.json() as Record<string, string>[];
    }
  }

  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the output report
// ─────────────────────────────────────────────────────────────────────────────
function buildReport(top10: Candidate[]): string {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  const rows = top10
    .map((c, i) => {
      const why = c.scoreBreakdown.join(', ');
      const url = c.linkedinUrl ? `[Profile](${c.linkedinUrl})` : '—';
      return `| ${i + 1} | **${c.name}** | ${c.title} | ${c.company} | ${c.score}/10 | ${url} | ${why} |`;
    })
    .join('\n');

  const profiles = top10
    .map((c, i) => {
      return `### ${i + 1}. ${c.name} (Score: ${c.score}/10)

**Current role:** ${c.title}${c.company ? ` at ${c.company}` : ''}
**Location:** ${c.location || 'Not specified'}
**LinkedIn:** ${c.linkedinUrl || 'Not available'}
**Connections:** ${c.connections >= 500 ? '500+' : c.connections || 'Unknown'}

**Scoring:** ${c.scoreBreakdown.join(' | ')}

**Why ideal for the foreword:**
${generateWhyText(c)}

---`;
    })
    .join('\n\n');

  return `# Forward Writer Candidates — The Digital Law Firm
Generated: ${ts}
Book: The Digital Law Firm (Law Society Publishing, Q4 2026)
Authors: Rajiv Abeysinghe, Darren, Nick Lockett, Sushila

---

## Summary Table — Top 10 Candidates

| Rank | Name | Title | Organisation | Score | LinkedIn | Why Ideal |
|------|------|-------|-------------|-------|----------|-----------|
${rows}

---

## Detailed Profiles

${profiles}

---

## Scoring Methodology

| Criterion | Points |
|-----------|--------|
| UK-based | +2 |
| Law Society / SRA / LawTech UK affiliation | +3 |
| Published author | +2 |
| 500+ LinkedIn connections | +1 |
| AI / legal technology focus in headline | +1 |
| Senior title (Partner, Director, CEO, Chair, President) | +1 |
| Practice management / SRA compliance relevance | +1 |

**Maximum possible score: 11**

---

## Next Steps

1. Review profiles and confirm top 3 choices with all four authors
2. Check for any existing relationship with any of the four authors
3. Draft personalised outreach email (Chapter 12 mentions each author's area — match foreword writer to strongest overlap)
4. Approach via LinkedIn InMail or mutual connection introduction

---

*Generated by the Digital Law Firm Ghostwriter pipeline — forward_writer_research.ts*
`;
}

function generateWhyText(c: Candidate): string {
  const lines: string[] = [];
  if (c.scoreBreakdown.some((s) => s.includes('Regulatory'))) {
    lines.push('Direct regulatory credibility — their endorsement signals SRA/Law Society alignment to the book\'s primary audience.');
  }
  if (c.scoreBreakdown.some((s) => s.includes('Published author'))) {
    lines.push('Publishing track record — familiar with Law Society Publishing standards and audience expectations.');
  }
  if (c.scoreBreakdown.some((s) => s.includes('AI'))) {
    lines.push('AI/legal technology focus — directly aligned with the book\'s core subject matter.');
  }
  if (c.scoreBreakdown.some((s) => s.includes('practice management'))) {
    lines.push('Practice management experience — speaks to Sarah Mitchell\'s role and the book\'s operational frame.');
  }
  if (lines.length === 0) {
    lines.push('Senior UK legal professional with relevant seniority and audience reach.');
  }
  return lines.map((l) => `- ${l}`).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  // Pre-flight checks
  if (!PB_API_KEY) {
    console.error('❌ PHANTOMBUSTER_API_KEY_BOOK not set in .env.local');
    console.error('   See the plan file for setup instructions.');
    process.exit(1);
  }
  if (!PB_AGENT_ID) {
    console.error('❌ PHANTOMBUSTER_AGENT_ID_BOOK not set in .env.local');
    console.error('   Create a "LinkedIn Search Export" phantom at phantombuster.com and add its ID.');
    process.exit(1);
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  console.log('━━━ Forward Writer Research — The Digital Law Firm ━━━━━━━━━━━━');
  console.log(`Using phantom: ${PB_AGENT_ID}`);
  console.log(`Running ${SEARCH_QUERIES.length} search queries…\n`);

  const allRaw: Record<string, string>[] = [];

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const url = SEARCH_QUERIES[i];
    console.log(`[${i + 1}/${SEARCH_QUERIES.length}] Launching phantom for: ${url.slice(0, 80)}…`);

    try {
      const containerId = await launchPhantom(url);
      console.log(`  Container: ${containerId}`);
      console.log('  Polling for completion (up to 10 min)…');
      await pollStatus(containerId);
      console.log('  ✅ Complete — fetching results…');
      const results = await fetchResults(containerId);
      console.log(`  Found ${results.length} profiles`);
      allRaw.push(...results);
    } catch (err) {
      console.error(`  ⚠️  Query ${i + 1} failed: ${err}`);
    }

    // Brief pause between queries to protect LinkedIn session health
    if (i < SEARCH_QUERIES.length - 1) {
      console.log('  Waiting 60s before next query (session health)…');
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }

  console.log(`\nTotal raw profiles collected: ${allRaw.length}`);

  if (allRaw.length === 0) {
    console.error('❌ No profiles returned. Check your LinkedIn session cookie in the phantom settings.');
    process.exit(1);
  }

  // Score and rank
  const scored = allRaw
    .map((r) => scoreCandidate(r))
    .filter((c) => c.name && c.linkedinUrl) // must have name and URL
    .sort((a, b) => b.score - a.score);

  // Deduplicate by LinkedIn URL
  const seen = new Set<string>();
  const deduped = scored.filter((c) => {
    if (seen.has(c.linkedinUrl)) return false;
    seen.add(c.linkedinUrl);
    return true;
  });

  const top10 = deduped.slice(0, 10);
  console.log(`\nTop 10 candidates (from ${deduped.length} unique profiles):`);
  top10.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} — ${c.title} at ${c.company} (score: ${c.score})`);
  });

  // Write reports
  const report = buildReport(top10);
  const outputPath = path.join(REPORTS_DIR, OUTPUT_FILENAME);
  fs.writeFileSync(outputPath, report, 'utf-8');
  console.log(`\n✅ Report saved: ${outputPath}`);

  // Copy to Google Drive
  try {
    fs.mkdirSync(GDRIVE_DIR, { recursive: true });
    fs.copyFileSync(outputPath, path.join(GDRIVE_DIR, OUTPUT_FILENAME));
    console.log(`✅ Copied to Google Drive: First Author Review/${OUTPUT_FILENAME}`);
  } catch {
    console.warn('⚠️  Could not copy to Google Drive (Drive may not be mounted)');
  }

  console.log('\n━━━ Done ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
