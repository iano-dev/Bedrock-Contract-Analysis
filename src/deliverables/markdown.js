// Combined Markdown deliverable — the three formats together (Section 5):
// (1) detailed written report, (2) risk-rated summary table, (3) phased checklist,
// plus favorable terms, incorporated-documents register, bid cross-check,
// GC-response email variants, and standing caveats. Delivered simultaneously.

import { buildChecklist } from './checklist.js';
import { buildEmailVariants } from './emailVariants.js';

const sevEmoji = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢' };

function mdEscape(s) {
  return (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function buildMarkdown(analysis) {
  const m = analysis.metadata;
  const L = [];

  L.push(`# Bedrock Subcontract Analysis`);
  L.push('');
  L.push(`**Prepared for:** ${analysis.generatedFor}`);
  if (analysis.fileName) L.push(`**Source file:** ${analysis.fileName}`);
  L.push(`**Tier:** ${analysis.tier} — ${analysis.tier === 1 ? 'Large/blue-chip GC: accept-most posture, review narrowed to scope + schedule' : 'Full review, flag everything'}${analysis.tierExplicit ? ' (set explicitly)' : ' (auto)'}`);
  L.push(`> Tier basis: ${analysis.tierSuggestion.reason}`);
  L.push('');

  // ---- At-a-glance --------------------------------------------------------
  L.push(`## At a glance`);
  L.push('');
  L.push(`| | HIGH | MEDIUM | LOW | Total |`);
  L.push(`|---|---|---|---|---|`);
  const s = analysis.summary;
  if (analysis.tier === 1) {
    L.push(`| Negotiate (scope/schedule) | ${s.negotiate.HIGH} | ${s.negotiate.MEDIUM} | ${s.negotiate.LOW} | ${s.negotiate.total} |`);
    L.push(`| Accept-and-proceed (awareness) | ${s.acceptAndProceed.HIGH} | ${s.acceptAndProceed.MEDIUM} | ${s.acceptAndProceed.LOW} | ${s.acceptAndProceed.total} |`);
  } else {
    L.push(`| All flags | ${s.all.HIGH} | ${s.all.MEDIUM} | ${s.all.LOW} | ${s.all.total} |`);
  }
  L.push('');
  L.push(`- **Incorporated documents to retrieve before signing:** ${s.incorporatedDocs}`);
  L.push(`- **Contested positions (verify before asserting):** ${s.contestedItems}`);
  L.push(`- **Attorney-review items:** ${s.attorneyReviewItems}`);
  L.push('');

  // ---- Contract facts -----------------------------------------------------
  L.push(`## Contract facts`);
  L.push('');
  L.push(`- **Contract type:** ${m.contractType}`);
  if (m.project) L.push(`- **Project:** ${m.project}`);
  if (m.contractor) L.push(`- **Contractor / counterparty:** ${m.contractor}`);
  if (m.subcontractor) L.push(`- **Subcontractor:** ${m.subcontractor}`);
  if (m.contractValue) L.push(`- **Contract value (largest figure detected):** ${m.contractValue}`);
  if (m.prevailingWage) L.push(`- **Prevailing wage:** YES — attorney review recommended on premium-time claims`);
  if (m.dates?.length) L.push(`- **Dates detected:** ${m.dates.join(', ')}`);
  if (m.scopeSnippet) {
    L.push('');
    L.push(`**Scope (as written):** ${m.scopeSnippet}`);
  }
  L.push('');

  // ---- (2) Risk-rated summary table ---------------------------------------
  L.push(`## Risk-rated summary table`);
  L.push('');
  L.push(`| Sev | Issue | Category | Confidence | Location | Required action |`);
  L.push(`|---|---|---|---|---|---|`);
  const tableFlags = analysis.tier === 1
    ? [...analysis.flags].sort((a, b) => (a.posture === 'negotiate' ? -1 : 1) - (b.posture === 'negotiate' ? -1 : 1))
    : analysis.flags;
  for (const f of tableFlags) {
    const loc = f.locations[0];
    const where = loc ? [loc.article, loc.page ? `p.${loc.page}` : null].filter(Boolean).join(', ') || '—' : '—';
    const conf = f.confidence === 'contested' ? 'CONTESTED' : 'firm';
    const tags = [f.attorneyReview ? '⚖️ atty' : null, analysis.tier === 1 && f.posture !== 'negotiate' ? 'accept-and-proceed' : null].filter(Boolean).join('; ');
    L.push(`| ${sevEmoji[f.severity]} ${f.severity} | ${mdEscape(f.title)}${tags ? ` _(${tags})_` : ''} | ${f.category} | ${conf} | ${where} | ${mdEscape(f.action)} |`);
  }
  L.push('');

  // Favorable & protective terms
  L.push(`### Favorable & protective terms`);
  if (analysis.favorable.length) {
    for (const fav of analysis.favorable) L.push(`- ✅ ${fav.label}`);
  } else {
    L.push(`- _None auto-detected. Review manually for standby rights, GC-supplied layout/utilities, changed-conditions protection, OCIP coverage._`);
  }
  L.push('');

  // ---- (1) Detailed written report ----------------------------------------
  L.push(`## Detailed written report`);
  L.push('');
  if (!analysis.flags.length) {
    L.push(`_No taxonomy patterns matched. This does not mean the contract is clean — re-check extraction quality and review manually._`);
    L.push('');
  }
  const byCat = {};
  for (const f of analysis.flags) (byCat[f.category] ||= []).push(f);
  const catOrder = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (const cat of catOrder) {
    const list = byCat[cat];
    if (!list?.length) continue;
    L.push(`### ${cat}. ${list[0].categoryName}`);
    L.push('');
    for (const f of list) {
      L.push(`#### ${sevEmoji[f.severity]} ${f.title}`);
      const loc = f.locations[0];
      if (loc) {
        L.push(`*Where:* ${[loc.article, loc.page ? `page ${loc.page}` : null].filter(Boolean).join(', ') || 'see clause text'}${f.occurrences > 1 ? ` (${f.occurrences} occurrences)` : ''}`);
        L.push('');
        L.push(`> ${mdEscape(loc.clauseText)}`);
      }
      L.push('');
      L.push(`**Why it matters to Bedrock:** ${f.why}`);
      L.push('');
      L.push(`**Severity:** ${f.severity} | **Confidence:** ${f.confidence}${f.attorneyReview ? ' | ⚖️ **Attorney review recommended**' : ''}${analysis.tier === 1 ? ` | **Posture:** ${f.posture}` : ''}`);
      if (f.note) L.push(`> ⚠️ ${f.note}`);
      L.push('');
      L.push(`**Recommended action:** ${f.action}`);
      L.push('');
    }
  }

  // ---- Incorporated documents register ------------------------------------
  L.push(`## Incorporated documents register (retrieve before signing)`);
  L.push('');
  if (analysis.incorporated.count) {
    L.push(`> ${analysis.incorporated.incorporationLanguagePresent ? 'Incorporation-by-reference language is present.' : 'No explicit "incorporated by reference" phrase found, but the following references appear.'} **Sign nothing until these are in hand.**`);
    L.push('');
    L.push(`| Reference | Type | Topic hint | Page | Action |`);
    L.push(`|---|---|---|---|---|`);
    for (const e of analysis.incorporated.entries) {
      L.push(`| ${mdEscape(e.name)} | ${e.type} | ${e.topicHint || '—'} | ${e.page || '—'} | ${mdEscape(e.action)} |`);
    }
  } else {
    L.push(`_No incorporated documents or CSI section numbers detected. Confirm manually — a 200-page set may reference specs not captured by extraction._`);
  }
  L.push('');

  // ---- Bid-vs-schedule cross-check ----------------------------------------
  L.push(`## Bid-vs-schedule cross-check`);
  L.push('');
  if (!analysis.crossCheck.provided) {
    L.push(`_No bid assumptions supplied. Provide priced basis (straight-time vs. premium), priced mobilizations, and additional-mob/standby rates to test the schedule against what was actually priced._`);
  } else if (!analysis.crossCheck.candidates.length) {
    L.push(`_No candidate change orders surfaced from the supplied bid assumptions._`);
  } else {
    for (const c of analysis.crossCheck.candidates) {
      L.push(`- **${c.title}** _(${c.confidence})_${c.attorneyReview ? ' ⚖️' : ''}`);
      L.push(`  - ${c.finding}`);
      if (c.candidateCO) L.push(`  - **Candidate CO:** ${c.candidateCO}`);
      L.push(`  - **Action:** ${c.action}`);
    }
  }
  L.push('');

  // ---- (3) Phased action-item checklist -----------------------------------
  const cl = buildChecklist(analysis);
  L.push(`## Phased action-item checklist`);
  L.push('');
  const renderPhase = (title, items) => {
    L.push(`### ${title}`);
    if (!items.length) {
      L.push(`- _No items._`);
    } else {
      for (const it of items) {
        L.push(`- [ ] **[${it.priority}]** (${it.timing}) ${it.item}`);
        if (it.contact) L.push(`  - *Contact/portal:* ${it.contact}`);
      }
    }
    L.push('');
  };
  renderPhase('IMMEDIATE — before signing', cl.immediate);
  renderPhase('PRE-MOBILIZATION — before anyone steps on site', cl.preMob);
  renderPhase('ONGOING — during performance', cl.ongoing);

  // ---- GC-response email variants -----------------------------------------
  const emails = buildEmailVariants(analysis);
  L.push(`## GC-response email — two postures (pick based on relationship)`);
  L.push('');
  L.push(`### Posture A — reserve and coordinate (softer)`);
  L.push('');
  L.push('```');
  L.push(emails.reserveAndCoordinate);
  L.push('```');
  L.push('');
  L.push(`### Posture B — assert change orders (firmer)`);
  L.push('');
  L.push('```');
  L.push(emails.assertChangeOrders);
  L.push('```');
  L.push('');

  // ---- Caveats ------------------------------------------------------------
  L.push(`## Standing caveats`);
  L.push('');
  for (const c of analysis.caveats) L.push(`- ${c}`);
  L.push('');

  return L.join('\n');
}
