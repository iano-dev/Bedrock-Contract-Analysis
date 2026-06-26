// Minimal local web UI: upload a subcontract PDF, pick a tier (or auto-suggest),
// optionally paste bid assumptions, and download all three deliverables.

import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzePdfBuffer } from '../src/index.js';
import { buildMarkdown, buildDocx } from '../src/deliverables/index.js';
import { loadCounterparties } from '../src/engine/tiers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

// In-memory cache of the last analysis per session-less token, so the download
// routes can re-render without re-uploading. Keyed by a returned id.
const cache = new Map();
let counter = 0;

app.get('/api/counterparties', (_req, res) => {
  res.json(loadCounterparties());
});

app.post('/api/analyze', upload.single('contract'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const tier = req.body.tier && req.body.tier !== 'auto' ? Number(req.body.tier) : 'auto';
    let bidAssumptions = {};
    if (req.body.bidAssumptions) {
      try { bidAssumptions = JSON.parse(req.body.bidAssumptions); } catch { /* ignore bad JSON */ }
    }
    const analysis = await analyzePdfBuffer(req.file.buffer, {
      fileName: req.file.originalname,
      tier,
      bidAssumptions,
    });
    const id = `a${++counter}`;
    cache.set(id, analysis);
    if (cache.size > 50) cache.delete(cache.keys().next().value);
    res.json({ id, analysis, markdown: buildMarkdown(analysis) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/download/:id.:fmt', async (req, res) => {
  const analysis = cache.get(req.params.id);
  if (!analysis) return res.status(404).send('Analysis expired — re-run.');
  const base = (analysis.metadata.project || analysis.fileName || 'analysis').replace(/[^a-z0-9]+/gi, '-').slice(0, 50);
  if (req.params.fmt === 'docx') {
    const buf = await buildDocx(analysis);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.docx"`);
    return res.send(buf);
  }
  if (req.params.fmt === 'md') {
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.md"`);
    return res.send(buildMarkdown(analysis));
  }
  if (req.params.fmt === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
    return res.send(JSON.stringify(analysis, null, 2));
  }
  res.status(400).send('Unknown format.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bedrock Contract Analyzer web UI -> http://localhost:${PORT}`);
});
