// OCR pipeline for scanned subcontract PDFs — cross-platform, Windows-friendly.
//
// Rasterize PDF pages with pdfjs-dist + @napi-rs/canvas (both ship prebuilt
// binaries / WASM — no node-gyp, no poppler/graphicsmagick), then run
// tesseract.js (WASM) over the rendered pages. Everything is dynamically
// imported so the rest of the analyzer still works if these aren't installed.
//
// Tesseract language data: by default tesseract.js fetches `eng.traineddata`
// from its CDN on first run and caches it. For fully offline Windows desktops,
// set BEDROCK_TESSDATA_PATH to a folder containing eng.traineddata.gz and we
// point tesseract at it (langPath).

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const RENDER_SCALE = 2.0; // ~144–150 DPI equivalent; good accuracy vs. speed.

// Bundled English language data so OCR runs fully offline (no CDN fetch) — the
// path that matters for locked-down Windows desktops. Override with
// BEDROCK_TESSDATA_PATH to point at a different tessdata directory.
const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_TESSDATA = join(__dirname, '..', 'data', 'tessdata');

function resolveLangPath() {
  if (process.env.BEDROCK_TESSDATA_PATH) return process.env.BEDROCK_TESSDATA_PATH;
  if (existsSync(join(BUNDLED_TESSDATA, 'eng.traineddata.gz'))) return BUNDLED_TESSDATA;
  return undefined; // fall back to tesseract.js CDN (requires network)
}

let _napi = null;
let _pdfjs = null;
let _tesseract = null;

async function loadDeps() {
  if (!_napi) _napi = await import('@napi-rs/canvas');
  if (!_pdfjs) _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!_tesseract) _tesseract = await import('tesseract.js');
  return { napi: _napi, pdfjs: _pdfjs, tesseract: _tesseract };
}

export async function ocrAvailable() {
  try {
    await loadDeps();
    return true;
  } catch {
    return false;
  }
}

// Render a subset of PDF pages (1-indexed) to PNG buffers.
async function renderPages(buffer, pageNumbers, { napi, pdfjs }) {
  // pdfjs needs a Uint8Array, not a Node Buffer view that may be pooled.
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data,
    verbosity: 0,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const out = [];
  for (const pageNum of pageNumbers) {
    if (pageNum < 1 || pageNum > pdf.numPages) continue;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = napi.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    // White background so anti-aliased scans OCR cleanly.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, intent: 'print' }).promise;
    out.push({ page: pageNum, png: canvas.toBuffer('image/png') });
    if (typeof page.cleanup === 'function') page.cleanup();
  }
  // pdfjs version differences: prefer the loading task's destroy, fall back to the doc's.
  if (typeof loadingTask.destroy === 'function') await loadingTask.destroy();
  else if (typeof pdf.destroy === 'function') await pdf.destroy();
  return out;
}

// OCR an array of {page, png} into {page, text}. Reuses one worker.
async function ocrImages(images, { tesseract }, { logger } = {}) {
  const langPath = resolveLangPath();
  const options = {};
  if (logger) options.logger = (m) => logger(`tesseract: ${m.status} ${Math.round((m.progress || 0) * 100)}%`);
  if (langPath) {
    options.langPath = langPath;
    options.cachePath = langPath; // read the bundled .gz in place; don't re-download
    options.cacheMethod = 'none';
  }
  const worker = await tesseract.createWorker('eng', undefined, options);
  try {
    const results = [];
    for (const img of images) {
      const { data } = await worker.recognize(img.png);
      results.push({ page: img.page, text: data.text || '' });
    }
    return results;
  } finally {
    await worker.terminate();
  }
}

// Public: OCR the given 1-indexed pages of a PDF buffer.
// Returns [{ page, text }] or throws if the toolchain is unavailable.
export async function ocrPdfPages(buffer, pageNumbers, { logger } = {}) {
  const deps = await loadDeps();
  if (logger) logger(`Rendering ${pageNumbers.length} page(s) for OCR…`);
  const images = await renderPages(buffer, pageNumbers, deps);
  if (logger) logger(`OCR over ${images.length} rendered page(s)…`);
  return ocrImages(images, deps, { logger });
}
