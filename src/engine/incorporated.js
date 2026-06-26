// Incorporated Documents Register (Sections 3.4 / 4.F) — a standing output.
//
// Auto-detects (a) named documents incorporated by reference and (b) CSI
// MasterFormat section numbers, and lists each as "retrieve and read separately
// before signing." The number tells you the topic and that you are bound; it
// never tells you the actual obligations.

import { MASTERFORMAT_HINTS } from '../data/patterns.js';
import { offsetToPage } from '../extract/pdf.js';

const NAMED_DOC_PATTERNS = [
  { label: 'Master Subcontract Agreement (MSA)', re: /\b(master subcontract agreement|MSA)\b/gi },
  { label: 'Prime Contract', re: /\bprime contract\b/gi },
  { label: 'General Conditions', re: /\bgeneral conditions\b/gi },
  { label: 'Project Specifications / Spec sections', re: /\b(specifications?|spec sections?|project manual)\b/gi },
  { label: 'Drawings / Plans', re: /\b(contract )?(drawings|plans)\b/gi },
  { label: 'Project Schedule', re: /\bproject schedule\b/gi },
  { label: 'Exhibit / Attachment', re: /\b(exhibit|attachment|appendix)\s+([A-Z0-9]{1,3})\b/gi },
  { label: 'Insurance requirements / endorsements', re: /\binsurance (requirements|exhibit|endorsements?)\b/gi },
];

const SECTION_NUMBER_RE = /\b(\d{2})\s(\d{2})\s(\d{2})(?:\s(\d{2}))?\b/g;

export function buildIncorporatedRegister(text, pages = []) {
  const onlyIfIncorporated = /\bincorporat\w+|by reference|attached hereto|made a part (of|hereof)\b/i.test(text);
  const entries = [];
  const seen = new Set();

  // Named documents.
  for (const p of NAMED_DOC_PATTERNS) {
    let m;
    p.re.lastIndex = 0;
    while ((m = p.re.exec(text)) !== null) {
      const key = p.label + '|' + (m[2] || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const display = m[2] ? `${p.label.split(' /')[0]} ${m[2]}` : p.label;
      entries.push({
        type: 'document',
        name: display,
        page: pages.length ? offsetToPage(pages, m.index) : null,
        topicHint: null,
        action: 'Retrieve and read separately before signing.',
      });
    }
  }

  // CSI MasterFormat section numbers.
  let s;
  SECTION_NUMBER_RE.lastIndex = 0;
  while ((s = SECTION_NUMBER_RE.exec(text)) !== null) {
    const num = `${s[1]} ${s[2]} ${s[3]}${s[4] ? ' ' + s[4] : ''}`;
    // Filter out obvious non-section numbers (e.g., dates, phone fragments) by
    // requiring the first pair to be a plausible MasterFormat division (00–49).
    const div = Number(s[1]);
    if (div > 49) continue;
    if (seen.has('sec|' + num)) continue;
    seen.add('sec|' + num);
    const hint = MASTERFORMAT_HINTS[num] || MASTERFORMAT_HINTS[`${s[1]} ${s[2]} ${s[3]}`] || null;
    entries.push({
      type: 'masterformat',
      name: `CSI ${num}`,
      page: pages.length ? offsetToPage(pages, s.index) : null,
      topicHint: hint,
      action: 'Spec section incorporated by reference — body text not in this PDF. Retrieve and read before signing.',
    });
  }

  return {
    incorporationLanguagePresent: onlyIfIncorporated,
    count: entries.length,
    entries,
  };
}
