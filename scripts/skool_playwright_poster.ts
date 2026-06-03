// @deprecated — use skool-mcp MCP tools. See /Users/arajiv/skool-mcp/docs/SKOOL_MICROSERVICE_CONSOLIDATION.md.

/**
 * Skool Playwright Poster
 * =======================
 * Posts items from skool_queue.json using the existing Chrome profile.
 * No cookie extraction needed — httpOnly auth_token is already present
 * in the profile. WAF token fetched live from the page.
 *
 * Usage:
 *   cd /Users/arajiv/legal-citation-verifier/frontend
 *   npx tsx scripts/skool_playwright_poster.ts
 *
 * Requires: npm install playwright
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const QUEUE_FILE = path.join(__dirname, 'skool_queue.json');
const CHROME_PROFILE = `${process.env.HOME}/Library/Application Support/Google/Chrome/Profile 4`;
const COMMUNITY_URL = 'https://www.skool.com/ghostwriter-tandem-6940';
const GROUP_ID = 'd3a075fcc6a44ecd9737cad305b95a09';

interface QueueItem {
  type: 'post' | 'comment';
  title: string;
  content: string;
  posted?: boolean;
  posted_at?: string;
  post_id?: string;
}

async function postViaFetch(page: any, title: string, content: string): Promise<string> {
  const result = await page.evaluate(async ({ title, content, groupId }: { title: string; content: string; groupId: string }) => {
    const wafToken = await (window as any).AwsWafIntegration?.getToken?.();
    const payload = {
      post_type: 'generic',
      group_id: groupId,
      metadata: { action: 0, title, content },
    };
    const res = await fetch('https://api2.skool.com/posts?follow=false', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-aws-waf-token': wafToken || '',
        'Origin': 'https://www.skool.com',
        'Referer': 'https://www.skool.com/',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    return { status: res.status, body: text };
  }, { title, content, groupId: GROUP_ID });

  if (result.status === 200 || result.status === 201) {
    try {
      const data = JSON.parse(result.body);
      return data.id || 'ok';
    } catch {
      return 'ok';
    }
  }

  // Fallback: use native Skool composer UI
  console.log(`  API returned ${result.status} — using composer UI fallback`);
  return postViaUI(page, title, content);
}

async function postViaUI(page: any, title: string, content: string): Promise<string> {
  // Navigate to fresh feed
  await page.goto(COMMUNITY_URL, { waitUntil: 'domcontentloaded' });

  // Click "Write something"
  const writeEl = page.locator('text="Write something"').first();
  await writeEl.click();

  // Wait for Title input
  const titleInput = page.locator('input[placeholder="Title"]');
  await titleInput.waitFor({ timeout: 8000 });

  // Set title via React-compatible approach
  await titleInput.fill(title);
  await page.waitForTimeout(200);

  // Fill body
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await editor.fill(content);
  await page.waitForTimeout(300);

  // Click Post
  const postBtn = page.locator('button:has-text("Post")').first();
  await postBtn.click();

  // Wait for navigation to post URL
  await page.waitForURL(/ghostwriter-tandem-6940\/.+/, { timeout: 10000 });
  return page.url();
}

async function main() {
  const raw = fs.readFileSync(QUEUE_FILE, 'utf-8');
  const queue: QueueItem[] = JSON.parse(raw);
  const pending = queue.filter(q => !q.posted && q.type === 'post');

  if (pending.length === 0) {
    console.log('✅ Queue is empty — nothing to post.');
    return;
  }

  console.log(`📋  ${pending.length} post(s) to send to Skool...\n`);

  const browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
    headless: false, // Keep visible so WAF doesn't block
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = await browser.newPage();
  await page.goto(COMMUNITY_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000); // Let WAF integration initialise

  let posted = 0;
  let failed = 0;

  for (const item of queue) {
    if (item.posted || item.type !== 'post') continue;

    console.log(`  POST: "${item.title.slice(0, 60)}..."`);
    try {
      const id = await postViaFetch(page, item.title, item.content);
      item.posted = true;
      item.posted_at = new Date().toISOString();
      item.post_id = id;
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
      console.log(`  ✅  Posted (id: ${id})\n`);
      posted++;
      await page.waitForTimeout(2000); // Rate limit
    } catch (err: any) {
      console.error(`  ❌  Failed: ${err.message}\n`);
      failed++;
    }
  }

  await browser.close();
  console.log(`\n🎉  Done — ${posted} posted, ${failed} failed.`);
}

main().catch(err => { console.error(err); process.exit(1); });
