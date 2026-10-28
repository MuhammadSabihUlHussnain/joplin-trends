import type { Activity, Entry, Expense } from "../types";
import { normalizeName } from "../sync/merge";

/** Everything known about one calendar day, with several entries on the same date combined. */
export interface Day {
  date: string;
  weekday: number; // 0 = Monday ... 6 = Sunday
  week: string; // the Monday of the date's week, YYYY-MM-DD
  mood: number | null;
  energy: number | null;
  sleep: number | null;
  sentiment: number | null;
  hours: Record<string, number>; // known durations per time category
  did: Set<string>; // time categories mentioned at all
  spend: Record<string, number>; // per money category
  totalSpend: number;
  totalHours: number;
  activities: Activity[];
  expenses: Expense[];
  activityNames: Set<string>;
  people: string[];
  places: string[];
  themes: string[];
  events: string[];
  entryIds: string[];
}

export function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}

export function weekdayOf(date: string): number {
  return (parseDate(date).getUTCDay() + 6) % 7;
}

export function weekOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

const avg = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v !== null);
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
};

export function buildDays(entries: Entry[]): Day[] {
  const byDate = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const days: Day[] = [];
  for (const [date, list] of byDate) {
    const recs = list.map((e) => e.record);
    const activities = recs.flatMap((r) => r.activities);
    const expenses = recs.flatMap((r) => r.expenses);
    const hours: Record<string, number> = {};
    const did = new Set<string>();
    for (const a of activities) {
      did.add(a.category);
      if (a.hours !== null) hours[a.category] = (hours[a.category] ?? 0) + a.hours;
    }
    const spend: Record<string, number> = {};
    for (const x of expenses) spend[x.category] = (spend[x.category] ?? 0) + x.amount;
    days.push({
      date,
      weekday: weekdayOf(date),
      week: weekOf(date),
      mood: avg(recs.map((r) => r.mood)),
      energy: avg(recs.map((r) => r.energy)),
      sleep: avg(recs.map((r) => r.sleep)),
      sentiment: avg(recs.map((r) => r.sentiment)),
      hours,
      did,
      spend,
      totalSpend: Object.values(spend).reduce((s, v) => s + v, 0),
      totalHours: Object.values(hours).reduce((s, v) => s + v, 0),
      activities,
      expenses,
      activityNames: new Set(activities.map((a) => normalizeName(a.name))),
      people: [...new Set(recs.flatMap((r) => r.people))],
      places: [...new Set(recs.flatMap((r) => r.places))],
      themes: [...new Set(recs.flatMap((r) => r.themes))],
      events: recs.flatMap((r) => r.events),
      entryIds: list.map((e) => e.id),
    });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}
