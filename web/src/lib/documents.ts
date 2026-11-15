import { formatDate } from "@/lib/format";
import { stateName } from "@/lib/states";
import type { Profile } from "@/lib/types";

/**
 * Letter templates. Everything here is plain string assembly from the
 * profile and what the user types: no model is involved, and names and
 * addresses stay in the browser. The model, when configured, only rewrites a
 * finished letter for tone and for extra details the user adds. The
 * who-to-notify list is built by the backend (`useNotifyList`).
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
