import { formatDate } from "@/lib/format";
import { stateName } from "@/lib/states";
import type { Profile, Task } from "@/lib/types";

/**
 * Document templates. Everything here is plain string assembly from the
 * profile and the plan: no model is involved, so the free list and the base
 * letters always work. The model, when configured, only rewrites a finished
 * letter for tone and for extra details the user adds.
 */

// ───────────────────────── Who to notify ─────────────────────────

export type NotifyItem = {
  id: string;
  who: string;
  why: string;
  how: string;
  /** Official page, when Civio has one. */
  link?: { name: string; url: string };
  /** Task in the plan that covers this, when there is one. */
  ruleId?: string;
  /** Letter template that fits this recipient. */
  letter?: LetterKind;
};

export function buildNotifyList(profile: Profile, tasks: readonly Task[]): NotifyItem[] {
  const destination = stateName(profile.destinationState);
  const has = (ruleId: string) => tasks.find((task) => task.ruleId === ruleId);
  const items: NotifyItem[] = [];

  items.push({
    id: "usps",
    who: "US Postal Service",
    why: "Mail sent to your old address is forwarded while everyone else catches up.",
    how: "File a change of address online or at a post office.",
    link: { name: "USPS — Change of address", url: "https://www.usps.com/manage/forward.htm" },
  });

  const irs = has("US-TAX-8822");
  if (irs) {
    items.push({
      id: "irs",
      who: "IRS",
      why: "Notices and refunds go to the address the IRS has on file.",
      how: "Mail Form 8822.",
      link: { name: irs.source.name, url: irs.source.url },
      ruleId: irs.ruleId,
    });
  }

  if (profile.employment === "employee" || profile.income === "w2" || profile.income === "both") {
    const de4 = has("CA-TAX-DE4");
    items.push({
      id: "employer",
      who: "Your employer's payroll or HR team",
      why: `State tax withholding follows where you live and work. ${destination} may need its own withholding form.`,
      how: de4 ? "Send your new address and hand in the state withholding form from your plan." : "Send your new address and ask which state forms they need.",
      ruleId: de4?.ruleId,
      letter: "address_change",
    });
  }

  if (profile.insurance && profile.insurance !== "none") {
    const task = tasks.find((t) => t.category === "health");
    const who =
      profile.insurance === "employer"
        ? "Your health plan (through HR)"
        : profile.insurance === "marketplace"
          ? "The health insurance Marketplace"
          : profile.insurance === "medicaid"
            ? "Your state Medicaid office"
            : "Your health insurer";
    items.push({
      id: "health",
      who,
      why: "Plans and provider networks are tied to where you live. A move between states usually means a new plan or a network check.",
      how: task ? `See “${task.title}” in your plan.` : "Report the move and ask what changes.",
      link: task ? { name: task.source.name, url: task.source.url } : undefined,
      ruleId: task?.ruleId,
      letter: profile.insurance === "other" ? "address_change" : undefined,
    });
  }

  if (profile.hasVehicle !== false) {
    const insurance = tasks.find((t) => t.ruleId.endsWith("VEH-INSURANCE"));
    items.push({
      id: "auto-insurer",
      who: "Your auto insurer",
      why: "The policy is rated for where the car is kept, and the new state sets its own minimum coverage.",
      how: "Give them the move date and the new garaging address.",
      ruleId: insurance?.ruleId,
      letter: "auto_insurer",
    });
    const dmv = tasks.find((t) => t.ruleId.endsWith("VEH-REG") || t.ruleId.endsWith("VEH-DL") || t.ruleId === "US-VEH-STATE-CHECK");
    if (dmv) {
      items.push({
        id: "dmv",
        who: `${destination} motor vehicle agency`,
        why: "A new resident has to move the license and registration over.",
        how: `See “${dmv.title}” in your plan.`,
        link: { name: dmv.source.name, url: dmv.source.url },
        ruleId: dmv.ruleId,
      });
    }
  }

  items.push({
    id: "bank",
    who: "Banks, credit cards and lenders",
    why: "Statements, replacement cards and fraud checks use your address.",
    how: "Update it in each online account, or send a letter where that is not possible.",
    letter: "address_change",
  });

  items.push({
    id: "landlord",
    who: "Your current landlord or property manager",
    why: "Your lease sets how much notice you owe and where the deposit is sent.",
    how: "Give written notice with a forwarding address. Check the notice period in your lease first.",
    letter: "landlord_notice",
  });

  items.push({
    id: "utilities",
    who: "Utilities, internet and phone",
    why: "Service has to stop at the old place on the day you leave and start at the new one.",
    how: "Schedule the stop and start dates with each provider.",
  });

  if (profile.hasChildren) {
    const school = tasks.find((t) => t.category === "family");
    items.push({
      id: "school",
      who: "Your children's current school",
      why: "The new school asks for records and immunization history.",
      how: "Request the records in writing before the move.",
      ruleId: school?.ruleId,
      letter: "school_records",
    });
  }

  items.push({
    id: "voter",
    who: "Voter registration",
    why: "Registration does not move with you. You register again in the new state.",
    how: "Start from the federal voter registration site.",
    link: { name: "vote.gov", url: "https://vote.gov" },
  });

  items.push({
    id: "medical",
    who: "Doctors, dentist and pharmacy",
    why: "Records and prescriptions are easier to transfer before you leave.",
    how: "Ask for records and move open prescriptions to a pharmacy near the new address.",
  });

  return items;
}

// ───────────────────────── Letters ─────────────────────────

export type LetterKind = "address_change" | "landlord_notice" | "auto_insurer" | "school_records";

export type LetterFields = {
  fullName: string;
  oldAddress: string;
  newAddress: string;
  recipient: string;
  /** Account, policy or student reference, optional. */
  reference: string;
};

export const EMPTY_FIELDS: LetterFields = { fullName: "", oldAddress: "", newAddress: "", recipient: "", reference: "" };

export const LETTERS: Record<LetterKind, { title: string; blurb: string; recipientHint: string; referenceLabel: string }> = {
  address_change: {
    title: "Change of address letter",
    blurb: "For a bank, employer, insurer or anyone who needs it in writing.",
    recipientHint: "e.g. First National Bank, Customer Service",
    referenceLabel: "Account or member number",
  },
  landlord_notice: {
    title: "Move-out notice to a landlord",
    blurb: "Written notice with a forwarding address for the deposit.",
    recipientHint: "e.g. Oak Street Property Management",
    referenceLabel: "Unit or lease number",
  },
  auto_insurer: {
    title: "Auto insurance update request",
    blurb: "Asks your insurer to re-rate the policy for the new state.",
    recipientHint: "e.g. your insurance company, Policy Services",
    referenceLabel: "Policy number",
  },
  school_records: {
    title: "School records request",
    blurb: "Asks the current school for transcripts and immunization records.",
    recipientHint: "e.g. Lincoln Elementary, Registrar",
    referenceLabel: "Student name and grade",
  },
};

const blank = (value: string, placeholder: string) => (value.trim() ? value.trim() : `[${placeholder}]`);

export function availableLetters(profile: Profile): LetterKind[] {
  const kinds: LetterKind[] = ["address_change", "landlord_notice"];
  if (profile.hasVehicle !== false) kinds.push("auto_insurer");
  if (profile.hasChildren) kinds.push("school_records");
  return kinds;
}

/** Build a letter. Missing inputs stay visible as [placeholders] instead of being guessed. */
export function buildLetter(kind: LetterKind, fields: LetterFields, profile: Profile, today: string): string {
  const name = blank(fields.fullName, "Your full name");
  const oldAddress = blank(fields.oldAddress, "Old address");
  const newAddress = blank(fields.newAddress, "New address");
  const recipient = blank(fields.recipient, "Recipient");
  const moveDate = profile.arrivedOn ?? profile.moveDate;
  const effective = moveDate ? formatDate(moveDate) : "[move date]";
  const destination = stateName(profile.destinationState);
  const reference = fields.reference.trim();

  const head = [name, oldAddress, "", formatDate(today), "", recipient, ""];
  const close = ["", "Sincerely,", name];

  let subject: string;
  let body: string[];
  switch (kind) {
    case "address_change":
      subject = "Re: Change of address";
      body = [
        "To whom it may concern,",
        "",
        `I am writing to let you know that my address changes on ${effective}. Please update your records${reference ? ` for ${reference}` : ""}.`,
        "",
        `Previous address: ${oldAddress}`,
        `New address: ${newAddress}`,
        "",
        "Please send all future correspondence to the new address and confirm in writing once the change is made.",
      ];
      break;
    case "landlord_notice":
      subject = "Re: Notice of intent to vacate";
      body = [
        "To whom it may concern,",
        "",
        `This letter is my written notice that I will move out of ${oldAddress}${reference ? ` (${reference})` : ""} on ${effective}.`,
        "",
        "I would like to schedule a move-out inspection before that date. Please send my security deposit and any final statement to my forwarding address:",
        "",
        newAddress,
        "",
        "Please confirm that you have received this notice.",
      ];
      break;
    case "auto_insurer":
      subject = `Re: Move to ${destination}${reference ? `, policy ${reference}` : ""}`;
      body = [
        "To whom it may concern,",
        "",
        `I am moving to ${destination} on ${effective}. From that date my vehicle will be kept at:`,
        "",
        newAddress,
        "",
        `Please update my policy to meet ${destination}'s coverage requirements from that date, and send me the new premium and proof of insurance that I can show when I register the vehicle.`,
      ];
      break;
    case "school_records":
      subject = "Re: Request for student records";
      body = [
        "To whom it may concern,",
        "",
        `My family is moving to ${destination} on ${effective}. Please prepare the school records${reference ? ` for ${reference}` : " for my child"}, including transcripts or report cards and immunization records, so the new school can complete enrollment.`,
        "",
        "Please send the records to:",
        "",
        newAddress,
        "",
        "If you need a signed release or the new school's contact details, let me know and I will send them.",
      ];
      break;
  }

  return [...head, subject, "", ...body, ...close].join("\n");
}

/** A plain-text version of the list, for copying or printing. */
export function notifyListText(items: readonly NotifyItem[], profile: Profile): string {
  const title = `Who to notify: ${stateName(profile.currentState)} to ${stateName(profile.destinationState)}`;
  const lines = items.map((item, index) => {
    const link = item.link ? `\n   ${item.link.url}` : "";
    return `${index + 1}. ${item.who}\n   Why: ${item.why}\n   How: ${item.how}${link}`;
  });
  return `${title}\n\n${lines.join("\n\n")}\n`;
}
