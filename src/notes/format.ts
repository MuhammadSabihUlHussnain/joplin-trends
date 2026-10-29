// A daily note as the editor sees it, and the Markdown file it is saved as in Dropbox.
// The file is plain Markdown in the template's shape, so it stays readable outside the app.

import { parseDuration, parseTemplate } from "../entry/template";
import { DATA_ROOT } from "../settings";

export const NOTES_DIR = `${DATA_ROOT}/notes`;
const NOTE_FILE = /^(\d{4}-\d{2}-\d{2})\.md$/i;

export interface TimeRow {
  name: string;
  hours: number | null;
}

export interface MoneyRow {
  merchant: string;
  amount: number | null;
}

export interface NoteDraft {
  date: string;
  mood: number | null;
  energy: number | null;
  sleep: number | null;
  time: TimeRow[];
  money: MoneyRow[];
  journal: string;
}

export function notePath(date: string): string {
  return `${NOTES_DIR}/${date}.md`;
}

/** "2026-10-28.md" -> "2026-10-28"; anything else -> null. */
export function dateFromFileName(name: string): string | null {
  return NOTE_FILE.exec(name)?.[1] ?? null;
}

export function emptyNote(date: string): NoteDraft {
  return { date, mood: null, energy: null, sleep: null, time: [], money: [], journal: "" };
}

/** 1.25 -> "1h 15m", 3 -> "3h", 0.5 -> "30m". */
export function formatDuration(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours) || hours <= 0) return "";
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

export function parseHours(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  return parseDuration(t).hours;
}

const num = (v: number | null) => (v === null ? "" : String(Math.round(v * 100) / 100));

export function toMarkdown(note: NoteDraft): string {
  const time = note.time
    .filter((r) => r.name.trim())
    .map((r) => `- ${r.name.trim()}${r.hours ? ` ${formatDuration(r.hours)}` : ""}`);
  const money = note.money
    .filter((r) => r.merchant.trim() || r.amount)
    .map((r) => `- ${r.amount ? `$${num(r.amount)} ` : ""}${r.merchant.trim()}`.trimEnd());
  return [
    "---",
    `mood: ${num(note.mood)}`,
    `energy: ${num(note.energy)}`,
    `sleep: ${num(note.sleep)}`,
    "---",
    "## Time",
    ...time,
    "",
    "## Money",
    ...money,
    "",
    "## Journal",
    note.journal.trim(),
    "",
  ].join("\n");
}

export function fromMarkdown(date: string, markdown: string): NoteDraft {
  const t = parseTemplate(markdown);
  return {
    date,
    mood: t.mood,
    energy: t.energy,
    sleep: t.sleep,
    time: t.time.map((r) => ({ name: r.name, hours: r.hours })),
    money: t.money.map((r) => ({ merchant: r.merchant, amount: r.amount })),
    journal: t.freeText,
  };
}

/** True when nothing has been written into the note yet. */
export function isBlank(note: NoteDraft): boolean {
  return note.mood === null && note.energy === null && note.sleep === null && !note.time.some((r) => r.name.trim()) && !note.money.some((r) => r.merchant.trim() || r.amount) && !note.journal.trim();
}
