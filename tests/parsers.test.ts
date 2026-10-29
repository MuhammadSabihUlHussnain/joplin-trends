import { describe, expect, it } from "vitest";
import { entryDate, parseDuration, parseMoney, parseTemplate } from "../src/entry/template";
import { mergeRecord } from "../src/sync/merge";
import { DEFAULT_CATEGORIES, type Extraction } from "../src/types";

describe("template parsing", () => {
  it("reads durations in every common form", () => {
    expect(parseDuration("class 3h").hours).toBe(3);
    expect(parseDuration("gym 1.5 hours").hours).toBe(1.5);
    expect(parseDuration("reading 90 min").hours).toBe(1.5);
    expect(parseDuration("infalytics 2h 30m")).toEqual({ hours: 2.5, rest: "infalytics" });
    expect(parseDuration("drive 1:15").hours).toBe(1.25);
    expect(parseDuration("called mom").hours).toBeNull();
    expect(parseDuration("10 more pages").hours).toBeNull();
  });

  it("reads amounts in every common form", () => {
    expect(parseMoney("$12 chipotle")).toEqual({ amount: 12, merchant: "chipotle" });
    expect(parseMoney("chipotle $12.50")).toEqual({ amount: 12.5, merchant: "chipotle" });
    expect(parseMoney("12 dollars gas")).toEqual({ amount: 12, merchant: "gas" });
    expect(parseMoney("45 gas")).toEqual({ amount: 45, merchant: "gas" });
    expect(parseMoney("$1,200 rent")).toEqual({ amount: 1200, merchant: "rent" });
    expect(parseMoney("nothing bought")).toBeNull();
  });

  it("parses the full template and keeps the free writing", () => {
    const t = parseTemplate(`---\nmood: 7/10\nenergy: \nsleep: 6.5\n---\n## Time\n- class 3h\n- gym 1h\n## Money\n- $12 chipotle\n- 45 gas\n## Journal\nLong day. Saw Ali at the library.`);
    expect(t).toMatchObject({ mood: 7, energy: null, sleep: 6.5 });
    expect(t.time).toEqual([
      { name: "class", hours: 3 },
      { name: "gym", hours: 1 },
    ]);
    expect(t.money).toEqual([
      { merchant: "chipotle", amount: 12 },
      { merchant: "gas", amount: 45 },
    ]);
    expect(t.freeText).toBe("Long day. Saw Ali at the library."); // the "## Journal" heading itself isn't journal text
    expect(t.freeText).not.toContain("chipotle");
  });

  it("treats an entry with no template as all free writing", () => {
    const t = parseTemplate("Just wrote a paragraph today.");
    expect(t).toMatchObject({ mood: null, time: [], money: [], freeText: "Just wrote a paragraph today." });
  });

  it("picks the entry date from the title, then the date field, then creation time", () => {
    const t = parseTemplate("---\ndate: 2026-10-02\n---\nx");
    expect(entryDate("2026-10-01", t, null)).toBe("2026-10-01");
    expect(entryDate("Tuesday", t, null)).toBe("2026-10-02");
    expect(entryDate("Tuesday", parseTemplate("x"), "2026-10-03T15:00:00.000Z")).toBe("2026-10-03");
  });
});

describe("mergeRecord", () => {
  const ai: Extraction = {
    mood: 5,
    energy: 6,
    sleep_hours: 7,
    activities: [
      { name: "gym", category: "Exercise", hours: 2 },
      { name: "netflix", category: "Entertainment", hours: null },
    ],
    expenses: [{ amount: 12, merchant: "chipotle", category: "Food" }],
    people: ["Ali"],
    places: ["library"],
    themes: ["exams"],
    sentiment: 0.2,
    notable_events: [],
  };

  it("lets typed numbers win and keeps the AI's extra items and categories", () => {
    const t = parseTemplate("---\nmood: 8\n---\n## Time\n- gym 1h\n- class 3h\n## Money\n- $12 chipotle\n- 45 gas");
    const r = mergeRecord("2026-10-27", t, ai, [], DEFAULT_CATEGORIES);
    expect(r.mood).toBe(8); // typed
    expect(r.energy).toBe(6); // from AI
    const gym = r.activities.find((a) => a.name === "gym")!;
    expect(gym).toMatchObject({ hours: 1, category: "Exercise", source: "template" });
    expect(r.activities.find((a) => a.name === "netflix")).toMatchObject({ source: "ai" });
    expect(r.activities.find((a) => a.name === "class")).toMatchObject({ category: "Class/Study", hours: 3 });
    expect(r.expenses).toHaveLength(2);
    expect(r.expenses.find((e) => e.merchant === "gas")).toMatchObject({ category: "Transport/Gas", amount: 45 });
  });

  it("applies category fixes last", () => {
    const t = parseTemplate("## Money\n- $12 chipotle");
    const r = mergeRecord("2026-10-27", t, ai, [{ kind: "expense", match: "chipotle", category: "Entertainment" }], DEFAULT_CATEGORIES);
    expect(r.expenses[0].category).toBe("Entertainment");
  });

  it("works with no AI result at all", () => {
    const r = mergeRecord("2026-10-27", parseTemplate("## Time\n- homework 2h"), null, [], DEFAULT_CATEGORIES);
    expect(r.activities).toEqual([{ name: "homework", category: "Class/Study", hours: 2, source: "template" }]);
    expect(r.mood).toBeNull();
  });
});
