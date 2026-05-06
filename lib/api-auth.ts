/**
 * API key authentication for the Verify microservice.
 *
 * Design:
 *  - Auth is opt-in via VERIFY_API_AUTH_ENABLED=true (default: off, preserving
 *    existing open-access behaviour for the Digital Law Firm prototype).
 *  - Each org has its own key stored in an env var:
 *      VERIFY_API_KEY_<ORG_ID_UPPERCASED_UNDERSCORED>
 *    e.g.  VERIFY_API_KEY_DIGITAL_LAW_FIRM=sk-dlf-...
 *          VERIFY_API_KEY_FINANCE_UK=sk-fin-...
 *  - Keys are passed via:
 *      Authorization: Bearer <key>   (preferred)
 *      X-Api-Key: <key>              (fallback)
 *  - Returns:
 *      null   → auth passed (or disabled)
 *      401    → no key supplied
 *      403    → wrong key
 */

import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Pure helpers (no I/O — easy to unit-test)
// ---------------------------------------------------------------------------

/**
 * Convert an org_id slug to the corresponding env var name.
 * "digital-law-firm" → "VERIFY_API_KEY_DIGITAL_LAW_FIRM"
 */
export function orgIdToEnvKey(orgId: string): string {
  return `VERIFY_API_KEY_${orgId.toUpperCase().replace(/-/g, '_')}`;
}

/**
 * Check whether candidateKey matches the configured key for orgId.
 * Returns false (not an error) when no key is configured — callers decide
 * whether to treat an unconfigured org as open or closed.
 */
export function validateApiKey(orgId: string, candidateKey: string): boolean {
  if (!candidateKey) return false;
  const envKey = orgIdToEnvKey(orgId);
  const configured = process.env[envKey];
  if (!configured) return false;
  // Constant-time comparison not available in edge runtime; keys are long
  // random strings so timing attacks are not a practical concern here.
  return configured === candidateKey;
}

/**
 * Extract the raw API key from a request's headers.
 * Returns null when no recognisable auth header is found.
 */
export function extractApiKey(request: Request): string | null {
  const authorization = request.headers.get('Authorization') ?? request.headers.get('authorization');
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1];
  }
  const xApiKey = request.headers.get('X-Api-Key') ?? request.headers.get('x-api-key');
  if (xApiKey) return xApiKey;
  return null;
}

// ---------------------------------------------------------------------------
// Route-level guard
// ---------------------------------------------------------------------------

/**
 * requireAuth — call at the top of each API route handler.
 *
 * Returns null when the request is allowed to proceed.
 * Returns a NextResponse (401 or 403) when it should be rejected.
 *
 * Auth is bypassed entirely when VERIFY_API_AUTH_ENABLED !== 'true'.
 */
export async function requireAuth(
  orgId: string,
  request: Request
): Promise<NextResponse | null> {
  if (process.env.VERIFY_API_AUTH_ENABLED !== 'true') {
    return null; // auth disabled — open access
  }

  const candidateKey = extractApiKey(request);

  if (!candidateKey) {
    return NextResponse.json(
      { error: 'API key required. Supply via Authorization: Bearer <key> or X-Api-Key header.' },
      { status: 401 }
    );
  }

  if (!validateApiKey(orgId, candidateKey)) {
    return NextResponse.json(
      { error: 'Invalid API key for this organisation.' },
      { status: 403 }
    );
  }

  return null; // authenticated
}
