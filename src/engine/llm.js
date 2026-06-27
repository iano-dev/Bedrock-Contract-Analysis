// LLM-assisted extraction pass (Claude / Anthropic SDK).
//
// The rules engine in scan.js is deterministic and fast but pattern-bound. This
// pass uses Claude to (a) extract contract facts more robustly than regex and
// (b) surface risk clauses the taxonomy's patterns missed — paraphrased
// language, unusual structures, scope hidden in prose. It is OPTIONAL: gated on
// an API key, and the analyzer falls back to the pure rules engine without one.
//
// Model: claude-opus-4-8. Structured outputs via messages.parse + zod guarantee
// a valid shape. The stable doctrine/system prompt is prompt-cached so repeated
// analyses and multi-chunk documents reuse the prefix cheaply.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { CATEGORIES } from '../data/patterns.js';
import { offsetToPage } from '../extract/pages.js';
import { applyTierPosture } from './tiers.js';
import { buildSummary } from './analyze.js';

const MODEL = 'claude-opus-4-8';
const CHUNK_CHARS = 60000; // ~15k tokens per chunk
const CHUNK_OVERLAP = 2000;
const MAX_CHUNKS = 8; // bound cost; we log if a document is truncated

export function llmAvailable() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function client() {
  return new Anthropic(); // resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / profile
}

// ---- Schemas ---------------------------------------------------------------

const MetadataSchema = z.object({
  contractType: z.string().describe('e.g. "AGC-standard subcontract", "Public Works Agreement (PWA)"'),
  project: z.string().nullable().describe('Project name, or null if not stated'),
  contractor: z.string().nullable().describe('General contractor / counterparty hiring Bedrock'),
  subcontractor: z.string().nullable().describe('The subcontractor (usually Bedrock)'),
  contractValue: z.string().nullable().describe('Subcontract sum as written, e.g. "$44,580", or null'),
  prevailingWage: z.boolean().describe('True if this is a prevailing-wage / public works job'),
  scopeSummary: z.string().nullable().describe('One- or two-sentence summary of Bedrock\'s scope of work'),
});

const FlagSchema = z.object({
  category: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).describe('Taxonomy category'),
  title: z.string().describe('Short title of the risk'),
  clauseText: z.string().describe('Exact quoted text of the clause from the contract (verbatim)'),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  confidence: z.enum(['firm', 'contested']).describe('"contested" if the position needs internal verification before asserting'),
  attorneyReview: z.boolean().describe('True for prevailing-wage premium, indemnity enforceability, or lien questions'),
  scopeSchedule: z.boolean().describe('True if this is a scope or schedule item (the Tier-1 negotiation focus)'),
  why: z.string().describe('Why it matters to Bedrock, grounded in the clause'),
  action: z.string().describe('Recommended action'),
});

const FlagsSchema = z.object({
  flags: z.array(FlagSchema),
});

// ---- Prompts ---------------------------------------------------------------

const DOCTRINE = `You are a contract-analysis assistant for Bedrock Concrete Cutting / Bedrock Commercial Concrete, a commercial concrete SUBCONTRACTOR in Oregon and Washington (flat/wall sawing, core drilling, selective demolition, trenching). Contracts come TO Bedrock from general contractors or higher-tier subs. Bedrock is almost always the lowest tier and rarely gets to redline.

You produce contract INTERPRETATION, not legal advice. Flag attorney review for prevailing-wage premium claims, indemnity enforceability, and lien rights. Default to flagging more, not less. Never present a contested position as settled.

Key doctrine:
- Means and methods (which saw, what sequence) belong to Bedrock as an independent contractor. A clause mandating a specific method/equipment is an intrusion and a possible change-order basis.
- Re-sequencing within priced scope = coordinate, no cost claim. Material cost-shifting (compression, added mobilizations, fragmentation into multiple trips, straight-time work pushed into a newly created premium window) = a change-order event.
- Premium-time absorption language ("included all costs and premium time required to perform the work and the project schedule") quietly shifts Saturday/extended-week premium onto Bedrock; treat as CONTESTED until the bid's straight-time vs. premium basis is confirmed.
- Documents incorporated by reference (MSA, prime contract, CSI MasterFormat spec sections like "02 41 00") bind Bedrock even though their text isn't in the PDF — sign nothing until retrieved.
- Bedrock is bound to the schedule as it existed at contract formation; a generic "check Procore/Smartsheets for updates" clause is notification, not consent to unlimited cost-shifting.

Taxonomy categories:
A — Schedule & premium time (highest priority): post-signing schedule changes, premium-time absorption, extended work weeks, mandatory OT at no comp, liquidated damages, weather-day limits, mobilization/standby terms.
B — Financial / cash flow: pay-if-paid vs pay-when-paid, retainage, invoice mechanics, close-out payment traps, lien-waiver chains.
C — Legal / risk allocation: broad indemnity, incorporation by reference, insurance/additional-insured, OCIP/wrap-up.
D — Operational / means-and-methods: mandated equipment/method, outcome constraints that drive method (no-overcut/polished slab), dust/slurry/cleanup, on-site supervision, hazmat stop-work.
E — Administrative / preconditions: change-order process, submittals window, executed-subcontract/COI preconditions, background checks/onboarding.
F — Incorporated documents (handled separately).`;

const FLAG_INSTRUCTIONS = `From the contract excerpt below, identify risk clauses relevant to Bedrock per the taxonomy. For each, quote the clause text VERBATIM (so it can be located in the document), assign the category, severity (HIGH/MEDIUM/LOW), confidence, attorneyReview, and scopeSchedule, and explain why it matters plus the recommended action.

Rules:
- Only report clauses actually present in this excerpt. Do not invent or generalize.
- Prefer precision: quote the specific sentence, not a whole article.
- A list of risks already detected by a separate pattern engine is provided — focus on clauses that engine likely MISSED (paraphrased language, unusual structures, scope buried in prose). Do not re-report a clause already in that list.
- If nothing new is present, return an empty flags array.`;

function systemBlocks() {
  return [{ type: 'text', text: DOCTRINE, cache_control: { type: 'ephemeral' } }];
}

function chunkText(text) {
  const chunks = [];
  for (let i = 0; i < text.length && chunks.length < MAX_CHUNKS; i += CHUNK_CHARS - CHUNK_OVERLAP) {
    chunks.push({ start: i, text: text.slice(i, i + CHUNK_CHARS) });
  }
  const covered = chunks.length ? Math.min(text.length, chunks[chunks.length - 1].start + CHUNK_CHARS) : 0;
  return { chunks, truncated: covered < text.length, coveredChars: covered };
}

// ---- Public API ------------------------------------------------------------

export async function llmExtractMetadata(text, { logger } = {}) {
  const c = client();
  const excerpt = text.slice(0, CHUNK_CHARS); // parties/value/scope live up front
  if (logger) logger('LLM: extracting contract facts…');
  const res = await c.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: systemBlocks(),
    messages: [
      {
        role: 'user',
        content: `Extract the contract facts from this subcontract excerpt.\n\n---\n${excerpt}\n---`,
      },
    ],
    output_config: { format: zodOutputFormat(MetadataSchema, 'contract_facts') },
  });
  return res.parsed_output || null;
}

export async function llmFindClauses(text, { existingFlags = [], logger } = {}) {
  const c = client();
  const { chunks, truncated, coveredChars } = chunkText(text);
  const existingList = existingFlags
    .map((f) => `- [${f.category}] ${f.title}`)
    .join('\n') || '(none)';

  const all = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    const ch = chunks[idx];
    if (logger) logger(`LLM: scanning excerpt ${idx + 1}/${chunks.length} for missed clauses…`);
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: systemBlocks(),
      messages: [
        {
          role: 'user',
          content: `${FLAG_INSTRUCTIONS}\n\nAlready-detected risks (do not repeat):\n${existingList}\n\n--- CONTRACT EXCERPT (chars ${ch.start}–${ch.start + ch.text.length}) ---\n${ch.text}\n---`,
        },
      ],
      output_config: { format: zodOutputFormat(FlagsSchema, 'risk_flags') },
    });
    const out = res.parsed_output;
    if (out?.flags?.length) all.push(...out.flags);
  }

  return { flags: all, truncated, coveredChars, totalChars: text.length, chunkCount: chunks.length };
}

// Bounded, single-call enrichment for the serverless web path: extract contract
// facts AND find missed clauses in ONE Claude call over a capped excerpt, at low
// effort, so it returns well within a serverless function's time limit. Returns
// raw facts + flags; the caller normalizes and merges. (The chunked, full-document
// enrichAnalysisWithLlm above is used by the CLI/library where there's no timeout.)
const ENRICH_MAX_CHARS = 36000; // ~9k tokens — one fast call

// The scope of work is often deep inside a long contract (e.g. an AGC 600's
// "Article 16 — Special Provisions / Scope of Work" can sit on page 14 of 247).
// Blindly taking the first N characters misses it entirely, so build an excerpt
// CENTERED on the scope/inclusions/exclusions language instead. Returns windows
// around every scope marker, merged and capped — or the head of the document if
// no marker is found.
const SCOPE_MARKERS =
  /\b(scope of (?:work|services|the work)|description of (?:the )?work|work to be performed|the following scope|statement of work|\binclusions?\b|\bexclusions?\b|\bclarifications?\b|assumptions and (?:qualifications|exclusions)|qualifications and (?:assumptions|exclusions)|scope:)\b/gi;

export function buildScopeExcerpt(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  SCOPE_MARKERS.lastIndex = 0;
  const hits = [];
  let m;
  while ((m = SCOPE_MARKERS.exec(text)) !== null && hits.length < 40) hits.push(m.index);
  if (!hits.length) return text.slice(0, maxChars);
  const BEFORE = 1200;
  const AFTER = 4500;
  const windows = hits.map((i) => [Math.max(0, i - BEFORE), Math.min(text.length, i + AFTER)]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1] + 400) last[1] = Math.max(last[1], w[1]);
    else merged.push([...w]);
  }
  let out = '';
  for (const [s, e] of merged) {
    if (out.length >= maxChars) break;
    out += (out ? '\n\n[…]\n\n' : '') + text.slice(s, e);
  }
  return out.slice(0, maxChars);
}

const EnrichSchema = z.object({
  facts: MetadataSchema,
  scopeItems: z
    .array(z.string())
    .describe(
      'The EXACT, specific scope of the subcontractor\'s work, copied verbatim from the contract — concrete quantities, dimensions, locations/zones, assemblies, and cut/saw/core types (e.g. "saw cut 2,207 SF of 6\\" slab in Areas A–C", "core drill 14 penetrations"). EXCLUDE generic boilerplate such as "furnish all labor, equipment and tools necessary to perform the Work." Return an empty array if the document only contains generic scope language.'
    ),
  flags: z.array(FlagSchema),
});

export async function llmQuickEnrich(documentText, { existingFlags = [] } = {}) {
  const c = client();
  const full = documentText || '';
  const truncated = full.length > ENRICH_MAX_CHARS;
  let doc;
  if (!truncated) {
    doc = full;
  } else {
    // Facts and early flags live up front; the scope section may be far deeper.
    // Send the head for facts, then a scope-centered excerpt from the remainder.
    const FRONT = 24000;
    const front = full.slice(0, FRONT);
    const scope = buildScopeExcerpt(full.slice(FRONT), ENRICH_MAX_CHARS - FRONT - 80);
    doc = scope ? `${front}\n\n[… excerpt continues — scope of work section …]\n\n${scope}` : front;
  }
  const existingList = existingFlags.map((f) => `- [${f.category}] ${f.title}`).join('\n') || '(none)';
  const res = await c.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: systemBlocks(),
    messages: [
      {
        role: 'user',
        content: `${FLAG_INSTRUCTIONS}\n\nAlso extract the contract facts (type, parties, value, scope, prevailing wage).\n\nSeparately, populate "scopeItems" with the EXACT, specific scope of OUR (the subcontractor's) work — copy the concrete quantities, dimensions, locations/zones, assemblies, and cut/saw/core descriptions verbatim from the document. Do NOT include generic boilerplate ("furnish all labor and materials to perform the Work"); only the specific, measurable scope. Empty array if the document has no specific scope.\n\nAlready-detected risks (do not repeat):\n${existingList}\n\n--- CONTRACT (excerpt) ---\n${doc}\n---`,
      },
    ],
    output_config: { format: zodOutputFormat(EnrichSchema, 'enrichment'), effort: 'low' },
  });
  const out = res.parsed_output || { facts: null, flags: [] };
  return { facts: out.facts || null, rawFlags: out.flags || [], scopeItems: out.scopeItems || [], truncated };
}

// Read a bid/estimate document and extract the structured assumptions used by
// the bid-vs-schedule cross-check, so the user can upload their bid instead of
// typing the numbers. One small, fast call.
const BidSchema = z.object({
  basis: z.enum(['straight-time', 'premium', 'unknown']).describe('Was labor priced at straight time, or did it include premium/overtime?'),
  pricedMobilizations: z.number().nullable().describe('Number of mobilizations/trips to the site that were priced, or null if not stated'),
  additionalMobRate: z.number().nullable().describe('Dollars per additional mobilization, or null'),
  standbyRate: z.number().nullable().describe('Dollars per hour of standby per crew member, or null'),
  pricedSaturdayWork: z.boolean().nullable().describe('Whether the bid included Saturday/weekend work, or null if unclear'),
});

export async function llmParseBid(bidText) {
  const c = client();
  const doc = (bidText || '').slice(0, 24000);
  const res = await c.messages.parse({
    model: MODEL,
    max_tokens: 800,
    system: [
      {
        type: 'text',
        text: 'You read a concrete-cutting subcontractor\'s (Bedrock) bid or estimate and extract the pricing assumptions, so they can be compared against the contract schedule to find change orders. Use null for any field the bid does not state. Do not guess.',
      },
    ],
    messages: [{ role: 'user', content: `Extract the bid assumptions from this estimate/bid:\n\n---\n${doc}\n---` }],
    output_config: { format: zodOutputFormat(BidSchema, 'bid_assumptions'), effort: 'low' },
  });
  const out = res.parsed_output || {};
  const a = {};
  if (out.basis) a.basis = out.basis;
  if (typeof out.pricedMobilizations === 'number') a.pricedMobilizations = out.pricedMobilizations;
  if (typeof out.additionalMobRate === 'number') a.additionalMobRate = out.additionalMobRate;
  if (typeof out.standbyRate === 'number') a.standbyRate = out.standbyRate;
  if (typeof out.pricedSaturdayWork === 'boolean') a.pricedSaturdayWork = out.pricedSaturdayWork;
  return a;
}

// Compare the scope of OUR uploaded quote/bid against the scope the contract
// actually binds us to, and draft redline language to send back to the GC so the
// contract matches what we priced. One bounded call over both documents.
const SCOPE_COMPARE_MAX = 30000; // chars per document — keep the single call bounded

const RedlineSchema = z.object({
  issue: z.string().describe('Short title of the scope mismatch, e.g. "Contract omits the 14 priced core-drill penetrations"'),
  direction: z
    .enum(['contract-exceeds-quote', 'quote-exceeds-contract', 'conflict', 'silent'])
    .describe(
      'contract-exceeds-quote = contract demands more than we priced (unpriced work / need exclusion); quote-exceeds-contract = we priced/assumed something the contract does not grant (need it added/confirmed); conflict = both state it but differ (quantity, location, premium time); silent = contract is silent on something our quote depends on'
    ),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']).describe('HIGH if it exposes Bedrock to unpriced cost or unpaid work'),
  contractLanguage: z
    .string()
    .nullable()
    .describe('The exact current contract sentence/clause this redline targets, quoted VERBATIM so it can be located — or null if the contract is silent and we are proposing an addition'),
  quoteBasis: z.string().nullable().describe('What our quote/bid says or assumes on this point (quantity, inclusion, exclusion, basis), or null'),
  suggestedLanguage: z.string().describe('Ready-to-send replacement or added clause language that aligns the contract to our quote — written to paste into a redline or an email to the GC'),
  rationale: z.string().describe('One or two sentences: why we are asking for this change, tied to what we priced.'),
});

const ScopeCompareSchema = z.object({
  summary: z.string().describe('One or two plain sentences on how well the contract scope matches our quoted scope overall.'),
  redlines: z.array(RedlineSchema).describe('Concrete, sendable scope changes. Empty array if the contract scope already matches the quote.'),
});

export async function llmScopeCompare({ contractText, bidText }) {
  if (!contractText?.trim() || !bidText?.trim()) return { summary: '', redlines: [] };
  const c = client();
  // The contract's scope section may sit deep in a long document — center the
  // excerpt on the scope language rather than taking the head. Bids are short.
  const contract = buildScopeExcerpt(contractText, SCOPE_COMPARE_MAX);
  const bid = bidText.slice(0, SCOPE_COMPARE_MAX);
  const res = await c.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: systemBlocks(),
    messages: [
      {
        role: 'user',
        content:
          `Compare the SCOPE in Bedrock's own QUOTE/BID against the SCOPE the CONTRACT binds Bedrock to, and propose redline language to send back to the general contractor so the contract matches what Bedrock actually priced.\n\n` +
          `Focus on the EXACT scope: quantities, dimensions, locations/zones, assemblies, cut/saw/core types, inclusions, exclusions, and pricing basis (straight time vs. premium, number of mobilizations). Ignore generic boilerplate.\n\n` +
          `For every material mismatch produce one redline:\n` +
          `- If the CONTRACT demands more than the quote covers (extra area, extra penetrations, work not priced), propose either an explicit EXCLUSION or that the item be priced as a change.\n` +
          `- If the QUOTE includes an assumption/exclusion the contract does not grant (e.g. priced one mobilization, straight time only, dewatering by others), propose adding that assumption/exclusion to the contract.\n` +
          `- If both address an item but the numbers/locations CONFLICT, propose language matching the quoted figure.\n` +
          `Quote the current contract sentence VERBATIM in contractLanguage so it can be located (null if the contract is simply silent). Write suggestedLanguage so it can be pasted straight into a redline or an email to the GC.\n\n` +
          `CRITICAL: Use only real content from the two documents below. NEVER output placeholder, dummy, or filler text (e.g. the word "placeholder"). If the contract excerpt does not contain a specific, concrete scope to compare against — or the scopes already match — return an EMPTY redlines array and say so plainly in the summary. Do not invent a redline just to fill the array.\n\n` +
          `--- BEDROCK QUOTE / BID ---\n${bid}\n---\n\n--- CONTRACT (scope-focused excerpt) ---\n${contract}\n---`,
      },
    ],
    output_config: { format: zodOutputFormat(ScopeCompareSchema, 'scope_comparison'), effort: 'medium' },
  });
  const out = res.parsed_output || { summary: '', redlines: [] };
  // Drop any degenerate placeholder/filler redlines the model may still emit.
  const redlines = (Array.isArray(out.redlines) ? out.redlines : []).filter(
    (r) => r && r.issue && r.suggestedLanguage && !/^\s*placeholder\s*$/i.test(r.issue) && !/^\s*placeholder\s*$/i.test(r.suggestedLanguage)
  );
  return { summary: out.summary || '', redlines };
}

// Convert raw LLM flags into the engine's Flag shape, attaching a page number by
// locating the quoted clause text in the document, and de-duping against the
// rules-engine flags by title similarity.
export function normalizeLlmFlags(rawFlags, { text, pages, existingFlags = [] }) {
  // Build per-category token sets for the rules-engine flags, so we can drop LLM
  // findings that restate something the patterns already caught.
  const existing = existingFlags.map((f) => ({ category: f.category, tokens: titleTokens(f.title) }));
  const kept = [];
  const out = [];
  for (const f of rawFlags) {
    const tokens = titleTokens(f.title);
    const isDup = [...existing, ...kept].some(
      (e) => e.category === f.category && tokenOverlap(e.tokens, tokens) >= 2
    );
    if (isDup) continue;
    kept.push({ category: f.category, tokens });
    const idx = f.clauseText ? text.indexOf(f.clauseText.slice(0, 40)) : -1;
    const page = idx >= 0 && pages.length ? offsetToPage(pages, idx) : null;
    out.push({
      id: `llm-${f.category}-${out.length + 1}`,
      source: 'llm',
      category: f.category,
      categoryName: CATEGORIES[f.category] || f.category,
      title: f.title,
      severity: f.severity,
      confidence: f.confidence,
      attorneyReview: f.attorneyReview,
      scopeSchedule: f.scopeSchedule,
      why: f.why,
      action: f.action,
      note: null,
      occurrences: 1,
      locations: [
        {
          page,
          article: null,
          clauseText: f.clauseText,
          quote: (f.clauseText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        },
      ],
    });
  }
  return out;
}

// Enrich a rules-engine analysis in place: fill missing contract facts and
// append LLM-found clauses the patterns missed. Returns the same analysis object
// (mutated) with an `llm` block describing what the pass did. Never throws — on
// API error it records the failure and leaves the rules-engine result intact.
export async function enrichAnalysisWithLlm(analysis, { text, pages = [], logger } = {}) {
  if (!llmAvailable()) {
    analysis.llm = { used: false, reason: 'No ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN set — rules engine only.' };
    return analysis;
  }
  try {
    // 1. Contract facts — fill fields the regex left null; keep regex value otherwise.
    const facts = await llmExtractMetadata(text, { logger });
    if (facts) {
      const m = analysis.metadata;
      const fill = (k, v) => { if ((m[k] == null || m[k] === '') && v != null && v !== '') m[k] = v; };
      fill('contractType', facts.contractType);
      fill('project', facts.project);
      fill('contractor', facts.contractor);
      fill('subcontractor', facts.subcontractor);
      fill('contractValue', facts.contractValue);
      if (facts.prevailingWage) m.prevailingWage = true;
      if (!m.scopeSnippet && facts.scopeSummary) m.scopeSnippet = facts.scopeSummary;
      analysis.metadata.llmFacts = facts;
    }

    // 2. Clauses the patterns missed.
    const found = await llmFindClauses(text, { existingFlags: analysis.flags, logger });
    let newFlags = normalizeLlmFlags(found.flags, { text, pages, existingFlags: analysis.flags });
    newFlags = applyTierPosture(newFlags, analysis.tier);

    if (newFlags.length) {
      const sevRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      analysis.flags = [...analysis.flags, ...newFlags].sort(
        (a, b) => a.category.localeCompare(b.category) || sevRank[a.severity] - sevRank[b.severity]
      );
      analysis.summary = buildSummary(analysis.flags, analysis.incorporated);
    }

    analysis.llm = {
      used: true,
      model: MODEL,
      addedFlags: newFlags.length,
      factsExtracted: !!facts,
      chunkCount: found.chunkCount,
      coverage: found.truncated
        ? `Scanned ${found.coveredChars.toLocaleString()} of ${found.totalChars.toLocaleString()} chars (first ${MAX_CHUNKS} excerpts) — large document truncated for the LLM pass; rules engine covered the full text.`
        : 'Full document scanned.',
    };
  } catch (e) {
    analysis.llm = { used: false, error: e.message, reason: 'LLM pass failed; rules-engine result is intact.' };
    if (logger) logger(`LLM pass failed: ${e.message}`);
  }
  return analysis;
}

// Significant (length>3) tokens of a title, ignoring a few generic filler words.
const FILLER = new Set(['clause', 'rules', 'flag', 'duplicate', 'obligation', 'requirement', 'provision']);
function titleTokens(t) {
  return new Set(
    (t || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !FILLER.has(w))
  );
}
function tokenOverlap(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}
