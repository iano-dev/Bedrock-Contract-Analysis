// Compare the scope of Bedrock's uploaded quote/bid against the contract scope
// and return suggested redline language to send back to the GC. Best-effort and
// session-gated, like enrich; requires ANTHROPIC_API_KEY and a bid upload.

import { llmScopeCompare, llmAvailable } from '../../src/engine/llm.js';
import { authEnabled, userFromCookieHeader } from '../../src/auth/session.js';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (authEnabled() && !(await userFromCookieHeader(req.headers.get('cookie')))) {
    return json({ error: 'Sign in required.' }, 401);
  }
  if (!llmAvailable()) return json({ summary: '', redlines: [], skipped: 'no-api-key' });
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.contractText?.trim() || !body.bidText?.trim()) return json({ summary: '', redlines: [] });
  try {
    const result = await llmScopeCompare({ contractText: body.contractText, bidText: body.bidText });
    return json(result);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { path: '/api/scope-compare' };
