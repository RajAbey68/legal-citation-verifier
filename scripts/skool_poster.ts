// @deprecated — use skool-mcp MCP tools. See /Users/arajiv/skool-mcp/docs/SKOOL_MICROSERVICE_CONSOLIDATION.md.

/**
 * Skool Queue Poster
 * ==================
 * Reads skool_queue.json, posts each pending item via the Skool API,
 * and marks items as done. No browser required.
 *
 * Usage:
 *   cd /Users/arajiv/legal-citation-verifier/frontend
 *   SKOOL_SESSION_COOKIE="..." npx tsx scripts/skool_poster.ts
 *
 * Or set SKOOL_SESSION_COOKIE in .env.local and run:
 *   npx tsx scripts/skool_poster.ts
 *
 * Queue format (skool_queue.json):
 *   [
 *     { "type": "post", "title": "Post title", "content": "Body text" },
 *     { "type": "comment", "root_id": "POST_ID", "parent_id": "POST_ID", "content": "Comment text" }
 *   ]
 *
 * Items gain `posted: true` and `posted_at` after successful submission.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  createPost,
  createComment,
  GHOSTWRITER_TANDEM_GROUP_ID,
} from '../lib/skool/client';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

// ─────────────────────────────────────────────────────────────────────────────
// Queue item types
// ─────────────────────────────────────────────────────────────────────────────

interface QueuePost {
  type: 'post';
  title: string;
  content: string;
  group_id?: string;
  posted?: boolean;
  posted_at?: string;
  post_id?: string;
}

interface QueueComment {
  type: 'comment';
  root_id: string;
  parent_id: string;
  content: string;
  group_id?: string;
  posted?: boolean;
  posted_at?: string;
  comment_id?: string;
}

type QueueItem = QueuePost | QueueComment;

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const QUEUE_PATH = path.join(__dirname, 'skool_queue.json');
const DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const cookies = process.env.SKOOL_SESSION_COOKIE;
  if (!cookies) {
    console.error('❌  SKOOL_SESSION_COOKIE is not set.');
    console.error('    Paste the Cookie header from DevTools → Network tab into .env.local');
    process.exit(1);
  }

  const raw = fs.readFileSync(QUEUE_PATH, 'utf-8');
  const queue: QueueItem[] = JSON.parse(raw);
  const pending = queue.filter(item => !item.posted);

  if (pending.length === 0) {
    console.log('✅  Queue is empty — nothing to post.');
    return;
  }

  console.log(`📋  ${pending.length} item(s) to post to Skool...\n`);

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (item.posted) continue;

    try {
      if (item.type === 'post') {
        process.stdout.write(`  POST: "${item.title.slice(0, 60)}"...`);
        const result = await createPost(cookies, {
          group_id: item.group_id ?? GHOSTWRITER_TANDEM_GROUP_ID,
          title: item.title,
          content: item.content,
        });
        (queue[i] as QueuePost).posted = true;
        (queue[i] as QueuePost).posted_at = new Date().toISOString();
        (queue[i] as QueuePost).post_id = result.id;
        console.log(` ✅  id=${result.id}`);

      } else if (item.type === 'comment') {
        process.stdout.write(`  COMMENT on ${item.root_id.slice(0, 8)}...`);
        const result = await createComment(cookies, {
          group_id: item.group_id ?? GHOSTWRITER_TANDEM_GROUP_ID,
          root_id: item.root_id,
          parent_id: item.parent_id,
          content: item.content,
        });
        (queue[i] as QueueComment).posted = true;
        (queue[i] as QueueComment).posted_at = new Date().toISOString();
        (queue[i] as QueueComment).comment_id = result.id;
        console.log(` ✅  id=${result.id}`);
      }

      // Write queue after every successful post (safe even if interrupted)
      fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));

      if (i < queue.length - 1) await sleep(DELAY_MS);

    } catch (err) {
      console.error(`\n  ❌  Failed: ${(err as Error).message}`);
      console.error('     Stopping — fix the error and re-run. Already-posted items are marked safe.');
      process.exit(1);
    }
  }

  console.log(`\n✅  All done. ${pending.length} item(s) posted.`);
}

main();
