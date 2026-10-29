// Loading and saving single notes for the editor. Saves are revision-checked so two devices
// editing the same day can't silently overwrite each other.

import { type DropboxApi, isConflict, isNotFound } from "../dropbox/client";
import { dateFromFileName, emptyNote, fromMarkdown, type NoteDraft, NOTES_DIR, notePath, toMarkdown } from "./format";

export interface LoadedNote {
  draft: NoteDraft;
  rev: string | null; // null = not saved yet
  markdown: string | null;
}

export class NoteConflictError extends Error {
  constructor(readonly remote: LoadedNote) {
    super("This note was changed on another device.");
    this.name = "NoteConflictError";
  }
}

/** Dates that have a note file, newest first. */
export async function listNoteDates(dropbox: DropboxApi): Promise<string[]> {
  const dates: string[] = [];
  try {
    let listing = await dropbox.listFolder(NOTES_DIR);
    for (;;) {
      for (const e of listing.entries) {
        const d = e.tag === "file" ? dateFromFileName(e.name) : null;
        if (d) dates.push(d);
      }
      if (!listing.hasMore) break;
      listing = await dropbox.listFolderContinue(listing.cursor);
    }
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  return dates.sort().reverse();
}

export async function loadNote(dropbox: DropboxApi, date: string): Promise<LoadedNote> {
  const res = await dropbox.download(notePath(date));
  if (!res) return { draft: emptyNote(date), rev: null, markdown: null };
  return { draft: fromMarkdown(date, res.text), rev: res.rev, markdown: res.text };
}

export async function saveNote(dropbox: DropboxApi, draft: NoteDraft, rev: string | null): Promise<{ rev: string; markdown: string }> {
  const markdown = toMarkdown(draft);
  try {
    const res = await dropbox.upload(notePath(draft.date), markdown, rev);
    return { rev: res.rev, markdown };
  } catch (err) {
    if (isConflict(err)) throw new NoteConflictError(await loadNote(dropbox, draft.date));
    throw err;
  }
}

/** Overwrite whatever is in Dropbox with this version ("Keep mine" after a conflict). */
export async function forceSaveNote(dropbox: DropboxApi, draft: NoteDraft): Promise<{ rev: string; markdown: string }> {
  const current = await dropbox.download(notePath(draft.date));
  return saveNote(dropbox, draft, current?.rev ?? null);
}
