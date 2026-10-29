// The app was called Joplin Trends and kept its files in /Joplin Trends. The first time a Dropbox
// account is used after the rename, that folder is moved to /Daybook (one rename, nothing copied or
// deleted). If /Daybook already exists, or there was never an old folder, nothing happens.

import { DATA_ROOT, LEGACY_DATA_ROOT } from "../settings";
import { type DropboxApi, isConflict, isNotFound } from "./client";

const done = new WeakMap<DropboxApi, Promise<void>>();

export function ensureDataRoot(dropbox: DropboxApi): Promise<void> {
  let p = done.get(dropbox);
  if (!p) {
    p = dropbox.move(LEGACY_DATA_ROOT, DATA_ROOT).catch((err) => {
      if (isNotFound(err) || isConflict(err)) return;
      done.delete(dropbox); // try again next time
      throw err;
    });
    done.set(dropbox, p);
  }
  return p;
}
