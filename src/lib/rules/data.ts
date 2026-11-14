import type { Rule } from "@/lib/types";

/**
 * The rule base. Every number and deadline below is copied from the official
 * source in `source_url`; nothing here is model-generated at runtime.
 *
 * `last_verified` is the date the wording was last checked against the source.
 * Rules with `verified: false` are honest gaps: Civio knows the topic applies
 * but has no checked state rule, so the task is emitted as "needs verification".
 *
 * Template tokens: {destination} and {origin} are replaced with state names.
 */

const CHECKED = "2026-11-14";

/** States that have verified rules per module. Everything else falls back. */
const VEHICLE_COVERED = ["CA", "TX"];
const SCHOOL_COVERED = ["CA"];
const STATE_TAX_COVERED = ["CA"];

export const RULES: readonly Rule[] = [
  // ───────────────────────── Taxes ─────────────────────────
  {
    rule_id: "US-TAX-8822",
    state: "US",
    conditions: [{ fact: "moving_between_states", op: "eq", value: true }],
    task_template: {
      title: "Tell the IRS your new address",
      category: "taxes",
      priority: "medium",
      description:
        "The IRS mails notices and refunds to the address it has on file. Form 8822 updates your home mailing address.",
      steps: [
        "Download Form 8822 from IRS.gov.",
        "Fill in your old and new address.",
        "Mail it to the IRS address listed in the form instructions for your old state.",
      ],
      documents: ["Form 8822", "Your Social Security number", "Old and new mailing address"],
      financial: { kind: "tax", note: "A missed IRS notice can turn into late-payment interest." },
    },
    source_name: "IRS — About Form 8822",
    source_url: "https://www.irs.gov/forms-pubs/about-form-8822",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "US-TAX-1040ES",
    state: "US",
    conditions: [{ fact: "has_self_employment_income", op: "eq", value: true }],
    task_template: {
      title: "Review your quarterly estimated tax payments",
      category: "taxes",
      priority: "high",
      description:
        "With 1099 or self-employment income, no employer withholds tax for you. The IRS says you generally have to make estimated payments if you expect to owe $1,000 or more when you file.",
      steps: [
        "Estimate this year's income and tax with the Form 1040-ES worksheet.",
        "Pay each quarter through IRS Direct Pay or your IRS online account.",
        "Check whether {destination} also expects state estimated payments.",
      ],
      documents: ["Form 1040-ES worksheet", "Year-to-date income and expense records", "Last year's tax return"],
      deadline: {
        label:
          "Quarterly: April 15, June 15, September 15 and January 15 (next business day if the date falls on a weekend or holiday)",
      },
      financial: { kind: "penalty", note: "Underpaying a quarter can add an IRS underpayment penalty." },
    },
    source_name: "IRS — Estimated taxes",
    source_url: "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "CA-TAX-540NR-IN",
    state: "CA",
    conditions: [{ fact: "moving_between_states", op: "eq", value: true }],
    task_template: {
      title: "Plan for a California part-year resident return",
      category: "taxes",
      priority: "medium",
      description:
        "If you move into California during the year, the Franchise Tax Board treats you as a part-year resident. Part-year residents who meet the income thresholds file Form 540NR.",
      steps: [
        "Write down the exact date you became a California resident.",
        "Keep pay records split by before and after the move.",
        "At tax time, file Form 540NR with Schedule CA (540NR).",
      ],
      documents: ["Form 540NR", "Schedule CA (540NR)", "W-2s and 1099s for the full year", "Proof of your move date"],
      deadline: { label: "Filed with your state return for the year of the move" },
      financial: { kind: "tax", note: "California taxes all income received while you are a resident." },
    },
    source_name: "California FTB — Part-year resident and nonresident",
    source_url: "https://www.ftb.ca.gov/file/personal/residency-status/part-year-and-nonresident.html",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "CA-TAX-DE4",
    state: "CA",
    conditions: [{ fact: "employment", op: "eq", value: "employee" }],
    task_template: {
      title: "Give your employer a California DE 4",
      category: "taxes",
      priority: "medium",
      description:
        "The federal W-4 only covers federal withholding. California income tax withholding is set by the state DE 4. Without a valid DE 4, an employer withholds as single with zero allowances.",
      steps: [
        "Download the DE 4 from the EDD site.",
        "Complete it with your filing status and allowances.",
        "Hand it to your employer's payroll team together with your new address.",
      ],
      documents: ["Form DE 4 (Employee's Withholding Allowance Certificate)", "Your new California address"],
      financial: { kind: "tax", note: "Wrong state withholding shows up as a bill or an oversized refund at tax time." },
    },
    source_name: "California EDD — DE 4",
    source_url: "https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de4.pdf",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "US-TAX-ORIGIN-CHECK",
    state: "US",
    conditions: [
      { fact: "moving_between_states", op: "eq", value: true },
    ],
    task_template: {
      title: "Check whether {origin} expects a final state return",
      category: "taxes",
      priority: "medium",
      description:
        "States that tax income usually want a part-year return for the months you lived there. Civio has not verified the rule for {origin}.",
      steps: [
        "Open the {origin} tax agency site from the official directory.",
        "Look for part-year resident filing rules.",
        "Note the form name and due date in this task.",
      ],
      documents: ["W-2s and 1099s for the year", "Proof of your move date"],
      financial: { kind: "tax", note: "Income earned before the move may be taxable in {origin}." },
    },
    source_name: "USA.gov — State taxes",
    source_url: "https://www.usa.gov/state-taxes",
    last_verified: CHECKED,
    verified: false,
  },
  {
    rule_id: "US-TAX-DEST-CHECK",
    state: "US",
    conditions: [
      { fact: "moving_between_states", op: "eq", value: true },
      { fact: "destination_state", op: "not_in", value: STATE_TAX_COVERED },
    ],
    task_template: {
      title: "Check {destination} income tax and withholding rules",
      category: "taxes",
      priority: "medium",
      description:
        "Your new state may tax income and need its own withholding form. Civio has not verified the rule for {destination}.",
      steps: [
        "Open the {destination} tax agency site from the official directory.",
        "Check whether the state taxes wages and which withholding form employers use.",
        "Look for part-year resident filing rules.",
      ],
      documents: ["Your first pay stub after the move"],
      financial: { kind: "tax", note: "State withholding may start, stop or change with the move." },
    },
    source_name: "USA.gov — State taxes",
    source_url: "https://www.usa.gov/state-taxes",
    last_verified: CHECKED,
    verified: false,
  },

  // ─────────────────── Health insurance ───────────────────
  {
    rule_id: "CA-HEALTH-COVEREDCA",
    state: "CA",
    conditions: [
      { fact: "moving_between_states", op: "eq", value: true },
      { fact: "insurance", op: "eq", value: "marketplace" },
    ],
    task_template: {
      title: "Enroll through Covered California",
      category: "health",
      priority: "high",
      description:
        "A Marketplace plan from another state does not follow you. Moving to California is a qualifying life event, and Covered California generally gives you 60 days from the move date to apply.",
      steps: [
        "Start a new application at CoveredCA.com with your California address.",
        "Compare plans available in your new ZIP code.",
        "Pick a plan, then end your old-state plan so the coverage dates line up.",
      ],
      documents: ["Proof of your new address and move date (lease, utility bill)", "Household income details", "Social Security numbers for everyone applying"],
      deadline: { label: "Generally 60 days from the date of your move", daysAfterMove: 60 },
      financial: { kind: "coverage", note: "Miss the window and you wait for the next open enrollment without a plan." },
    },
    source_name: "Covered California — Major life changes",
    source_url: "https://www.coveredca.com/special-enrollment/",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "US-HEALTH-MARKETPLACE",
    state: "US",
    conditions: [
      { fact: "moving_between_states", op: "eq", value: true },
      { fact: "insurance", op: "eq", value: "marketplace" },
      { fact: "destination_state", op: "not_in", value: ["CA"] },
    ],
    task_template: {
      title: "Review Marketplace coverage for {destination}",
      category: "health",
      priority: "high",
      description:
        "When you move to a new state you need a new Marketplace application. The move qualifies you for a Special Enrollment Period: in most cases you have 60 days from your move date to enroll.",
      steps: [
        "Start a new application for {destination} at HealthCare.gov (it redirects you if the state runs its own exchange).",
        "Compare plans for your new ZIP code.",
        "Pick a plan, then end the old plan so the coverage dates line up.",
      ],
      documents: [
        "Proof of your new address and move date",
        "Proof you had coverage for at least 1 day in the 60 days before the move, if asked",
      ],
      deadline: { label: "In most cases, 60 days from your move date", daysAfterMove: 60 },
      financial: { kind: "coverage", note: "Miss the window and you wait for the next open enrollment without a plan." },
    },
    source_name: "HealthCare.gov — What if you move out of state",
    source_url: "https://www.healthcare.gov/help/moving-to-a-new-state/",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "US-HEALTH-MEDICAID",
    state: "US",
    conditions: [
      { fact: "moving_between_states", op: "eq", value: true },
      { fact: "insurance", op: "eq", value: "medicaid" },
    ],
    task_template: {
      title: "Apply for Medicaid in {destination}",
      category: "health",
      priority: "high",
      description:
        "Medicaid is run state by state and you generally must be a resident of the state that covers you. Coverage from {origin} does not transfer: apply in {destination} and report the move to {origin}.",
      steps: [
        "Apply with the {destination} Medicaid agency using the address where you intend to live.",
        "Report your change of residency to the {origin} Medicaid agency.",
        "Keep both notices until the new coverage is confirmed.",
      ],
      documents: ["Proof of your new address", "Income details for your household", "Current Medicaid card or notice"],
      financial: { kind: "coverage", note: "A gap between the two states means paying for care out of pocket." },
    },
    source_name: "Medicaid.gov — State residency guide",
    source_url: "https://www.medicaid.gov/resources-for-states/downloads/macpro-ig-state-residency.pdf",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "US-HEALTH-EMPLOYER-CHECK",
    state: "US",
    conditions: [
      { fact: "moving_between_states", op: "eq", value: true },
      { fact: "insurance", op: "eq", value: "employer" },
    ],
    task_template: {
      title: "Ask HR whether your plan works in {destination}",
      category: "health",
      priority: "medium",
      description:
        "Employer plans differ on out-of-area coverage. Civio found no official rule that covers every plan, so this one is yours to confirm with your benefits team.",
      steps: [
        "Ask HR whether your plan's network covers {destination}.",
        "Ask whether the move lets you change plans outside open enrollment.",
        "Update your home address in the benefits system.",
      ],
      documents: ["Your plan's Summary of Benefits and Coverage"],
      financial: { kind: "coverage", note: "Out-of-network care is usually billed at a higher rate." },
    },
    source_name: "U.S. Department of Labor — Employee Benefits Security Administration",
    source_url: "https://www.dol.gov/agencies/ebsa",
    last_verified: CHECKED,
    verified: false,
  },

  // ───────────────────────── Vehicle ─────────────────────────
  {
    rule_id: "CA-VEH-REG",
    state: "CA",
    conditions: [{ fact: "has_vehicle", op: "eq", value: true }],
    task_template: {
      title: "Register your vehicle in California",
      category: "vehicle",
      priority: "high",
      description:
        "The California DMV requires a vehicle from another state to be registered within 20 days of establishing residency or accepting employment in California. The DMV advises submitting the application and fees on time even if some paperwork is still missing.",
      steps: [
        "Get a smog certification from a California smog station, if your vehicle needs one.",
        "Complete form REG 343, signed by every registered owner.",
        "Bring the vehicle to a DMV office for VIN verification (REG 31). An appointment is recommended.",
        "Hand in the out-of-state title, registration and plates, and pay the fees.",
      ],
      documents: [
        "Application for Title or Registration (REG 343)",
        "Out-of-state title",
        "Out-of-state registration or renewal notice",
        "Smog certification, if required",
        "Verification of Vehicle (REG 31)",
      ],
      deadline: {
        label: "Within 20 days of establishing residency or accepting employment in California",
        daysAfterMove: 20,
      },
      financial: { kind: "penalty", note: "Registration fees and use tax are due. Late registration adds DMV penalties." },
    },
    source_name: "California DMV — New California resident portal",
    source_url:
      "https://www.dmv.ca.gov/portal/driver-education-and-safety/special-interest-driver-guides/new-to-california/",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "CA-VEH-DL",
    state: "CA",
    conditions: [{ fact: "drives", op: "eq", value: true }],
    task_template: {
      title: "Get a California driver license",
      category: "vehicle",
      priority: "high",
      description:
        "If you become a California resident and drive, the DMV says you must get a California driver license within 10 days.",
      steps: [
        "Start the driver license application on the DMV site.",
        "Book a DMV office visit.",
        "Bring your identity and residency documents and your current license.",
      ],
      documents: ["Current out-of-state driver license", "Identity and California residency documents listed by the DMV"],
      deadline: { label: "Within 10 days of becoming a California resident", daysAfterMove: 10 },
      financial: { kind: "fee", note: "The DMV charges an application fee." },
    },
    source_name: "California DMV — Requirements for a California driver's license",
    source_url: "https://www.dmv.ca.gov/portal/file/fast-facts-5-requirements-for-a-california-drivers-license/",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "CA-VEH-INSURANCE",
    state: "CA",
    conditions: [{ fact: "has_vehicle", op: "eq", value: true }],
    task_template: {
      title: "Move your auto insurance to a California policy",
      category: "vehicle",
      priority: "medium",
      description:
        "California's minimum liability limits rose on January 1, 2025: $30,000 for injury or death of one person, $60,000 per accident, and $15,000 for property damage.",
      steps: [
        "Tell your insurer your move date and California garaging address.",
        "Confirm the new policy meets the 30/60/15 minimum.",
        "Keep proof of insurance for your DMV registration visit.",
      ],
      documents: ["Proof of California auto insurance"],
      financial: { kind: "fee", note: "Your premium is re-rated for the new address." },
    },
    source_name: "California Department of Insurance — Automobile insurance guide",
    source_url:
      "https://www.insurance.ca.gov/01-consumers/105-type/95-guides/01-auto/upload/IG-Auto-Insurance-Updated-020525.pdf",
    last_verified: CHECKED,
    effective_date: "2025-01-01",
    verified: true,
  },
  {
    rule_id: "TX-VEH-REG",
    state: "TX",
    conditions: [{ fact: "has_vehicle", op: "eq", value: true }],
    task_template: {
      title: "Register your vehicle in Texas",
      category: "vehicle",
      priority: "high",
      description:
        "The Texas DMV gives new residents 30 days from the move to register a vehicle in the state.",
      steps: [
        "Get Texas auto insurance.",
        "Complete Form 130-U (Application for Texas Title and/or Registration).",
        "Take the paperwork to your county tax assessor-collector office.",
      ],
      documents: ["Form 130-U", "Proof of Texas auto insurance", "Out-of-state title or registration receipt"],
      deadline: { label: "Within 30 days of moving to Texas", daysAfterMove: 30 },
      financial: { kind: "penalty", note: "Registration fees are due. Registering late may add penalty fees." },
    },
    source_name: "Texas DMV — New to Texas",
    source_url: "https://www.txdmv.gov/motorists/new-to-texas",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "TX-VEH-DL",
    state: "TX",
    conditions: [{ fact: "drives", op: "eq", value: true }],
    task_template: {
      title: "Get a Texas driver license",
      category: "vehicle",
      priority: "medium",
      description:
        "New residents are required to get a Texas driver license from the Department of Public Safety within 90 days of moving to the state.",
      steps: [
        "Book an appointment with a DPS driver license office.",
        "Bring proof of identity and Texas residency.",
        "Surrender your out-of-state license.",
      ],
      documents: ["Current out-of-state driver license", "Proof of Texas residency", "Proof of identity"],
      deadline: { label: "Within 90 days of moving to Texas", daysAfterMove: 90 },
      financial: { kind: "fee", note: "DPS charges a license fee." },
    },
    source_name: "Texas DMV — New to Texas",
    source_url: "https://www.txdmv.gov/motorists/new-to-texas",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "US-VEH-STATE-CHECK",
    state: "US",
    conditions: [
      { fact: "has_vehicle_or_drives", op: "eq", value: true },
      { fact: "destination_state", op: "not_in", value: VEHICLE_COVERED },
    ],
    task_template: {
      title: "Check which {destination} DMV deadlines apply to you",
      category: "vehicle",
      priority: "high",
      description:
        "Every state sets its own deadline for new residents to register a vehicle and swap their license. Civio has not verified the rule for {destination}.",
      steps: [
        "Open the {destination} motor vehicle agency from the official directory.",
        "Check licensing if you will drive and registration if you are bringing a vehicle.",
        "List the documents the agency asks for.",
      ],
      documents: ["Out-of-state title and registration", "Current driver license", "Proof of insurance"],
      financial: { kind: "penalty", note: "States commonly charge late fees for missed registration deadlines." },
    },
    source_name: "USA.gov — State motor vehicle services",
    source_url: "https://www.usa.gov/state-motor-vehicle-services",
    last_verified: CHECKED,
    verified: false,
  },

  // ─────────────────── Family & education ───────────────────
  {
    rule_id: "CA-FAM-SCHOOL",
    state: "CA",
    conditions: [{ fact: "has_school_age_child", op: "eq", value: true }],
    task_template: {
      title: "Enroll your child in a California school",
      category: "family",
      priority: "high",
      description:
        "In California, children between 6 and 18 are subject to compulsory full-time education. A child is admitted to kindergarten if they turn five on or before September 1 of the school year.",
      steps: [
        "Find the school district for your new address.",
        "Ask the district for its enrollment document list.",
        "Bring your child's immunization record to registration.",
        "Request records from the previous school.",
      ],
      documents: [
        "Immunization record (checked at admission under California Department of Public Health rules)",
        "Other documents on your school district's enrollment list",
      ],
      deadline: { label: "Before your child's first school day after the move" },
    },
    source_name: "California Department of Education — Kindergarten FAQ",
    source_url: "https://www.cde.ca.gov/ci/gs/em/kindergartenfaq.asp",
    last_verified: CHECKED,
    verified: true,
  },
  {
    rule_id: "US-FAM-SCHOOL-CHECK",
    state: "US",
    conditions: [
      { fact: "has_school_age_child", op: "eq", value: true },
      { fact: "destination_state", op: "not_in", value: SCHOOL_COVERED },
    ],
    task_template: {
      title: "Check school enrollment requirements in {destination}",
      category: "family",
      priority: "high",
      description:
        "School age cut-offs, immunization rules and enrollment documents are set by each state and district. Civio has not verified the rule for {destination}.",
      steps: [
        "Find the school district for your new address.",
        "Ask for its enrollment document list and immunization requirements.",
        "Request records from the previous school.",
      ],
      documents: ["Immunization record", "Records from the previous school"],
    },
    source_name: "U.S. Department of Education — State contacts",
    source_url: "https://www.ed.gov/contact-us/state-contacts",
    last_verified: CHECKED,
    verified: false,
  },
];

export function ruleById(id: string): Rule | undefined {
  return RULES.find((rule) => rule.rule_id === id);
}
