// Local web server — mirrors the Netlify deployment so the same browser client
// works in both places. The browser does PDF rendering, text extraction, and
// OCR; this server only runs the rules engine + optional Claude pass and
// generates deliverables. Run via `npm run web` (which stages vendor assets
// first). Stateless — nothing is stored between requests.

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runAnalysis } from '../src/engine/run.js';
import { buildMarkdown, buildDocx } from '../src/deliverables/index.js';
import { loadCounterparties } from '../src/engine/tiers.js';

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
  });
});

app.get('/api/counterparties', (_req, res) => res.json(loadCounterparties()));

app.post('/api/analyze', async (req, res) => {
  try {
    if (!req.body?.text || !req.body.text.trim()) {
      return res.status(400).json({ error: 'No contract text supplied (extraction may have failed in the browser).' });
    }
    const analysis = await runAnalysis(req.body);
    res.json({ analysis });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/deliverable', async (req, res) => {
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
