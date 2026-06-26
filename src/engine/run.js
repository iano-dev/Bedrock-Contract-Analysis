// Shared analysis entry for already-extracted text — used by both the local
// Express server and the Netlify serverless function. No native dependencies:
// text extraction and OCR happen in the browser; this only runs the pure rules
// engine plus the optional Claude pass.

import { analyze } from './analyze.js';
import { enrichAnalysisWithLlm, llmAvailable } from './llm.js';

// input: { text, pages, fileName, tier, bidAssumptions, llm, extraction }
// llm: 'auto' (use Claude if a key is configured) | true | false
export async function runAnalysis({
  text,
  pages = [],
  fileName = null,
  tier = 'auto',
  bidAssumptions = {},
  llm = 'auto',
  extraction = null,
} = {}) {
  const analysis = analyze({ text, pages, fileName, tier, bidAssumptions });
  if (extraction) analysis.extraction = extraction;

  const wantLlm = llm === true || (llm === 'auto' && llmAvailable());
  if (wantLlm) {
    await enrichAnalysisWithLlm(analysis, { text, pages });
  } else {
    analysis.llm = { used: false, reason: llm === false ? 'LLM pass disabled.' : 'No API key — rules engine only.' };
  }
  return analysis;
}
