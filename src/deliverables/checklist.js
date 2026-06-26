// Phased action-item checklist (Section 5, format 3): IMMEDIATE -> pre-mobilization
// -> ongoing, each item with timing, priority, and the specific contact/portal/link.

function priorityFromSeverity(sev) {
  return sev === 'HIGH' ? 'P1' : sev === 'MEDIUM' ? 'P2' : 'P3';
}

export function buildChecklist(analysis) {
  const immediate = [];
  const preMob = [];
  const ongoing = [];

  // --- IMMEDIATE (before signing) ------------------------------------------
  if (analysis.incorporated.count > 0) {
    immediate.push({
      priority: 'P1',
      timing: 'Before signing',
      item: `Retrieve and read all ${analysis.incorporated.count} incorporated document(s)/spec section(s) listed in the register. SIGN NOTHING until seen.`,
      contact: 'GC project manager — request copies of every incorporated document and Division 02/03 spec section.',
    });
  }

  for (const f of analysis.flags) {
    if (f.confidence === 'contested') {
      immediate.push({
        priority: 'P1',
        timing: 'Before signing / before performing',
        item: `Verify CONTESTED position before asserting: ${f.title}.${f.note ? ' ' + f.note : ''}`,
        contact: 'Internal — estimator/owner to confirm bid basis; do not present as settled.',
      });
    }
  }

  if (analysis.flags.some((f) => f.id === 'D-mandated-method-equipment')) {
    immediate.push({
      priority: 'P2',
      timing: 'Before performing directed method',
      item: 'A specific method/equipment is being directed. Request the WRITTEN contractual basis; if none, reserve CO positioning on the cost differential (means and methods are Bedrock\'s — 3.1).',
      contact: 'GC superintendent/PM — request written direction.',
    });
  }

  // Scope/schedule HIGH items become immediate reservations.
  for (const f of analysis.flags) {
    if (f.severity === 'HIGH' && f.scopeSchedule && f.posture === 'negotiate') {
      immediate.push({
        priority: 'P1',
        timing: 'Before performing',
        item: `Reserve in writing: ${f.title}. Reserve the cost/schedule impact BEFORE performing — silence + performance is what lets a coordination clause be read against Bedrock (3.3).`,
        contact: 'GC PM — written reservation email (use the email variants).',
      });
    }
  }

  // --- PRE-MOBILIZATION ----------------------------------------------------
  preMob.push({
    priority: 'P1',
    timing: 'Before anyone steps on site',
    item: 'Fully executed subcontract returned and in hand.',
    contact: 'GC PM / contracts.',
  });
  if (analysis.flags.some((f) => f.category === 'C' && /insur/i.test(f.id))) {
    preMob.push({
      priority: 'P1',
      timing: 'Before mobilizing',
      item: 'Project-specific COI issued naming ALL required additional insureds, with "primary and non-contributory" and waiver of subrogation as required.',
      contact: 'Bedrock insurance broker — send the contract\'s insurance exhibit.',
    });
  }
  if (analysis.flags.some((f) => f.id === 'C-ocip-wrap')) {
    preMob.push({
      priority: 'P1',
      timing: 'Before mobilizing',
      item: 'Enroll in the OCIP/CCIP wrap-up program via the wrap portal (separate pre-mobilization step).',
      contact: 'Wrap administrator / GC — obtain wrap portal link and deadline.',
    });
  }
  if (analysis.flags.some((f) => f.id === 'E-submittals-window')) {
    preMob.push({
      priority: 'P2',
      timing: 'Within the NTP submittal window (often 5–7 days)',
      item: 'Submit required submittals within the contractual window of NTP.',
      contact: 'GC PM / Procore submittals.',
    });
  }
  if (analysis.flags.some((f) => f.id === 'E-background-checks-onboarding')) {
    preMob.push({
      priority: 'P2',
      timing: 'Start immediately (long lead)',
      item: 'Complete site onboarding: background checks/fingerprinting, badging, ACH enrollment, job-site business license.',
      contact: 'GC site-access coordinator.',
    });
  }
  if (analysis.flags.some((f) => f.id === 'B-invoice-mechanics')) {
    preMob.push({
      priority: 'P3',
      timing: 'Before first pay app',
      item: 'Set up billing: capture the invoice submission deadline, required job number, and exact billing email/portal.',
      contact: 'GC accounts payable.',
    });
  }

  // --- ONGOING -------------------------------------------------------------
  ongoing.push({
    priority: 'P1',
    timing: 'Throughout',
    item: 'CO discipline: get every cost/schedule impact approved in WRITING by the PM within the notice window. Verbal super direction is NOT an approval — confirm in writing immediately.',
    contact: 'GC PM.',
  });
  ongoing.push({
    priority: 'P1',
    timing: 'Real time, before performing directed changes',
    item: 'Reserve rights in real time. Assert impacts BEFORE the work is done, not after (3.3).',
    contact: 'GC PM — reservation email.',
  });
  if (analysis.flags.some((f) => f.id === 'A-mobilization-terms') || analysis.crossCheck.candidates.length) {
    ongoing.push({
      priority: 'P1',
      timing: 'Each trip',
      item: 'Track mobilizations vs. the priced count. Every mobilization beyond what was priced is a candidate CO at the contract additional-mob/standby rate.',
      contact: 'Field foreman -> PM, logged in Procore.',
    });
  }
  ongoing.push({
    priority: 'P2',
    timing: 'Each schedule revision',
    item: 'Watch for posted schedule revisions (Procore / Smartsheets). A generic "check the portal" clause is notification, not consent to unlimited cost-shifting (3.5). Re-analyze and reserve on any revision that pushes work to premium windows or adds mobilizations.',
    contact: 'GC scheduler — Procore/Smartsheets.',
  });
  if (analysis.flags.some((f) => f.id === 'B-lien-waiver-chain')) {
    ongoing.push({
      priority: 'P2',
      timing: 'Each pay app',
      item: 'Maintain the lien-waiver chain: collect/update lien releases and affidavits from all sub-tier suppliers as required.',
      contact: 'Bedrock accounting + suppliers.',
    });
  }

  return { immediate, preMob, ongoing, priorityFromSeverity };
}
