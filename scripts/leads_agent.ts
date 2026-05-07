#!/usr/bin/env npx tsx
/**
 * Scale Foundry: Legal — Leads List Agent
 * =========================================
 * Runs on a schedule (weekly via cron) using LinkedIn Sales Navigator
 * + PhantomBuster to find and maintain a growing list of ideal prospects
 * for the Scale Foundry: Legal community.
 *
 * Target: Practice managers and managing partners at UK law firms,
 * 4–25 fee earners, SRA-regulated. The exact reader of The Digital Law Firm.
 *
 * PRE-FLIGHT:
 *   1. Create a "LinkedIn Sales Navigator Search Export" phantom at phantombuster.com
 *   2. Connect your LinkedIn account via the li_at cookie in phantom settings
 *   3. Add to .env.local:
 *        PHANTOMBUSTER_API_KEY_BOOK=<your key>
 *        PHANTOMBUSTER_AGENT_ID_LEADS=<Sales Navigator Search Export phantom ID>
 *
 * Usage:
 *   npx tsx scripts/leads_agent.ts          # manual run
 *   npm run leads:refresh                   # same via package.json
 *
 * The agent appends new leads to leads_list.md and logs each run.
 * Duplicates (by LinkedIn URL) are automatically skipped.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const PB_API_KEY = process.env.PHANTOMBUSTER_API_KEY_BOOK;
const PB_AGENT_ID = process.env.PHANTOMBUSTER_AGENT_ID_LEADS;
const PB_BASE = 'https://api.phantombuster.com/api/v2';

const OUTPUT_DIR = path.join(
  process.env.HOME!,
  'Library/CloudStorage/GoogleDrive-rajabey68@gmail.com/My Drive/Digital Law firms/First Author Review',
);
const LEADS_FILE = path.join(OUTPUT_DIR, 'leads_list.md');
const LOG_FILE = path.join(OUTPUT_DIR, 'leads_agent_log.md');

// ─────────────────────────────────────────────────────────────────────────────
// Sales Navigator search queries — UK law firm practice managers & partners
// These use the Sales Nav people search URL format
// ─────────────────────────────────────────────────────────────────────────────
const SALES_NAV_SEARCHES = [
  // Practice managers at UK law firms
  'https://www.linkedin.com/sales/search/people?query=(filters%3AList((type%3ACURRENT_TITLE%2Cvalues%3AList((id%3A14%2CselectionType%3AINCLUDED)))%2C(type%3AGEO%2Cvalues%3AList((id%3A101165590%2CselectionType%3AINCLUDED))))%2CkeywordFirstName%3A%2CkeywordLastName%3A%2CkeywordTitle%3Apractice%2520manager%2CkeywordCompany%3Asolicitors)',
  // Managing partners at regional UK law firms
  'https://www.linkedin.com/sales/search/people?query=(filters%3AList((type%3AGEO%2Cvalues%3AList((id%3A101165590%2CselectionType%3AINCLUDED))))%2CkeywordTitle%3Amanaging%2520partner%2CkeywordCompany%3Asolicitors)',
  // Legal operations / law firm technology directors UK
  'https://www.linkedin.com/sales/search/people?query=(filters%3AList((type%3AGEO%2Cvalues%3AList((id%3A101165590%2CselectionType%3AINCLUDED))))%2CkeywordTitle%3Alegal%2520operations%2CkeywordCompany%3Alaw)',
];

interface Lead {
  name: string;
  title: string;
  company: string;
  linkedinUrl: string;
  location: string;
  connections: number;
  addedDate: string;
  source: string;
  score: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring — how well does this person match the Scale Foundry: Legal prospect?
// ─────────────────────────────────────────────────────────────────────────────
function scoreLead(raw: Record<string, string>): Lead {
  const title = (raw.title ?? raw.jobTitle ?? raw.headline ?? '').toLowerCase();
  const company = (raw.company ?? raw.companyName ?? '').toLowerCase();
  const location = (raw.location ?? '').toLowerCase();
  const connections = parseInt(raw.connectionsCount ?? '0', 10) || 0;

  let score = 0;

  // UK-based
  if (['united kingdom', 'england', 'wales', 'london', ', uk', '(uk)'].some((t) => location.includes(t))) score += 2;

  // Practice manager or managing partner (primary target)
  if (title.includes('practice manager') || title.includes('managing partner')) score += 3;

  // Law firm / solicitors
  if (['solicitors', 'law', 'legal'].some((t) => company.includes(t))) score += 2;

  // Small/medium firm signal (not BigLaw)
  const bigLaw = ['linklaters', 'clifford chance', 'freshfields', 'slaughter', 'allen & overy', 'herbert smith', 'ashurst', 'norton rose', 'hogan lovells', 'bird & bird', 'cms ', 'simmons'];
  if (!bigLaw.some((f) => company.includes(f))) score += 1;

  // Regional / high street signal
  const regional = ['regional', 'high street', 'local', 'community'];
  if (regional.some((t) => company.includes(t) || title.includes(t))) score += 1;

  // 100–500 connections (not a ghost profile, not already overcontacted)
  if (connections >= 100 && connections <= 500) score += 1;

  return {
    name: raw.fullName ?? raw.full_name ?? raw.name ?? `${raw.firstName ?? ''} ${raw.lastName ?? ''}`.trim(),
    title: raw.title ?? raw.jobTitle ?? raw.headline ?? '',
    company: raw.company ?? raw.companyName ?? '',
    linkedinUrl: raw.linkedInUrl ?? raw.profileUrl ?? '',
    location: raw.location ?? '',
    connections,
    addedDate: new Date().toISOString().slice(0, 10),
    source: 'PhantomBuster Sales Nav',
    score,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Load existing leads to deduplicate
// ─────────────────────────────────────────────────────────────────────────────
function loadExistingUrls(): Set<string> {
  if (!fs.existsSync(LEADS_FILE)) return new Set();
  const content = fs.readFileSync(LEADS_FILE, 'utf-8');
  const urls = new Set<string>();
  for (const line of content.split('\n')) {
    const match = line.match(/https:\/\/www\.linkedin\.com\/in\/[^\s)]+/);
    if (match) urls.add(match[0]);
  }
  return urls;
}

// ─────────────────────────────────────────────────────────────────────────────
// PhantomBuster API calls
// ─────────────────────────────────────────────────────────────────────────────
async function launchPhantom(searchUrl: string): Promise<string> {
  const res = await fetch(`${PB_BASE}/agents/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Phantombuster-Key': PB_API_KEY! },
    body: JSON.stringify({ id: PB_AGENT_ID, argument: { searches: searchUrl, numberOfProfiles: 25 } }),
  });
  if (!res.ok) throw new Error(`Launch failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { containerId: string };
  return data.containerId;
}

async function pollStatus(containerId: string): Promise<void> {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${PB_BASE}/containers/fetch?id=${containerId}`, {
      headers: { 'X-Phantombuster-Key': PB_API_KEY! },
    });
    const data = await res.json() as { status: string };
    if (data.status === 'finished') return;
    if (data.status === 'failed') throw new Error('Phantom failed');
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error('Timeout');
}

async function fetchResults(containerId: string): Promise<Record<string, string>[]> {
  const res = await fetch(`${PB_BASE}/containers/fetch-result-object?id=${containerId}`, {
    headers: { 'X-Phantombuster-Key': PB_API_KEY! },
  });
  if (res.ok) {
    const data = await res.json() as Record<string, string>[];
    if (Array.isArray(data) && data.length > 0) return data;
  }
  // Fallback: S3 URL from console output
  const res2 = await fetch(`${PB_BASE}/containers/fetch-output?id=${containerId}`, {
    headers: { 'X-Phantombuster-Key': PB_API_KEY! },
  });
  if (res2.ok) {
    const log = await res2.text();
    const match = log.match(/JSON saved at (https:\/\/[^\s\r\n]+\.json)/);
    if (match) {
      const s3 = await fetch(match[1]);
      if (s3.ok) return await s3.json() as Record<string, string>[];
    }
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Write / append leads to the master list
// ─────────────────────────────────────────────────────────────────────────────
function appendToLeadsList(newLeads: Lead[]): void {
  const date = new Date().toISOString().slice(0, 10);
  const isNew = !fs.existsSync(LEADS_FILE);

  const header = isNew ? `# Scale Foundry: Legal — Prospect Leads List

Target: Practice managers and managing partners at UK law firms (4–25 fee earners, SRA-regulated)
Community: skool.com/scalefoundrylegal
Book: The Digital Law Firm (Law Society Publishing, Q4 2026)

Scoring: UK-based (+2) | Practice manager/managing partner (+3) | Law firm (+2) | Not BigLaw (+1) | Regional signal (+1) | 100–500 connections (+1)

---

` : '';

  const section = `## Run: ${date} — ${newLeads.length} new leads added

| Score | Name | Title | Firm | Location | LinkedIn |
|-------|------|-------|------|----------|----------|
${newLeads.map((l) => `| ${l.score} | ${l.name} | ${l.title} | ${l.company} | ${l.location} | [Profile](${l.linkedinUrl}) |`).join('\n')}

---

`;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.appendFileSync(LEADS_FILE, header + section, 'utf-8');
}

function appendToLog(message: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, `[${ts}] ${message}\n`, 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!PB_API_KEY) {
    console.error('❌ PHANTOMBUSTER_API_KEY_BOOK not set in .env.local');
    process.exit(1);
  }
  if (!PB_AGENT_ID) {
    console.error('❌ PHANTOMBUSTER_AGENT_ID_LEADS not set in .env.local');
    console.error('   Create a "LinkedIn Sales Navigator Search Export" phantom and add its ID.');
    process.exit(1);
  }

  console.log('━━━ Scale Foundry: Legal — Leads Agent ━━━━━━━━━━━━━━━━━━━━━━━');
  appendToLog(`Run started — ${SALES_NAV_SEARCHES.length} queries`);

  const existingUrls = loadExistingUrls();
  console.log(`Existing leads: ${existingUrls.size}`);

  const allRaw: Record<string, string>[] = [];

  for (let i = 0; i < SALES_NAV_SEARCHES.length; i++) {
    const url = SALES_NAV_SEARCHES[i];
    console.log(`\n[${i + 1}/${SALES_NAV_SEARCHES.length}] Launching phantom…`);
    try {
      const containerId = await launchPhantom(url);
      await pollStatus(containerId);
      const results = await fetchResults(containerId);
      console.log(`  ✅ ${results.length} profiles`);
      allRaw.push(...results);
    } catch (err) {
      console.error(`  ⚠️  Query ${i + 1} failed: ${err}`);
      appendToLog(`Query ${i + 1} failed: ${err}`);
    }
    if (i < SALES_NAV_SEARCHES.length - 1) {
      console.log('  Waiting 60s (session health)…');
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }

  // Score, deduplicate, filter minimum score >= 4
  const scored = allRaw
    .map(scoreLead)
    .filter((l) => l.name && l.linkedinUrl && !existingUrls.has(l.linkedinUrl) && l.score >= 4)
    .sort((a, b) => b.score - a.score);

  // Deduplicate within this batch
  const seen = new Set<string>();
  const newLeads = scored.filter((l) => {
    if (seen.has(l.linkedinUrl)) return false;
    seen.add(l.linkedinUrl);
    return true;
  });

  console.log(`\nNew leads (score ≥ 4): ${newLeads.length}`);

  if (newLeads.length > 0) {
    appendToLeadsList(newLeads);
    console.log(`✅ Appended to: ${LEADS_FILE}`);
  } else {
    console.log('No new qualifying leads this run.');
  }

  const logMsg = `Run complete — ${allRaw.length} raw → ${newLeads.length} new leads added (${existingUrls.size + newLeads.length} total)`;
  appendToLog(logMsg);
  console.log(`\n${logMsg}`);
  console.log('━━━ Done ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch((err) => {
  console.error('Fatal:', err);
  appendToLog(`FATAL: ${err}`);
  process.exit(1);
});
