import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authEnabled,
  allowedDomains,
  emailAllowed,
  signSession,
  verifySession,
  parseCookies,
  sessionCookie,
  COOKIE_NAME,
} from '../src/auth/session.js';

function withAuthEnv(fn) {
  const saved = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    ALLOWED_EMAIL_DOMAINS: process.env.ALLOWED_EMAIL_DOMAINS,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  process.env.ALLOWED_EMAIL_DOMAINS = 'bedrock.works, dmidesign.com';
  process.env.SESSION_SECRET = 'unit-test-secret-value-please-change';
  return Promise.resolve(fn()).finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

test('authEnabled requires all three env vars', () => {
  const saved = { ...process.env };
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.ALLOWED_EMAIL_DOMAINS;
  delete process.env.SESSION_SECRET;
  assert.equal(authEnabled(), false);
  process.env.GOOGLE_CLIENT_ID = 'x';
  assert.equal(authEnabled(), false, 'client id alone is not enough');
  process.env.ALLOWED_EMAIL_DOMAINS = 'bedrock.works';
  process.env.SESSION_SECRET = 's';
  assert.equal(authEnabled(), true);
  for (const k of ['GOOGLE_CLIENT_ID', 'ALLOWED_EMAIL_DOMAINS', 'SESSION_SECRET']) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test('emailAllowed: domain allow-list and Google hosted-domain', () =>
  withAuthEnv(() => {
    assert.deepEqual(allowedDomains(), ['bedrock.works', 'dmidesign.com']);
    assert.equal(emailAllowed('ian@bedrock.works'), true);
    assert.equal(emailAllowed('jane@dmidesign.com'), true);
    assert.equal(emailAllowed('IAN@Bedrock.Works'), true, 'case-insensitive');
    assert.equal(emailAllowed('someone@gmail.com'), false);
    assert.equal(emailAllowed('x@evil.com', 'bedrock.works'), true, 'hd claim counts');
    assert.equal(emailAllowed(''), false);
  }));

test('session sign/verify roundtrip; tampering rejected', () =>
  withAuthEnv(async () => {
    const token = await signSession({ email: 'ian@bedrock.works', name: 'Ian', picture: 'p' });
    const user = await verifySession(token);
    assert.equal(user.email, 'ian@bedrock.works');
    assert.equal(await verifySession(token + 'x'), null, 'tampered token rejected');
    assert.equal(await verifySession('not-a-jwt'), null);
    assert.equal(await verifySession(''), null);
  }));

test('parseCookies + sessionCookie', () => {
  const c = parseCookies(`a=1; ${COOKIE_NAME}=abc.def; b=2`);
  assert.equal(c[COOKIE_NAME], 'abc.def');
  assert.match(sessionCookie('tok'), /HttpOnly/);
  assert.match(sessionCookie('tok'), /Secure/);
  assert.match(sessionCookie('tok', { secure: false }), /HttpOnly/);
  assert.doesNotMatch(sessionCookie('tok', { secure: false }), /Secure/);
});

test('analyze function: 401 without session, 200 with valid session (auth enabled)', () =>
  withAuthEnv(async () => {
    const { default: analyze } = await import('../netlify/functions/analyze.mjs');
    const payload = JSON.stringify({
      text: 'Subcontractor has included all premium time required to perform the work and the project schedule.',
      pages: [{ page: 1, start: 0, end: 96 }],
      tier: 2,
      llm: false,
    });

    const unauth = await analyze(new Request('http://x/api/analyze', { method: 'POST', body: payload, headers: { 'content-type': 'application/json' } }));
    assert.equal(unauth.status, 401, 'blocked without a session');

    const token = await signSession({ email: 'ian@bedrock.works' });
    const authed = await analyze(
      new Request('http://x/api/analyze', {
        method: 'POST',
        body: payload,
        headers: { 'content-type': 'application/json', cookie: `${COOKIE_NAME}=${token}` },
      })
    );
    assert.equal(authed.status, 200, 'allowed with a valid session');
    const body = await authed.json();
    assert.ok(body.analysis.flags.length >= 1);
  }));
