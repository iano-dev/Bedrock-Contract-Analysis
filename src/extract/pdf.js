// PDF text extraction with per-page offsets and an OCR fallback for scanned sets.
//
// Returns: { text, pages: [{ page, start, end }], pageCount, ocrUsed, ocrPages, warnings }
// `pages[].start/end` are character offsets into `text`, so any match offset can
// be resolved back to a page number for citations in the report.
//
// Scanned pages (those with little or no embedded text) are detected per-page
// and OCR'd individually via src/extract/ocr.js — only the scanned pages, so a
// mostly-digital 200-page set with a few scanned exhibits stays fast.

import { createRequire } from 'node:module';
import { ocrPdfPages, ocrAvailable } from './ocr.js';

export { offsetToPage } from './pages.js';

const require = createRequire(import.meta.url);

// pdf-parse exposes a per-page render hook; we use it to build the page map.
function defaultPageRender(pageData) {
  return pageData.getTextContent().then((tc) => {
    let last = -1;
    let out = '';
    for (const item of tc.items) {
      if (last !== -1 && item.transform[5] !== last) out += '\n';
      out += item.str;
      last = item.transform[5];
    }
    return out;
  });
}

function stitch(pageTexts) {
  const SEP = '\n\n';
  let text = '';
  const pages = [];
  pageTexts.forEach((t, i) => {
    const start = text.length;
    text += t;
    pages.push({ page: i + 1, start, end: text.length });
    if (i < pageTexts.length - 1) text += SEP;
  });
  return { text, pages };
}

export async function extractPdf(buffer, { ocr = 'auto', minCharsPerPage = 100, logger = null } = {}) {
  const warnings = [];
  const pageTexts = [];

  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch {
    throw new Error('pdf-parse is not installed. Run `npm install` first.');
  }

  await pdfParse(buffer, {
    pagerender: (pageData) =>
      defaultPageRender(pageData).then((t) => {
        pageTexts.push(t || '');
        return t;
      }),
  });

  const pageCount = pageTexts.length;

  // Identify scanned pages (low embedded-text yield).
  const scannedPages = [];
  pageTexts.forEach((t, i) => {
    if ((t || '').replace(/\s/g, '').length < minCharsPerPage) scannedPages.push(i + 1);
  });

  let ocrUsed = false;
  const ocrPages = [];
  if (scannedPages.length && ocr !== 'off') {
    if (await ocrAvailable()) {
      try {
        const note = `Detected ${scannedPages.length}/${pageCount} low-text page(s) — running OCR on those page(s).`;
        warnings.push(note);
        if (logger) logger(note);
        const results = await ocrPdfPages(buffer, scannedPages, { logger });
        for (const r of results) {
          if (r.text && r.text.replace(/\s/g, '').length > 0) {
            pageTexts[r.page - 1] = r.text;
            ocrPages.push(r.page);
          }
        }
        ocrUsed = ocrPages.length > 0;
        if (ocrUsed) warnings.push(`OCR recovered text on ${ocrPages.length} page(s).`);
      } catch (e) {
        warnings.push(`OCR attempt failed: ${e.message}. Analysis will run on the embedded text only.`);
      }
    } else {
      warnings.push(
        `Detected ${scannedPages.length}/${pageCount} low-text (scanned) page(s) but OCR dependencies are unavailable. ` +
          'Install pdfjs-dist, @napi-rs/canvas, and tesseract.js to enable scanned-set support. Analysis will run on the limited embedded text.'
      );
    }
  }

  const { text, pages } = stitch(pageTexts);
  return { text, pages, pageCount, ocrUsed, ocrPages, scannedPageCount: scannedPages.length, warnings };
}
