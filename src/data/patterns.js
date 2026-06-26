// Clause / pattern library — the long-term asset.
//
// Each pattern encodes a recurring contract risk that Bedrock Concrete Cutting
// has seen in incoming subcontracts. The engine scans extracted contract text
// for these patterns and, on a hit, emits a Flag carrying:
//   what the clause says  ->  why it matters to Bedrock  ->  severity  ->  action
//
// Severity:    HIGH | MEDIUM | LOW   (default; engine may escalate via context)
// Confidence:  'firm'      = position is well supported, can be asserted
//              'contested' = needs internal verification before asserting (3.6)
// attorneyReview: true when the issue touches prevailing-wage premium claims,
//              indemnity enforceability, or lien rights (3.7)
// scopeSchedule: true when the pattern belongs to the narrowed Tier-1 focus
//              (scope + schedule). Tier-1 reviews only negotiate these; all
//              other hits are surfaced as "accept-and-proceed" awareness items.
//
// `matchers` are case-insensitive regexes. `requireAll: true` means every
// matcher must hit somewhere in the document for the pattern to fire (used to
// reduce false positives on compound language).

export const CATEGORIES = {
  A: 'Schedule & premium time',
  B: 'Financial / cash flow',
  C: 'Legal / risk allocation',
  D: 'Operational / means-and-methods',
  E: 'Administrative / preconditions to starting work',
  F: 'Incorporated documents register',
};

export const PATTERNS = [
  // ---------------------------------------------------------------------------
  // A. SCHEDULE & PREMIUM TIME  (highest-priority category)
  // ---------------------------------------------------------------------------
  {
    id: 'A-post-signing-schedule-change',
    category: 'A',
    title: 'Obligation to accept schedule changes after signing (possible no added comp)',
    matchers: [
      /\b(schedule|sequenc\w+)\b[^.]{0,160}\b(may|will|shall|subject to)\b[^.]{0,80}\b(change|chang\w+|revis\w+|updat\w+|adjust\w+)\b/i,
    ],
    severity: 'HIGH',
    confidence: 'firm',
    scopeSchedule: true,
    why:
      'Bedrock is generally bound to the schedule as it existed at contract formation (3.5). A clause letting the GC change the schedule after signing — especially into after-hours or beyond 40 hrs/week — creates cost exposure Bedrock did not price. Re-sequencing within priced scope is coordination (no cost claim); material cost-shifting (compression, added mobilizations, work pushed into a newly created premium window) is a change-order event (3.2).',
    action:
      'Confirm the clause is notification/coordination, not unilateral scope modification. If it grants unilateral change power, reserve in writing BEFORE performing any directed change, and price any premium/compression window as a candidate CO. Do not perform-then-claim (3.3).',
  },
  {
    id: 'A-premium-time-absorption',
    category: 'A',
    title: 'Premium-time absorption clause (premium/OT cost pushed onto Bedrock)',
    matchers: [
      /\b(includ\w+|has included|inclusive of)\b[^.]{0,120}\b(premium time|overtime|premium)\b/i,
    ],
    severity: 'HIGH',
    confidence: 'contested',
    scopeSchedule: true,
    note:
      'Contested where the baseline schedule already carries an extended-week label (e.g., "58-hour work week"). Confirm whether Bedrock\'s bid was priced at straight time before asserting a premium claim (3.6).',
    why:
      'Language saying Bedrock "has included all costs… and premium time required to perform the work outlined in this agreement and the project schedule" is the mechanism that quietly shifts Saturday/extended-week premium cost onto Bedrock. Read together with any "overtime as identified in the schedule" clarification, it ties premium absorption to a schedule that can move after signing.',
    action:
      'Cross-check against the priced bid (straight-time vs. premium). If premium hours in the schedule were NOT priced, flag the differential as a candidate change order and reserve before performing. Attorney review recommended on prevailing-wage premium.',
    attorneyReview: true,
  },
  {
    id: 'A-extended-work-week',
    category: 'A',
    title: 'Extended work week referenced (58-hr / 4×10 / six-day window)',
    matchers: [
      /\b(58[\s-]*hour|fifty[\s-]*eight[\s-]*hour|4\s*[x×]\s*10|four[\s-]*ten|six[\s-]*day|6[\s-]*day work)\b/i,
    ],
    severity: 'MEDIUM',
    confidence: 'contested',
    scopeSchedule: true,
    note: 'Verify whether Bedrock\'s task bars actually land on Saturdays/after-hours, and whether the bid priced those hours.',
    why:
      'An extended-work-week label (e.g., "58-hour work week") in the baseline schedule is what makes premium-time absorption stick. If Bedrock\'s own task bars fall on Saturdays/after-hours within that window, premium cost may be deemed priced.',
    action:
      'Identify which Bedrock tasks fall in the extended window. Confirm the bid basis (straight-time vs. premium). If straight-time, the premium window is a candidate CO — reserve early.',
  },
  {
    id: 'A-mandatory-ot-no-comp',
    category: 'A',
    title: 'Mandatory overtime/weekend work at no additional compensation',
    matchers: [
      /\b(overtime|weekend|saturday|sunday|after[\s-]*hours)\b[^.]{0,160}\b(no\s+additional|without\s+additional|at no\s+(extra|additional)|no\s+extra)\b/i,
      /\b(durations?|schedule)\b[^.]{0,120}\b(not\s+met|fail\w*\s+to\s+meet|behind)\b[^.]{0,160}\b(overtime|weekend|premium)\b/i,
    ],
    severity: 'HIGH',
    confidence: 'firm',
    scopeSchedule: true,
    why:
      'A clause making OT/weekend work mandatory at no added comp if durations are not met converts a schedule slip — often caused by others — into uncompensated premium labor for Bedrock.',
    action:
      'Flag loudly. Reserve the right to compensation where the slip is not Bedrock-caused, in writing, before working the premium window. Tie any acceleration to a CO.',
  },
  {
    id: 'A-liquidated-damages',
    category: 'A',
    title: 'Liquidated damages',
    matchers: [
      /\bliquidated damages?\b/i,
      /\$\s?[\d,]+(\.\d{2})?\s*(per|\/)\s*(day|calendar day|working day)\b/i,
    ],
    severity: 'HIGH',
    confidence: 'firm',
    scopeSchedule: true,
    why:
      'Liquidated damages assess a fixed $/day against delay. Note the rate and exactly what triggers it; LDs can dwarf the value of a small saw-cutting subcontract.',
    action:
      'Record the rate and trigger. Confirm LDs apply only to Bedrock-caused critical-path delay, not GC- or owner-caused slips. Attorney review recommended on enforceability and pass-through breadth.',
    attorneyReview: true,
  },
  {
    id: 'A-weather-days',
    category: 'A',
    title: 'Weather-day language limiting schedule relief',
    matchers: [/\bweather days?\b[^.]{0,120}\b(do not|shall not|will not)\b[^.]{0,40}\bextend\b/i, /\bweather days?\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    scopeSchedule: true,
    why:
      '"Weather days do not extend the schedule" caps Bedrock\'s relief for conditions outside its control, increasing the chance of triggering LDs or forced acceleration.',
    action: 'Note the limitation. Preserve the right to a time extension/CO where weather drives compression into a premium window.',
  },
  {
    id: 'A-mobilization-terms',
    category: 'A',
    title: 'Mobilization terms (count included, additional-mob rate, standby billing)',
    matchers: [
      /\bmobiliz\w+\b/i,
      /\bstand[\s-]*by\b/i,
      /\$\s?350\b/,
      /\$\s?150\s*(\/|per)\s*(hr|hour)\b/i,
    ],
    severity: 'MEDIUM',
    confidence: 'firm',
    scopeSchedule: true,
    why:
      'How many mobilizations are included, the rate for additional ones (e.g., $350 each), and standby billing (e.g., $150/hr per crew member) are direct cost levers. Fragmented sequencing that multiplies trips — splitting continuous work into zone-by-zone visits — is a change-order trigger and one of Bedrock\'s strongest, best-documented CO positions (3.6).',
    action:
      'Extract the included mobilization count and additional-mob/standby rates. Compare to the priced bid. Each mobilization beyond what was priced is a candidate CO at the stated rate — assert with the clarifications as support.',
  },

  // ---------------------------------------------------------------------------
  // B. FINANCIAL / CASH FLOW
  // ---------------------------------------------------------------------------
  {
    id: 'B-pay-if-paid',
    category: 'B',
    title: 'Pay-if-paid (owner-default risk shifted to Bedrock)',
    matchers: [/\bpay[\s-]*if[\s-]*paid\b/i, /\bcondition precedent\b[^.]{0,80}\bpay\w*\b/i, /\bonly (if|when) (the\s+)?(contractor|GC)\s+(is|has been)\s+paid\b/i],
    severity: 'HIGH',
    confidence: 'firm',
    why:
      'Pay-if-paid makes the owner paying the GC a condition precedent to Bedrock being paid at all — it shifts owner-default/insolvency risk onto Bedrock. Distinct from pay-when-paid, which only affects timing.',
    action: 'Identify whether the clause is pay-IF-paid or pay-WHEN-paid. For pay-if-paid, attorney review recommended; consider requesting conversion to pay-when-paid with an outside date.',
    attorneyReview: true,
  },
  {
    id: 'B-pay-when-paid',
    category: 'B',
    title: 'Pay-when-paid (timing tied to GC receiving owner payment)',
    matchers: [/\bpay[\s-]*when[\s-]*paid\b/i, /\bwithin\s+\d+\s+days?\s+(after|of)\b[^.]{0,80}\b(owner|contractor|GC)\b[^.]{0,40}\bpa(y|id|yment)\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    why:
      'Payment within N days after the GC is paid by the owner delays Bedrock\'s cash flow and ties it to events outside Bedrock\'s control, though (unlike pay-if-paid) it does not eliminate the obligation to pay.',
    action: 'Record the day count and trigger. Confirm an outside date exists so payment is not indefinitely deferred on owner delay.',
  },
  {
    id: 'B-retainage',
    category: 'B',
    title: 'Retainage withheld',
    matchers: [/\bretain\w*\b/i, /\b\d{1,2}\s?%[^.]{0,40}\bretain\w*\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    why: 'Retainage (e.g., 10%) withholds part of each payment until release. Note the percentage and the release condition — close-out-gated release can hold cash long after Bedrock\'s scope is complete.',
    action: 'Record the retainage % and release trigger. Confirm Bedrock\'s retainage releases on completion of Bedrock\'s scope, not the whole project.',
  },
  {
    id: 'B-invoice-mechanics',
    category: 'B',
    title: 'Invoice submission mechanics (deadline, job number, portal/email)',
    matchers: [/\binvoic\w+\b[^.]{0,120}\b(by the\s+\d{1,2}(st|nd|rd|th)?|deadline|due)\b/i, /\bpay\s*app\w*\b/i, /\bjob\s*(number|no\.?|#)\b/i],
    severity: 'LOW',
    confidence: 'firm',
    why: 'Missing a submission deadline (e.g., by the 25th), omitting a required job number, or using the wrong billing email/portal pushes payment a full cycle. Administrative but real cash-flow impact.',
    action: 'Capture the submission deadline, required job number, and exact billing email/portal into the pre-mobilization checklist.',
  },
  {
    id: 'B-closeout-payment-trap',
    category: 'B',
    title: 'Close-out payment trap (large final payment gated on out-of-control conditions)',
    matchers: [/\b(final payment|close[\s-]*out)\b[^.]{0,160}\b(condition\w*|upon|gated|withheld|until)\b/i, /\b\d{2}\s?%[^.]{0,80}\bclose[\s-]*out\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    why: 'A large final payment (e.g., 75% held to close-out) gated on project-wide conditions outside Bedrock\'s control can hold most of the contract value hostage to other trades\' completion.',
    action: 'Quantify how much value is gated and on what conditions. Push to tie Bedrock\'s final payment to Bedrock\'s scope completion.',
  },
  {
    id: 'B-lien-waiver-chain',
    category: 'B',
    title: 'Lien-waiver chain across sub-tier suppliers',
    matchers: [/\blien (waiver|release)s?\b/i, /\b(unconditional|conditional)\s+(waiver|release)\b/i, /\baffidavit\w*\b[^.]{0,80}\b(lien|pay)\w*\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    why: 'Payment withheld until lien releases arrive from ALL sub-tier suppliers (not just Bedrock), with affidavits required before starting and updated each pay app, can withhold Bedrock\'s payment over a supplier Bedrock does not control.',
    action: 'Map the full lien-waiver chain and affidavit cadence. Attorney review recommended on lien-rights waivers.',
    attorneyReview: true,
  },

  // ---------------------------------------------------------------------------
  // C. LEGAL / RISK ALLOCATION
  // ---------------------------------------------------------------------------
  {
    id: 'C-broad-indemnity',
    category: 'C',
    title: 'Broad indemnification (may reach beyond Bedrock\'s negligence)',
    matchers: [/\bindemnif\w+\b/i, /\b(defend|hold harmless)\b/i, /\battorney'?s?\s+fees\b/i],
    severity: 'HIGH',
    confidence: 'firm',
    why: 'A broad indemnity (e.g., an Article 17 covering essentially any claim arising from the work, including attorney\'s fees) can require Bedrock to cover loss beyond its own negligence — including others\' fault. Oregon limits indemnity for the indemnitee\'s sole negligence in construction contracts.',
    action: 'Flag the breadth. Confirm whether it reaches beyond Bedrock\'s proportionate fault. Attorney review recommended on enforceability and any anti-indemnity-statute conflict.',
    attorneyReview: true,
  },
  {
    id: 'C-incorporation-by-reference',
    category: 'C',
    title: 'Incorporation by reference (MSA / prime contract / specs not in the PDF)',
    matchers: [/\bincorporat\w+\b[^.]{0,40}\b(by reference|herein|into this)\b/i, /\b(master subcontract agreement|MSA)\b/i, /\bprime contract\b/i, /\b(exhibit|attachment)\s+[A-Z0-9]\b/i],
    severity: 'HIGH',
    confidence: 'firm',
    scopeSchedule: true,
    why: 'Documents incorporated by reference bind Bedrock even though the text is usually not in the PDF (3.4). Incorporation binds to the document as it existed at formation. The reference tells you the topic and that you are on the hook; it never tells you the actual obligations.',
    action: 'SIGN NOTHING until every incorporated document is retrieved and read (see the Incorporated Documents Register). Each is a hidden-scope risk until reviewed.',
  },
  {
    id: 'C-insurance-additional-insured',
    category: 'C',
    title: 'Insurance / additional insured requirements',
    matchers: [/\badditional insured\b/i, /\b(commercial general liability|CGL)\b/i, /\bwaiver of subrogation\b/i, /\bprimary and non[\s-]*contributory\b/i, /\bumbrella|excess\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    why: 'Required limits (CGL, excess/umbrella, auto, WC, tools & equipment), the additional-insured list, "primary and non-contributory" language, and waiver of subrogation must all be satisfiable by Bedrock\'s policies before mobilizing — and waiver of subrogation surrenders Bedrock\'s insurer\'s recovery rights.',
    action: 'Send required limits and AI/endorsement language to Bedrock\'s broker to confirm the COI can be issued exactly as required. Add COI issuance to the pre-mobilization gate.',
  },
  {
    id: 'C-ocip-wrap',
    category: 'C',
    title: 'OCIP / CCIP wrap-up insurance program',
    matchers: [/\bO?CIP\b/, /\bwrap[\s-]*up\b/i, /\bcontrolled insurance program\b/i, /\bwrap (portal|enrollment)\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    why: 'Under an owner/contractor-controlled insurance program, on-site CGL is usually covered by the wrap (a favorable point), but enrollment is a separate, pre-mobilization step (e.g., via a wrap portal). Missing enrollment can stop mobilization.',
    action: 'Treat wrap enrollment as a precondition to mobilize. Identify the wrap portal and deadline; confirm which coverages remain Bedrock\'s (typically off-site, auto, WC, tools).',
  },

  // ---------------------------------------------------------------------------
  // D. OPERATIONAL / MEANS-AND-METHODS
  // ---------------------------------------------------------------------------
  {
    id: 'D-mandated-method-equipment',
    category: 'D',
    title: 'Clause mandating specific equipment or method (means-and-methods intrusion)',
    matchers: [/\b(shall|must|required to)\s+use\b[^.]{0,80}\b(saw|wall saw|hand saw|wire saw|blade|equipment|method)\b/i, /\bno\s+(hand|wall)\s*saw\w*\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    scopeSchedule: true,
    why: 'Under AGC-standard structures the subcontractor furnishes the means, methods, and equipment as an independent contractor (Article 8.2 type). How Bedrock performs — which saw, what sequence — is Bedrock\'s domain (3.1). A WRITTEN clause mandating a specific method is a means-and-methods intrusion and a potential CO basis for any cost differential.',
    action: 'Flag as a means-and-methods intrusion. If the directive is only verbal, request the written contractual basis and preserve CO positioning on the cost differential (e.g., hand-saw vs. wall-saw). Do not absorb a dictated method silently.',
  },
  {
    id: 'D-outcome-drives-method',
    category: 'D',
    title: 'Outcome constraint that indirectly drives method (no-overcut / polished slab)',
    matchers: [/\bno over[\s-]*cut\w*\b/i, /\bpolished concrete\b/i, /\bexposed (slab|concrete)\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    scopeSchedule: true,
    why: 'An outcome clause such as "no overcutting (slabs to be polished concrete)" governs result quality, not tool choice — but it pushes toward finish cuts and carries rework exposure on exposed slabs. Architects specify how clean the result must be, not which machine to run (3.1).',
    action: 'Treat as a quality/outcome obligation, not a method mandate. Price the finish-cut rework risk; confirm it does not silently convert into a dictated method.',
  },
  {
    id: 'D-dust-slurry-cleanup',
    category: 'D',
    title: 'Dust control / slurry / cleanup responsibility',
    matchers: [/\b(dust control|slurry|wet cut\w*|cleanup|clean[\s-]*up|haul[\s-]*away|disposal)\b/i],
    severity: 'LOW',
    confidence: 'firm',
    why: 'Dust control / slurry / cleanup language implies wet cutting and a disposal burden on Bedrock — labor and haul-away cost that must be in scope.',
    action: 'Confirm slurry containment and disposal were priced. Note any disposal-site or environmental requirements.',
  },
  {
    id: 'D-super-foreman-onsite',
    category: 'D',
    title: 'Superintendent/foreman required on site at all times (no substitution w/o approval)',
    matchers: [/\b(superintendent|foreman)\b[^.]{0,120}\b(at all times|on site|present)\b/i, /\bno\s+substitut\w+\b[^.]{0,80}\b(written )?approval\b/i],
    severity: 'LOW',
    confidence: 'firm',
    why: 'A requirement to keep a superintendent/foreman on site at all times with no substitution without GC written approval can force supervisory hours beyond what a short saw-cutting scope would otherwise need.',
    action: 'Confirm the supervision requirement matches the crew/scope; price any dedicated-supervisor requirement.',
  },
  {
    id: 'D-hazmat-protocol',
    category: 'D',
    title: 'Hazardous materials protocol (asbestos / PCB stop-work)',
    matchers: [/\b(asbestos|PCB|hazardous material\w*|lead paint)\b/i, /\bstop[\s-]*work\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    why: 'On encountering asbestos/PCB, Bedrock typically must stop work and notify in writing. The key is whether a time/cost adjustment is preserved for the stoppage and any abatement delay.',
    action: 'Confirm the protocol preserves Bedrock\'s right to a time AND cost adjustment for hazmat stop-work. Reserve before resuming.',
  },

  // ---------------------------------------------------------------------------
  // E. ADMINISTRATIVE / PRECONDITIONS TO STARTING WORK
  // ---------------------------------------------------------------------------
  {
    id: 'E-change-order-process',
    category: 'E',
    title: 'Change-order process (written PM approval only; tight notice; no verbal supers)',
    matchers: [/\bchange order\w*\b/i, /\b(written|prior written) (approval|authorization)\b[^.]{0,120}\bchange\b/i, /\bno verbal\b/i, /\bwithin\s+(24|48)\s*(hours|hrs)\b/i],
    severity: 'MEDIUM',
    confidence: 'firm',
    scopeSchedule: true,
    why: 'A CO process requiring written PM approval only, with tight notice windows (e.g., 24–48 hrs) and no verbal approvals from supers, is the gate Bedrock must operate through to recover any cost impact. Missing the notice window forfeits the claim — which is why real-time written reservation matters (3.3).',
    action: 'Capture the notice window, who can approve, the markup cap (e.g., 10% labor / 10% equipment), and that CO work bills separately. Brief the field crew that verbal super direction is NOT an approval — get it in writing immediately.',
  },
  {
    id: 'E-submittals-window',
    category: 'E',
    title: 'Submittals due within a short window of NTP',
    matchers: [/\bsubmittal\w*\b[^.]{0,120}\bwithin\s+\d+\s*(days|business days)\b/i, /\bsubmittal\w*\b/i],
    severity: 'LOW',
    confidence: 'firm',
    why: 'Submittals due within a short window of NTP (e.g., 5–7 days) are an easy precondition to miss and can delay mobilization.',
    action: 'Add the submittals deadline to the pre-mobilization checklist with the exact day count from NTP.',
  },
  {
    id: 'E-executed-subcontract-precondition',
    category: 'E',
    title: 'Fully executed subcontract / COI required before work',
    matchers: [/\bfully executed\b/i, /\bprior to (commencing|starting|mobiliz\w+)\b/i, /\bcertificate of insurance\b/i, /\bCOI\b/],
    severity: 'LOW',
    confidence: 'firm',
    why: 'A fully executed subcontract in hand and a project-specific COI naming all required additional insureds are common preconditions to any payment or mobilization.',
    action: 'Gate mobilization on: executed subcontract returned, project-specific COI issued, and all required additional insureds named.',
  },
  {
    id: 'E-background-checks-onboarding',
    category: 'E',
    title: 'Site onboarding preconditions (background checks, fingerprinting, ACH, licenses)',
    matchers: [/\b(background check\w*|fingerprint\w*|drug (test|screen)\w*|badg\w+)\b/i, /\bACH (enrollment|payment)\b/i, /\bbusiness licens\w+\b/i],
    severity: 'LOW',
    confidence: 'firm',
    why: 'Job-site licenses, background checks (often with hard deadlines), fingerprinting, and ACH enrollment are preconditions that, if missed, keep the crew off site or delay payment setup.',
    action: 'List each onboarding precondition with its deadline in the pre-mobilization gate; start long-lead items (background checks) immediately.',
  },
];

// CSI MasterFormat Division 02 (and related) section-number labels, used to
// annotate the Incorporated Documents Register with the topic each number
// signals. The number tells you the topic and that you are bound; never the
// actual obligations (3.4).
export const MASTERFORMAT_HINTS = {
  '02 41 00': 'Demolition',
  '02 41 13': 'Selective Site Demolition',
  '02 41 16': 'Structure Demolition',
  '02 41 19': 'Selective Demolition',
  '03 30 00': 'Cast-in-Place Concrete',
  '03 35 00': 'Concrete Finishing (incl. polished concrete)',
  '03 81 00': 'Concrete Cutting',
  '03 82 00': 'Concrete Boring',
  '01 32 00': 'Construction Progress Documentation (schedules)',
  '01 33 00': 'Submittal Procedures',
  '00 72 00': 'General Conditions',
};
