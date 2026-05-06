/**
 * API key authentication tests.
 *
 * validateApiKey(orgId, candidateKey) must:
 *   - return true when the key matches the org's configured API key
 *   - return false when the key is wrong
 *   - return false when no key is configured for the org
 *   - return false when candidateKey is empty / undefined
 *
 * extractApiKey(request) must:
 *   - read from Authorization: Bearer <key>
 *   - read from X-Api-Key header as fallback
 *   - return null when neither header is present
 *
 * requireAuth(orgId, request) must:
 *   - return null (pass) when the key is valid
 *   - return a NextResponse 401 when the key is missing
 *   - return a NextResponse 403 when the key is wrong
 *   - bypass auth entirely when VERIFY_API_AUTH_ENABLED !== 'true'
 */

import { validateApiKey, extractApiKey, requireAuth } from '../lib/api-auth';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com', { headers });
}

// ---------------------------------------------------------------------------
// validateApiKey
// ---------------------------------------------------------------------------

describe('validateApiKey', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('returns true when key matches org env var', () => {
    process.env.VERIFY_API_KEY_DIGITAL_LAW_FIRM = 'secret-key-123';
    expect(validateApiKey('digital-law-firm', 'secret-key-123')).toBe(true);
  });

  it('returns false when key does not match', () => {
    process.env.VERIFY_API_KEY_DIGITAL_LAW_FIRM = 'secret-key-123';
    expect(validateApiKey('digital-law-firm', 'wrong-key')).toBe(false);
  });

  it('returns false when no env var configured for org', () => {
    delete process.env.VERIFY_API_KEY_DIGITAL_LAW_FIRM;
    expect(validateApiKey('digital-law-firm', 'any-key')).toBe(false);
  });

  it('returns false when candidateKey is empty string', () => {
    process.env.VERIFY_API_KEY_DIGITAL_LAW_FIRM = 'secret-key-123';
    expect(validateApiKey('digital-law-firm', '')).toBe(false);
  });

  it('returns false when candidateKey is undefined', () => {
    process.env.VERIFY_API_KEY_DIGITAL_LAW_FIRM = 'secret-key-123';
    expect(validateApiKey('digital-law-firm', undefined as unknown as string)).toBe(false);
  });

  it('converts org_id hyphens to underscores for env var lookup', () => {
    process.env.VERIFY_API_KEY_FINANCE_UK = 'finance-secret';
    expect(validateApiKey('finance-uk', 'finance-secret')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractApiKey
// ---------------------------------------------------------------------------

describe('extractApiKey', () => {
  it('extracts key from Authorization Bearer header', () => {
    const req = makeRequest({ Authorization: 'Bearer my-token' });
    expect(extractApiKey(req)).toBe('my-token');
  });

  it('extracts key from X-Api-Key header', () => {
    const req = makeRequest({ 'X-Api-Key': 'my-token' });
    expect(extractApiKey(req)).toBe('my-token');
  });

  it('prefers Authorization over X-Api-Key', () => {
    const req = makeRequest({ Authorization: 'Bearer bearer-token', 'X-Api-Key': 'api-key-token' });
    expect(extractApiKey(req)).toBe('bearer-token');
  });

  it('returns null when no auth header present', () => {
    const req = makeRequest();
    expect(extractApiKey(req)).toBeNull();
  });

  it('returns null for malformed Authorization header without Bearer', () => {
    const req = makeRequest({ Authorization: 'Token something' });
    expect(extractApiKey(req)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe('requireAuth', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    process.env.VERIFY_API_AUTH_ENABLED = 'true';
    process.env.VERIFY_API_KEY_DIGITAL_LAW_FIRM = 'valid-key';
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('returns null (pass) when key is valid', async () => {
    const req = makeRequest({ Authorization: 'Bearer valid-key' });
    const result = await requireAuth('digital-law-firm', req);
    expect(result).toBeNull();
  });

  it('returns 401 when no API key provided', async () => {
    const req = makeRequest();
    const result = await requireAuth('digital-law-firm', req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns 403 when wrong API key provided', async () => {
    const req = makeRequest({ Authorization: 'Bearer wrong-key' });
    const result = await requireAuth('digital-law-firm', req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('bypasses auth when VERIFY_API_AUTH_ENABLED is not true', async () => {
    process.env.VERIFY_API_AUTH_ENABLED = 'false';
    const req = makeRequest(); // no key
    const result = await requireAuth('digital-law-firm', req);
    expect(result).toBeNull();
  });

  it('bypasses auth when VERIFY_API_AUTH_ENABLED is unset', async () => {
    delete process.env.VERIFY_API_AUTH_ENABLED;
    const req = makeRequest();
    const result = await requireAuth('digital-law-firm', req);
    expect(result).toBeNull();
  });

  it('returns 401 JSON body with error field', async () => {
    const req = makeRequest();
    const result = await requireAuth('digital-law-firm', req);
    const body = await result!.json();
    expect(body).toHaveProperty('error');
  });
});
