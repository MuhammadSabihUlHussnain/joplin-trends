import { AiError, type AiProvider } from "../ai/provider";
import { type DbxFile, type DropboxApi, isConflict, isNotFound } from "../dropbox/client";
import { parseTemplate } from "../entry/template";
import { dateFromFileName, fromMarkdown, isBlank, NOTES_DIR, notePath, toMarkdown } from "../notes/format";
import { DATA_FILE } from "../settings";
import { type Entry, emptyTrendsFile, type TemplateData, type TrendsFile } from "../types";
import { mergeRecord } from "./merge";

export interface Progress {
  phase: "loading" | "listing" | "downloading" | "analyzing" | "saving" | "done";
  done: number;
  total: number;
}

export interface RefreshStats {
  changedNotes: number;
  analyzed: number;
  pending: number;
  failed: number;
  removed: number;
  entries: number;
}

export interface RefreshResult {
  file: TrendsFile;
  rev: string | null;
  stats: RefreshStats;
  warnings: string[];
}

export interface RefreshDeps {
  dropbox: DropboxApi;
  ai: AiProvider | null;
  onProgress?: (p: Progress) => void;
  downloadConcurrency?: number;
  aiConcurrency?: number;
}

export class RefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefreshError";
  }
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const run = async () => {
    while (next < items.length) await worker(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

/** Version 1 files came from the Joplin era: same entries and fixes, different bookkeeping. */
interface LegacyFile {
  version: 1;
  entries: Record<string, Entry>;
  overrides: TrendsFile["overrides"];
  categories: TrendsFile["categories"];
}

/** Reads data.json from Dropbox. Returns an empty file the first time. */
export async function loadTrendsFile(dropbox: DropboxApi): Promise<{ file: TrendsFile; rev: string | null; legacy: Entry[] }> {
  const res = await dropbox.download(DATA_FILE);
  if (!res) return { file: emptyTrendsFile(), rev: null, legacy: [] };
  let parsed: TrendsFile | LegacyFile;
  try {
    parsed = JSON.parse(res.text) as TrendsFile | LegacyFile;
  } catch {
    throw new RefreshError(`${DATA_FILE} in your Dropbox is damaged. Rename or delete it and Refresh to rebuild it.`);
  }
  if (parsed.version === 1) {
    const file = emptyTrendsFile();
    file.overrides = parsed.overrides ?? [];
    file.categories = parsed.categories ?? file.categories;
    return { file, rev: res.rev, legacy: Object.values(parsed.entries ?? {}) };
  }
  if (parsed.version !== 2) throw new RefreshError(`${DATA_FILE} was written by a newer version of this app. Reload the page.`);
  return { file: { ...emptyTrendsFile(), ...parsed }, rev: res.rev, legacy: [] };
}

/** Rebuild every entry's record from its stored template + AI result. Used after category fixes too. */
export function recomputeRecords(file: TrendsFile): void {
  for (const e of Object.values(file.entries)) {
    e.record = mergeRecord(e.date, e.template, e.ai, file.overrides, file.categories);
  }
}

function legacyToMarkdown(date: string, t: TemplateData): string {
  return toMarkdown({
    date,
    mood: t.mood,
    energy: t.energy,
    sleep: t.sleep,
    time: t.time,
    money: t.money,
    journal: t.freeText.replace(/^#{1,6}\s+(journal|notes?|diary)\s*\n?/i, ""),
  });
}

/**
 * Entries made before notes lived in this app (written in Joplin) become note files, keeping their
 * AI results so they aren't paid for twice. Blank ones are dropped. Existing notes are never overwritten.
 */
async function migrateLegacy(dropbox: DropboxApi, file: TrendsFile, legacy: Entry[]): Promise<number> {
  let moved = 0;
  const byDate = new Map<string, Entry>();
  for (const e of legacy) if (/^\d{4}-\d{2}-\d{2}$/.test(e.date)) byDate.set(e.date, byDate.get(e.date) ?? e);
  for (const [date, old] of byDate) {
    const markdown = legacyToMarkdown(date, old.template);
    if (isBlank(fromMarkdown(date, markdown))) continue;
    try {
      await dropbox.upload(notePath(date), markdown, null);
    } catch (err) {
      if (isConflict(err)) continue; // a note for that day already exists; keep it
      throw err;
    }
    const template = parseTemplate(markdown);
    file.entries[date] = {
      id: date,
      title: date,
      date,
      updatedTime: old.updatedTime,
      textHash: await sha256(markdown),
      status: old.ai ? "ok" : "pending",
      template,
      ai: old.ai,
      record: mergeRecord(date, template, old.ai, file.overrides, file.categories),
    };
    moved++;
  }
  return moved;
}

export async function refresh(deps: RefreshDeps): Promise<RefreshResult> {
  const progress = deps.onProgress ?? (() => {});
  const warnings: string[] = [];
  const stats: RefreshStats = { changedNotes: 0, analyzed: 0, pending: 0, failed: 0, removed: 0, entries: 0 };

  progress({ phase: "loading", done: 0, total: 1 });
  const loaded = await loadTrendsFile(deps.dropbox);
  const file = loaded.file;
  const touched = new Set<string>(); // dates changed in this run, for conflict merging

  if (loaded.legacy.length) {
    const moved = await migrateLegacy(deps.dropbox, file, loaded.legacy);
    for (const d of Object.keys(file.entries)) touched.add(d);
    if (moved) warnings.push(`Moved ${moved} earlier ${moved === 1 ? "entry" : "entries"} into Notes.`);
  }

  // 1. Which note files changed since the last Refresh (on this or any other device).
  progress({ phase: "listing", done: 0, total: 1 });
  const changed: DbxFile[] = [];
  const deleted = new Set<string>();
  const seen = new Set<string>();
  let fullListing = !file.notesCursor;
  let cursor: string | null = null;
  try {
    let listing = file.notesCursor ? await deps.dropbox.listFolderContinue(file.notesCursor) : await deps.dropbox.listFolder(NOTES_DIR);
    for (;;) {
      for (const e of listing.entries) {
        const date = dateFromFileName(e.name);
        if (!date) continue;
        if (e.tag === "file") {
          seen.add(date);
          if (file.notes[date]?.dbxHash !== e.contentHash) changed.push(e);
        } else if (e.tag === "deleted") deleted.add(date);
      }
      if (!listing.hasMore) break;
      listing = await deps.dropbox.listFolderContinue(listing.cursor);
    }
    cursor = listing.cursor;
  } catch (err) {
    if (file.notesCursor && err instanceof Error && /reset|cursor/i.test(err.message)) {
      // An expired cursor: start over with a full listing next time.
      file.notesCursor = null;
      return refreshAgain(deps, warnings);
    }
    if (!isNotFound(err)) throw err;
    fullListing = true; // no notes folder yet: nothing written so far
  }
  if (fullListing) for (const d of Object.keys(file.notes)) if (!seen.has(d)) deleted.add(d);
  stats.changedNotes = changed.length;

  for (const d of deleted) {
    delete file.notes[d];
    if (file.entries[d]) {
      delete file.entries[d];
      stats.removed++;
    }
  }

  // 2. Download changed notes, plus any left waiting for the AI by an earlier Refresh.
  const retry = Object.values(file.entries)
    .filter((e) => e.status === "pending" || (e.status === "no-ai" && deps.ai !== null))
    .map((e) => e.date)
    .filter((d) => file.notes[d] && !changed.some((c) => dateFromFileName(c.name) === d));
  const jobs = [
    ...changed.map((f) => ({ date: dateFromFileName(f.name)!, path: f.pathLower, hash: f.contentHash })),
    ...retry.map((date) => ({ date, path: notePath(date), hash: file.notes[date].dbxHash })),
  ];
  const texts = new Map<string, string>();
  let done = 0;
  progress({ phase: "downloading", done, total: jobs.length });
  await pool(jobs, deps.downloadConcurrency ?? 6, async (job) => {
    const res = await deps.dropbox.download(job.path);
    if (res) {
      texts.set(job.date, res.text);
      file.notes[job.date] = { dbxHash: job.hash };
    }
    progress({ phase: "downloading", done: ++done, total: jobs.length });
  });

  // 3. Build or update entries; only new or changed text goes to the AI.
  const toAnalyze: { entry: Entry; text: string }[] = [];
  for (const [date, text] of texts) {
    const textHash = await sha256(text);
    const prev = file.entries[date];
    const again = prev && (prev.status === "pending" || (prev.status === "no-ai" && deps.ai !== null));
    if (prev && prev.textHash === textHash && !again) continue;
    const template = parseTemplate(text);
    const draft = fromMarkdown(date, text);
    if (isBlank(draft)) {
      // An opened-but-empty day: nothing to count yet.
      if (prev) {
        delete file.entries[date];
        stats.removed++;
      }
      continue;
    }
    const entry: Entry = {
      id: date,
      title: date,
      date,
      updatedTime: new Date().toISOString(),
      textHash,
      status: deps.ai ? "pending" : "no-ai",
      template,
      ai: prev && prev.textHash === textHash ? prev.ai : null,
      record: mergeRecord(date, template, null, file.overrides, file.categories),
    };
    file.entries[date] = entry;
    touched.add(date);
    if (deps.ai) toAnalyze.push({ entry, text });
  }

  if (deps.ai && toAnalyze.length) {
    const ai = deps.ai;
    done = 0;
    let stop: string | null = null;
    progress({ phase: "analyzing", done, total: toAnalyze.length });
    await pool(toAnalyze, deps.aiConcurrency ?? 3, async ({ entry, text }) => {
      if (stop) return;
      try {
        entry.ai = await ai.extract({ date: entry.date, title: entry.title, text }, file.categories);
        entry.status = "ok";
        delete entry.error;
        stats.analyzed++;
      } catch (err) {
        const e = err instanceof AiError ? err : new AiError(String(err), true);
        entry.error = e.message;
        entry.status = e.retryable ? "pending" : "error";
        // A bad key or expired sign-in fails every call the same way: stop instead of repeating it.
        if (!e.retryable && /key|allowed|sign/i.test(e.message)) stop = e.message;
      }
      progress({ phase: "analyzing", done: ++done, total: toAnalyze.length });
    });
    if (stop) warnings.push(stop);
  }

  recomputeRecords(file);
  const entries = Object.values(file.entries);
  stats.entries = entries.length;
  stats.pending = entries.filter((e) => e.status === "pending").length;
  stats.failed = entries.filter((e) => e.status === "error").length;
  if (!deps.ai && entries.some((e) => e.status === "no-ai")) {
    warnings.push("No AI connected, so only the Time and Money lists are counted. Connect Claude or ChatGPT in Settings to read the journal text too.");
  }

  file.notesCursor = cursor;
  file.updatedAt = new Date().toISOString();
  progress({ phase: "saving", done: 0, total: 1 });
  const saved = await save(deps.dropbox, file, loaded.rev, touched);
  progress({ phase: "done", done: 1, total: 1 });
  return { file: saved.file, rev: saved.rev, stats, warnings };
}

async function refreshAgain(deps: RefreshDeps, warnings: string[]): Promise<RefreshResult> {
  const loaded = await loadTrendsFile(deps.dropbox);
  loaded.file.notesCursor = null;
  await save(deps.dropbox, loaded.file, loaded.rev, new Set());
  const res = await refresh(deps);
  return { ...res, warnings: [...warnings, ...res.warnings] };
}

/**
 * Writes data.json only if nobody changed it since we read it. If another device saved in the
 * meantime, keep their file, lay this run's changed entries on top, and try again.
 */
export async function save(
  dropbox: DropboxApi,
  file: TrendsFile,
  rev: string | null,
  touched: Set<string>,
): Promise<{ file: TrendsFile; rev: string | null }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await dropbox.upload(DATA_FILE, JSON.stringify(file), rev);
      return { file, rev: res.rev };
    } catch (err) {
      if (!isConflict(err)) throw err;
      const remote = await loadTrendsFile(dropbox);
      const merged = remote.file;
      for (const id of touched) {
        if (file.entries[id]) merged.entries[id] = file.entries[id];
        else delete merged.entries[id];
      }
      merged.notes = { ...merged.notes, ...file.notes };
      merged.notesCursor = file.notesCursor;
      const keys = new Set(file.overrides.map((o) => `${o.kind}:${o.match}`));
      merged.overrides = [...file.overrides, ...merged.overrides.filter((o) => !keys.has(`${o.kind}:${o.match}`))];
      merged.categories = file.categories;
      merged.updatedAt = new Date().toISOString();
      recomputeRecords(merged);
      file = merged;
      rev = remote.rev;
    }
  }
  throw new RefreshError("Another device kept saving at the same time. Refresh again.");
}
