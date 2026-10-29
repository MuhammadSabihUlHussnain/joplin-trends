// Shared data model. Everything here is stored in the user's Dropbox as /Joplin Trends/data.json.

export type Source = "template" | "ai";

export interface Activity {
  name: string;
  category: string;
  /** Hours spent, or null when the entry mentions it without a duration. */
  hours: number | null;
  source: Source;
}

export interface Expense {
  amount: number;
  merchant: string;
  category: string;
  source: Source;
}

/** What one journal entry says, after the template and the AI results are merged. */
export interface DayRecord {
  date: string; // YYYY-MM-DD
  mood: number | null; // 1-10
  energy: number | null; // 1-10
  sleep: number | null; // hours
  activities: Activity[];
  expenses: Expense[];
  people: string[];
  places: string[];
  themes: string[];
  sentiment: number | null; // -1..1
  events: string[];
}

/** Numbers the user typed into the template block. These win over anything the AI infers. */
export interface TemplateData {
  date: string | null;
  mood: number | null;
  energy: number | null;
  sleep: number | null;
  time: { name: string; hours: number | null }[];
  money: { merchant: string; amount: number }[];
  /** Everything outside the template block: the free writing. */
  freeText: string;
}

/** What the AI provider returns for one entry. */
export interface Extraction {
  mood: number | null;
  energy: number | null;
  sleep_hours: number | null;
  activities: { name: string; category: string; hours: number | null }[];
  expenses: { amount: number; merchant: string; category: string }[];
  people: string[];
  places: string[];
  themes: string[];
  sentiment: number | null;
  notable_events: string[];
}

export type EntryStatus = "ok" | "pending" | "error" | "no-ai";

export interface Entry {
  id: string; // the note's date, YYYY-MM-DD
  title: string;
  date: string;
  updatedTime: string;
  /** Hash of title + body; the AI only runs again when this changes. */
  textHash: string;
  status: EntryStatus;
  error?: string;
  template: TemplateData;
  ai: Extraction | null;
  record: DayRecord;
}

/** Re-categorize every activity or expense whose normalized name matches, in every entry. */
export interface Override {
  kind: "activity" | "expense";
  match: string;
  category: string;
}

/** What we remember about each note file so unchanged notes are never downloaded twice. */
export interface NoteMeta {
  dbxHash: string; // Dropbox content_hash
}

export interface Categories {
  time: string[];
  money: string[];
}

export interface TrendsFile {
  version: 2;
  /** Dropbox listing cursor for the notes folder, so each Refresh only sees what changed. */
  notesCursor: string | null;
  notes: Record<string, NoteMeta>; // by date
  entries: Record<string, Entry>; // by date
  overrides: Override[];
  categories: Categories;
  updatedAt: string;
}

export const DEFAULT_CATEGORIES: Categories = {
  time: [
    "Class/Study",
    "Work",
    "Research",
    "Exercise",
    "Social",
    "Family",
    "Entertainment",
    "Commute",
    "Chores",
    "Health",
    "Sleep",
    "Other",
  ],
  money: [
    "Food",
    "Groceries",
    "Transport/Gas",
    "Shopping",
    "Subscriptions",
    "Bills",
    "Entertainment",
    "Health",
    "Other",
  ],
};

export function emptyTrendsFile(): TrendsFile {
  return {
    version: 2,
    notesCursor: null,
    notes: {},
    entries: {},
    overrides: [],
    categories: structuredClone(DEFAULT_CATEGORIES),
    updatedAt: new Date(0).toISOString(),
  };
}
