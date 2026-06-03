/**
 * Skool API Client
 * ================
 * Thin wrapper around api2.skool.com for creating posts and comments
 * programmatically. Uses cookie-based auth (session cookie from browser).
 *
 * Auth: paste the Cookie header from browser DevTools → Network tab into
 * the SKOOL_SESSION_COOKIE env var. Typically valid for several weeks.
 *
 * API base: https://api2.skool.com
 * Endpoint: POST /posts?follow=false
 *
 * Ghostwriter Tandem group: d3a075fcc6a44ecd9737cad305b95a09
 */

const SKOOL_API = 'https://api2.skool.com/posts?follow=false';

export const GHOSTWRITER_TANDEM_GROUP_ID = 'd3a075fcc6a44ecd9737cad305b95a09';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SkoolPost {
  group_id: string;
  title: string;
  content: string;
}

export interface SkoolComment {
  group_id: string;
  root_id: string;   // ID of the top-level post
  parent_id: string; // ID of the item being replied to (same as root_id for direct comments)
  content: string;
}

export interface SkoolResult {
  id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builders (pure — testable without network)
// ─────────────────────────────────────────────────────────────────────────────

/** Builds the JSON body for creating a new top-level post. */
export function buildPostPayload(post: SkoolPost): object {
  return {
    post_type: 'generic',
    group_id: post.group_id,
    metadata: {
      action: 0,
      title: post.title,
      content: post.content,
    },
  };
}

/** Builds the JSON body for creating a comment on an existing post. */
export function buildCommentPayload(comment: SkoolComment): object {
  return {
    post_type: 'comment',
    group_id: comment.group_id,
    root_id: comment.root_id,
    parent_id: comment.parent_id,
    metadata: {
      title: '',
      content: comment.content,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// API calls
// ─────────────────────────────────────────────────────────────────────────────

async function skoolFetch(cookies: string, payload: object, wafToken?: string): Promise<SkoolResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Cookie': cookies,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Origin': 'https://www.skool.com',
    'Referer': 'https://www.skool.com/',
  };
  // WAF token optional — only needed for browser SSR pages, not api2 REST
  const token = wafToken ?? process.env.SKOOL_WAF_TOKEN;
  if (token) headers['x-aws-waf-token'] = token;

  const res = await fetch(SKOOL_API, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Skool API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { id: string };
  if (!data.id) throw new Error(`Skool API returned no id: ${JSON.stringify(data)}`);
  return { id: data.id };
}

/** Creates a new top-level post in the group. Returns the post ID. */
export async function createPost(cookies: string, post: SkoolPost, wafToken?: string): Promise<SkoolResult> {
  return skoolFetch(cookies, buildPostPayload(post), wafToken);
}

/** Creates a comment on an existing post. Returns the comment ID. */
export async function createComment(cookies: string, comment: SkoolComment, wafToken?: string): Promise<SkoolResult> {
  return skoolFetch(cookies, buildCommentPayload(comment), wafToken);
}
