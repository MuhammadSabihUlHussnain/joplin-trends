import type { TemplateData } from "../types";

// The daily entry template. Users paste this into a Joplin note titled YYYY-MM-DD.
export const ENTRY_TEMPLATE = `---
mood:
energy:
sleep:
---
## Time
- class 3h
## Money
- $12 chipotle
## Journal
`;

const HOURS = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i;
const MINUTES = /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i;
const CLOCK = /\b(\d{1,2}):([0-5]\d)\b/;

/** "3h", "1.5 hours", "90 min", "1h 30m", "1:30" -> hours. null when the line has no duration. */
export function parseDuration(text: string): { hours: number | null; rest: string } {
  let rest = text;
  let hours = 0;
  let found = false;
  const clock = CLOCK.exec(rest);
  if (clock) {
    hours += Number(clock[1]) + Number(clock[2]) / 60;
    rest = rest.replace(clock[0], " ");
    found = true;
  }
  const h = HOURS.exec(rest);
  if (h) {
    hours += Number(h[1]);
    rest = rest.replace(h[0], " ");
    found = true;
  }
  const m = MINUTES.exec(rest);
  if (m) {
    hours += Number(m[1]) / 60;
    rest = rest.replace(m[0], " ");
    found = true;
  }
  return { hours: found ? Math.round(hours * 100) / 100 : null, rest: cleanName(rest) };
}

const DOLLAR_PREFIX = /\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/;
const DOLLAR_SUFFIX = /(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:\$|dollars?|bucks|usd)\b/i;
const BARE_NUMBER = /(?:^|\s)(\d+(?:,\d{3})*(?:\.\d{1,2})?)(?=\s|$)/;

/** "$12 chipotle", "chipotle $12", "12 dollars gas", "45 gas" -> amount + merchant. */
export function parseMoney(text: string): { amount: number; merchant: string } | null {
  for (const re of [DOLLAR_PREFIX, DOLLAR_SUFFIX, BARE_NUMBER]) {
    const m = re.exec(text);
    if (m) {
      const amount = Number(m[1].replace(/,/g, ""));
      return { amount, merchant: cleanName(text.replace(m[0], " ")) };
    }
  }
  return null;
}

function cleanName(text: string): string {
  return text
    .replace(/\s+(on|at|for)\s*$/i, "")
    .replace(/^[\s\-–:,.;]+|[\s\-–:,.;]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseScore(value: string | undefined): number | null {
  if (!value) return null;
  const m = /(-?\d+(?:\.\d+)?)/.exec(value);
  return m ? Number(m[1]) : null;
}

type Section = "time" | "money" | "other";

function sectionFor(heading: string): Section {
  const h = heading.toLowerCase();
  if (/\b(time|hours|activities|activity)\b/.test(h)) return "time";
  if (/\b(money|spending|spent|expenses?|purchases?)\b/.test(h)) return "money";
  return "other";
}

const LIST_ITEM = /^\s*[-*+]\s+(.*)$/;

export function parseTemplate(body: string): TemplateData {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const fields: Record<string, string> = {};
  let start = 0;

  // Front matter: the first non-empty line is "---", then key: value lines until the next "---".
  let first = 0;
  while (first < lines.length && lines[first].trim() === "") first++;
  if (lines[first]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > first && l.trim() === "---");
    if (end > first) {
      for (const line of lines.slice(first + 1, end)) {
        const m = /^\s*([A-Za-z_ ]+?)\s*:\s*(.*)$/.exec(line);
        if (m) fields[m[1].toLowerCase()] = m[2].trim();
      }
      start = end + 1;
    }
  }

  const time: TemplateData["time"] = [];
  const money: TemplateData["money"] = [];
  const free: string[] = [];
  let section: Section = "other";

  for (const line of lines.slice(start)) {
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      section = sectionFor(heading[1]);
      if (section === "other") free.push(line);
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (section === "time" && item) {
      const { hours, rest } = parseDuration(item[1]);
      if (rest) time.push({ name: rest, hours });
      continue;
    }
    if (section === "money" && item) {
      const parsed = parseMoney(item[1]);
      if (parsed && parsed.amount > 0) money.push({ merchant: parsed.merchant || "unknown", amount: parsed.amount });
      continue;
    }
    if (section === "other") free.push(line);
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(fields.date ?? "") ? fields.date : null;
  return {
    date,
    mood: parseScore(fields.mood),
    energy: parseScore(fields.energy),
    sleep: parseScore(fields.sleep),
    time,
    money,
    freeText: free.join("\n").trim(),
  };
}

/** Entry date: a YYYY-MM-DD title, else the template's date field, else the note's creation day. */
export function entryDate(title: string, template: TemplateData, createdIso: string | null): string | null {
  const t = /(\d{4}-\d{2}-\d{2})/.exec(title);
  if (t) return t[1];
  if (template.date) return template.date;
  if (!createdIso) return null;
  return localDate(new Date(createdIso));
}

/** YYYY-MM-DD in the browser's timezone. */
export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
