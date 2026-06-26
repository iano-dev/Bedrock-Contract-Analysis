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
import { offsetToPage } from '../extract/pdf.js';
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
      locations: [{ page, article: null, clauseText: f.clauseText }],
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
