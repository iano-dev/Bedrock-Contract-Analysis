# Bedrock Contract Analyzer

Internal tool for **Bedrock Concrete Cutting / Bedrock Commercial Concrete** (a commercial concrete subcontractor in OR/WA) to analyze incoming subcontracts. It encodes the construction-specific reasoning and Bedrock-specific priorities from our contract-review doctrine as a rules engine, then produces the three deliverables the team expects — a detailed written report, a risk-rated summary table, and a phased action-item checklist — plus two GC-response email postures, all at once.

> **This is contract interpretation, not legal advice.** It flags attorney review for prevailing-wage premium, indemnity enforceability, and lien questions. It defaults to flagging more (not less) for unknown counterparties, never treats a contested position as settled, and tells you to sign nothing until incorporated-by-reference documents are in hand.

---

## What it does

1. **Tiered triage first** (the most important decision). Tier 1 = large/blue-chip GCs (Skanska, Turner, Hoffman, …): accept-most posture, review narrows to **scope + schedule**; everything else is surfaced as "accept-and-proceed" awareness. Tier 2 = everyone else: **full review, flag everything.** Unknown counterparties **default to Tier 2** (fail safe). The Tier-1 list is editable in `src/data/counterparties.json`.
2. **Extracts** contract text from the PDF (with per-page offsets for citations). **Scanned pages are OCR'd automatically and offline** — see OCR below.
3. **Detects** contract type (AGC sub, PWA/prevailing-wage, …), parties, dates, value, and the scope section.
4. **Runs the full flagging taxonomy** (Section 4 of the brief) as a checklist pass. Each hit emits: *what the clause says → why it matters to Bedrock → severity → recommended action*, with the clause text and a page/article citation.
5. **Auto-builds the Incorporated Documents Register** — every named document and CSI MasterFormat section number incorporated by reference, each marked "retrieve and read separately before signing."
6. **Bid-vs-schedule cross-check** — given priced assumptions, tests whether extended-week/Saturday windows or fragmented mobilizations fall outside what was priced and surfaces the differential as a candidate change order.
7. **Optional Claude-assisted pass** (see below) — fills in contract facts regex missed and surfaces risk clauses the pattern library didn't catch.
8. **Generates all deliverables simultaneously**: Markdown report, risk-rated table, phased checklist, **Word `.docx`** (color-coded severity), JSON, and two GC-response email postures (softer "reserve and coordinate" / firmer "assert change orders").

Every flag carries a **confidence label** (`firm` vs. `contested`), a **source** (rules engine vs. 🤖 Claude-found), and, where appropriate, an **attorney-review** flag.

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

# Force a tier, run the bid-vs-schedule cross-check, and add the Claude pass
node src/cli.js path/to/subcontract.pdf \
  --tier 2 \
  --basis straight-time \
  --priced-mobs 1 --add-mob-rate 350 --standby-rate 150 \
  --llm \
  --print
```

Key flags: `--tier 1|2|auto`, `--llm` / `--no-llm`, `--ocr auto|off`, `--bid bid.json`, `--out <dir>`, `--print`.

Outputs `*.report.md`, `*.report.docx`, and `*.analysis.json` to `./output/` (override with `--out`). Bid assumptions can also come from a JSON file via `--bid bid.json`:

```json
{ "basis": "straight-time", "pricedMobilizations": 1, "additionalMobRate": 350, "standbyRate": 150, "pricedSaturdayWork": false }
```

## Use — Web UI (document-review workspace)

```bash
npm run web      # http://localhost:3000
```

- **Upload** by drag-and-drop, file picker, or **Google Drive** (see below).
- Pick a tier (or auto), choose the Claude pass, optionally paste bid assumptions, then **Analyze**.
- **Split-screen review:** the rendered PDF on the left, the findings/commentary on the right, with a **draggable divider** to resize either side and a zoom control.
- **Click a finding** → it jumps to the page and **highlights the exact clause** in the document. (Scanned/OCR'd pages have no text layer, so it jumps to the page and flashes it.)
- Filter findings (High / Med / Low / Attorney / AI-found), expand the full written report + phased checklist, and download `.docx` / Markdown / JSON.

The PDF viewer uses the bundled pdf.js **legacy** build served locally, so it works **offline** and on older corporate browsers.

**Architecture (so it can run on Netlify):** PDF rendering, text extraction, and OCR all happen **in the browser** (pdf.js + tesseract.js, served locally from `web/public/vendor/`, staged by `npm run build:web`). The server only runs the pure-JS rules engine + optional Claude pass and generates deliverables — no native binaries, no stored state. The local Express server (`web/server.js`) and the Netlify functions (`netlify/functions/`) expose the same `/api/analyze` and `/api/deliverable` endpoints, so the same client works in both places.

## Deploy to Netlify

The repo is Netlify-ready (`netlify.toml`):

- **Build command:** `npm run build:web` (stages the browser vendor assets into `web/public/vendor/`).
- **Publish dir:** `web/public`. **Functions dir:** `netlify/functions` (bundled with esbuild).
- The two functions (`/api/analyze`, `/api/deliverable`) are pure JS and bundle to ~1 MB.

Connect the GitHub repo in Netlify (or `netlify deploy`), and set site environment variables as needed:

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the Claude-assisted pass in the analyze function. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY` | Enables the in-browser Google Drive picker. |
| `GOOGLE_CLIENT_ID` + `ALLOWED_EMAIL_DOMAINS` + `SESSION_SECRET` | Enables **Google sign-in** ("Sign in with Google," restricted to the listed email domains). When all three are set, the app shows a sign-in gate and the `/api/analyze` and `/api/deliverable` functions require a valid session. Unset → the app is open (e.g. local dev). |

**Google sign-in details:** the browser gets a Google ID token, a function verifies it against Google and checks the email domain is in `ALLOWED_EMAIL_DOMAINS` (comma-separated, e.g. `bedrock.works,dmidesign.com`), then issues a signed session cookie (`SESSION_SECRET` signs it). `GOOGLE_CLIENT_ID` is a Google Cloud **OAuth Web client** whose authorized JavaScript origin is your site URL — the same client can power the Drive picker.

OCR runs in the visitor's browser (tesseract.js), so it works on the hosted site without any server-side native dependencies.

### Google Drive (optional)

The Drive button is gated on a Google Cloud OAuth client. Set two env vars and restart:

```bash
export GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
export GOOGLE_API_KEY=AIza...
npm run web
```

Create these in the Google Cloud Console (enable the **Picker API** and **Drive API**, add an OAuth client ID for a Web app with your origin, e.g. `http://localhost:3000`). The browser uses Google's Picker with a `drive.file` scope and downloads the chosen PDF client-side — no Google credentials live on the server. Without the vars, the button shows a "configure to enable" tooltip. (Drive requires internet, so it's not an offline path — use drag-and-drop offline.)

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

The suite covers the flagging logic, tier posture, incorporated register, bid cross-check, and deliverable generation (fixtures drawn from the worked examples — Cedar Park MS Seismic PWA Tier 2, Skanska AGC Tier 1), plus a real **scanned image-only PDF** that exercises the OCR path end-to-end, and the LLM pass's normalization/dedup and no-key fallback (the live API call is gated behind a key, so those assertions run offline).

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
| OCR fallback for scanned 200+ page sets (§6) | `src/extract/ocr.js`, `src/extract/pdf.js` |
| Claude-assisted extraction pass | `src/engine/llm.js` |

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

## OCR for scanned PDFs (offline, Windows-friendly)

OCR is wired and runs **fully offline** — important for locked-down Windows desktops.

- The extractor checks **each page** for embedded text. Pages with little or no text layer are treated as scanned and OCR'd individually (a mostly-digital 200-page set with a few scanned exhibits stays fast — only the scanned pages are processed).
- Pages are rasterized with **`pdfjs-dist` + `@napi-rs/canvas`** (prebuilt binaries — no `node-gyp`, no poppler/graphicsmagick) and read with **`tesseract.js`** (WASM). All three install with prebuilt/portable artifacts on Windows, macOS, and Linux.
- English language data (`eng.traineddata.gz`) is **bundled** at `src/data/tessdata/`, so OCR needs **no network access**. Point at a different tessdata directory with `BEDROCK_TESSDATA_PATH=C:\path\to\tessdata`.
- Disable OCR with `--ocr off` (CLI). The report records which pages were OCR-recovered.

If the OCR dependencies are somehow unavailable, the analyzer degrades gracefully: it warns, then runs on whatever embedded text exists.

## Claude-assisted extraction pass (optional)

The rules engine is deterministic and fast but pattern-bound. With an API key configured, a second pass uses **Claude (`claude-opus-4-8`)** to:

- **Extract contract facts** more robustly than regex (parties, value, scope, prevailing wage) — filling only fields the regex left blank.
- **Find risk clauses the pattern library missed** — paraphrased language, unusual structures, scope buried in prose — returned as structured flags, de-duplicated against the rules-engine findings and tagged **🤖 AI-found** in every deliverable.

Details:

- **Gating:** runs only when `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) is set. Without a key, the tool is the pure rules engine — no behavior change, no errors.
- **Structured & safe:** uses structured outputs (`messages.parse` + a Zod schema) so the model returns a validated shape. If the pass fails for any reason, the rules-engine result is left intact and the failure is recorded in `analysis.llm`.
- **Efficient:** the stable Bedrock doctrine/system prompt is **prompt-cached**, so repeated analyses and multi-chunk documents reuse the prefix cheaply. Large documents are chunked; coverage (and any truncation of the LLM pass) is reported — the rules engine always covers the full text.
- **Controls:** CLI `--llm` (require) / `--no-llm` (disable); default is auto. Web UI has an "Claude-assisted pass" dropdown.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node src/cli.js subcontract.pdf --tier 2 --llm
```

## Notes

- Large PDFs (200+ pages) are expected; extraction keeps per-page offsets so the report can cite page numbers.
- Live jobs reference **Procore** and **Smartsheets** for GC-side schedule/communication; the checklist points re-analysis/reservation triggers at those portals. A future integration could watch for posted schedule revisions and prompt a re-analysis.
- `.docx` generation uses the `docx` npm library (the proven path); Markdown and JSON are offered as alternates.
