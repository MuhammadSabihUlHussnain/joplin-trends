const COLORS: Record<string, string> = {
  "Class/Study": "#4f7cff",
  Work: "#f2a33a",
  Research: "#9b6cf0",
  Exercise: "#2fb27a",
  Social: "#ef6f9a",
  Family: "#e05a4f",
  Entertainment: "#46b5d1",
  Commute: "#a1887f",
  Chores: "#8aa04a",
  Health: "#22a6a0",
  Sleep: "#6b7fa8",
  Food: "#f2a33a",
  Groceries: "#2fb27a",
  "Transport/Gas": "#4f7cff",
  Shopping: "#ef6f9a",
  Subscriptions: "#9b6cf0",
  Bills: "#e05a4f",
  Other: "#9aa0a6",
};

const EXTRA = ["#d4a017", "#5c9ead", "#c06c84", "#6c9a3c", "#8e7cc3", "#e07b39"];

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
