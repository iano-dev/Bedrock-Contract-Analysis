// Tier triage — the first and most important decision (Section 2).
//
// Tier 1: large/blue-chip GCs. Accept most contracts even when terms look
//   unfavorable; narrow review to SCOPE + SCHEDULE only; surface everything
//   else as "accept-and-proceed" awareness.
// Tier 2: everyone else. Full review, flag everything. DEFAULT for unknowns —
//   failing safe means flagging more, not less.

// Imported as a module so it bundles cleanly in serverless functions (no fs /
// __dirname). Editing the JSON requires a restart of the local server.
import counterparties from '../data/counterparties.json' with { type: 'json' };

export function loadCounterparties() {
  return counterparties;
}

function matches(name, entry) {
  const hay = name.toLowerCase();
  const needles = [entry.name, ...(entry.aliases || [])].map((s) => s.toLowerCase());
  return needles.some((n) => n && hay.includes(n));
}

// Suggest a tier from a detected counterparty name. Never auto-decides a Tier-1
// downgrade silently — returns a suggestion + reason; the user confirms at upload.
export function suggestTier(counterpartyName, counterparties = loadCounterparties()) {
  if (!counterpartyName) {
    return { suggested: 2, reason: 'No counterparty detected — defaulting to Tier 2 (full review).', matched: null };
  }
  const t1 = (counterparties.tier1 || []).find((e) => matches(counterpartyName, e));
  if (t1) {
    return {
      suggested: 1,
      reason: `Counterparty matches Tier-1 list ("${t1.name}") — accept-most posture, review narrows to scope + schedule.`,
      matched: t1.name,
    };
  }
  const known2 = (counterparties.tier2_known || []).find((e) => matches(counterpartyName, e));
  if (known2) {
    return {
      suggested: 2,
      reason: `Counterparty matches known Tier-2 list ("${known2.name}") — full review.`,
      matched: known2.name,
    };
  }
  return {
    suggested: 2,
    reason: `Counterparty "${counterpartyName}" is not on the Tier-1 list — defaulting to Tier 2 (full review).`,
    matched: null,
  };
}

// Tier-1 keeps only scope/schedule flags as negotiation points; the rest become
// awareness items. Tier-2 negotiates everything.
export function applyTierPosture(flags, tier) {
  if (tier === 1) {
    return flags.map((f) => ({
      ...f,
      posture: f.scopeSchedule ? 'negotiate' : 'accept-and-proceed',
    }));
  }
  return flags.map((f) => ({ ...f, posture: 'negotiate' }));
}
