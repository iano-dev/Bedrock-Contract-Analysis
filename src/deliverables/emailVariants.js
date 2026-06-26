// GC-response email variants (Section 5): always TWO postures, never collapsed
// to one. The user picks based on the relationship.
//   A) softer "reserve and coordinate"
//   B) firmer "assert change orders"

function topIssues(analysis, n = 5) {
  return analysis.flags
    .filter((f) => f.posture === 'negotiate')
    .slice()
    .sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.severity] - { HIGH: 0, MEDIUM: 1, LOW: 2 }[b.severity]))
    .slice(0, n);
}

export function buildEmailVariants(analysis) {
  const issues = topIssues(analysis);
  const gc = analysis.metadata.contractor || 'the General Contractor';
  const project = analysis.metadata.project || 'the referenced project';
  const bullet = (s) => `  • ${s}`;

  const issueLinesSoft = issues
    .map((f) => bullet(`${f.title}${f.locations[0]?.article ? ` (${f.locations[0].article})` : ''}`))
    .join('\n');

  const coCandidates = analysis.crossCheck.candidates
    .filter((c) => c.candidateCO)
    .map((c) => bullet(`${c.title} — ${c.candidateCO}`))
    .join('\n');

  const reserveAndCoordinate = `Subject: ${project} — Bedrock subcontract: clarifications & reservation of rights

Hi ${gc} team,

Thanks for sending the subcontract. We're ready to move and want to keep this on schedule. Before we sign/mobilize, we'd like to coordinate on a few items so expectations are aligned:

${issueLinesSoft || '  • (No scope/schedule items flagged for negotiation.)'}

To be clear, we're not looking to slow anything down — we just want to reserve our rights on cost/schedule impacts that fall outside what we priced, and coordinate sequencing with you. In particular, if the schedule shifts our work into premium windows or adds mobilizations beyond what was bid, we'd handle those through the normal change-order process.${
    analysis.incorporated.count
      ? `\n\nAlso, the agreement incorporates ${analysis.incorporated.count} document(s)/spec section(s) by reference that we don't yet have. Could you send those so we can review before signing?`
      : ''
  }

Happy to jump on a quick call. Thanks again.

Best,
Bedrock Concrete Cutting

[Posture A — "reserve and coordinate." Softer; preserves the relationship while putting the reservation on record. Use with Tier-1 / strong relationships.]`;

  const assertChangeOrders = `Subject: ${project} — Bedrock subcontract: scope/schedule exceptions & change-order basis

Hi ${gc} team,

We've completed our review of the subcontract. We're glad to perform the work as bid, but several terms fall outside our priced scope and we need to address them before signing/mobilizing:

${issueLinesSoft || '  • (No scope/schedule items flagged.)'}

Cost items we will track as change orders unless the contract is adjusted:
${coCandidates || '  • Any mobilizations, premium-time, or compression beyond the priced bid.'}

Our position: re-sequencing within our priced scope is part of the job and we'll coordinate it at no cost. But material cost-shifting — added mobilizations, fragmentation into multiple trips, compression, or straight-time work pushed into a newly created premium window — was not in the documents that existed when we bid, so it will be handled as change-order work at the contract rates.${
    analysis.incorporated.count
      ? `\n\nWe also cannot sign until we've received and reviewed the ${analysis.incorporated.count} document(s)/spec section(s) the agreement incorporates by reference.`
      : ''
  }

Please confirm and we'll get the executed agreement and COI turned around quickly.

Best,
Bedrock Concrete Cutting

[Posture B — "assert change orders." Firmer; states the CO basis up front. Use with Tier-2 / unfamiliar parties where Bedrock has standing.]`;

  return { reserveAndCoordinate, assertChangeOrders };
}
