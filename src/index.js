// Public API for the Bedrock Contract Analyzer.

import { readFile } from 'node:fs/promises';
import { extractPdf } from './extract/pdf.js';
import { analyze } from './engine/analyze.js';
import { enrichAnalysisWithLlm, llmAvailable } from './engine/llm.js';
import { generateDeliverables } from './deliverables/index.js';

export { analyze } from './engine/analyze.js';
export { extractPdf } from './extract/pdf.js';
export { enrichAnalysisWithLlm, llmAvailable } from './engine/llm.js';
export { generateDeliverables, buildMarkdown, buildDocx } from './deliverables/index.js';
export { suggestTier, loadCounterparties } from './engine/tiers.js';

// End-to-end from a PDF on disk.
export async function analyzePdfFile(path, opts = {}) {
  const buffer = await readFile(path);
  return analyzePdfBuffer(buffer, { fileName: path.split('/').pop(), ...opts });
}

// End-to-end from a PDF buffer (used by the web upload route).
// llm: 'auto' (use Claude if an API key is present), true (require it), false (off).
export async function analyzePdfBuffer(
  buffer,
  { fileName = null, tier = 'auto', bidAssumptions = {}, ocr = 'auto', llm = 'auto', logger = null } = {}
) {
  const extracted = await extractPdf(buffer, { ocr, logger });
  const analysis = analyze({
    text: extracted.text,
    pages: extracted.pages,
    fileName,
    tier,
    bidAssumptions,
  });
  analysis.extraction = {
    pageCount: extracted.pageCount,
    ocrUsed: extracted.ocrUsed,
    ocrPages: extracted.ocrPages,
    scannedPageCount: extracted.scannedPageCount,
    warnings: extracted.warnings,
    chars: extracted.text.length,
  };

  const wantLlm = llm === true || (llm === 'auto' && llmAvailable());
  if (wantLlm) {
    await enrichAnalysisWithLlm(analysis, { text: extracted.text, pages: extracted.pages, logger });
  } else {
    analysis.llm = { used: false, reason: llm === false ? 'LLM pass disabled.' : 'No API key — rules engine only.' };
  }
  return analysis;
}

// Convenience: analyze a buffer and write all deliverables.
export async function analyzeAndGenerate(buffer, { outDir, ...opts } = {}) {
  const analysis = await analyzePdfBuffer(buffer, opts);
  const deliverables = await generateDeliverables(analysis, { outDir });
  return { analysis, deliverables };
}
