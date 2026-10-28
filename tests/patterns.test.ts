import { describe, expect, it } from "vitest";
import { addDays, buildDays } from "../src/analytics/days";
import { findPatterns } from "../src/analytics/patterns";
import { weekly, weekSummary } from "../src/analytics/rollups";
import { benjaminiHochberg, seededRandom, spearman, studentTwoSided } from "../src/analytics/stats";
import { DEFAULT_CATEGORIES, type DayRecord, type Entry } from "../src/types";

const START = "2026-08-31"; // a Monday

function gaussian(rand: () => number) {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 60 days of fake entries. With effects on: gym days +2 mood, sleep lifts mood, exam weeks double food spending. */
function synthetic(seed: number, effects: boolean): Entry[] {
  const rand = seededRandom(seed);
  const entries: Entry[] = [];
  for (let i = 0; i < 60; i++) {
    const date = addDays(START, i);
    const week = Math.floor(i / 7);
    const gym = rand() < 0.45;
    const sleep = 5 + rand() * 3.5;
    let mood = 6 + gaussian(rand) * 1.2;
    if (effects) mood += (gym ? 2 : 0) + 0.8 * (sleep - 6.75);
    const examWeek = effects && (week === 4 || week === 7);
    const food = Math.max(0, 9 + gaussian(rand) * 3) * (examWeek ? 2.5 : 1);
    const record: DayRecord = {
      date,
      mood: Math.round(Math.min(10, Math.max(1, mood)) * 10) / 10,
      energy: null,
      sleep: Math.round(sleep * 10) / 10,
      activities: [
        { name: "class", category: "Class/Study", hours: 2 + Math.round(rand() * 3), source: "template" },
        ...(gym ? [{ name: "gym", category: "Exercise", hours: 1, source: "template" as const }] : []),
      ],
      expenses: [{ merchant: "lunch", amount: Math.round(food * 100) / 100, category: "Food", source: "template" }],
      people: [],
      places: [],
      themes: [],
      sentiment: null,
      events: [],
    };
    entries.push({
      id: `n${i}`,
      title: date,
      date,
      updatedTime: `${date}T12:00:00.000Z`,
      textHash: `${i}`,
      status: "ok",
      template: { date: null, mood: null, energy: null, sleep: null, time: [], money: [], freeText: "" },
      ai: null,
      record,
    });
  }
  return entries;
}

const TODAY = addDays(START, 59);

describe("statistics", () => {
  it("matches known Student t p-values", () => {
    expect(studentTwoSided(2.0, 10)).toBeCloseTo(0.0734, 3);
    expect(studentTwoSided(0, 10)).toBeCloseTo(1, 6);
    expect(studentTwoSided(3.5, 30)).toBeCloseTo(0.00147, 4);
  });

  it("computes Spearman with ties", () => {
    const s = spearman([1, 2, 2, 3, 4, 5], [2, 3, 3, 5, 4, 6]);
    expect(s.r).toBeGreaterThan(0.85);
    expect(s.p).toBeLessThan(0.05);
  });

  it("controls the false discovery rate", () => {
    expect(benjaminiHochberg([0.001, 0.01, 0.04, 0.5], 0.1)).toEqual([true, true, true, false]);
    expect(benjaminiHochberg([0.04, 0.5, 0.6, 0.7], 0.1)).toEqual([false, false, false, false]);
  });
});

describe("pattern engine", () => {
  it("finds the planted effects", () => {
    const days = buildDays(synthetic(7, true));
    const { patterns, daysNeeded } = findPatterns(days, DEFAULT_CATEGORIES, TODAY);
    expect(daysNeeded).toBe(0);
    const ids = patterns.map((p) => p.id);
    expect(ids).toContain("mood~Exercise");
    expect(ids).toContain("mood~sleep");
    expect(patterns.find((p) => p.id === "mood~Exercise")!.title).toMatch(/higher/);
    const foodSpikes = ids.filter((id) => id.startsWith("spend~Food~"));
    expect(foodSpikes).toContain(`spend~Food~${addDays(START, 28)}`);
    expect(foodSpikes).toContain(`spend~Food~${addDays(START, 49)}`);
  });

  it("reports no correlations on pure noise, and unusual weeks only rarely", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    let datasetsWithAnomaly = 0;
    for (const seed of seeds) {
      const { patterns } = findPatterns(buildDays(synthetic(seed, false)), DEFAULT_CATEGORIES, TODAY);
      const correlations = patterns.filter((p) => p.kind === "correlation");
      expect(correlations, `seed ${seed}: ${correlations.map((p) => `${p.id} ${p.detail}`).join("; ")}`).toEqual([]);
      if (patterns.some((p) => p.kind === "anomaly")) datasetsWithAnomaly++;
    }
    // Random data does produce the odd extreme week (say 7 gym days against a usual 2); that's a
    // true statement about the week, so it may be shown, but it has to stay uncommon.
    expect(datasetsWithAnomaly / seeds.length).toBeLessThanOrEqual(0.15);
  });

  it("asks for more days instead of guessing", () => {
    const days = buildDays(synthetic(7, true).slice(0, 9));
    const { patterns, daysNeeded } = findPatterns(days, DEFAULT_CATEGORIES, addDays(START, 8));
    expect(daysNeeded).toBe(5);
    expect(patterns.filter((p) => p.kind === "correlation")).toEqual([]);
  });
});

describe("rollups", () => {
  it("adds up weeks and compares this week with the same days last week", () => {
    const days = buildDays(synthetic(7, true));
    const rows = weekly(days, "spend", DEFAULT_CATEGORIES.money, TODAY);
    expect(rows).toHaveLength(9);
    expect(rows[4].Food as number).toBeGreaterThan(1.8 * (rows[3].Food as number));
    const s = weekSummary(days, TODAY);
    expect(s.thisWeek.entries).toBe(s.lastWeek.entries);
  });
});
