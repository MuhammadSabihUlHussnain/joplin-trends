import { useCallback, useEffect, useRef, useState } from "react";
import type { AiProvider } from "../ai/provider";
import { dropboxAccessToken, isDropboxConnected } from "../dropbox/auth";
import { HttpDropbox } from "../dropbox/client";
import { demoFile } from "../demo";
import { localCache } from "../store/localCache";
import { settings } from "../settings";
import { normalizeName } from "../sync/merge";
import { loadTrendsFile, type Progress, recomputeRecords, refresh as runRefresh, type RefreshStats, save } from "../sync/refresh";
import type { Categories, Override, TrendsFile } from "../types";

export type DataSource = "none" | "dropbox" | "demo";

export interface TrendsState {
  file: TrendsFile | null;
  rev: string | null;
  source: DataSource;
  busy: boolean;
  progress: Progress | null;
  warnings: string[];
  error: string | null;
  lastStats: RefreshStats | null;
}

/** The AI SDK is only downloaded when a Refresh actually needs it. */
async function aiProvider(): Promise<AiProvider | null> {
  const key = settings.get("anthropicKey").trim();
  if (!key) return null;
  const { ClaudeProvider } = await import("../ai/claude");
  return new ClaudeProvider(key);
}

export function dropboxClient() {
  return new HttpDropbox(dropboxAccessToken);
}
const dropbox = dropboxClient;

export function useTrends() {
  const [state, setState] = useState<TrendsState>({
    file: null,
    rev: null,
    source: "none",
    busy: false,
    progress: null,
    warnings: [],
    error: null,
    lastStats: null,
  });
  const busy = useRef(false);
  const patch = (p: Partial<TrendsState>) => setState((s) => ({ ...s, ...p }));

  const remember = (file: TrendsFile, rev: string | null, source: DataSource) => {
    void localCache.save({ file, rev, demo: source === "demo" });
    patch({ file, rev, source });
  };

  const refresh = useCallback(async () => {
    if (busy.current) return;
    if (!isDropboxConnected()) {
      patch({ error: "Connect Dropbox in Settings first, or try the sample data." });
      return;
    }
    busy.current = true;
    patch({ busy: true, error: null, warnings: [], progress: { phase: "loading", done: 0, total: 1 } });
    try {
      const res = await runRefresh({
        dropbox: dropbox(),
        ai: await aiProvider(),
        onProgress: (progress) => patch({ progress }),
      });
      remember(res.file, res.rev, "dropbox");
      patch({ warnings: res.warnings, lastStats: res.stats });
    } catch (err) {
      patch({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      busy.current = false;
      patch({ busy: false, progress: null });
    }
  }, []);

  // On open: show the cached copy at once, then pick up data.json from Dropbox (written by any
  // device). Notes themselves are only re-read when you press Refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await localCache.load();
      if (cancelled) return;
      if (cached && cached.file.version === 2) patch({ file: cached.file, rev: cached.rev, source: cached.demo ? "demo" : "dropbox" });
      if (cached?.demo || !isDropboxConnected()) return;
      try {
        const remote = await loadTrendsFile(dropbox());
        if (cancelled) return;
        if (remote.legacy.length) void refresh(); // a file from the Joplin era: move its entries into Notes now
        else if (remote.rev) remember(remote.file, remote.rev, "dropbox");
      } catch (err) {
        if (!cancelled) patch({ error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  /** Save a changed file (category fix, category lists) to Dropbox, or locally for sample data. */
  const commit = useCallback(
    async (next: TrendsFile) => {
      recomputeRecords(next);
      next.updatedAt = new Date().toISOString();
      if (state.source !== "dropbox") {
        remember(next, null, state.source === "none" ? "demo" : state.source);
        return;
      }
      patch({ file: next, busy: true, error: null });
      try {
        const saved = await save(dropbox(), next, state.rev, new Set());
        remember(saved.file, saved.rev, "dropbox");
      } catch (err) {
        patch({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        patch({ busy: false });
      }
    },
    [state.source, state.rev],
  );

  const setCategory = useCallback(
    (kind: Override["kind"], name: string, category: string) => {
      if (!state.file) return;
      const next = structuredClone(state.file);
      const match = normalizeName(name);
      next.overrides = [...next.overrides.filter((o) => !(o.kind === kind && o.match === match)), { kind, match, category }];
      void commit(next);
    },
    [state.file, commit],
  );

  const setCategories = useCallback(
    (categories: Categories) => {
      const next = structuredClone(state.file ?? demoFile(0));
      next.categories = categories;
      void commit(next);
    },
    [state.file, commit],
  );

  const loadDemo = useCallback(() => remember(demoFile(), null, "demo"), []);

  const clearData = useCallback(async () => {
    await localCache.clear();
    patch({ file: null, rev: null, source: "none", warnings: [], error: null, lastStats: null });
  }, []);

  return { state, refresh, setCategory, setCategories, loadDemo, clearData, dismissError: () => patch({ error: null }) };
}
