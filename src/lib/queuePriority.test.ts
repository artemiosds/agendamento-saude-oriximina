import { describe, expect, it } from "vitest";
import { compareClinicalAndLegalPriority, compareLegalPriority, hasTriageTea, legalPriorityKey, patientAge } from "./queuePriority";

const today = new Date(2026, 8, 23);

describe("queue legal priority", () => {
  it("recognizes birthdays in both supported formats and rejects invalid dates", () => {
    expect(patientAge("1941-09-23", today)).toBe(85);
    expect(patientAge("24/09/1941", today)).toBe(84);
    expect(patientAge("31/02/1941", today)).toBeNull();
  });

  it("puts an older patient first within the same risk without assigning any clinical risk", () => {
    const older = legalPriorityKey({ dataNascimento: "1941-09-23" }, false, today);
    const younger = legalPriorityKey({ dataNascimento: "1961-09-23" }, false, today);
    expect(compareLegalPriority(older, younger)).toBeLessThan(0);
    expect(compareLegalPriority(younger, older)).toBeGreaterThan(0);
    expect(older).not.toHaveProperty("risco");
  });

  it("recognizes TEA from either registration or triage and leaves equal priorities tied", () => {
    const registered = legalPriorityKey({ isAutista: true }, false, today);
    const inTriage = legalPriorityKey({}, hasTriageTea(["TEA"]), today);
    const pregnant = legalPriorityKey({ isGestante: true }, false, today);
    expect(registered.tier).toBe(2);
    expect(compareLegalPriority(registered, inTriage)).toBe(0);
    expect(compareLegalPriority(inTriage, pregnant)).toBe(0);
    expect(hasTriageTea(["hipertensão"])).toBe(false);
  });

  it("keeps a red patient above a legally prioritized green patient", () => {
    const regular = legalPriorityKey({}, false, today);
    const older = legalPriorityKey({ dataNascimento: "1941-09-23" }, false, today);
    expect(compareClinicalAndLegalPriority(1, regular, 4, older)).toBeLessThan(0);
    expect(compareClinicalAndLegalPriority(1, regular, 1, older)).toBeGreaterThan(0);
  });

  it("uses a consistent order when elderly, pregnant and TEA patients are mixed", () => {
    const older = legalPriorityKey({ dataNascimento: "1947-09-23" }, false, today);
    const younger = legalPriorityKey({ dataNascimento: "1961-09-23" }, false, today);
    const pregnant = legalPriorityKey({ isGestante: true }, false, today);
    const tea = legalPriorityKey({ isAutista: true }, false, today);
    const arrival = ["10:00", "08:00", "07:00", "09:00"];
    const items = [older, younger, pregnant, tea];
    const compare = (i: number, j: number) => compareLegalPriority(items[i], items[j]) || arrival[i].localeCompare(arrival[j]);
    expect(compare(0, 1)).toBeLessThan(0);
    expect(compare(1, 2)).toBeLessThan(0);
    expect(compare(0, 2)).toBeLessThan(0);
    expect(compare(2, 3)).toBeLessThan(0);
    expect([3, 2, 1, 0].sort(compare)).toEqual([0, 1, 2, 3]);
  });

  it("puts the older patient first even when two elderly patients have the same age in years", () => {
    const older = legalPriorityKey({ dataNascimento: "1941-01-10" }, false, today);
    const younger = legalPriorityKey({ dataNascimento: "1941-08-10" }, false, today);
    expect(older.age).toBe(younger.age);
    expect(compareLegalPriority(older, younger)).toBeLessThan(0);
  });
});
