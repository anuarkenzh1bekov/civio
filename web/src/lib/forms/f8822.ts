import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

/**
 * IRS Form 8822, Change of Address (Rev. February 2021). The official PDF is filled in
 * as it is: nothing on the form is redrawn, only its own fields get values.
 *
 * Deliberately not filled in: both social security number boxes, the decedent lines, and
 * the signature and date lines. Civio never asks for an SSN, and a signature is the
 * person's own.
 */

export type Form8822Input = {
  /** Line 3a: your name (first name, initial, last name). */
  name: string;
  /** Line 4a: spouse's name, if they share the address change. */
  spouseName?: string;
  /** Line 5a: your prior names, if any. */
  priorNames?: string;
  /** Line 6a: old address on one line (no., street, apt. no., city, state and ZIP code). */
  oldAddress: string;
  /** Line 7: new address on one line. */
  newAddress: string;
  /** Daytime telephone number of the person to contact (optional). */
  phone?: string;
  /** Box 1 sub-line: the last return was joint and you now have a separate residence. */
  separateResidence?: boolean;
};

const PAGE = "topmostSubform[0].Page1[0].";
const FIELD = {
  individualReturns: `${PAGE}c1_1[0]`,
  separateResidence: `${PAGE}c1_2[0]`,
  name: `${PAGE}f1_3[0]`,
  spouseName: `${PAGE}f1_5[0]`,
  priorNames: `${PAGE}f1_7[0]`,
  oldAddress: `${PAGE}f1_9[0]`,
  newAddress: `${PAGE}f1_17[0]`,
  phone: `${PAGE}f1_21[0]`,
} as const;

/** The standard PDF fonts only draw Latin-1, so anything else is dropped instead of failing the whole form. */
export function pdfSafe(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E -ÿ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Join address parts on one line, skipping empty ones: "12 Oak St, Austin, TX 78701". */
export function oneLineAddress(parts: { street: string; city: string; state: string; zip: string }): string {
  const region = [parts.state.trim(), parts.zip.trim()].filter(Boolean).join(" ");
  return [parts.street.trim(), parts.city.trim(), region].filter(Boolean).join(", ");
}

export async function fillForm8822(template: ArrayBuffer | Uint8Array, input: Form8822Input): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  const form = doc.getForm();
  const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);

  const put = (name: string, value: string | undefined) => {
    const text = pdfSafe(value ?? "");
    if (!text) return;
    const field = form.getTextField(name);
    const widget = field.acroField.getWidgets()[0];
    const available = (widget?.getRectangle().width ?? 200) - 6;
    // Start at 10 pt and shrink a long line until it fits the box; very long text is cut by the box.
    let size = 10;
    while (size > 6 && font.widthOfTextAtSize(text, size) > available) size -= 0.5;
    field.setFontSize(size);
    field.setText(text);
  };

  // Box 1 is the one every move needs: individual income tax returns.
  form.getCheckBox(FIELD.individualReturns).check();
  if (input.separateResidence) form.getCheckBox(FIELD.separateResidence).check();

  put(FIELD.name, input.name);
  put(FIELD.spouseName, input.spouseName);
  put(FIELD.priorNames, input.priorNames);
  put(FIELD.oldAddress, input.oldAddress);
  put(FIELD.newAddress, input.newAddress);
  put(FIELD.phone, input.phone);

  form.updateFieldAppearances(font);
  return doc.save();
}
