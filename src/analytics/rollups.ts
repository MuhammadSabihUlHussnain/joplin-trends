import { addDays, type Day, weekOf } from "./days";

export type Measure = "hours" | "spend";

export interface WeekRow {
  week: string;
  total: number;
  [category: string]: number | string;
}

/** One row per week (Monday start) from the first entry to `today`, empty weeks included. */
export function weekly(days: Day[], measure: Measure, categories: string[], today: string): WeekRow[] {
  if (!days.length) return [];
  const rows = new Map<string, WeekRow>();
  for (let w = weekOf(days[0].date); w <= weekOf(today); w = addDays(w, 7)) {
    const row: WeekRow = { week: w, total: 0 };
    for (const c of categories) row[c] = 0;
    rows.set(w, row);
  }
  for (const d of days) {
    const row = rows.get(d.week);
    if (!row) continue;
    const values = measure === "hours" ? d.hours : d.spend;
    for (const [c, v] of Object.entries(values)) {
      row[c] = ((row[c] as number) ?? 0) + v;
      row.total += v;
    }
  }
  for (const row of rows.values()) {
    for (const k of Object.keys(row)) if (typeof row[k] === "number") row[k] = Math.round((row[k] as number) * 100) / 100;
  }
  return [...rows.values()];
}

export function totalsBetween(days: Day[], from: string, to: string, measure: Measure): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of days) {
    if (d.date < from || d.date > to) continue;
    for (const [c, v] of Object.entries(measure === "hours" ? d.hours : d.spend)) out[c] = (out[c] ?? 0) + v;
  }
  return out;
}

export function sum(values: Record<string, number>): number {
  return Object.values(values).reduce((s, v) => s + v, 0);
}

export interface WeekSummary {
  thisWeek: { from: string; to: string; hours: Record<string, number>; spend: Record<string, number>; mood: number | null; entries: number };
  lastWeek: { from: string; to: string; hours: Record<string, number>; spend: Record<string, number>; mood: number | null; entries: number };
}

/** This week so far (Monday to today) against the same weekdays of last week, so partial weeks compare fairly. */
export function weekSummary(days: Day[], today: string): WeekSummary {
  const from = weekOf(today);
  const lastFrom = addDays(from, -7);
  const lastTo = addDays(today, -7);
  const span = (a: string, b: string) => {
    const ds = days.filter((d) => d.date >= a && d.date <= b);
    const moods = ds.map((d) => d.mood).filter((m): m is number => m !== null);
    return {
      from: a,
      to: b,
      hours: totalsBetween(ds, a, b, "hours"),
      spend: totalsBetween(ds, a, b, "spend"),
      mood: moods.length ? moods.reduce((s, v) => s + v, 0) / moods.length : null,
      entries: ds.length,
    };
  };
  return { thisWeek: span(from, today), lastWeek: span(lastFrom, lastTo) };
}

/** Average per weekday (Mon..Sun) over days that have an entry. */
export function byWeekday(days: Day[], value: (d: Day) => number | null): { weekday: string; value: number | null; n: number }[] {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return names.map((name, i) => {
    const xs = days.filter((d) => d.weekday === i).map(value).filter((v): v is number => v !== null);
    return { weekday: name, value: xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10 : null, n: xs.length };
  });
}

export function topExpenses(days: Day[], from: string, limit = 10) {
  return days
    .filter((d) => d.date >= from)
    .flatMap((d) => d.expenses.map((e) => ({ ...e, date: d.date })))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/** Total spend per merchant, for "where does the money go" lists. */
export function byMerchant(days: Day[], from: string, limit = 10) {
  const totals = new Map<string, { merchant: string; category: string; amount: number; count: number }>();
  for (const d of days) {
    if (d.date < from) continue;
    for (const e of d.expenses) {
      const t = totals.get(e.merchant) ?? { merchant: e.merchant, category: e.category, amount: 0, count: 0 };
      t.amount += e.amount;
      t.count++;
      totals.set(e.merchant, t);
    }
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export function series(days: Day[], value: (d: Day) => number | null) {
  return days.map((d) => ({ date: d.date, value: value(d) }));
}

/** Trailing average over the last `window` days that have a value. */
export function rolling(points: { date: string; value: number | null }[], window: number) {
  const out: { date: string; value: number | null; avg: number | null }[] = [];
  const buf: number[] = [];
  for (const p of points) {
    if (p.value !== null) {
      buf.push(p.value);
      if (buf.length > window) buf.shift();
    }
    out.push({ ...p, avg: buf.length ? Math.round((buf.reduce((s, v) => s + v, 0) / buf.length) * 10) / 10 : null });
  }
  return out;
}
