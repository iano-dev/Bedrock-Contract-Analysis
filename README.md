# Bedrock Contract Analyzer

Internal tool for **Bedrock Concrete Cutting / Bedrock Commercial Concrete** (a commercial concrete subcontractor in OR/WA) to analyze incoming subcontracts. It encodes the construction-specific reasoning and Bedrock-specific priorities from our contract-review doctrine as a rules engine, then produces the three deliverables the team expects — a detailed written report, a risk-rated summary table, and a phased action-item checklist — plus two GC-response email postures, all at once.

> **This is contract interpretation, not legal advice.** It flags attorney review for prevailing-wage premium, indemnity enforceability, and lien questions. It defaults to flagging more (not less) for unknown counterparties, never treats a contested position as settled, and tells you to sign nothing until incorporated-by-reference documents are in hand.

---

## What it does

1. **Tiered triage first** (the most important decision). Tier 1 = large/blue-chip GCs (Skanska, Turner, Hoffman, …): accept-most posture, review narrows to **scope + schedule**; everything else is surfaced as "accept-and-proceed" awareness. Tier 2 = everyone else: **full review, flag everything.** Unknown counterparties **default to Tier 2** (fail safe). The Tier-1 list is editable in `src/data/counterparties.json`.
2. **Extracts** contract text from the PDF (with per-page offsets for citations; OCR fallback hook for scanned sets — see caveat below).
3. **Detects** contract type (AGC sub, PWA/prevailing-wage, …), parties, dates, value, and the scope section.
4. **Runs the full flagging taxonomy** (Section 4 of the brief) as a checklist pass. Each hit emits: *what the clause says → why it matters to Bedrock → severity → recommended action*, with the clause text and a page/article citation.
5. **Auto-builds the Incorporated Documents Register** — every named document and CSI MasterFormat section number incorporated by reference, each marked "retrieve and read separately before signing."
6. **Bid-vs-schedule cross-check** — given priced assumptions, tests whether extended-week/Saturday windows or fragmented mobilizations fall outside what was priced and surfaces the differential as a candidate change order.
7. **Generates all deliverables simultaneously**: Markdown report, risk-rated table, phased checklist, **Word `.docx`** (color-coded severity), JSON, and two GC-response email postures (softer "reserve and coordinate" / firmer "assert change orders").

Every flag carries a **confidence label** (`firm` vs. `contested`) and, where appropriate, an **attorney-review** flag.

---

## Install

```bash
npm install
```

Requires Node ≥ 20.

## Use — CLI

```bash
# Tier auto-suggested from the counterparty, failing to Tier 2
node src/cli.js path/to/subcontract.pdf

# Force a tier and run the bid-vs-schedule cross-check
node src/cli.js path/to/subcontract.pdf \
  --tier 2 \
  --basis straight-time \
  --priced-mobs 1 --add-mob-rate 350 --standby-rate 150 \
  --print
```

Outputs `*.report.md`, `*.report.docx`, and `*.analysis.json` to `./output/` (override with `--out`). Bid assumptions can also come from a JSON file via `--bid bid.json`:

```json
{ "basis": "straight-time", "pricedMobilizations": 1, "additionalMobRate": 350, "standbyRate": 150, "pricedSaturdayWork": false }
```

## Use — Web UI

```bash
npm run web      # http://localhost:3000
```

Upload a PDF, pick a tier (or auto), optionally paste bid assumptions, and download the `.docx` / Markdown / JSON.

## Use — as a library

```js
import { analyzePdfFile, generateDeliverables } from './src/index.js';

const analysis = await analyzePdfFile('subcontract.pdf', {
  tier: 'auto',
  bidAssumptions: { basis: 'straight-time', pricedMobilizations: 1, additionalMobRate: 350 },
});
await generateDeliverables(analysis, { outDir: 'output' });
```

## Test

```bash
npm test
```

The suite uses two fixtures drawn from the worked examples in the brief (Cedar Park MS Seismic PWA — Tier 2; a Skanska AGC sub — Tier 1) as regression tests for the flagging logic, tier posture, incorporated register, bid cross-check, and deliverable generation.

---

## How the doctrine maps to the code

| Doctrine (brief) | Where it lives |
|---|---|
| Two-tier triage (§2) | `src/engine/tiers.js`, `src/data/counterparties.json` |
| Flagging taxonomy A–F (§4) | `src/data/patterns.js`, `src/engine/scan.js` |
| Means-and-methods are Bedrock's (§3.1) | patterns `D-mandated-method-equipment`, `D-outcome-drives-method` |
| Re-sequencing vs. change in the work (§3.2) | `src/engine/bidCrossCheck.js`, schedule patterns |
| Reserve rights in real time (§3.3) | checklist IMMEDIATE/ONGOING items, email postures |
| Incorporation by reference = retrieval flag (§3.4) | `src/engine/incorporated.js` |
| Binding to post-signing schedules (§3.5) | pattern `A-post-signing-schedule-change` |
| Separate firm vs. contested positions (§3.6) | `confidence` on every flag + cross-check |
| Not legal advice / attorney review (§3.7, §8) | `attorneyReview` flags, standing caveats |
| Three deliverables + email variants (§5) | `src/deliverables/*` |
| Clause/pattern library as long-term asset (§6) | `src/data/patterns.js` — add patterns here as new contracts come through |
| Bid-vs-schedule cross-check (§6) | `src/engine/bidCrossCheck.js` |
| Preconditions-to-mobilize gate (§6) | `src/deliverables/checklist.js` (PRE-MOBILIZATION phase) |

## Growing the pattern library

The clause/pattern library is the long-term asset. To teach the tool a new recurring pattern, add an entry to `PATTERNS` in `src/data/patterns.js`:

```js
{
  id: 'B-new-pattern',
  category: 'B',                 // A–F per the taxonomy
  title: 'Short human title',
  matchers: [/case-insensitive regex/i],
  severity: 'HIGH',             // HIGH | MEDIUM | LOW
  confidence: 'firm',           // 'firm' | 'contested'
  attorneyReview: false,
  scopeSchedule: false,         // true => part of the Tier-1 narrowed focus
  why: 'Why it matters to Bedrock, with doctrine references.',
  action: 'Recommended action.',
  note: 'Optional verification a contested position needs.',
}
```

Add a regression case to `test/analyze.test.js` so the pattern stays covered.

---

## Scanned-PDF / OCR caveat

Text-based PDFs work out of the box. For **scanned** sets the extractor detects low text yield and warns. Full OCR needs both `tesseract.js` (declared as an optional dependency) **and** a PDF-page rasterizer (poppler/graphicsmagick), which is environment-dependent and not wired by default. Until that toolchain is provisioned, either supply a text-based PDF or pre-render pages for OCR. The analysis still runs on whatever text is extracted, with the warning surfaced in the report.

## Notes

- Large PDFs (200+ pages) are expected; extraction keeps per-page offsets so the report can cite page numbers.
- Live jobs reference **Procore** and **Smartsheets** for GC-side schedule/communication; the checklist points re-analysis/reservation triggers at those portals. A future integration could watch for posted schedule revisions and prompt a re-analysis.
- `.docx` generation uses the `docx` npm library (the proven path); Markdown and JSON are offered as alternates.
