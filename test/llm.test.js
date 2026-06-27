import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { analyze } from '../src/engine/analyze.js';
import { llmAvailable, normalizeLlmFlags, enrichAnalysisWithLlm, llmScopeCompare } from '../src/engine/llm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cedar = readFileSync(join(__dirname, 'fixtures', 'cedar-park-pwa.txt'), 'utf8');

test('llmAvailable reflects presence of an API key', () => {
  const had = process.env.ANTHROPIC_API_KEY;
  const hadAuth = process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  assert.equal(llmAvailable(), false);
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  assert.equal(llmAvailable(), true);
  // restore
  if (had === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = had;
  if (hadAuth === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN; else process.env.ANTHROPIC_AUTH_TOKEN = hadAuth;
});

test('normalizeLlmFlags: shapes flags, attaches page, de-dupes vs rules flags', () => {
  const text = 'Filler. ARTICLE 99: The Subcontractor shall provide daily progress photos via the portal. More filler.';
  const pages = [{ page: 1, start: 0, end: text.length }];
  const existingFlags = [{ category: 'A', title: 'Premium-time absorption clause' }];
  const raw = [
    {
      category: 'A',
      title: 'Premium-time absorption clause (duplicate of rules flag)',
      clauseText: 'has included all costs and premium time',
      severity: 'HIGH', confidence: 'contested', attorneyReview: true, scopeSchedule: true,
      why: 'x', action: 'y',
    },
    {
      category: 'E',
      title: 'Daily progress photo upload obligation',
      clauseText: 'The Subcontractor shall provide daily progress photos via the portal',
      severity: 'LOW', confidence: 'firm', attorneyReview: false, scopeSchedule: false,
      why: 'admin burden', action: 'note it',
    },
  ];
  const out = normalizeLlmFlags(raw, { text, pages, existingFlags });
  // The duplicate of an existing rules flag is dropped; the novel one is kept.
  assert.equal(out.length, 1);
  const f = out[0];
  assert.equal(f.source, 'llm');
  assert.equal(f.category, 'E');
  assert.equal(f.page ?? f.locations[0].page, 1, 'page located from quoted clause text');
  assert.ok(f.id.startsWith('llm-'));
  assert.equal(f.categoryName, 'Administrative / preconditions to starting work');
});

test('llmScopeCompare: empty quote or contract short-circuits to no redlines (no API call)', async () => {
  assert.deepEqual(await llmScopeCompare({ contractText: cedar, bidText: '' }), { summary: '', redlines: [] });
  assert.deepEqual(await llmScopeCompare({ contractText: '', bidText: 'some bid' }), { summary: '', redlines: [] });
});

test('enrichAnalysisWithLlm: no API key -> rules engine untouched, llm.used false', async () => {
  const had = process.env.ANTHROPIC_API_KEY;
  const hadAuth = process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;

  const a = analyze({ text: cedar, tier: 2 });
  const before = a.flags.length;
  await enrichAnalysisWithLlm(a, { text: cedar, pages: [] });
  assert.equal(a.llm.used, false);
  assert.equal(a.flags.length, before, 'flags unchanged without LLM');

  if (had === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = had;
  if (hadAuth === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN; else process.env.ANTHROPIC_AUTH_TOKEN = hadAuth;
});
