// Apple system colors (light-mode values; they read well on dark backgrounds too).
const COLORS: Record<string, string> = {
  "Class/Study": "#007AFF",
  Work: "#FF9500",
  Research: "#AF52DE",
  Exercise: "#34C759",
  Social: "#FF2D55",
  Family: "#FF3B30",
  Entertainment: "#32ADE6",
  Commute: "#A2845E",
  Chores: "#FFCC00",
  Health: "#30B0C7",
  Sleep: "#5856D6",
  Food: "#FF9500",
  Groceries: "#34C759",
  "Transport/Gas": "#007AFF",
  Shopping: "#FF2D55",
  Subscriptions: "#AF52DE",
  Bills: "#FF3B30",
  Other: "#8E8E93",
};

const EXTRA = ["#00C7BE", "#FF9F0A", "#BF5AF2", "#64D2FF", "#FFD60A", "#AC8E68"];

export function colorFor(category: string): string {
  if (COLORS[category]) return COLORS[category];
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA[h % EXTRA.length];
}

export const fmtMoney = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: v < 100 ? 2 : 0, minimumFractionDigits: 0 })}`;
export const fmtHours = (v: number) => `${Math.round(v * 10) / 10} h`;
export const fmtNum = (v: number | null, digits = 1) => (v === null || !Number.isFinite(v) ? "–" : (Math.round(v * 10 ** digits) / 10 ** digits).toString());

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function longDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "+12%" / "−5%" against last week, or null when there's nothing to compare. */
export function change(now: number, before: number): string | null {
  if (before === 0) return now === 0 ? null : "new";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)}%`;
}
