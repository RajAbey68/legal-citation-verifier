/**
 * WhatsApp Client — GhostWright
 * ==============================
 * Thin fetch() wrapper around the WhatToDo Railway gateway.
 * GhostWright never touches Baileys directly — all sends go
 * through the single paired session on Railway.
 *
 * Gateway: https://loving-upliftment-production-22b6.up.railway.app
 * Auth:    X-API-Key header (set WHATTODO_API_KEY in .env.local)
 */

const GATEWAY = process.env.WHATTODO_RAILWAY_URL ?? 'https://loving-upliftment-production-22b6.up.railway.app';

function gatewayHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = process.env.WHATTODO_API_KEY;
  if (key) headers['X-API-Key'] = key;
  return headers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WhatsAppGroup {
  jid: string;        // e.g. "120363026675410554@g.us"
  name: string;
  memberCount: number;
}

export interface SendGroupResult {
  success: boolean;
  groupJid: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lists all WhatsApp groups the paired account is a member of.
 * Use this once to discover the Ghostwriter Tandem group JID.
 */
export async function listGroups(): Promise<WhatsAppGroup[]> {
  const res = await fetch(`${GATEWAY}/api/whatsapp/groups`, {
    headers: gatewayHeaders(),
  });
  if (!res.ok) throw new Error(`WhatsApp gateway error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { groups: WhatsAppGroup[] };
  return data.groups;
}

/**
 * Sends a plain-text message to a WhatsApp group.
 * @param groupJid  Must end with @g.us (e.g. "120363026675410554@g.us")
 * @param message   Plain text — supports WhatsApp markdown (*bold*, _italic_)
 */
export async function sendGroupMessage(groupJid: string, message: string): Promise<SendGroupResult> {
  if (!groupJid.endsWith('@g.us')) {
    throw new Error(`Invalid groupJid — must end with @g.us, got: ${groupJid}`);
  }
  const res = await fetch(`${GATEWAY}/api/whatsapp/send-group`, {
    method: 'POST',
    headers: gatewayHeaders(),
    body: JSON.stringify({ groupJid, message }),
  });
  if (!res.ok) throw new Error(`WhatsApp gateway error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<SendGroupResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: pre-formatted GhostWright notifications
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a chapter audio-ready notification to the Ghostwriter Tandem group.
 * groupJid comes from WHATTODO_GHOSTWRITER_GROUP_JID env var.
 */
export async function notifyChapterAudioReady(chapter: number, chapterTitle: string): Promise<void> {
  const groupJid = process.env.WHATTODO_GHOSTWRITER_GROUP_JID;
  if (!groupJid) throw new Error('WHATTODO_GHOSTWRITER_GROUP_JID is not set in .env.local');

  const message = [
    `📻 *Chapter ${String(chapter).padStart(2, '0')} Audio Ready*`,
    `_${chapterTitle}_`,
    '',
    'NotebookLM deep-dive podcast is now available in the Ghostwriter Tandem community.',
    '',
    '👉 https://www.skool.com/ghostwriter-tandem-6940',
  ].join('\n');

  await sendGroupMessage(groupJid, message);
}

/**
 * Sends a quality review summary notification to the Ghostwriter Tandem group.
 */
export async function notifyQualityReview(chapter: number, chapterTitle: string, author: string, flagCount: number): Promise<void> {
  const groupJid = process.env.WHATTODO_GHOSTWRITER_GROUP_JID;
  if (!groupJid) throw new Error('WHATTODO_GHOSTWRITER_GROUP_JID is not set in .env.local');

  const message = [
    `🔍 *Quality Review Complete — Chapter ${String(chapter).padStart(2, '0')}*`,
    `_${chapterTitle}_ · Author: ${author}`,
    '',
    `${flagCount} flag${flagCount !== 1 ? 's' : ''} raised for author review.`,
    '',
    '👉 https://www.skool.com/ghostwriter-tandem-6940',
  ].join('\n');

  await sendGroupMessage(groupJid, message);
}
