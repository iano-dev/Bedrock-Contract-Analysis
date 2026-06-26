// Word .docx deliverable via the `docx` npm library (the proven path).
// Color-coded severity, risk-rated table, narrative report, incorporated-docs
// register, bid cross-check, phased checklist, and both email postures.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType,
} from 'docx';
import { buildChecklist } from './checklist.js';
import { buildEmailVariants } from './emailVariants.js';

const SEV_FILL = { HIGH: 'F8D7DA', MEDIUM: 'FFF3CD', LOW: 'D4EDDA' };
const SEV_COLOR = { HIGH: 'B02A37', MEDIUM: '997404', LOW: '0F5132' };

function h(text, level = HeadingLevel.HEADING_2) {
  return new Paragraph({ text, heading: level, spacing: { before: 200, after: 100 } });
}
function p(children, opts = {}) {
  const runs = Array.isArray(children) ? children : [new TextRun(children)];
  return new Paragraph({ children: runs, spacing: { after: 80 }, ...opts });
}
function cell(content, { fill, bold, color, width } = {}) {
  const runs = Array.isArray(content) ? content : [new TextRun({ text: String(content ?? ''), bold, color })];
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ children: runs })],
  });
}
function headerRow(labels) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((l) => cell(l, { fill: '343A40', bold: true, color: 'FFFFFF' })),
  });
}
function table(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
    },
    rows,
  });
}

export async function buildDocx(analysis) {
  const m = analysis.metadata;
  const kids = [];

  kids.push(new Paragraph({ text: 'Bedrock Subcontract Analysis', heading: HeadingLevel.TITLE }));
  kids.push(p([new TextRun({ text: analysis.generatedFor, italics: true })]));
  if (analysis.fileName) kids.push(p([new TextRun({ text: `Source file: ${analysis.fileName}`, italics: true })]));
  kids.push(
    p([
      new TextRun({ text: `Tier ${analysis.tier}`, bold: true }),
      new TextRun({ text: ` — ${analysis.tier === 1 ? 'accept-most posture; review narrowed to scope + schedule' : 'full review, flag everything'}.` }),
    ])
  );
  kids.push(p([new TextRun({ text: analysis.tierSuggestion.reason, italics: true, color: '555555' })]));

  // At a glance
  kids.push(h('At a glance'));
  const s = analysis.summary;
  const glanceRows = [headerRow(['', 'HIGH', 'MEDIUM', 'LOW', 'Total'])];
  if (analysis.tier === 1) {
    glanceRows.push(new TableRow({ children: [cell('Negotiate (scope/schedule)'), cell(s.negotiate.HIGH), cell(s.negotiate.MEDIUM), cell(s.negotiate.LOW), cell(s.negotiate.total)] }));
    glanceRows.push(new TableRow({ children: [cell('Accept-and-proceed'), cell(s.acceptAndProceed.HIGH), cell(s.acceptAndProceed.MEDIUM), cell(s.acceptAndProceed.LOW), cell(s.acceptAndProceed.total)] }));
  } else {
    glanceRows.push(new TableRow({ children: [cell('All flags'), cell(s.all.HIGH), cell(s.all.MEDIUM), cell(s.all.LOW), cell(s.all.total)] }));
  }
  kids.push(table(glanceRows));
  kids.push(p([new TextRun({ text: `Incorporated docs to retrieve: ${s.incorporatedDocs}  |  Contested: ${s.contestedItems}  |  Attorney-review items: ${s.attorneyReviewItems}` })]));
  kids.push(
    p([
      new TextRun({
        text: analysis.llm?.used
          ? `Analysis engine: rules engine + Claude-assisted pass (${analysis.llm.model}) — ${analysis.llm.addedFlags} additional clause(s) found by Claude.`
          : `Analysis engine: rules engine only${analysis.llm?.reason ? ` (${analysis.llm.reason})` : ''}.`,
        italics: true,
        color: '555555',
      }),
    ])
  );
  if (analysis.extraction?.ocrUsed) {
    kids.push(p([new TextRun({ text: `OCR: ${analysis.extraction.ocrPages?.length || 0} scanned page(s) recovered.`, italics: true, color: '555555' })]));
  }

  // Contract facts
  kids.push(h('Contract facts'));
  const facts = [
    ['Contract type', m.contractType],
    ['Project', m.project],
    ['Contractor / counterparty', m.contractor],
    ['Subcontractor', m.subcontractor],
    ['Contract value (largest figure)', m.contractValue],
    ['Prevailing wage', m.prevailingWage ? 'YES — attorney review on premium-time' : 'Not detected'],
  ].filter(([, v]) => v);
  for (const [k, v] of facts) kids.push(p([new TextRun({ text: `${k}: `, bold: true }), new TextRun({ text: String(v) })]));
  if (m.scopeSnippet) kids.push(p([new TextRun({ text: 'Scope (as written): ', bold: true }), new TextRun({ text: m.scopeSnippet })]));

  // Risk-rated table
  kids.push(h('Risk-rated summary table'));
  const trows = [headerRow(['Sev', 'Issue', 'Cat', 'Conf', 'Location', 'Required action'])];
  for (const f of analysis.flags) {
    const loc = f.locations[0];
    const where = loc ? [loc.article, loc.page ? `p.${loc.page}` : null].filter(Boolean).join(', ') || '—' : '—';
    const titleRuns = [new TextRun({ text: f.title })];
    if (f.source === 'llm') titleRuns.push(new TextRun({ text: '  [AI-found]', italics: true, color: '0969DA' }));
    if (f.attorneyReview) titleRuns.push(new TextRun({ text: '  [attorney review]', italics: true, color: '6F42C1' }));
    if (analysis.tier === 1 && f.posture !== 'negotiate') titleRuns.push(new TextRun({ text: '  [accept-and-proceed]', italics: true, color: '555555' }));
    trows.push(
      new TableRow({
        children: [
          cell([new TextRun({ text: f.severity, bold: true, color: SEV_COLOR[f.severity] })], { fill: SEV_FILL[f.severity] }),
          cell(titleRuns),
          cell(f.category),
          cell(f.confidence === 'contested' ? [new TextRun({ text: 'CONTESTED', bold: true, color: 'B02A37' })] : 'firm'),
          cell(where),
          cell(f.action),
        ],
      })
    );
  }
  kids.push(table(trows));

  // Favorable terms
  kids.push(h('Favorable & protective terms'));
  if (analysis.favorable.length) {
    for (const fav of analysis.favorable) kids.push(p([new TextRun({ text: '✓ ', bold: true, color: '0F5132' }), new TextRun({ text: fav.label })]));
  } else {
    kids.push(p([new TextRun({ text: 'None auto-detected — review manually for standby rights, GC-supplied layout/utilities, changed-conditions protection, OCIP coverage.', italics: true })]));
  }

  // Detailed report
  kids.push(h('Detailed written report'));
  const byCat = {};
  for (const f of analysis.flags) (byCat[f.category] ||= []).push(f);
  for (const cat of ['A', 'B', 'C', 'D', 'E']) {
    const list = byCat[cat];
    if (!list?.length) continue;
    kids.push(h(`${cat}. ${list[0].categoryName}`, HeadingLevel.HEADING_3));
    for (const f of list) {
      kids.push(p([new TextRun({ text: `${f.severity} — ${f.title}`, bold: true, color: SEV_COLOR[f.severity] })]));
      const loc = f.locations[0];
      if (loc) {
        kids.push(p([new TextRun({ text: `Where: ${[loc.article, loc.page ? `page ${loc.page}` : null].filter(Boolean).join(', ') || 'see clause'}`, italics: true, color: '555555' })]));
        kids.push(p([new TextRun({ text: loc.clauseText, italics: true })], { border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC', space: 8 } } }));
      }
      kids.push(p([new TextRun({ text: 'Why it matters: ', bold: true }), new TextRun({ text: f.why })]));
      if (f.note) kids.push(p([new TextRun({ text: '⚠ Verify: ', bold: true, color: '997404' }), new TextRun({ text: f.note })]));
      kids.push(p([new TextRun({ text: 'Recommended action: ', bold: true }), new TextRun({ text: f.action })]));
    }
  }

  // Incorporated register
  kids.push(h('Incorporated documents register (retrieve before signing)'));
  if (analysis.incorporated.count) {
    const irows = [headerRow(['Reference', 'Type', 'Topic hint', 'Page', 'Action'])];
    for (const e of analysis.incorporated.entries) {
      irows.push(new TableRow({ children: [cell(e.name), cell(e.type), cell(e.topicHint || '—'), cell(e.page || '—'), cell(e.action)] }));
    }
    kids.push(table(irows));
  } else {
    kids.push(p([new TextRun({ text: 'No incorporated documents or CSI section numbers detected — confirm manually.', italics: true })]));
  }

  // Bid cross-check
  kids.push(h('Bid-vs-schedule cross-check'));
  if (!analysis.crossCheck.provided) {
    kids.push(p([new TextRun({ text: 'No bid assumptions supplied. Provide priced basis, mobilizations, and rates to test against the schedule.', italics: true })]));
  } else if (!analysis.crossCheck.candidates.length) {
    kids.push(p([new TextRun({ text: 'No candidate change orders surfaced.', italics: true })]));
  } else {
    for (const c of analysis.crossCheck.candidates) {
      kids.push(p([new TextRun({ text: `${c.title} (${c.confidence})`, bold: true })]));
      kids.push(p(c.finding));
      if (c.candidateCO) kids.push(p([new TextRun({ text: 'Candidate CO: ', bold: true }), new TextRun({ text: c.candidateCO })]));
      kids.push(p([new TextRun({ text: 'Action: ', bold: true }), new TextRun({ text: c.action })]));
    }
  }

  // Phased checklist
  const cl = buildChecklist(analysis);
  kids.push(h('Phased action-item checklist'));
  const phase = (title, items) => {
    kids.push(h(title, HeadingLevel.HEADING_3));
    if (!items.length) { kids.push(p('No items.')); return; }
    for (const it of items) {
      kids.push(p([new TextRun({ text: `☐ [${it.priority}] `, bold: true }), new TextRun({ text: `(${it.timing}) ${it.item}` })]));
      if (it.contact) kids.push(p([new TextRun({ text: `Contact/portal: ${it.contact}`, italics: true, color: '555555' })]));
    }
  };
  phase('IMMEDIATE — before signing', cl.immediate);
  phase('PRE-MOBILIZATION — before stepping on site', cl.preMob);
  phase('ONGOING — during performance', cl.ongoing);

  // Email variants
  const emails = buildEmailVariants(analysis);
  kids.push(h('GC-response email — two postures'));
  const emailBlock = (title, body) => {
    kids.push(h(title, HeadingLevel.HEADING_3));
    for (const line of body.split('\n')) kids.push(new Paragraph({ children: [new TextRun({ text: line })], spacing: { after: 20 } }));
  };
  emailBlock('Posture A — reserve and coordinate (softer)', emails.reserveAndCoordinate);
  emailBlock('Posture B — assert change orders (firmer)', emails.assertChangeOrders);

  // Caveats
  kids.push(h('Standing caveats'));
  for (const c of analysis.caveats) kids.push(p([new TextRun({ text: '• ' + c })]));

  const doc = new Document({
    creator: 'Bedrock Contract Analyzer',
    title: 'Bedrock Subcontract Analysis',
    sections: [{ properties: {}, children: kids }],
  });
  return Packer.toBuffer(doc);
}
