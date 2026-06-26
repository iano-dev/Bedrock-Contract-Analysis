// Orchestrates the full analysis pipeline (Section 6).
//
//  1. (caller) extract text + page map
//  2. detect contract type, parties, dates, value, scope
//  3. run the Section 4 taxonomy -> flags with clause locations
//  4. build the incorporated-documents register
//  5. apply tier logic (Tier 1 -> scope+schedule negotiate; rest accept-and-proceed)
//  6. bid-vs-schedule cross-check
//  7. detect favorable/protective terms
//  8. summarize

import { extractMetadata } from './metadata.js';
import { scanPatterns } from './scan.js';
import { buildIncorporatedRegister } from './incorporated.js';
import { suggestTier, applyTierPosture, loadCounterparties } from './tiers.js';
import { bidCrossCheck } from './bidCrossCheck.js';
import { detectFavorable } from './favorable.js';

// analyze({ text, pages, fileName, tier, bidAssumptions })
// tier: 1 | 2 | 'auto'  (default 'auto' -> suggest from counterparty, fail to 2)
export function analyze({ text, pages = [], fileName = null, tier = 'auto', bidAssumptions = {} }) {
  if (!text || !text.trim()) {
    throw new Error('No contract text to analyze. Extraction may have failed (scanned PDF without OCR?).');
  }

  const metadata = extractMetadata(text);
  const counterparties = loadCounterparties();
  const tierSuggestion = suggestTier(metadata.contractor, counterparties);

  let effectiveTier;
  if (tier === 'auto' || tier == null) effectiveTier = tierSuggestion.suggested;
  else effectiveTier = Number(tier) === 1 ? 1 : 2;

  let flags = scanPatterns(text, pages);
  flags = applyTierPosture(flags, effectiveTier);

  const incorporated = buildIncorporatedRegister(text, pages);
  const crossCheck = bidCrossCheck(text, flags, bidAssumptions);
  const favorable = detectFavorable(text);

  // Summary stats — for Tier 1, count negotiate-posture (scope/schedule) vs.
  // accept-and-proceed separately so the picture matches the posture.
  const negotiate = flags.filter((f) => f.posture === 'negotiate');
  const acceptProceed = flags.filter((f) => f.posture === 'accept-and-proceed');
  const counts = (list) => ({
    HIGH: list.filter((f) => f.severity === 'HIGH').length,
    MEDIUM: list.filter((f) => f.severity === 'MEDIUM').length,
    LOW: list.filter((f) => f.severity === 'LOW').length,
    total: list.length,
  });

  return {
    generatedFor: 'Bedrock Concrete Cutting / Bedrock Commercial Concrete (OR/WA subcontractor)',
    fileName,
    tier: effectiveTier,
    tierSuggestion,
    tierExplicit: tier !== 'auto' && tier != null,
    metadata,
    summary: {
      all: counts(flags),
      negotiate: counts(negotiate),
      acceptAndProceed: counts(acceptProceed),
      attorneyReviewItems: flags.filter((f) => f.attorneyReview).length,
      contestedItems: flags.filter((f) => f.confidence === 'contested').length,
      incorporatedDocs: incorporated.count,
    },
    flags,
    incorporated,
    crossCheck,
    favorable,
    caveats: [
      'This is contract interpretation, not legal advice.',
      'Default to flagging more, not less, for unknown counterparties.',
      'Never treat a contested position as settled — pair it with the verification it needs.',
      'Sign nothing until incorporated-by-reference documents are in hand.',
    ],
  };
}
