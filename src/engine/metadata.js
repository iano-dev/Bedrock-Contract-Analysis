// Pull the key facts a reviewer needs at the top of every analysis:
// contract type, parties, dates, contract value, and the scope section.
// All best-effort regex extraction over the contract text.

const CONTRACT_TYPES = [
  { id: 'agc-sub', label: 'AGC-standard subcontract', re: /\bAGC\b|\bassociated general contractors\b|standard form of agreement between contractor and subcontractor/i },
  { id: 'pwa', label: 'Public Works Agreement (PWA)', re: /\bpublic works (agreement|contract)\b|\bPWA\b|prevailing wage/i },
  { id: 'subcontract', label: 'Subcontract agreement', re: /\bsubcontract(?:\s+agreement)?\b/i },
  { id: 'psa', label: 'Purchase/Services agreement', re: /\bpurchase order\b|\bservices agreement\b/i },
];

function firstMatch(text, re, group = 0) {
  const m = text.match(re);
  return m ? (m[group] || m[0]).trim() : null;
}

export function detectContractType(text) {
  const hits = CONTRACT_TYPES.filter((t) => t.re.test(text)).map((t) => t.label);
  // Prefer the most specific (PWA / AGC) when several match.
  if (/\bpublic works\b|prevailing wage/i.test(text)) return 'Public Works Agreement (PWA) — prevailing wage';
  if (/\bAGC\b|associated general contractors/i.test(text)) return 'AGC-standard subcontract';
  return hits[0] || 'Unclassified agreement';
}

export function extractMetadata(text) {
  const moneyRe = /\$\s?[\d]{1,3}(?:,\d{3})+(?:\.\d{2})?/g;
  const money = [...text.matchAll(moneyRe)].map((m) => m[0].replace(/\s/g, ''));
  // Contract value: the largest money figure is a reasonable heuristic for the
  // subcontract sum on a small saw-cutting deal; report candidates too.
  const numeric = money.map((m) => Number(m.replace(/[$,]/g, ''))).filter((n) => !Number.isNaN(n));
  const contractValue = numeric.length ? `$${Math.max(...numeric).toLocaleString('en-US')}` : null;

  const dateRe = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/g;
  const dates = [...new Set([...text.matchAll(dateRe)].map((m) => m[0]))].slice(0, 12);

  // Parties — look near common labels.
  const contractor =
    firstMatch(text, /\b(?:contractor|general contractor)\s*[:]\s*([A-Z][A-Za-z0-9&.,'\- ]{2,60})/i, 1) ||
    firstMatch(text, /\bbetween\s+([A-Z][A-Za-z0-9&.,'\- ]{2,60})\s+\(?(?:"?Contractor"?|GC)\)?/i, 1);
  const subcontractor =
    firstMatch(text, /\bsubcontractor\s*[:]\s*([A-Z][A-Za-z0-9&.,'\- ]{2,60})/i, 1) ||
    firstMatch(text, /\b(Bedrock[A-Za-z0-9&.,'\- ]{0,40})/i, 1);

  // Scope section — capture the heading and a snippet.
  const scopeIdx = text.search(/\b(scope of work|description of work|work to be performed|subcontractor'?s? work)\b/i);
  let scope = null;
  if (scopeIdx >= 0) {
    scope = text.slice(scopeIdx, scopeIdx + 600).replace(/\s+/g, ' ').trim();
  }

  const project =
    firstMatch(text, /\bproject\s*(?:name)?\s*[:]\s*([A-Z0-9][A-Za-z0-9&.,'\-# ]{2,70})/i, 1) ||
    firstMatch(text, /\bre\s*[:]\s*([A-Z0-9][A-Za-z0-9&.,'\-# ]{2,70})/i, 1);

  return {
    contractType: detectContractType(text),
    project: project || null,
    contractor: contractor ? contractor.trim() : null,
    subcontractor: subcontractor ? subcontractor.trim() : null,
    contractValue,
    moneyFigures: [...new Set(money)].slice(0, 15),
    dates,
    scopeSnippet: scope,
    prevailingWage: /prevailing wage/i.test(text),
  };
}
