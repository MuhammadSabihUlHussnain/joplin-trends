// A copy of data.json in IndexedDB so the dashboard opens instantly, before Dropbox answers.

import type { TrendsFile } from "../types";

const DB = "joplin-trends";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined; // private window or storage blocked: the app still works, just without the instant cache
  }
}

export interface Cached {
  file: TrendsFile;
  rev: string | null;
  demo: boolean;
}

export const localCache = {
  load: () => run<Cached>("readonly", (s) => s.get("trends")),
  save: (value: Cached) => run<IDBValidKey>("readwrite", (s) => s.put(value, "trends")),
  clear: () => run<undefined>("readwrite", (s) => s.delete("trends")),
};
