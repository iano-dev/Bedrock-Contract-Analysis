// Bid-vs-schedule cross-check (Section 6 feature).
//
// Given the priced bid assumptions, test whether schedule clauses push work
// outside what was priced and surface the differential as a candidate change
// order. The test throughout: was this cost in the documents that existed when
// Bedrock bid/signed? (3.2) If not, Bedrock can't be deemed to have priced it.
//
// bidAssumptions shape (all optional):
//   {
//     basis: 'straight-time' | 'premium' | 'unknown',
//     pricedMobilizations: number,
//     additionalMobRate: number,      // $ per extra mobilization, e.g. 350
//     standbyRate: number,            // $/hr per crew member, e.g. 150
//     pricedStraightHours: number,
//     pricedSaturdayWork: boolean
//   }

export function bidCrossCheck(text, flags, bidAssumptions = {}) {
  const candidates = [];

  const has = (id) => flags.some((f) => f.id === id);
  const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null);

  // --- Premium / Saturday window vs. priced basis ---------------------------
  const premiumScheduleSignals =
    has('A-premium-time-absorption') || has('A-extended-work-week') || /\bsaturday|premium time|overtime\b/i.test(text);
  if (premiumScheduleSignals) {
    if (bidAssumptions.basis === 'straight-time' || bidAssumptions.pricedSaturdayWork === false) {
      candidates.push({
        title: 'Premium / extended-week hours not in priced bid',
        confidence: 'firm',
        finding:
          'The schedule references premium/extended-week (e.g., Saturday or 58-hour-week) work, and the bid basis is straight-time with no Saturday work priced. Premium hours that were not priced are a candidate change order.',
        candidateCO: 'Premium-time differential for the extended-week/Saturday window (quantify hours × premium rate).',
        action: 'Reserve in writing before performing any premium-window work; price the differential as a CO. Attorney review recommended on prevailing-wage premium.',
        attorneyReview: true,
      });
    } else if (bidAssumptions.basis === 'premium') {
      candidates.push({
        title: 'Premium hours appear priced — no CO on premium basis',
        confidence: 'firm',
        finding: 'Bid basis is premium; the schedule\'s premium/extended-week window appears already priced. Do not assert a premium CO on this basis.',
        candidateCO: null,
        action: 'No premium CO from basis. Still test for ADDED mobilizations and compression separately.',
      });
    } else {
      candidates.push({
        title: 'Premium window present, bid basis unconfirmed — CONTESTED',
        confidence: 'contested',
        finding:
          'The schedule references premium/extended-week work but the bid basis (straight-time vs. premium) was not provided. The Saturday/premium claim is contested until the bid basis is confirmed (3.6).',
        candidateCO: 'Possible premium-time differential — verify bid basis first.',
        action: 'CONFIRM whether the bid was priced at straight time BEFORE asserting any premium claim. Do not present as settled.',
      });
    }
  }

  // --- Mobilizations: scheduled trips vs. priced count ----------------------
  const pricedMobs = num(bidAssumptions.pricedMobilizations);
  if (pricedMobs !== null && (has('A-mobilization-terms') || /\bmobiliz\w+|zone[\s-]*by[\s-]*zone|phas\w+\b/i.test(text))) {
    const rate = num(bidAssumptions.additionalMobRate);
    candidates.push({
      title: 'Fragmented sequencing may exceed priced mobilizations',
      confidence: 'firm',
      finding:
        `Bid priced ${pricedMobs} mobilization(s). The schedule/clarifications show fragmentation (zone-by-zone or phased trips) that can multiply mobilizations. Each mobilization beyond ${pricedMobs} is a candidate CO` +
        (rate ? ` at the stated $${rate}/mobilization.` : '.'),
      candidateCO:
        rate
          ? `(Scheduled mobilizations − ${pricedMobs}) × $${rate} each` + (num(bidAssumptions.standbyRate) ? `, plus standby at $${bidAssumptions.standbyRate}/hr per crew member where applicable.` : '.')
          : `Each mobilization beyond ${pricedMobs} — price at the contract additional-mobilization rate.`,
      action:
        'Count the mobilizations the current schedule actually requires for Bedrock\'s scope. Assert the delta as a CO using the contract\'s additional-mobilization/standby rates. This is typically Bedrock\'s strongest, best-documented CO position.',
    });
  }

  // --- Compression / acceleration ------------------------------------------
  if (has('A-mandatory-ot-no-comp') || has('A-post-signing-schedule-change')) {
    candidates.push({
      title: 'Schedule compression / forced acceleration not priced',
      confidence: 'firm',
      finding:
        'A clause can compress Bedrock\'s duration or force overtime to recover a slip. Where the slip is not Bedrock-caused and acceleration was not priced, the added cost is a change-order event, not coordination (3.2).',
      candidateCO: 'Acceleration/compression premium where the slip is not Bedrock-caused.',
      action: 'Document the cause of any slip in real time. Reserve before accelerating. Tie acceleration cost to a CO.',
    });
  }

  return {
    provided: Object.keys(bidAssumptions).length > 0,
    bidAssumptions,
    candidates,
  };
}
