import type { Activity, Categories, DayRecord, Expense, Extraction, Override, TemplateData } from "../types";

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(the|a|an|my)\s+/, "")
    .replace(/[^\p{L}\p{N}\s/&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameThing(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

// Used only when there is no AI result to take a category from (no key yet, or the AI failed).
const KEYWORDS: Array<[RegExp, string]> = [
  [/\b(class|lecture|study|studying|homework|hw|exam|quiz|lab|assignment|reading|csc|itc)\b/, "Class/Study"],
  [/\b(work|job|shift|meeting|infalytics|office|client)\b/, "Work"],
  [/\b(research|paper|thesis|experiment)\b/, "Research"],
  [/\b(gym|run|running|workout|lift|lifting|yoga|walk|swim|basketball|soccer|exercise)\b/, "Exercise"],
  [/\b(friends?|party|hangout|hung out|date|dinner with)\b/, "Social"],
  [/\b(family|mom|dad|parents|brother|sister)\b/, "Family"],
  [/\b(game|gaming|netflix|movie|tv|youtube|show|reddit|tiktok|instagram)\b/, "Entertainment"],
  [/\b(drive|driving|commute|bus|uber|lyft)\b/, "Commute"],
  [/\b(cleaning|laundry|dishes|cooking|groceries|errands?|chores?)\b/, "Chores"],
  [/\b(doctor|dentist|therapy|clinic|meds|medicine)\b/, "Health"],
  [/\b(sleep|nap)\b/, "Sleep"],
  [/\b(chipotle|mcdonald|starbucks|coffee|lunch|dinner|breakfast|pizza|restaurant|takeout|doordash|ubereats|food)\b/, "Food"],
  [/\b(walmart|kroger|aldi|publix|costco|grocer(y|ies))\b/, "Groceries"],
  [/\b(gas|fuel|parking|uber|lyft|bus|train|toll)\b/, "Transport/Gas"],
  [/\b(amazon|target|clothes|shoes|shopping)\b/, "Shopping"],
  [/\b(netflix|spotify|subscription|icloud|chatgpt|claude)\b/, "Subscriptions"],
  [/\b(rent|electric|water|internet|phone bill|bill|insurance)\b/, "Bills"],
  [/\b(pharmacy|cvs|walgreens|copay)\b/, "Health"],
];

export function guessCategory(name: string, allowed: string[]): string {
  const n = normalizeName(name);
  for (const [re, category] of KEYWORDS) if (re.test(n) && allowed.includes(category)) return category;
  return allowed.includes("Other") ? "Other" : allowed[allowed.length - 1];
}

function overrideFor(kind: Override["kind"], name: string, overrides: Override[]): string | null {
  const n = normalizeName(name);
  return overrides.find((o) => o.kind === kind && o.match === n)?.category ?? null;
}

/**
 * One entry's final record. Numbers typed in the template win over the AI's guesses; the AI's
 * categories and the extra items it found in the free writing fill in the rest; the user's
 * category fixes are applied last.
 */
export function mergeRecord(
  date: string,
  template: TemplateData,
  ai: Extraction | null,
  overrides: Override[],
  categories: Categories,
): DayRecord {
  const activities: Activity[] = (ai?.activities ?? []).map((a) => ({ ...a, source: "ai" as const }));
  for (const t of template.time) {
    const match = activities.find((a) => a.source === "ai" && sameThing(a.name, t.name));
    if (match) {
      if (t.hours !== null) match.hours = t.hours;
      match.source = "template";
    } else {
      activities.push({ name: normalizeName(t.name) || t.name, category: guessCategory(t.name, categories.time), hours: t.hours, source: "template" });
    }
  }

  const expenses: Expense[] = (ai?.expenses ?? []).map((e) => ({ ...e, source: "ai" as const }));
  for (const t of template.money) {
    const match = expenses.find(
      (e) => e.source === "ai" && (Math.abs(e.amount - t.amount) < 0.01 || sameThing(e.merchant, t.merchant)),
    );
    if (match) {
      match.amount = t.amount;
      match.source = "template";
    } else {
      expenses.push({ merchant: normalizeName(t.merchant) || t.merchant, amount: t.amount, category: guessCategory(t.merchant, categories.money), source: "template" });
    }
  }

  for (const a of activities) a.category = overrideFor("activity", a.name, overrides) ?? a.category;
  for (const e of expenses) e.category = overrideFor("expense", e.merchant, overrides) ?? e.category;

  return {
    date,
    mood: template.mood ?? ai?.mood ?? null,
    energy: template.energy ?? ai?.energy ?? null,
    sleep: template.sleep ?? ai?.sleep_hours ?? null,
    activities,
    expenses,
    people: ai?.people ?? [],
    places: ai?.places ?? [],
    themes: ai?.themes ?? [],
    sentiment: ai?.sentiment ?? null,
    events: ai?.notable_events ?? [],
  };
}
