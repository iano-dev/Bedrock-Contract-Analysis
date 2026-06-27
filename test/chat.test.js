import test from 'node:test';
import assert from 'node:assert/strict';
import { signSession, COOKIE_NAME } from '../src/auth/session.js';

// The heavy LLM tasks (chat, enrich, scope, scope-compare) run through the
// Netlify background function, which gates on the session before doing any work.
// These tests exercise that gate without touching Netlify Blobs (the 401 and
// task-allowlist checks both return before the blob store is opened).
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

const req = (body, cookie) =>
  new Request('http://x/.netlify/functions/run-background', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });

test('background function: 401 without a session (auth enabled)', () =>
  withEnv(async () => {
    const { default: run } = await import('../netlify/functions/run-background.mjs');
    const res = await run(req({ jobId: 'j1', task: 'chat', payload: { documentText: 'x', messages: [{ role: 'user', content: 'hi' }] } }));
    assert.equal(res.status, 401);
  }));

test('background function: 400 for an unknown task even with a valid session', () =>
  withEnv(async () => {
    const { default: run } = await import('../netlify/functions/run-background.mjs');
    const token = await signSession({ email: 'ian@bedrock.works' });
    const res = await run(req({ jobId: 'j2', task: 'definitely-not-a-task', payload: {} }, `${COOKIE_NAME}=${token}`));
    assert.equal(res.status, 400);
  }));

test('background function: 400 when jobId or task is missing', () =>
  withEnv(async () => {
    const { default: run } = await import('../netlify/functions/run-background.mjs');
    const res = await run(req({ task: 'chat' }));
    assert.equal(res.status, 400);
  }));
