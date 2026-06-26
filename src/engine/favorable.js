// "Favorable & protective terms" list (Section 5) — keeps the picture balanced.
// Detect terms that protect Bedrock so the summary table isn't all red.

const FAVORABLE = [
  { id: 'standby-billing', label: 'Standby billing right (e.g., $150/hr per crew member)', re: /\bstand[\s-]*by\b[^.]{0,60}(\$\s?\d|bill|rate|per hour|\/hr)/i },
  { id: 'additional-mob-rate', label: 'Additional-mobilization rate stated (recoverable per extra trip)', re: /\b(additional|extra)\s+mobiliz\w+[^.]{0,60}\$\s?\d/i },
  { id: 'thickness-change', label: 'Thickness/condition-change protection (CO for changed conditions)', re: /\b(thickness|changed condition\w*|differing site condition\w*)\b/i },
  { id: 'ocip-cgl', label: 'OCIP/wrap covers on-site CGL (lower insurance burden on Bedrock)', re: /\bO?CIP\b|\bwrap[\s-]*up\b|controlled insurance program/i },
  { id: 'gc-layout-utilities', label: 'GC-supplied layout / utilities / water / power', re: /\b(GC|contractor) (shall|will) (provide|furnish|supply)\b[^.]{0,80}\b(layout|water|power|electric\w*|utilit\w+|access|staging)\b/i },
  { id: 'time-extension', label: 'Time-extension right preserved for excusable delay', re: /\btime extension\b|\bexcusable delay\b/i },
  { id: 'co-markup', label: 'Change-order markup allowed (labor/equipment %)', re: /\bmark[\s-]*up\b[^.]{0,40}\d{1,2}\s?%/i },
];

export function detectFavorable(text) {
  return FAVORABLE.filter((f) => f.re.test(text)).map((f) => ({ id: f.id, label: f.label }));
}
