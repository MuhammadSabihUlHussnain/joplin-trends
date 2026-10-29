import type { DbxEntry, DbxListing, DropboxApi } from "../src/dropbox/client";
import { DropboxError } from "../src/dropbox/client";

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
