// Netlify serverless function: run the rules engine + optional Claude pass over
// text that the browser already extracted (and OCR'd). Stateless, pure JS — no
// native binaries, no file handling. Set ANTHROPIC_API_KEY in the Netlify site
// environment to enable the Claude-assisted pass.

import { analyze } from '../../src/engine/analyze.js';
import { authEnabled, userFromCookieHeader } from '../../src/auth/session.js';

// Rules engine only — fast and never times out. The optional Claude pass runs
// separately via /api/enrich so a slow LLM call can't break the main analysis.
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (authEnabled() && !(await userFromCookieHeader(req.headers.get('cookie')))) {
    return json({ error: 'Sign in required.' }, 401);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.text || !body.text.trim()) {
    return json({ error: 'No contract text supplied (extraction may have failed in the browser).' }, 400);
  }
  try {
    const analysis = analyze({
      text: body.text,
      pages: body.pages,
      fileName: body.fileName,
      tier: body.tier,
      bidAssumptions: body.bidAssumptions,
    });
    if (body.extraction) analysis.extraction = body.extraction;
    analysis.llm = { used: false };
    return json({ analysis });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { path: '/api/analyze' };
