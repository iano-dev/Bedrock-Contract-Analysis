// PDF text extraction with per-page offsets and an OCR fallback for scanned sets.
//
// Returns: { text, pages: [{ page, start, end }], pageCount, ocrUsed, warnings }
// `pages[].start/end` are character offsets into `text`, so any match offset can
// be resolved back to a page number for citations in the report.

import { createRequire } from 'node:module';
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

export async function extractPdf(buffer, { ocr = 'auto', minCharsPerPage = 100 } = {}) {
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

  // Stitch pages into one string while recording offsets.
  const SEP = '\n\n';
  let text = '';
  const pages = [];
  pageTexts.forEach((t, i) => {
    const start = text.length;
    text += t;
    pages.push({ page: i + 1, start, end: text.length });
    if (i < pageTexts.length - 1) text += SEP;
  });

  const pageCount = pageTexts.length;
  const avgChars = pageCount ? text.length / pageCount : 0;
  const looksScanned = pageCount > 0 && avgChars < minCharsPerPage;

  let ocrUsed = false;
  if (looksScanned && ocr !== 'off') {
    warnings.push(
      `Low text yield (${Math.round(avgChars)} chars/page across ${pageCount} pages) — this set appears scanned.`
    );
    const ocrResult = await tryOcr(buffer, ocr, warnings);
    if (ocrResult) {
      ocrUsed = true;
      return { ...ocrResult, ocrUsed, warnings };
    }
    warnings.push(
      'OCR fallback unavailable. Install `tesseract.js` AND a PDF page rasterizer, or supply a text-based PDF. Analysis will run on the limited extracted text.'
    );
  }

  return { text, pages, pageCount, ocrUsed, warnings };
}

// OCR is best-effort. tesseract.js is an optional dependency and it needs raster
// images, which requires rendering PDF pages first. We attempt it; if the toolchain
// is absent we degrade gracefully rather than crash.
async function tryOcr(buffer, ocr, warnings) {
  try {
    require.resolve('tesseract.js');
  } catch {
    return null;
  }
  // Rendering PDF pages to images needs native libs (poppler / graphicsmagick)
  // not assumed present here. We surface a clear message and let callers pre-render.
  warnings.push(
    'tesseract.js is installed but PDF-page rasterization is not wired in this environment. Provide pre-rendered page images via the OCR pipeline to enable scanned-set support.'
  );
  return null;
}

// Resolve a character offset to a page number using the page map.
export function offsetToPage(pages, offset) {
  for (const p of pages) {
    if (offset >= p.start && offset <= p.end) return p.page;
  }
  return pages.length ? pages[pages.length - 1].page : null;
}
