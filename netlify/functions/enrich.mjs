// Optional Claude-assisted enrichment — a single bounded call that returns the
// contract facts and clauses the rules engine missed. Best-effort: the browser
// already has the rules-engine result, so if this is slow or fails, nothing
// breaks. Session-gated when Google sign-in is on; requires ANTHROPIC_API_KEY.

import { llmQuickEnrich, normalizeLlmFlags, llmAvailable } from '../../src/engine/llm.js';
import { applyTierPosture } from '../../src/engine/tiers.js';
import { authEnabled, userFromCookieHeader } from '../../src/auth/session.js';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (authEnabled() && !(await userFromCookieHeader(req.headers.get('cookie')))) {
    return json({ error: 'Sign in required.' }, 401);
  }
  if (!llmAvailable()) return json({ flags: [], facts: null, skipped: 'no-api-key' });
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.documentText || !body.documentText.trim()) return json({ error: 'No document.' }, 400);
  try {
    const existingFlags = body.existingFlags || [];
    const { facts, rawFlags, scopeItems, truncated } = await llmQuickEnrich(body.documentText, { existingFlags });
    let flags = normalizeLlmFlags(rawFlags, { text: body.documentText, pages: body.pages || [], existingFlags });
    flags = applyTierPosture(flags, Number(body.tier) === 1 ? 1 : 2);
    return json({ flags, facts, scope: scopeItems, truncated });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { path: '/api/enrich' };
