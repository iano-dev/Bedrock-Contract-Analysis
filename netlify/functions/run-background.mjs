// Netlify BACKGROUND function (the "-background" suffix is what makes it async):
// it returns 202 immediately and may run for up to 15 minutes, so the heavy Opus
// calls can never hit the 10s synchronous-function timeout. The client generates
// a jobId, posts the work here, then polls /api/job for the result, which this
// function writes to Netlify Blobs.

import { getStore } from '@netlify/blobs';
import { runTask, ASYNC_TASKS } from '../../src/engine/tasks.js';
import { authEnabled, userFromCookieHeader } from '../../src/auth/session.js';

export default async (req) => {
  let body;
  try { body = await req.json(); } catch { return new Response('bad request', { status: 400 }); }
  const { jobId, task, payload } = body || {};
  if (!jobId || !task) return new Response('missing jobId/task', { status: 400 });

  // Same session gate as the synchronous endpoints.
  if (authEnabled() && !(await userFromCookieHeader(req.headers.get('cookie')))) {
    return new Response('unauthorized', { status: 401 });
  }
  if (!ASYNC_TASKS.has(task)) return new Response('unknown task', { status: 400 });

  const store = getStore('jobs');
  // Best-effort: record that we're working, then run and store the outcome.
  try { await store.setJSON(jobId, { status: 'pending' }); } catch {}
  try {
    const result = await runTask(task, payload || {});
    await store.setJSON(jobId, { status: 'done', result });
  } catch (e) {
    try { await store.setJSON(jobId, { status: 'error', error: e.message || String(e) }); } catch {}
  }
  // Background functions can only return 202; the client gets the result by polling.
  return new Response('', { status: 202 });
};
