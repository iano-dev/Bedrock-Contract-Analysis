// Fast status endpoint the browser polls for a background job's result. Reads the
// outcome the background function wrote to Netlify Blobs. Session-gated; the jobId
// is an unguessable UUID. Deletes the record once a terminal state is read.

import { getStore } from '@netlify/blobs';
import { authEnabled, userFromCookieHeader } from '../../src/auth/session.js';

export default async (req) => {
  if (authEnabled() && !(await userFromCookieHeader(req.headers.get('cookie')))) {
    return json({ error: 'Sign in required.' }, 401);
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'missing id' }, 400);

  const store = getStore('jobs');
  let rec;
  try { rec = await store.get(id, { type: 'json' }); } catch { rec = null; }
  if (!rec) return json({ status: 'pending' }); // not written yet, or already consumed
  if (rec.status === 'done' || rec.status === 'error') {
    try { await store.delete(id); } catch {}
  }
  return json(rec);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { path: '/api/job' };
