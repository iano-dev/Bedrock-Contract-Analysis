// Dedicated, exhaustive extraction of the exact scope of Bedrock's work. Runs as
// its own bounded Claude call (separate from enrich) so the long, nested
// Inclusions / Clarifications / Exclusions / rates list isn't summarized away.
// Best-effort and session-gated; requires ANTHROPIC_API_KEY.

import { llmExtractScope, llmAvailable } from '../../src/engine/llm.js';
import { authEnabled, userFromCookieHeader } from '../../src/auth/session.js';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (authEnabled() && !(await userFromCookieHeader(req.headers.get('cookie')))) {
    return json({ error: 'Sign in required.' }, 401);
  }
  if (!llmAvailable()) return json({ scopeItems: [], skipped: 'no-api-key' });
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.documentText?.trim()) return json({ scopeItems: [] });
  try {
    return json(await llmExtractScope(body.documentText));
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { path: '/api/scope' };
