// Read an uploaded bid/estimate (text extracted in the browser) and return the
// structured assumptions for the bid-vs-schedule cross-check. Session-gated when
// Google sign-in is on; requires ANTHROPIC_API_KEY.

import { llmParseBid, llmAvailable } from '../../src/engine/llm.js';
import { authEnabled, userFromCookieHeader } from '../../src/auth/session.js';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (authEnabled() && !(await userFromCookieHeader(req.headers.get('cookie')))) {
    return json({ error: 'Sign in required.' }, 401);
  }
  if (!llmAvailable()) return json({ assumptions: {}, skipped: 'no-api-key' });
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.bidText || !body.bidText.trim()) return json({ error: 'No bid text.' }, 400);
  try {
    const assumptions = await llmParseBid(body.bidText);
    return json({ assumptions });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { path: '/api/parse-bid' };
