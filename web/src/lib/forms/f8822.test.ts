import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fillForm8822, oneLineAddress, pdfSafe } from "./f8822";

const template = readFileSync(resolve(__dirname, "../../../public/forms/f8822.pdf"));
const P = "topmostSubform[0].Page1[0].";

async function read(bytes: Uint8Array) {
  const form = (await PDFDocument.load(bytes)).getForm();
  const text = (name: string) => form.getTextField(`${P}${name}[0]`).getText() ?? "";
  return { form, text };
}

describe("IRS Form 8822", () => {
  it("fills the official form's own fields", async () => {
    const out = await fillForm8822(template, {
      name: "Jordan A. Rivera",
      spouseName: "Sam Rivera",
      priorNames: "Jordan Smith",
      oldAddress: oneLineAddress({ street: "12 Oak St Apt 4", city: "Austin", state: "TX", zip: "78701" }),
      newAddress: oneLineAddress({ street: "900 Pine Ave", city: "San Diego", state: "CA", zip: "92101" }),
      phone: "555-010-0199",
    });
    const { form, text } = await read(out);
    expect(text("f1_3")).toBe("Jordan A. Rivera");
    expect(text("f1_5")).toBe("Sam Rivera");
    expect(text("f1_7")).toBe("Jordan Smith");
    expect(text("f1_9")).toBe("12 Oak St Apt 4, Austin, TX 78701");
    expect(text("f1_17")).toBe("900 Pine Ave, San Diego, CA 92101");
    expect(text("f1_21")).toBe("555-010-0199");
    expect(form.getCheckBox(`${P}c1_1[0]`).isChecked()).toBe(true);
    expect(form.getCheckBox(`${P}c1_2[0]`).isChecked()).toBe(false);
  });

  it("never fills a social security number, the decedent lines or the signature", async () => {
    const out = await fillForm8822(template, { name: "Jordan Rivera", oldAddress: "1 A St", newAddress: "2 B St" });
    const { text } = await read(out);
    for (const ssn of ["f1_4", "f1_6", "f1_2", "f1_1"]) expect(text(ssn)).toBe("");
    // The foreign-address spaces and the representative's title stay empty too.
    for (const other of ["f1_10", "f1_11", "f1_12", "f1_18", "f1_22"]) expect(text(other)).toBe("");
  });

  it("checks the separate-residence box only when asked", async () => {
    const out = await fillForm8822(template, { name: "A B", oldAddress: "1 A St", newAddress: "2 B St", separateResidence: true });
    const { form } = await read(out);
    expect(form.getCheckBox(`${P}c1_2[0]`).isChecked()).toBe(true);
  });

  it("writes characters the standard font cannot draw as nothing instead of failing", async () => {
    expect(pdfSafe("Zoë Müller 张伟")).toBe("Zoë Müller");
    const out = await fillForm8822(template, { name: "Иван Петров", oldAddress: "1 A St", newAddress: "2 B St" });
    const { text } = await read(out);
    expect(text("f1_3")).toBe("");
  });

  it("shrinks a long address to fit the line", async () => {
    const long = oneLineAddress({ street: "123456 Very Long Boulevard Name Apartment Complex Building C Unit 4021", city: "Rancho Santa Margarita", state: "CA", zip: "92688" });
    const out = await fillForm8822(template, { name: "A B", oldAddress: long, newAddress: "2 B St" });
    const { text } = await read(out);
    expect(text("f1_9")).toBe(long);
  });

  it("joins address parts and skips empty ones", () => {
    expect(oneLineAddress({ street: "1 A St", city: "", state: "NY", zip: "" })).toBe("1 A St, NY");
  });
});
