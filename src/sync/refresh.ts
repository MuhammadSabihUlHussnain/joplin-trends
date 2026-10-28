import { AiError, type AiProvider } from "../ai/provider";
import { type DbxFile, type DropboxApi, isConflict, isNotFound } from "../dropbox/client";
import { entryDate, parseTemplate } from "../entry/template";
import { idFromFileName, isItemFileName, ItemType, type JoplinItem, parseJoplinItem } from "../joplin/parseItem";
import { DATA_FILE } from "../settings";
import { type Entry, emptyTrendsFile, type TrendsFile } from "../types";
import { mergeRecord } from "./merge";

export interface Progress {
  phase: "loading" | "listing" | "downloading" | "analyzing" | "saving" | "done";
  done: number;
  total: number;
}

export interface RefreshStats {
  changedFiles: number;
  downloaded: number;
  analyzed: number;
  pending: number;
  failed: number;
  removed: number;
  journalEntries: number;
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
  joplinPath: string;
  notebookName: string;
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

/** Reads data.json from Dropbox. Returns an empty file the first time. */
export async function loadTrendsFile(dropbox: DropboxApi): Promise<{ file: TrendsFile; rev: string | null }> {
  const res = await dropbox.download(DATA_FILE);
  if (!res) return { file: emptyTrendsFile(), rev: null };
  try {
    const parsed = JSON.parse(res.text) as TrendsFile;
    if (parsed.version !== 1) throw new Error("unknown version");
    return { file: { ...emptyTrendsFile(), ...parsed }, rev: res.rev };
  } catch {
    throw new RefreshError(`${DATA_FILE} in your Dropbox is damaged. Rename or delete it and Refresh to rebuild it.`);
  }
}

/** Rebuild every entry's record from its stored template + AI result. Used after category fixes too. */
export function recomputeRecords(file: TrendsFile): void {
  for (const e of Object.values(file.entries)) {
    e.record = mergeRecord(e.date, e.template, e.ai, file.overrides, file.categories);
  }
}

export async function refresh(deps: RefreshDeps): Promise<RefreshResult> {
  const progress = deps.onProgress ?? (() => {});
  const warnings: string[] = [];
  const stats: RefreshStats = { changedFiles: 0, downloaded: 0, analyzed: 0, pending: 0, failed: 0, removed: 0, journalEntries: 0 };
  const root = deps.joplinPath.replace(/\/+$/, "");

  progress({ phase: "loading", done: 0, total: 1 });
  const loaded = await loadTrendsFile(deps.dropbox);
  const file = loaded.file;
  const touched = new Set<string>(); // entry ids changed in this run, for conflict merging

  // 1. What changed in Joplin's folder since the last Refresh.
  progress({ phase: "listing", done: 0, total: 1 });
  const changed: DbxFile[] = [];
  const deleted = new Set<string>();
  const seen = new Set<string>();
  if (file.cursorPath && file.cursorPath.toLowerCase() !== root.toLowerCase()) {
    // The Joplin folder changed in Settings: everything known about the old folder is stale.
    file.cursor = null;
    file.items = {};
    file.entries = {};
    file.journalFolderId = null;
  }
  let fullListing = !file.cursor;
  let listing;
  try {
    listing = file.cursor ? await deps.dropbox.listFolderContinue(file.cursor) : await deps.dropbox.listFolder(root);
  } catch (err) {
    if (file.cursor && err instanceof Error && /reset|cursor/i.test(err.message)) {
      fullListing = true;
      listing = await deps.dropbox.listFolder(root);
    } else if (isNotFound(err)) {
      throw new RefreshError(`There's no Joplin folder at ${root} in your Dropbox. Check Joplin's sync target, or fix the path in Settings.`);
    } else throw err;
  }
  for (;;) {
    for (const e of listing.entries) {
      if (!isItemFileName(e.name)) continue;
      const id = idFromFileName(e.name);
      if (e.tag === "file") {
        seen.add(id);
        if (file.items[id]?.dbxHash !== e.contentHash) changed.push(e);
      } else if (e.tag === "deleted") deleted.add(id);
    }
    if (!listing.hasMore) break;
    listing = await deps.dropbox.listFolderContinue(listing.cursor);
  }
  const cursor = listing.cursor;
  if (fullListing) for (const id of Object.keys(file.items)) if (!seen.has(id)) deleted.add(id);
  stats.changedFiles = changed.length;

  // 2. Download changed items and remember their type, notebook and title (titles for notebooks only).
  const notes = new Map<string, JoplinItem>();
  let encrypted = 0;
  const fetchItem = async (path: string, dbxHash: string | null) => {
    const res = await deps.dropbox.download(path);
    stats.downloaded++;
    if (!res) return;
    let item: JoplinItem;
    try {
      item = parseJoplinItem(res.text);
    } catch {
      return; // not a note or notebook (Joplin also syncs tags, resources' metadata, etc.)
    }
    if (item.encrypted) {
      encrypted++;
      return;
    }
    const prev = file.items[item.id];
    file.items[item.id] = {
      type: item.type,
      parentId: item.parentId,
      dbxHash: dbxHash ?? prev?.dbxHash ?? "",
      ...(item.type === ItemType.Folder ? { title: item.title } : {}),
    };
    if (item.type === ItemType.Note) notes.set(item.id, item);
  };

  let done = 0;
  const downloadTotal = () => changed.length;
  progress({ phase: "downloading", done, total: downloadTotal() });
  await pool(changed, deps.downloadConcurrency ?? 6, async (f) => {
    await fetchItem(f.pathLower, f.contentHash);
    progress({ phase: "downloading", done: ++done, total: downloadTotal() });
  });
  if (encrypted) {
    warnings.push(`${encrypted} Joplin item(s) are end-to-end encrypted and can't be read. Turn off encryption in Joplin's settings to include them.`);
  }

  for (const id of deleted) {
    delete file.items[id];
    if (file.entries[id]) {
      delete file.entries[id];
      stats.removed++;
    }
  }

  // 3. Find the journal notebook.
  const wanted = deps.notebookName.trim().toLowerCase();
  const journal = Object.entries(file.items).find(([, m]) => m.type === ItemType.Folder && m.title?.trim().toLowerCase() === wanted);
  if (!journal) {
    file.cursor = cursor;
    file.cursorPath = root;
    file.updatedAt = new Date().toISOString();
    warnings.push(`No notebook named "${deps.notebookName}" in Joplin yet. Create it (or change the name in Settings) and Refresh.`);
    const saved = await save(deps.dropbox, file, loaded.rev, touched);
    return { file: saved.file, rev: saved.rev, stats, warnings };
  }
  const journalId = journal[0];
  file.journalFolderId = journalId;

  // Entries that left the notebook (moved or the notebook was swapped) are dropped.
  for (const id of Object.keys(file.entries)) {
    if (file.items[id]?.parentId !== journalId) {
      delete file.entries[id];
      stats.removed++;
    }
  }

  // Journal notes not downloaded this run but still needing work: new to the notebook (e.g. the
  // notebook was just renamed to match), or left pending / without AI by an earlier Refresh.
  const needsText = Object.entries(file.items)
    .filter(([id, m]) => m.type === ItemType.Note && m.parentId === journalId && !notes.has(id))
    .filter(([id]) => {
      const e = file.entries[id];
      return !e || e.status === "pending" || (e.status === "no-ai" && deps.ai !== null);
    })
    .map(([id]) => id);
  if (needsText.length) {
    done = 0;
    progress({ phase: "downloading", done, total: needsText.length });
    await pool(needsText, deps.downloadConcurrency ?? 6, async (id) => {
      await fetchItem(`${root}/${id}.md`.toLowerCase(), null);
      progress({ phase: "downloading", done: ++done, total: needsText.length });
    });
  }

  // 4. Build or update journal entries; only new or changed text goes to the AI.
  const toAnalyze: { entry: Entry; text: string }[] = [];
  for (const note of notes.values()) {
    if (note.parentId !== journalId) continue;
    if (note.isConflict) {
      if (file.entries[note.id]) {
        delete file.entries[note.id];
        stats.removed++;
      }
      continue;
    }
    const template = parseTemplate(note.body);
    const date = entryDate(note.title, template, note.userCreatedTime ?? note.createdTime);
    if (!date) continue;
    const textHash = await sha256(`${note.title}\n${note.body}`);
    const prev = file.entries[note.id];
    const retry = prev && (prev.status === "pending" || (prev.status === "no-ai" && deps.ai !== null));
    if (prev && prev.textHash === textHash && !retry) {
      if (prev.date !== date || prev.title !== note.title) {
        prev.date = date;
        prev.title = note.title;
        touched.add(note.id);
      }
      continue;
    }
    const entry: Entry = {
      id: note.id,
      title: note.title,
      date,
      updatedTime: note.updatedTime ?? new Date().toISOString(),
      textHash,
      status: deps.ai ? "pending" : "no-ai",
      template,
      ai: prev && prev.textHash === textHash ? prev.ai : null,
      record: mergeRecord(date, template, null, file.overrides, file.categories),
    };
    file.entries[note.id] = entry;
    touched.add(note.id);
    if (deps.ai) toAnalyze.push({ entry, text: note.body });
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
        // A bad key fails every call the same way: stop instead of repeating it for each entry.
        if (!e.retryable && /key|allowed/i.test(e.message)) stop = e.message;
      }
      progress({ phase: "analyzing", done: ++done, total: toAnalyze.length });
    });
    if (stop) warnings.push(stop);
  }

  recomputeRecords(file);
  const entries = Object.values(file.entries);
  stats.journalEntries = entries.length;
  stats.pending = entries.filter((e) => e.status === "pending").length;
  stats.failed = entries.filter((e) => e.status === "error").length;
  if (!deps.ai && entries.some((e) => e.status === "no-ai")) {
    warnings.push("No AI key set, so only the template lists are counted. Add a Claude key in Settings to read the free writing too.");
  }

  file.cursor = cursor;
  file.cursorPath = root;
  file.updatedAt = new Date().toISOString();
  progress({ phase: "saving", done: 0, total: 1 });
  const saved = await save(deps.dropbox, file, loaded.rev, touched);
  progress({ phase: "done", done: 1, total: 1 });
  return { file: saved.file, rev: saved.rev, stats, warnings };
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
      }
      merged.items = { ...merged.items, ...file.items };
      merged.cursor = file.cursor;
      merged.cursorPath = file.cursorPath;
      merged.journalFolderId = file.journalFolderId;
      const keys = new Set(file.overrides.map((o) => `${o.kind}:${o.match}`));
      merged.overrides = [...file.overrides, ...merged.overrides.filter((o) => !keys.has(`${o.kind}:${o.match}`))];
      merged.updatedAt = new Date().toISOString();
      recomputeRecords(merged);
      file = merged;
      rev = remote.rev;
    }
  }
  throw new RefreshError("Another device kept saving at the same time. Refresh again.");
}
