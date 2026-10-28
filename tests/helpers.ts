import type { DbxEntry, DbxListing, DropboxApi } from "../src/dropbox/client";
import { DropboxError } from "../src/dropbox/client";

/** Builds a raw Joplin sync item exactly as Joplin serializes it. */
export function joplinNote(opts: {
  id: string;
  parentId: string;
  title: string;
  body: string;
  updated?: string;
  created?: string;
  conflict?: boolean;
  encrypted?: boolean;
}): string {
  const created = opts.created ?? "2026-10-20T14:00:00.000Z";
  return [
    opts.title,
    "",
    opts.body,
    "",
    `id: ${opts.id}`,
    `parent_id: ${opts.parentId}`,
    `created_time: ${created}`,
    `updated_time: ${opts.updated ?? created}`,
    `is_conflict: ${opts.conflict ? 1 : 0}`,
    "latitude: 0.00000000",
    "longitude: 0.00000000",
    "altitude: 0.0000",
    "author: ",
    "source_url: ",
    "is_todo: 0",
    "todo_due: 0",
    "todo_completed: 0",
    "source: joplin-desktop",
    "source_application: net.cozic.joplin-desktop",
    "application_data: ",
    "order: 0",
    `user_created_time: ${created}`,
    `user_updated_time: ${opts.updated ?? created}`,
    `encryption_cipher_text: ${opts.encrypted ? "JED01000022..." : ""}`,
    `encryption_applied: ${opts.encrypted ? 1 : 0}`,
    "markup_language: 1",
    "is_shared: 0",
    "share_id: ",
    "conflict_original_id: ",
    "master_key_id: ",
    "user_data: ",
    "deleted_time: 0",
    "type_: 1",
  ].join("\n");
}

export function joplinFolder(id: string, title: string): string {
  return [
    title,
    "",
    `id: ${id}`,
    "created_time: 2026-10-01T10:00:00.000Z",
    "updated_time: 2026-10-01T10:00:00.000Z",
    "user_created_time: 2026-10-01T10:00:00.000Z",
    "user_updated_time: 2026-10-01T10:00:00.000Z",
    "encryption_cipher_text: ",
    "encryption_applied: 0",
    "parent_id: ",
    "is_shared: 0",
    "share_id: ",
    "master_key_id: ",
    "icon: ",
    "user_data: ",
    "deleted_time: 0",
    "type_: 2",
  ].join("\n");
}

/** An in-memory Dropbox with cursors and revision checks, enough to exercise the refresh pipeline. */
export class FakeDropbox implements DropboxApi {
  files = new Map<string, { text: string; rev: number }>();
  private log: { path: string; deleted: boolean }[] = [];
  private revCounter = 0;
  downloads: string[] = [];

  put(path: string, text: string) {
    const p = path.toLowerCase();
    this.files.set(p, { text, rev: ++this.revCounter });
    this.log.push({ path: p, deleted: false });
  }

  remove(path: string) {
    const p = path.toLowerCase();
    this.files.delete(p);
    this.log.push({ path: p, deleted: true });
  }

  private hash(text: string) {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return `h${h}`;
  }

  private entriesFor(folder: string, since: number): DbxEntry[] {
    const f = folder.toLowerCase().replace(/\/+$/, "");
    const latest = new Map<string, boolean>();
    for (const e of this.log.slice(since)) if (e.path.startsWith(`${f}/`) && !e.path.slice(f.length + 1).includes("/")) latest.set(e.path, e.deleted);
    const out: DbxEntry[] = [];
    for (const [path, wasDeleted] of latest) {
      const name = path.slice(f.length + 1);
      const file = this.files.get(path);
      if (wasDeleted || !file) {
        if (since > 0) out.push({ tag: "deleted", name, pathLower: path });
      } else out.push({ tag: "file", name, pathLower: path, rev: String(file.rev), contentHash: this.hash(file.text) });
    }
    return out;
  }

  async listFolder(path: string): Promise<DbxListing> {
    const f = path.toLowerCase();
    if (![...this.files.keys()].some((k) => k.startsWith(`${f}/`))) throw new DropboxError("not found", 409, "path/not_found/");
    return { entries: this.entriesFor(path, 0), cursor: `${f}|${this.log.length}`, hasMore: false };
  }

  async listFolderContinue(cursor: string): Promise<DbxListing> {
    const [folder, n] = cursor.split("|");
    return { entries: this.entriesFor(folder, Number(n)), cursor: `${folder}|${this.log.length}`, hasMore: false };
  }

  async download(path: string) {
    this.downloads.push(path.toLowerCase());
    const f = this.files.get(path.toLowerCase());
    return f ? { text: f.text, rev: String(f.rev) } : null;
  }

  async upload(path: string, text: string, rev: string | null) {
    const p = path.toLowerCase();
    const existing = this.files.get(p);
    if ((rev === null && existing) || (rev !== null && (!existing || String(existing.rev) !== rev))) {
      throw new DropboxError("conflict", 409, "path/conflict/file/");
    }
    this.put(p, text);
    return { rev: String(this.files.get(p)!.rev) };
  }
}
