// Run the Section 4 taxonomy as a checklist pass over the contract text.
// For each pattern hit, capture the clause text + location so the report can
// cite "Article/clause" with a page number.

import { PATTERNS, CATEGORIES } from '../data/patterns.js';
import { offsetToPage } from '../extract/pages.js';

function snippet(text, index, length, pad = 90) {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  let s = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) s = '…' + s;
  if (end < text.length) s = s + '…';
  return s;
}

// Try to name the governing article/section near a match for citation.
function nearestArticle(text, index) {
  const window = text.slice(Math.max(0, index - 400), index);
  const m = [...window.matchAll(/\b(article|section|clause|paragraph)\s+([0-9]+(?:\.[0-9a-z]+)*)/gi)];
  if (m.length) {
    const last = m[m.length - 1];
    return `${last[1][0].toUpperCase()}${last[1].slice(1)} ${last[2]}`;
  }
  return null;
}

export function scanPatterns(text, pages = []) {
  const flags = [];

  for (const pat of PATTERNS) {
    const hits = [];
    for (const re of pat.matchers) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      let guard = 0;
      while ((m = g.exec(text)) !== null && guard < 50) {
        guard++;
        hits.push({ index: m.index, length: m[0].length });
        if (m.index === g.lastIndex) g.lastIndex++;
      }
    }
    if (pat.requireAll) {
      const allHit = pat.matchers.every((re) => new RegExp(re.source, re.flags).test(text));
      if (!allHit) continue;
    }
    if (!hits.length) continue;

    // De-dupe nearby hits and keep up to 3 representative locations.
    hits.sort((a, b) => a.index - b.index);
    const reps = [];
    for (const h of hits) {
      if (!reps.length || h.index - reps[reps.length - 1].index > 200) reps.push(h);
      if (reps.length >= 3) break;
    }

    const locations = reps.map((h) => ({
      page: pages.length ? offsetToPage(pages, h.index) : null,
      article: nearestArticle(text, h.index),
      clauseText: snippet(text, h.index, h.length),
      // A clean ~160-char excerpt starting at the match, whitespace-normalized,
      // used by the web viewer to find-and-highlight the clause in the rendered
      // PDF (no ellipses, so it can be searched against the page text layer).
      quote: text.slice(h.index, Math.min(text.length, h.index + 160)).replace(/\s+/g, ' ').trim(),
    }));

    flags.push({
      id: pat.id,
      category: pat.category,
      categoryName: CATEGORIES[pat.category],
      title: pat.title,
      severity: pat.severity,
      confidence: pat.confidence || 'firm',
      attorneyReview: !!pat.attorneyReview,
      scopeSchedule: !!pat.scopeSchedule,
      why: pat.why,
      action: pat.action,
      note: pat.note || null,
      occurrences: hits.length,
      locations,
    });
  }

  // Stable ordering: category A→F, then HIGH→LOW within category.
  const sevRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  flags.sort(
    (a, b) => a.category.localeCompare(b.category) || sevRank[a.severity] - sevRank[b.severity]
  );
  return flags;
}
