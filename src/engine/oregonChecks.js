// Oregon-specific statutory checks. These encode hard legal limits (not just
// risk patterns), so they fire as their own findings with attorney-review flags.

import { offsetToPage } from '../extract/pages.js';
import { CATEGORIES } from '../data/patterns.js';

// Oregon caps retainage on construction contracts at 5% (ORS 701.420 for private
// construction; ORS 279C.570 for public improvement contracts). Detect the
// retainage percentage and flag anything above 5%.
function retainageCap(text, pages) {
  // Percentage appearing near the word "retain…", in either order.
  const re = /retain\w*[^.\n]{0,40}?(\d{1,2}(?:\.\d+)?)\s?%|(\d{1,2}(?:\.\d+)?)\s?%[^.\n]{0,40}?retain\w*/gi;
  let m;
  let maxPct = 0;
  let idx = -1;
  while ((m = re.exec(text)) !== null) {
    const pct = Number(m[1] ?? m[2]);
    if (!Number.isNaN(pct) && pct > maxPct) {
      maxPct = pct;
      idx = m.index;
    }
  }
  if (maxPct <= 5) return null;

  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + 130);
  const clause = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return {
    id: 'OR-retainage-cap',
    category: 'B',
    categoryName: CATEGORIES['B'],
    title: `Retainage of ${maxPct}% exceeds Oregon's 5% statutory cap`,
    severity: 'HIGH',
    confidence: 'firm',
    attorneyReview: true,
    scopeSchedule: false,
    source: 'oregon-law',
    why: `Oregon caps retainage on construction contracts at 5% — ORS 701.420 (private construction) and ORS 279C.570 (public improvement contracts). This agreement withholds ${maxPct}%, which exceeds the statutory limit for an Oregon project.`,
    action: `Request that retainage be reduced to 5% to comply with Oregon law. Confirm the project is located in Oregon (the cap is statutory there). Attorney review recommended.`,
    note: 'Applies to Oregon projects. For a Washington project, confirm the applicable retainage limit separately.',
    occurrences: 1,
    locations: [{ page: pages.length ? offsetToPage(pages, Math.max(0, idx)) : null, article: null, clauseText: clause, quote: clause }],
  };
}

export function oregonStatutoryChecks(text, pages = []) {
  return [retainageCap(text, pages)].filter(Boolean);
}
