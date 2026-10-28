// Real call to Claude. Skipped unless JT_LIVE=1 and ANTHROPIC_API_KEY are set, because it costs money
// (a fraction of a cent per run on Claude Haiku).
import { describe, expect, it } from "vitest";
import { ClaudeProvider } from "../src/ai/claude";
import { parseTemplate } from "../src/entry/template";
import { mergeRecord } from "../src/sync/merge";
import { DEFAULT_CATEGORIES } from "../src/types";

declare const process: { env: Record<string, string | undefined> };
const live = process.env.JT_LIVE === "1" && Boolean(process.env.ANTHROPIC_API_KEY);

const ENTRY = `---
mood: 7
energy:
sleep: 6
---
## Time
- csc 424 class 1h 15m
- infalytics 3h
## Money
- $12.40 chipotle
## Journal
Rough morning, barely slept. Went to the gym with Ali after class for about an hour, which helped a lot.
Grabbed coffee at Starbucks for 6 bucks and filled up gas for $38. Spent the evening on the investor deck.`;

describe.runIf(live)("Claude extraction (live)", () => {
  it("pulls activities, purchases and people out of a real entry", { timeout: 90_000 }, async () => {
    const ai = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);
    const out = await ai.extract({ date: "2026-10-27", title: "2026-10-27", text: ENTRY }, DEFAULT_CATEGORIES);
    console.log(JSON.stringify(out, null, 2));

    expect(out.activities.some((a) => /gym/.test(a.name) && a.category === "Exercise")).toBe(true);
    expect(out.expenses.some((e) => Math.abs(e.amount - 38) < 0.01 && e.category === "Transport/Gas")).toBe(true);
    expect(out.expenses.some((e) => Math.abs(e.amount - 6) < 0.01)).toBe(true);
    expect(out.people.map((p) => p.toLowerCase())).toContain("ali");
    for (const a of out.activities) expect(DEFAULT_CATEGORIES.time).toContain(a.category);
    for (const e of out.expenses) expect(DEFAULT_CATEGORIES.money).toContain(e.category);

    const record = mergeRecord("2026-10-27", parseTemplate(ENTRY), out, [], DEFAULT_CATEGORIES);
    expect(record.mood).toBe(7); // typed value wins
    expect(record.expenses.filter((e) => Math.abs(e.amount - 12.4) < 0.01)).toHaveLength(1); // not double-counted
  });
});
