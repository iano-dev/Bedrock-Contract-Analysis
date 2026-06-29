import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { extractPdf } from '../src/extract/pdf.js';
import { analyzePdfBuffer } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scannedPdf = join(__dirname, 'fixtures', 'scanned-sample.pdf');

// OCR is real work (renders + tesseract WASM). Give it room.
test('OCR: recovers text from a scanned (image-only) PDF', { timeout: 120000 }, async () => {
  assert.ok(existsSync(scannedPdf), 'scanned fixture present');
  const buffer = readFileSync(scannedPdf);
  const r = await extractPdf(buffer);
  assert.equal(r.scannedPageCount, 1, 'detects the image-only page as scanned');
  assert.equal(r.ocrUsed, true, 'OCR ran and recovered text');
  assert.deepEqual(r.ocrPages, [1]);
  assert.match(r.text, /SUBCONTRACT/i);
  assert.match(r.text, /premium time/i);
});

test('OCR: scanned PDF flows through to flags', { timeout: 120000 }, async () => {
  const buffer = readFileSync(scannedPdf);
  const analysis = await analyzePdfBuffer(buffer, { tier: 2, llm: false });
  assert.equal(analysis.extraction.ocrUsed, true);
  const ids = analysis.flags.map((f) => f.id);
  assert.ok(ids.includes('A-premium-time-absorption'), 'premium-time flag fires on OCR text');
  assert.ok(ids.includes('C-broad-indemnity'), 'indemnity flag fires on OCR text');
});

test('OCR can be turned off', { timeout: 120000 }, async () => {
  const buffer = readFileSync(scannedPdf);
  const r = await extractPdf(buffer, { ocr: 'off' });
  assert.equal(r.ocrUsed, false);
  assert.equal(r.scannedPageCount, 1);
});
