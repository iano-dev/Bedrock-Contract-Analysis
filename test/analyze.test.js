import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { analyze } from '../src/engine/analyze.js';
import { suggestTier } from '../src/engine/tiers.js';
import { buildMarkdown, buildDocx } from '../src/deliverables/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = (name) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const cedar = fx('cedar-park-pwa.txt');
const skanska = fx('skanska-tier1.txt');

test('Cedar Park (Tier 2 PWA): fires the high-priority schedule/premium flags', () => {
  const a = analyze({ text: cedar, fileName: 'cedar-park-pwa.txt', tier: 2 });
  const ids = a.flags.map((f) => f.id);
  assert.ok(ids.includes('A-premium-time-absorption'), 'premium-time absorption');
  assert.ok(ids.includes('A-extended-work-week'), '58-hour work week');
  assert.ok(ids.includes('A-mobilization-terms'), 'mobilization terms');
  assert.ok(ids.includes('A-weather-days'), 'weather days');
  assert.ok(ids.includes('B-pay-when-paid'), 'pay-when-paid');
  assert.ok(ids.includes('B-retainage'), 'retainage');
  assert.ok(ids.includes('C-broad-indemnity'), 'broad indemnity');
  assert.ok(ids.includes('C-incorporation-by-reference'), 'incorporation by reference');
  assert.ok(ids.includes('C-insurance-additional-insured'), 'insurance / additional insured');
  assert.ok(ids.includes('D-outcome-drives-method'), 'no-overcut / polished slab');
  assert.ok(ids.includes('E-change-order-process'), 'CO process');
});

test('Cedar Park: premium-time absorption is CONTESTED and attorney-flagged', () => {
  const a = analyze({ text: cedar, tier: 2 });
  const f = a.flags.find((x) => x.id === 'A-premium-time-absorption');
  assert.equal(f.confidence, 'contested');
  assert.equal(f.attorneyReview, true);
  assert.ok(f.note && /straight time/i.test(f.note));
});

test('Cedar Park: incorporated register captures CSI sections + prime contract', () => {
  const a = analyze({ text: cedar, tier: 2 });
  const names = a.incorporated.entries.map((e) => e.name);
  assert.ok(names.some((n) => n.includes('02 41 00')), 'CSI 02 41 00');
  assert.ok(names.some((n) => n.includes('02 41 19')), 'CSI 02 41 19');
  assert.ok(names.some((n) => /Prime Contract/i.test(n)), 'prime contract');
  assert.ok(a.incorporated.incorporationLanguagePresent);
});

test('Cedar Park: prevailing wage detected and contract value parsed', () => {
  const a = analyze({ text: cedar, tier: 2 });
  assert.equal(a.metadata.prevailingWage, true);
  assert.match(a.metadata.contractType, /PWA|prevailing/i);
});

test('Bid cross-check: straight-time basis surfaces a firm premium CO and mobilization delta', () => {
  const a = analyze({
    text: cedar,
    tier: 2,
    bidAssumptions: { basis: 'straight-time', pricedMobilizations: 1, additionalMobRate: 350, standbyRate: 150, pricedSaturdayWork: false },
  });
  assert.ok(a.crossCheck.provided);
  const titles = a.crossCheck.candidates.map((c) => c.title);
  assert.ok(titles.some((t) => /premium/i.test(t)));
  assert.ok(titles.some((t) => /mobiliz/i.test(t)));
  const premium = a.crossCheck.candidates.find((c) => /premium/i.test(c.title));
  assert.equal(premium.confidence, 'firm');
});

test('Bid cross-check: unknown basis keeps the premium claim CONTESTED', () => {
  const a = analyze({ text: cedar, tier: 2, bidAssumptions: { pricedMobilizations: 1 } });
  const premium = a.crossCheck.candidates.find((c) => /premium/i.test(c.title));
  assert.ok(premium);
  assert.equal(premium.confidence, 'contested');
});

test('Tier suggestion: Skanska -> Tier 1; unknown -> Tier 2', () => {
  assert.equal(suggestTier('Skanska USA Building').suggested, 1);
  assert.equal(suggestTier('Some Unknown GC LLC').suggested, 2);
  assert.equal(suggestTier(null).suggested, 2);
});

test('Tier 1 posture: only scope/schedule flags are negotiate; rest accept-and-proceed', () => {
  const a = analyze({ text: skanska, tier: 1 });
  const indemnity = a.flags.find((f) => f.id === 'C-broad-indemnity');
  assert.equal(indemnity.posture, 'accept-and-proceed');
  const schedule = a.flags.find((f) => f.scopeSchedule);
  assert.ok(schedule);
  assert.equal(schedule.posture, 'negotiate');
});

test('Deliverables: markdown contains all three formats + both email postures', () => {
  const a = analyze({ text: cedar, tier: 2 });
  const md = buildMarkdown(a);
  assert.match(md, /Risk-rated summary table/);
  assert.match(md, /Detailed written report/);
  assert.match(md, /Phased action-item checklist/);
  assert.match(md, /Posture A — reserve and coordinate/);
  assert.match(md, /Posture B — assert change orders/);
  assert.match(md, /Incorporated documents register/);
});

test('Deliverables: docx builds to a non-trivial buffer', async () => {
  const a = analyze({ text: cedar, tier: 2 });
  const buf = await buildDocx(a);
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 2000, 'docx buffer should be substantial');
});

test('Empty text throws a clear error', () => {
  assert.throws(() => analyze({ text: '   ' }), /No contract text/);
});
