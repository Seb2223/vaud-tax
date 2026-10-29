// Regression tests for bugs found in code review.
import { describe, expect, it } from "vitest";
import { chatWindow } from "../server/ai";
import type { Extraction } from "./aiSchemas";
import { applyExtraction, valuesOf } from "./apply";
import { compute } from "./calc";
import { emptyData, newChild, newEmployment, newPerson, newProperty } from "./defaults";

const employee = (patch: Partial<ReturnType<typeof newPerson>> = {}) => ({
  ...newPerson(),
  employments: [{ ...newEmployment(), netSalary: 80000 }],
  ...patch,
});
const line = (d: ReturnType<typeof emptyData>, code: string) => compute(d).lines.find((l) => l.code === code);

describe("review fixes", () => {
  it("0 commuting days means no commuting or meal deduction (not a full year)", () => {
    const d = emptyData();
    d.persons = [employee({ commuteMode: "public", commuteKm: 20, commuteDays: 0, meals: "outside" })];
    expect(line(d, "140")?.icc ?? 0).toBe(0);
    expect(line(d, "150")?.icc ?? 0).toBe(0);
  });

  it("childcare is not deducted when only one spouse works", () => {
    const d = { ...emptyData(), civilStatus: "married" as const };
    d.persons = [employee(), newPerson()];
    d.children = [{ ...newChild(), birthYear: 2021, childcareCosts: 10000 }];
    expect(line(d, "670")!.icc).toBe(0);
    expect(line(d, "670")!.warnings?.[0]).toMatch(/Not deducted/);
    d.childcareTrainingOrIncapacity = true;
    expect(line(d, "670")!.icc).toBe(10000);
  });

  it("federal debt-interest cap uses the 90% rental value", () => {
    const d = emptyData();
    d.persons = [employee()];
    d.properties = [{ ...newProperty("Lausanne"), surfaceM2: 200, constructionYear: 2015, detachedVilla: true }];
    d.debts = [{ id: "x", creditor: "Bank", balance: 2_000_000, interest: 90000 }];
    const l = line(d, "610")!;
    expect(l.ifd).toBeGreaterThan(l.icc);
  });

  it("editing one of several rows with the same key keeps the other rows", () => {
    const x = {
      documentType: "health_insurance_premiums",
      fields: [
        { key: "health_premiums_total", label: "A", value: 4000, sourceText: "" },
        { key: "health_premiums_total", label: "B", value: 3500, sourceText: "" },
      ],
    } as Extraction;
    expect(valuesOf(x, [4100, 3500]).health_premiums_total).toBe(7600);
  });

  it("two pillar 3a certificates add up", () => {
    const d = emptyData();
    const x = { documentType: "pillar3a_certificate", fields: [] } as unknown as Extraction;
    applyExtraction(d, x, { pillar3a_paid: 4000 }, { personIndex: 0 });
    applyExtraction(d, x, { pillar3a_paid: 3000 }, { personIndex: 0 });
    expect(d.persons[0].pillar3a).toBe(7000);
  });

  it("long chats keep starting with a question", () => {
    const history = Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: `m${i}` }));
    const w = chatWindow(history);
    expect(w[0].role).toBe("user");
    expect(w.at(-1)!.content).toBe("m20");
  });
});
