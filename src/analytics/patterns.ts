import type { Categories } from "../types";
import { addDays, type Day, daysBetween, weekOf } from "./days";
import { benjaminiHochberg, mean, median, spearman } from "./stats";

export type PatternKind = "correlation" | "recurrence" | "anomaly" | "streak" | "people" | "theme";

export interface Pattern {
  id: string;
  kind: PatternKind;
  title: string;
  detail: string;
  /** 0..1, used to rank patterns on the Overview. */
  strength: number;
  n: number;
}

export interface PatternReport {
  patterns: Pattern[];
  /** Days with a mood value still needed before correlations are checked at all. */
  daysNeeded: number;
}

export const MIN_DAYS = 14;
const MIN_R = 0.3;
// False discovery rate across all the pairs checked at once. Planted effects in the tests clear it by orders
// of magnitude, while chance correlations in 60 days of noise don't.
const FDR = 0.01;

const round1 = (v: number) => Math.round(v * 10) / 10;
const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
const WEEKDAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

function shortDate(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
}

interface Candidate {
  id: string;
  x: number[];
  y: number[];
  describe: (r: number) => { title: string; detail: string };
}

function correlationCandidates(days: Day[], categories: Categories): Candidate[] {
  const out: Candidate[] = [];
  const withMood = days.filter((d) => d.mood !== null);
  const withEnergy = days.filter((d) => d.energy !== null);

  const binaryEffect = (pool: Day[], has: (d: Day) => boolean, value: (d: Day) => number, label: string, what: string, id: string) => {
    const yes = pool.filter(has).map(value);
    const no = pool.filter((d) => !has(d)).map(value);
    if (yes.length < 5 || no.length < 5) return;
    out.push({
      id,
      x: pool.map((d) => (has(d) ? 1 : 0)),
      y: pool.map(value),
      describe: (r) => ({
        title: `${what} is ${r > 0 ? "higher" : "lower"} on days with ${label}`,
        detail: `${round1(mean(yes))} on ${yes.length} days with ${label}, ${round1(mean(no))} on ${no.length} days without.`,
      }),
    });
  };

  for (const c of categories.time) {
    if (c === "Sleep") continue;
    binaryEffect(withMood, (d) => d.did.has(c), (d) => d.mood!, c.toLowerCase(), "Mood", `mood~${c}`);
    binaryEffect(withEnergy, (d) => d.did.has(c), (d) => d.energy!, c.toLowerCase(), "Energy", `energy~${c}`);
  }

  const slept = withMood.filter((d) => d.sleep !== null);
  if (slept.length >= MIN_DAYS) {
    out.push({
      id: "mood~sleep",
      x: slept.map((d) => d.sleep!),
      y: slept.map((d) => d.mood!),
      describe: (r) => {
        const cut = median(slept.map((d) => d.sleep!));
        const more = slept.filter((d) => d.sleep! > cut).map((d) => d.mood!);
        const less = slept.filter((d) => d.sleep! <= cut).map((d) => d.mood!);
        return {
          title: r > 0 ? "More sleep, better mood" : "More sleep, lower mood",
          detail: `Mood averages ${round1(mean(more))} after nights over ${round1(cut)} h of sleep and ${round1(mean(less))} after shorter nights.`,
        };
      },
    });
  }

  binaryEffect(
    withMood,
    (d) => d.totalSpend > median(withMood.map((x) => x.totalSpend)),
    (d) => d.mood!,
    "above-usual spending",
    "Mood",
    "mood~spend",
  );
  for (const c of categories.money) {
    binaryEffect(withMood, (d) => (d.spend[c] ?? 0) > 0, (d) => d.mood!, `${c.toLowerCase()} spending`, "Mood", `mood~$${c}`);
  }
  return out;
}

function correlations(days: Day[], categories: Categories): Pattern[] {
  const cands = correlationCandidates(days, categories)
    .map((c) => ({ c, s: spearman(c.x, c.y) }))
    .filter(({ c, s }) => Number.isFinite(s.r) && c.x.length >= MIN_DAYS);
  const keep = benjaminiHochberg(cands.map(({ s }) => s.p), FDR);
  return cands
    .filter(({ s }, i) => keep[i] && Math.abs(s.r) >= MIN_R)
    .map(({ c, s }) => {
      const { title, detail } = c.describe(s.r);
      return {
        id: c.id,
        kind: "correlation" as const,
        title,
        detail: `${detail} (r = ${s.r.toFixed(2)}, ${s.n} days)`,
        strength: Math.min(1, Math.abs(s.r)),
        n: s.n,
      };
    });
}

function recurrences(days: Day[]): Pattern[] {
  const occurrences = new Map<string, string[]>();
  for (const d of days) for (const name of d.activityNames) occurrences.set(name, [...(occurrences.get(name) ?? []), d.date]);
  const out: Pattern[] = [];
  for (const [name, dates] of occurrences) {
    if (dates.length < 4 || new Set(dates.map(weekOf)).size < 3) continue;
    const counts = new Array(7).fill(0);
    for (const date of dates) counts[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]++;
    const top = counts.indexOf(Math.max(...counts));
    const share = counts[top] / dates.length;
    if (counts[top] >= 3 && share >= 0.6) {
      out.push({
        id: `weekday~${name}`,
        kind: "recurrence",
        title: `${capitalize(name)} usually happens on ${WEEKDAYS[top]}`,
        detail: `${counts[top]} of ${dates.length} times were on a ${WEEKDAYS[top].slice(0, -1)}.`,
        strength: 0.4 + 0.4 * share,
        n: dates.length,
      });
      continue;
    }
    const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
    const g = median(gaps);
    const spread = median(gaps.map((x) => Math.abs(x - g)));
    // Every 1-2 days is just "most days"; only longer rhythms are worth pointing out.
    if (dates.length >= 5 && g >= 3 && g <= 14 && spread <= 1) {
      out.push({
        id: `interval~${name}`,
        kind: "recurrence",
        title: `${capitalize(name)} comes around every ${g} days`,
        detail: `${dates.length} times since ${shortDate(dates[0])}, usually ${g} days apart.`,
        strength: 0.5,
        n: dates.length,
      });
    }
  }
  return out;
}

function anomalies(days: Day[], categories: Categories, today: string): Pattern[] {
  const out: Pattern[] = [];
  const weeksWithData = [...new Set(days.map((d) => d.week))].sort();
  const totals = (week: string, pick: (d: Day) => number) => days.filter((d) => d.week === week).reduce((s, d) => s + pick(d), 0);
  const recent = weeksWithData.filter((w) => w >= addDays(weekOf(today), -7 * 8));
  const check = (label: string, unit: "money" | "hours", pick: (d: Day) => number, minDiff: number, idPrefix: string) => {
    for (const w of recent) {
      const prior = weeksWithData.filter((p) => p < w).slice(-8);
      if (prior.length < 4) continue;
      const history = prior.map((p) => totals(p, pick));
      const base = median(history);
      const value = totals(w, pick);
      // Also require the week to sit well outside the usual week-to-week swing (robust z-score on the
      // median absolute deviation), so an ordinary busy week isn't reported as a jump.
      const spread = Math.max(1.4826 * median(history.map((h) => Math.abs(h - base))), 0.25 * base, minDiff / 2);
      if (base > 0 && value > 1.5 * base && value - base >= minDiff && (value - base) / spread >= 3) {
        const fmt = unit === "money" ? money : (v: number) => `${round1(v)} h`;
        out.push({
          id: `${idPrefix}~${w}`,
          kind: "anomaly",
          title: `${label} jumped the week of ${shortDate(w)}`,
          detail: `${fmt(value)} against a usual ${fmt(base)} a week (${round1(value / base)}x).`,
          strength: Math.min(1, 0.4 + (value / base - 1.5) / 3),
          n: prior.length + 1,
        });
      }
    }
  };
  for (const c of categories.money) check(`${c} spending`, "money", (d) => d.spend[c] ?? 0, 20, `spend~${c}`);
  for (const c of categories.time) check(`Time on ${c.toLowerCase()}`, "hours", (d) => d.hours[c] ?? 0, 3, `hours~${c}`);
  return out;
}

function streaks(days: Day[], categories: Categories, today: string): Pattern[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: Pattern[] = [];
  for (const c of categories.time) {
    if (c === "Sleep" || c === "Other") continue;
    let longest = { len: 0, end: "" };
    let run = 0;
    let prev = "";
    for (const d of days) {
      if (!d.did.has(c)) {
        run = 0;
        continue;
      }
      run = prev && daysBetween(prev, d.date) === 1 && run > 0 ? run + 1 : 1;
      prev = d.date;
      if (run > longest.len) longest = { len: run, end: d.date };
    }
    let current = 0;
    for (let date = byDate.get(today)?.did.has(c) ? today : addDays(today, -1); byDate.get(date)?.did.has(c); date = addDays(date, -1)) current++;
    if (current >= 3) {
      out.push({
        id: `streak~${c}`,
        kind: "streak",
        title: `${current}-day ${c.toLowerCase()} streak going`,
        detail: `Your longest ${c.toLowerCase()} streak is ${longest.len} days.`,
        strength: Math.min(1, 0.4 + current / 20),
        n: current,
      });
    } else if (longest.len >= 4) {
      out.push({
        id: `streak~${c}`,
        kind: "streak",
        title: `Longest ${c.toLowerCase()} streak: ${longest.len} days`,
        detail: `It ended ${shortDate(longest.end)}.`,
        strength: 0.3,
        n: longest.len,
      });
    }
  }
  return out;
}

function mentions(days: Day[]): Pattern[] {
  const withMood = days.filter((d) => d.mood !== null);
  if (withMood.length < MIN_DAYS) return [];
  const base = mean(withMood.map((d) => d.mood!));
  const out: Pattern[] = [];
  const check = (kind: "people" | "theme", label: string, has: (d: Day) => boolean, id: string, word: string) => {
    const on = withMood.filter(has).map((d) => d.mood!);
    if (on.length < 3) return;
    const diff = mean(on) - base;
    if (Math.abs(diff) < 1) return;
    out.push({
      id,
      kind,
      title: `Mood runs ${diff > 0 ? "higher" : "lower"} on days ${word} ${label}`,
      detail: `${round1(mean(on))} on ${on.length} days against your usual ${round1(base)}.`,
      strength: Math.min(1, 0.3 + Math.abs(diff) / 4),
      n: on.length,
    });
  };
  const people = new Set(days.flatMap((d) => d.people));
  for (const p of people) check("people", p, (d) => d.people.includes(p), `person~${p}`, "you mention");
  const places = new Set(days.flatMap((d) => d.places));
  for (const p of places) check("people", p, (d) => d.places.includes(p), `place~${p}`, "at");
  const themes = new Set(days.flatMap((d) => d.themes));
  for (const t of themes) check("theme", `"${t}"`, (d) => d.themes.includes(t), `theme-mood~${t}`, "about");

  for (const t of themes) {
    const n = days.filter((d) => d.themes.includes(t)).length;
    if (n >= 4 && n / days.length >= 0.25) {
      out.push({
        id: `theme~${t}`,
        kind: "theme",
        title: `Recurring theme: ${t}`,
        detail: `Comes up in ${n} of ${days.length} entries.`,
        strength: Math.min(0.8, n / days.length),
        n,
      });
    }
  }
  return out;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function findPatterns(days: Day[], categories: Categories, today: string): PatternReport {
  const moodDays = days.filter((d) => d.mood !== null).length;
  const patterns = [
    ...(moodDays >= MIN_DAYS ? correlations(days, categories) : []),
    ...recurrences(days),
    ...anomalies(days, categories, today),
    ...streaks(days, categories, today),
    ...mentions(days),
  ].sort((a, b) => b.strength - a.strength);
  return { patterns, daysNeeded: Math.max(0, MIN_DAYS - moodDays) };
}
