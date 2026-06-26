#!/usr/bin/env node
// CLI: analyze a subcontract PDF (or extracted .txt) and emit all deliverables.
//
//   bedrock-analyze <file.pdf|file.txt> [options]
//
// Options:
//   --tier <1|2|auto>            Counterparty tier (default: auto-suggest, fail to 2)
//   --out <dir>                  Output directory (default: ./output)
//   --bid <file.json>            Bid assumptions JSON for the bid-vs-schedule cross-check
//   --basis <straight-time|premium|unknown>
//   --priced-mobs <n>            Priced mobilization count
//   --add-mob-rate <n>           $ per additional mobilization (e.g. 350)
//   --standby-rate <n>           $/hr per crew member standby (e.g. 150)
//   --print                      Print the markdown report to stdout

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Command } from 'commander';
import { extractPdf } from './extract/pdf.js';
import { analyze } from './engine/analyze.js';
import { generateDeliverables } from './deliverables/index.js';

const program = new Command();
program
  .name('bedrock-analyze')
  .description('Bedrock subcontract analyzer — tiered triage, clause flagging, three deliverables.')
  .argument('<file>', 'subcontract PDF (or pre-extracted .txt)')
  .option('--tier <tier>', 'counterparty tier: 1, 2, or auto', 'auto')
  .option('--out <dir>', 'output directory', 'output')
  .option('--bid <file>', 'bid assumptions JSON file')
  .option('--basis <basis>', 'bid basis: straight-time | premium | unknown')
  .option('--priced-mobs <n>', 'priced mobilization count', (v) => Number(v))
  .option('--add-mob-rate <n>', '$ per additional mobilization', (v) => Number(v))
  .option('--standby-rate <n>', '$/hr per crew member standby', (v) => Number(v))
  .option('--print', 'print markdown report to stdout')
  .parse();

const opts = program.opts();
const file = program.args[0];

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function loadBidAssumptions() {
  let bid = {};
  if (opts.bid) {
    if (!existsSync(opts.bid)) fail(`Bid file not found: ${opts.bid}`);
    bid = JSON.parse(await readFile(opts.bid, 'utf8'));
  }
  if (opts.basis) bid.basis = opts.basis;
  if (typeof opts.pricedMobs === 'number' && !Number.isNaN(opts.pricedMobs)) bid.pricedMobilizations = opts.pricedMobs;
  if (typeof opts.addMobRate === 'number' && !Number.isNaN(opts.addMobRate)) bid.additionalMobRate = opts.addMobRate;
  if (typeof opts.standbyRate === 'number' && !Number.isNaN(opts.standbyRate)) bid.standbyRate = opts.standbyRate;
  return bid;
}

(async () => {
  if (!existsSync(file)) fail(`File not found: ${file}`);

  const buffer = await readFile(file);
  let text, pages = [];
  const extractionMeta = {};

  if (file.toLowerCase().endsWith('.pdf')) {
    const extracted = await extractPdf(buffer);
    text = extracted.text;
    pages = extracted.pages;
    extractionMeta.pageCount = extracted.pageCount;
    extractionMeta.ocrUsed = extracted.ocrUsed;
    for (const w of extracted.warnings) console.error(`⚠ ${w}`);
  } else {
    text = buffer.toString('utf8');
  }

  if (!text.trim()) fail('No text extracted. For scanned PDFs, OCR support must be wired (see README).');

  const bidAssumptions = await loadBidAssumptions();
  const tier = opts.tier === '1' || opts.tier === '2' ? Number(opts.tier) : 'auto';

  const analysis = analyze({ text, pages, fileName: file.split('/').pop(), tier, bidAssumptions });
  if (Object.keys(extractionMeta).length) analysis.extraction = extractionMeta;

  const { written, markdown } = await generateDeliverables(analysis, { outDir: opts.out });

  const s = analysis.summary;
  console.error('');
  console.error(`✓ Analyzed: ${analysis.fileName}`);
  console.error(`  Tier ${analysis.tier} — ${analysis.tierSuggestion.reason}`);
  console.error(`  Flags: ${s.all.total}  (HIGH ${s.all.HIGH} / MED ${s.all.MEDIUM} / LOW ${s.all.LOW})`);
  console.error(`  Incorporated docs to retrieve: ${s.incorporatedDocs} | Contested: ${s.contestedItems} | Attorney-review: ${s.attorneyReviewItems}`);
  console.error(`  Deliverables written to: ${opts.out}/`);
  for (const w of written) console.error(`    - ${w}`);
  console.error('');

  if (opts.print) console.log(markdown);
})().catch((e) => fail(e.stack || e.message));
