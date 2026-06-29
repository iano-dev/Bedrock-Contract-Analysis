// Google sign-in + session helpers, shared by the Netlify functions and the
// local Express server.
//
// Flow: the browser gets a Google ID token ("Sign in with Google"), POSTs it to
// /api/auth/login, the server verifies the token against Google, checks the
// email is on an allowed company domain, and issues a short-lived signed session
// cookie. The analyze/deliverable endpoints require that cookie.
//
// Auth is only ENFORCED when all three env vars are set:
//   GOOGLE_CLIENT_ID        OAuth web client id (also used by the Drive picker)
//   ALLOWED_EMAIL_DOMAINS   comma-separated, e.g. "bedrock.works,dmidesign.com"
//   SESSION_SECRET          random string used to sign the session cookie
// With any of them unset (e.g. local dev), the app stays open — handy for
// `npm run web` without Google setup.

import { OAuth2Client } from 'google-auth-library';
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'bca_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export function authEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.ALLOWED_EMAIL_DOMAINS && process.env.SESSION_SECRET);
}

export function allowedDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// An email is allowed if its domain (or the Google Workspace hosted-domain claim)
// is on the allow-list.
export function emailAllowed(email, hostedDomain) {
  const domains = allowedDomains();
  if (!domains.length) return false;
  const emailDomain = (email || '').split('@')[1]?.toLowerCase();
  const hd = hostedDomain ? String(hostedDomain).toLowerCase() : null;
  return Boolean((emailDomain && domains.includes(emailDomain)) || (hd && domains.includes(hd)));
}

function secretKey() {
  const s = process.env.SESSION_SECRET;
  return s ? new TextEncoder().encode(s) : null;
}

// Verify a Google ID token and return { ok, user } or { ok:false, reason }.
export async function verifyGoogleToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return { ok: false, reason: 'Google auth is not configured.' };
  const client = new OAuth2Client(clientId);
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    return { ok: false, reason: 'Invalid Google sign-in token.' };
  }
  if (!payload?.email || !payload.email_verified) {
    return { ok: false, reason: 'Google account email is not verified.' };
  }
  if (!emailAllowed(payload.email, payload.hd)) {
    return { ok: false, reason: `${payload.email} is not on an allowed company domain.` };
  }
  return { ok: true, user: { email: payload.email, name: payload.name, picture: payload.picture } };
}

export async function signSession(user) {
  const key = secretKey();
  return new SignJWT({ email: user.email, name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifySession(token) {
  const key = secretKey();
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    return { email: payload.email, name: payload.name, picture: payload.picture };
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader) {
  const out = {};
  (cookieHeader || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

export function sessionCookie(token, { secure = true } = {}) {
  return `${COOKIE_NAME}=${token}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearCookie({ secure = true } = {}) {
  return `${COOKIE_NAME}=; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`;
}

// Resolve the signed-in user from a cookie header string (null if none/invalid).
export async function userFromCookieHeader(cookieHeader) {
  const token = parseCookies(cookieHeader)[COOKIE_NAME];
  return verifySession(token);
}
