// Web UI: a document-review workspace. Upload a subcontract (drag-and-drop,
// file picker, or Google Drive), analyze it, then review findings side-by-side
// with the rendered PDF — click a finding to highlight where it lives in the doc.

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
// Serve the pdf.js *legacy* browser build locally so the viewer works offline
// and on older corporate browsers (the modern build uses very new JS APIs).
app.use('/vendor/pdfjs', express.static(join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build')));
app.use(express.json());

// In-memory store: id -> { analysis, buffer, mime, markdown }. The buffer is kept
// so the viewer can re-fetch the original PDF for rendering.
const store = new Map();
let counter = 0;

app.get('/favicon.ico', (_req, res) => res.status(204).end());

app.get('/api/config', (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    googleApiKey: process.env.GOOGLE_API_KEY || null,
    llmConfigured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  });
});

app.get('/api/counterparties', (_req, res) => res.json(loadCounterparties()));

app.post('/api/analyze', upload.single('contract'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const tier = req.body.tier && req.body.tier !== 'auto' ? Number(req.body.tier) : 'auto';
    const llm = req.body.llm === 'on' ? true : req.body.llm === 'off' ? false : 'auto';
    let bidAssumptions = {};
    if (req.body.bidAssumptions) {
      try { bidAssumptions = JSON.parse(req.body.bidAssumptions); } catch { /* ignore */ }
    }
    const analysis = await analyzePdfBuffer(req.file.buffer, {
      fileName: req.file.originalname,
      tier,
      bidAssumptions,
      llm,
    });
    const id = `a${++counter}`;
    const isPdf = (req.file.mimetype || '').includes('pdf') || /\.pdf$/i.test(req.file.originalname || '');
    store.set(id, { analysis, buffer: req.file.buffer, mime: isPdf ? 'application/pdf' : req.file.mimetype });
    if (store.size > 30) store.delete(store.keys().next().value);
    res.json({ id, analysis, viewable: isPdf, markdown: buildMarkdown(analysis) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve the original uploaded file back for in-browser rendering.
app.get('/api/file/:id', (req, res) => {
  const entry = store.get(req.params.id);
  if (!entry) return res.status(404).send('Expired — re-upload.');
  res.setHeader('Content-Type', entry.mime || 'application/octet-stream');
  res.send(entry.buffer);
});

app.get('/api/download/:id.:fmt', async (req, res) => {
  const entry = store.get(req.params.id);
  if (!entry) return res.status(404).send('Analysis expired — re-run.');
  const { analysis } = entry;
  const base = (analysis.metadata.project || analysis.fileName || 'analysis').replace(/[^a-z0-9]+/gi, '-').slice(0, 50);
  if (req.params.fmt === 'docx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.docx"`);
    return res.send(await buildDocx(analysis));
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
app.listen(PORT, () => console.log(`Bedrock Contract Analyzer web UI -> http://localhost:${PORT}`));
