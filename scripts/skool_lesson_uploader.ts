// @deprecated — use skool-mcp MCP tools (skool_lessons_plan_upload → skool_lessons_backup → skool_lessons_upload_one → skool_lessons_verify). Do not delete until one end-to-end MCP upload is verified. See /Users/arajiv/skool-mcp/docs/SKOOL_MICROSERVICE_CONSOLIDATION.md.

/**
 * Skool Lesson Uploader
 * =====================
 * Uploads all 12 chapter drafts as content into their Skool classroom
 * lesson modules.
 *
 * Auth strategy: decrypts cookies directly from Chrome Profile 4 (the
 * proven approach — same profile the Skool session is active in), then
 * injects them into a Playwright browser context for fetch calls.
 *
 * Usage:
 *   cd /Users/arajiv/legal-citation-verifier/frontend
 *   npx tsx scripts/skool_lesson_uploader.ts
 */

import { chromium, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const SKOOL_API = 'https://api2.skool.com';
const SKOOL_CLASSROOM = 'https://www.skool.com/ghostwriter-tandem-6940/classroom';

const CHAPTERS: Array<{ num: string; moduleId: string; title: string }> = [
  { num: '01', moduleId: '9ae7730737db4870af412b199bf14813', title: '📖 Ch01 — The AI Readiness Audit' },
  { num: '02', moduleId: '5520a74f020e492ba0171de972e043ff', title: '📖 Ch02 — The Pricing Paradox' },
  { num: '03', moduleId: '0649852568ad4fd5bd19db3ac1314d53', title: '📖 Ch03 — The 90-Day Pilot' },
  { num: '04', moduleId: '7df38711db28412aab414607203a4305', title: '📖 Ch04 — The Safety Scaffolding' },
  { num: '05', moduleId: '4cf70eab4eae460dbf92cd4b8498e175', title: '📖 Ch05 — The Technology Stack' },
  { num: '06', moduleId: '706fcb6dd52e4070a778470361e4b684', title: '📖 Ch06 — The Partnership Conversation' },
  { num: '07', moduleId: '422bc6008e884378a6f043f62fcbc1bc', title: '📖 Ch07 — The Technology Register' },
  { num: '08', moduleId: '5824e7c6951c4f76a29451299fc1223b', title: '📖 Ch08 — The Governance Model' },
  { num: '09', moduleId: 'b25b30a096f74ef384397266874f10d6', title: '📖 Ch09 — The EU AI Act Roadmap' },
  { num: '10', moduleId: 'abc15c2ab2094865b7b678051a6fb93a', title: '📖 Ch10 — The PI Insurance Conversation' },
  { num: '11', moduleId: '81de00902460481c9f95e8f58d4cc905', title: '📖 Ch11 — The Change Management' },
  { num: '12', moduleId: '7c986acaf967458e8b49acbf1516906f', title: '📖 Ch12 — The First Year Forward' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Cookie decryption (Chrome Profile 4 → plain text values)
// ─────────────────────────────────────────────────────────────────────────────

function decryptChromeCookies(): Record<string, string> {
  // /tmp/decrypt_skool_cookies.py writes to /tmp/skool_cookies.json
  execSync('python3 /tmp/decrypt_skool_cookies.py', { encoding: 'utf-8' });
  return JSON.parse(fs.readFileSync('/tmp/skool_cookies.json', 'utf-8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload a single lesson
// ─────────────────────────────────────────────────────────────────────────────

async function uploadLesson(
  context: BrowserContext,
  moduleId: string,
  title: string,
  payloadPath: string
): Promise<number> {
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));
  // Update title in payload
  payload.metadata.title = title;

  const page = await context.newPage();
  try {
    await page.goto(SKOOL_CLASSROOM, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const result = await page.evaluate(
      async ({ url, payload }: { url: string; payload: object }) => {
        const res = await fetch(url, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return res.status;
      },
      { url: `${SKOOL_API}/courses/${moduleId}`, payload }
    );

    return result;
  } finally {
    await page.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀  Skool Lesson Uploader\n');

  // Verify payload files
  const missing = CHAPTERS.filter(ch => !fs.existsSync(`/tmp/ch${ch.num}_payload.json`));
  if (missing.length > 0) {
    console.error(`❌  Missing payloads: ${missing.map(c => c.num).join(', ')}`);
    process.exit(1);
  }

  // Decrypt cookies
  console.log('  🔓  Decrypting Skool session cookies from Chrome Profile 4...');
  let cookies: Record<string, string>;
  try {
    cookies = decryptChromeCookies();
    console.log(`  ✅  Got cookies: ${Object.keys(cookies).join(', ')}\n`);
  } catch (err: any) {
    console.error(`  ❌  Cookie decryption failed: ${err.message}`);
    process.exit(1);
  }

  // Launch fresh browser with injected cookies
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: {
      cookies: Object.entries(cookies).map(([name, value]) => ({
        name,
        value,
        domain: '.skool.com',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: true,
        sameSite: 'Lax' as const,
      })),
      origins: [],
    },
  });

  let uploaded = 0;
  let failed = 0;

  for (const ch of CHAPTERS) {
    process.stdout.write(`  Ch${ch.num}: ${ch.title.replace('📖 ', '')}... `);
    try {
      const status = await uploadLesson(context, ch.moduleId, ch.title, `/tmp/ch${ch.num}_payload.json`);
      if (status === 200) {
        console.log('✅');
        uploaded++;
      } else {
        console.log(`❌  HTTP ${status}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`❌  ${err.message}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  await browser.close();
  console.log(`\n${uploaded === 12 ? '🎉' : '⚠️ '}  ${uploaded}/12 chapters uploaded.`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
