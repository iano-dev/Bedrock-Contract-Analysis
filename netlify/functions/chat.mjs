// Chat endpoint: ask questions about the loaded contract. Session-gated when
// Google sign-in is enabled. Requires ANTHROPIC_API_KEY.

import { chatAboutContract, chatAvailable } from '../../src/engine/chat.js';
import { authEnabled, userFromCookieHeader } from '../../src/auth/session.js';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (authEnabled() && !(await userFromCookieHeader(req.headers.get('cookie')))) {
    return json({ error: 'Sign in required.' }, 401);
  }
  if (!chatAvailable()) {
    return json({ error: 'Chat needs the Claude API key (set ANTHROPIC_API_KEY).' }, 400);
  }
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.documentText || !body.documentText.trim()) return json({ error: 'No document loaded.' }, 400);
  if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: 'No message.' }, 400);
  try {
    const result = await chatAboutContract(body);
    return json(result);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { path: '/api/chat' };
