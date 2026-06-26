import test from 'node:test';
import assert from 'node:assert/strict';
import { signSession, COOKIE_NAME } from '../src/auth/session.js';

// Enable auth, ensure NO Anthropic key (so chatAvailable() is false) for these
// gating tests. The real Claude call needs a key and is exercised manually.
function withEnv(fn) {
  const saved = { ...process.env };
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  process.env.ALLOWED_EMAIL_DOMAINS = 'bedrock.works';
  process.env.SESSION_SECRET = 'unit-test-secret';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  return Promise.resolve(fn()).finally(() => {
    for (const k of ['GOOGLE_CLIENT_ID', 'ALLOWED_EMAIL_DOMAINS', 'SESSION_SECRET', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

const body = JSON.stringify({ documentText: 'Some contract text', messages: [{ role: 'user', content: 'What is the retainage?' }] });

test('chat function: 401 without a session (auth enabled)', () =>
  withEnv(async () => {
    const { default: chat } = await import('../netlify/functions/chat.mjs');
    const res = await chat(new Request('http://x/api/chat', { method: 'POST', body, headers: { 'content-type': 'application/json' } }));
    assert.equal(res.status, 401);
  }));

test('chat function: 400 with a valid session but no API key configured', () =>
  withEnv(async () => {
    const { default: chat } = await import('../netlify/functions/chat.mjs');
    const token = await signSession({ email: 'ian@bedrock.works' });
    const res = await chat(
      new Request('http://x/api/chat', { method: 'POST', body, headers: { 'content-type': 'application/json', cookie: `${COOKIE_NAME}=${token}` } })
    );
    assert.equal(res.status, 400);
    const j = await res.json();
    assert.match(j.error, /API key/i);
  }));
