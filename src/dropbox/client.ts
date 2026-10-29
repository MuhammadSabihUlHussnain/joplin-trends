// The four Dropbox calls the app needs: list a folder, continue a listing, download, upload.

export interface DbxFile {
  tag: "file";
  name: string;
  pathLower: string;
  rev: string;
  contentHash: string;
}
export interface DbxDeleted {
  tag: "deleted";
  name: string;
  pathLower: string;
}
export type DbxEntry = DbxFile | DbxDeleted | { tag: "folder"; name: string; pathLower: string };

export interface DbxListing {
  entries: DbxEntry[];
  cursor: string;
  hasMore: boolean;
}

export class DropboxError extends Error {
  constructor(message: string, readonly status: number, readonly summary: string) {
    super(message);
    this.name = "DropboxError";
  }
}

/** Anything the pipeline needs from Dropbox. Tests swap in an in-memory version. */
export interface DropboxApi {
  listFolder(path: string): Promise<DbxListing>;
  listFolderContinue(cursor: string): Promise<DbxListing>;
  download(path: string): Promise<{ text: string; rev: string } | null>;
  upload(path: string, text: string, rev: string | null): Promise<{ rev: string }>;
  /** Renames a file or folder. Fails with a conflict if `to` exists, or not_found if `from` doesn't. */
  move(from: string, to: string): Promise<void>;
}

// Dropbox-API-Arg must be HTTP-header safe: escape every non-ASCII character.
function headerJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

type RawEntry = { ".tag": string; name: string; path_lower: string; rev?: string; content_hash?: string };

function toEntry(e: RawEntry): DbxEntry {
  if (e[".tag"] === "file") return { tag: "file", name: e.name, pathLower: e.path_lower, rev: e.rev!, contentHash: e.content_hash! };
  if (e[".tag"] === "deleted") return { tag: "deleted", name: e.name, pathLower: e.path_lower };
  return { tag: "folder", name: e.name, pathLower: e.path_lower };
}

export class HttpDropbox implements DropboxApi {
  constructor(private token: () => Promise<string>) {}

  private async rpc<T>(endpoint: string, body: unknown): Promise<T> {
    const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await dropboxError(res, endpoint);
    return (await res.json()) as T;
  }

  private listing(json: { entries: RawEntry[]; cursor: string; has_more: boolean }): DbxListing {
    return { entries: json.entries.map(toEntry), cursor: json.cursor, hasMore: json.has_more };
  }

  async listFolder(path: string) {
    return this.listing(await this.rpc("files/list_folder", { path, recursive: false, include_deleted: false, limit: 2000 }));
  }

  async listFolderContinue(cursor: string) {
    return this.listing(await this.rpc("files/list_folder/continue", { cursor }));
  }

  async download(path: string) {
    const res = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.token()}`, "Dropbox-API-Arg": headerJson({ path }) },
    });
    if (res.status === 409) {
      const err = await dropboxError(res, "files/download");
      if (err.summary.includes("not_found")) return null;
      throw err;
    }
    if (!res.ok) throw await dropboxError(res, "files/download");
    const meta = JSON.parse(res.headers.get("Dropbox-API-Result") ?? "{}") as { rev?: string };
    return { text: await res.text(), rev: meta.rev ?? "" };
  }

  /** rev = null creates the file; a rev only overwrites if nobody else changed the file since. */
  async upload(path: string, text: string, rev: string | null) {
    const mode = rev ? { ".tag": "update", update: rev } : { ".tag": "add" };
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": headerJson({ path, mode, autorename: false, mute: true }),
      },
      body: new TextEncoder().encode(text),
    });
    if (!res.ok) throw await dropboxError(res, "files/upload");
    const json = (await res.json()) as { rev: string };
    return { rev: json.rev };
  }

  move(from: string, to: string) {
    return moveViaHttp(this.token, from, to);
  }
}

export async function moveViaHttp(token: () => Promise<string>, from: string, to: string): Promise<void> {
  const res = await fetch("https://api.dropboxapi.com/2/files/move_v2", {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from_path: from, to_path: to, autorename: false, allow_ownership_transfer: false }),
  });
  if (!res.ok) throw await dropboxError(res, "files/move_v2");
}

async function dropboxError(res: Response, endpoint: string): Promise<DropboxError> {
  const text = await res.text();
  let summary = text;
  try {
    summary = (JSON.parse(text) as { error_summary?: string }).error_summary ?? text;
  } catch {
    /* plain-text error body */
  }
  if (res.status === 401) return new DropboxError("Dropbox access expired. Connect it again in Settings.", 401, summary);
  if (res.status === 429) return new DropboxError("Dropbox is rate limiting requests. Try Refresh again in a minute.", 429, summary);
  return new DropboxError(`Dropbox ${endpoint} failed (${res.status}): ${summary}`, res.status, summary);
}

export function isConflict(err: unknown): boolean {
  return err instanceof DropboxError && err.status === 409 && err.summary.includes("conflict");
}

export function isNotFound(err: unknown): boolean {
  return err instanceof DropboxError && err.status === 409 && err.summary.includes("not_found");
}
