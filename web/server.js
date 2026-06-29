// Local web server — mirrors the Netlify deployment so the same browser client
// works in both places. The browser does PDF rendering, text extraction, and
// OCR; this server only runs the rules engine + optional Claude pass and
// generates deliverables. Run via `npm run web` (which stages vendor assets
// first). Stateless — nothing is stored between requests.

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyze } from '../src/engine/analyze.js';
import { llmAvailable } from '../src/engine/llm.js';
import { chatAvailable } from '../src/engine/chat.js';
import { runTask } from '../src/engine/tasks.js';
import { buildMarkdown, buildDocx } from '../src/deliverables/index.js';
import { loadCounterparties } from '../src/engine/tiers.js';
import {
  authEnabled,
  verifyGoogleToken,
  signSession,
  sessionCookie,
  clearCookie,
  userFromCookieHeader,
} from '../src/auth/session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(express.static(join(__dirname, 'public')));

app.get('/favicon.ico', (_req, res) => res.status(204).end());

app.get('/api/config', (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    googleApiKey: process.env.GOOGLE_API_KEY || null,
    llmConfigured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    background: false, // local: synchronous endpoints, no serverless time limit
    authEnabled: authEnabled(),
    authConfig: {
      clientId: !!process.env.GOOGLE_CLIENT_ID,
      domains: !!process.env.ALLOWED_EMAIL_DOMAINS,
      secret: !!process.env.SESSION_SECRET,
    },
  });
});

// --- Google sign-in (mirrors netlify/functions/auth.mjs) ---
const cookieOpts = (req) => ({ secure: req.secure || req.headers['x-forwarded-proto'] === 'https' });

app.get('/api/auth/me', async (req, res) => {
  const user = await userFromCookieHeader(req.headers.cookie);
  res.json({ user, authEnabled: authEnabled() });
});
app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearCookie(cookieOpts(req)));
  res.json({ ok: true });
});
app.post('/api/auth/login', async (req, res) => {
  if (!authEnabled()) return res.status(400).json({ error: 'Google auth is not configured.' });
  const result = await verifyGoogleToken(req.body?.credential);
  if (!result.ok) return res.status(403).json({ error: result.reason });
  const token = await signSession(result.user);
  res.setHeader('Set-Cookie', sessionCookie(token, cookieOpts(req)));
  res.json({ user: result.user });
});

// Reject API calls without a valid session when auth is enabled.
async function requireAuth(req, res, next) {
  if (!authEnabled()) return next();
  const user = await userFromCookieHeader(req.headers.cookie);
  if (!user) return res.status(401).json({ error: 'Sign in required.' });
  next();
}

app.get('/api/counterparties', (_req, res) => res.json(loadCounterparties()));

app.post('/api/analyze', requireAuth, (req, res) => {
  try {
    if (!req.body?.text || !req.body.text.trim()) {
      return res.status(400).json({ error: 'No contract text supplied (extraction may have failed in the browser).' });
    }
    const { text, pages, fileName, tier, bidAssumptions, extraction } = req.body;
    const analysis = analyze({ text, pages, fileName, tier, bidAssumptions });
    if (extraction) analysis.extraction = extraction;
    analysis.llm = { used: false };
    res.json({ analysis });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Local mirror of the async tasks — runs synchronously (Express has no timeout),
// so the browser uses these directly when config.background is false.
app.post('/api/enrich', requireAuth, async (req, res) => {
  try { res.json(await runTask('enrich', req.body || {})); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/scope', requireAuth, async (req, res) => {
  try { res.json(await runTask('scope', req.body || {})); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/parse-bid', requireAuth, async (req, res) => {
  try { res.json(await runTask('parse-bid', req.body || {})); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/scope-compare', requireAuth, async (req, res) => {
  try { res.json(await runTask('scope-compare', req.body || {})); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    if (!chatAvailable()) return res.status(400).json({ error: 'Chat needs the Claude API key (set ANTHROPIC_API_KEY).' });
    if (!req.body?.documentText?.trim()) return res.status(400).json({ error: 'No document loaded.' });
    if (!Array.isArray(req.body.messages) || !req.body.messages.length) return res.status(400).json({ error: 'No message.' });
    res.json(await runTask('chat', req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/deliverable', requireAuth, async (req, res) => {
  const { analysis, format = 'docx' } = req.body || {};
  if (!analysis) return res.status(400).send('Missing analysis');
  const base = (analysis.metadata?.project || analysis.fileName || 'analysis').replace(/[^a-z0-9]+/gi, '-').slice(0, 50);
  if (format === 'docx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.docx"`);
    return res.send(await buildDocx(analysis));
  }
  if (format === 'md') {
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.md"`);
    return res.send(buildMarkdown(analysis));
  }
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
    return res.send(JSON.stringify(analysis, null, 2));
  }
  res.status(400).send('Unknown format');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bedrock Contract Analyzer web UI -> http://localhost:${PORT}`));
