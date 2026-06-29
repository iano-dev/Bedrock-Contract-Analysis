// Auth endpoints: POST /api/auth/login (exchange a Google ID token for a session
// cookie), GET /api/auth/me (current user), POST /api/auth/logout.

import { verifyGoogleToken, signSession, sessionCookie, clearCookie, userFromCookieHeader, authEnabled } from '../../src/auth/session.js';

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.endsWith('/me')) {
    const user = await userFromCookieHeader(req.headers.get('cookie'));
    return json({ user, authEnabled: authEnabled() });
  }

  if (path.endsWith('/logout')) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json', 'set-cookie': clearCookie() },
    });
  }

  if (path.endsWith('/login')) {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!authEnabled()) return json({ error: 'Google auth is not configured on this site.' }, 400);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const result = await verifyGoogleToken(body.credential);
    if (!result.ok) return json({ error: result.reason }, 403);
    const token = await signSession(result.user);
    return new Response(JSON.stringify({ user: result.user }), {
      headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(token) },
    });
  }

  return json({ error: 'Not found' }, 404);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { path: ['/api/auth/login', '/api/auth/me', '/api/auth/logout'] };
