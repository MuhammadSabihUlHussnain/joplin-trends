import { useEffect, useMemo, useState } from "react";
import { buildDays, type Day } from "./analytics/days";
import { findPatterns, type PatternReport } from "./analytics/patterns";
import { completeDropboxLogin } from "./dropbox/auth";
import { localDate } from "./entry/template";
import { Entries } from "./pages/Entries";
import { Money } from "./pages/Money";
import { Mood } from "./pages/Mood";
import { Overview } from "./pages/Overview";
import { Patterns } from "./pages/Patterns";
import { Settings } from "./pages/Settings";
import { Time } from "./pages/Time";
import { useTrends } from "./state/useTrends";
import type { TrendsFile } from "./types";

export interface Analysis {
  file: TrendsFile;
  days: Day[];
  today: string;
  report: PatternReport;
}

const PAGES = [
  ["overview", "Overview"],
  ["time", "Time"],
  ["money", "Money"],
  ["mood", "Mood & sleep"],
  ["patterns", "Patterns"],
  ["entries", "Entries"],
  ["settings", "Settings"],
] as const;
type Page = (typeof PAGES)[number][0];

function currentPage(): Page {
  const p = location.hash.replace(/^#\/?/, "");
  return (PAGES.find(([id]) => id === p)?.[0] ?? "overview") as Page;
}

const PHASES: Record<string, string> = {
  loading: "Loading saved results",
  listing: "Checking Joplin for changes",
  downloading: "Downloading changed notes",
  analyzing: "Reading entries with AI",
  saving: "Saving to Dropbox",
  done: "Done",
};

export default function App() {
  const [page, setPage] = useState<Page>(currentPage);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { state, refresh, setCategory, setCategories, loadDemo, clearData, dismissError } = useTrends();

  useEffect(() => {
    const onHash = () => setPage(currentPage());
    addEventListener("hashchange", onHash);
    completeDropboxLogin()
      .then((justConnected) => {
        if (justConnected) location.hash = "#/settings";
      })
      .catch((err: Error) => setLoginError(err.message));
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const analysis = useMemo<Analysis | null>(() => {
    if (!state.file) return null;
    const days = buildDays(Object.values(state.file.entries));
    const today = localDate(new Date());
    return { file: state.file, days, today, report: findPatterns(days, state.file.categories, today) };
  }, [state.file]);

  const hasEntries = Boolean(analysis && analysis.days.length);
  const p = state.progress;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◐
          </span>
          Joplin Trends
          {state.source === "demo" && <span className="badge demo">Sample data</span>}
        </div>
        <nav>
          {PAGES.map(([id, label]) => (
            <a key={id} href={`#/${id}`} className={page === id ? "active" : ""}>
              {label}
            </a>
          ))}
        </nav>
        <button className="refresh" onClick={refresh} disabled={state.busy}>
          {state.busy ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {p && (
        <div className="progress" role="status">
          <span>
            {PHASES[p.phase]}
            {p.total > 1 ? ` · ${p.done} of ${p.total}` : ""}
          </span>
          <div className="bar">
            <span style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}
      {(state.error || loginError) && (
        <div className="banner error" role="alert">
          {state.error ?? loginError}
          <button className="link" onClick={() => (dismissError(), setLoginError(null))}>
            Dismiss
          </button>
        </div>
      )}
      {state.warnings.map((w) => (
        <div className="banner warn" key={w}>
          {w}
        </div>
      ))}
      {state.lastStats && !state.busy && (
        <div className="banner info">
          Refreshed: {state.lastStats.changedFiles} changed {state.lastStats.changedFiles === 1 ? "file" : "files"} in Joplin,{" "}
          {state.lastStats.analyzed} {state.lastStats.analyzed === 1 ? "entry" : "entries"} read by AI, {state.lastStats.journalEntries} journal entries in
          total{state.lastStats.pending ? `, ${state.lastStats.pending} waiting to retry` : ""}.
        </div>
      )}

      <main>
        {page === "settings" ? (
          <Settings categories={state.file?.categories ?? null} source={state.source} onCategories={setCategories} onDemo={loadDemo} onClear={clearData} />
        ) : !analysis || !hasEntries ? (
          <section className="card welcome">
            <h2>{state.source === "dropbox" ? "No journal entries yet" : "See where your time and money go"}</h2>
            <p>
              Write in Joplin, press Refresh, and this page turns your entries into weekly hours, spending, mood and the patterns
              that repeat. Everything stays in your own Dropbox.
            </p>
            <div className="row">
              <a className="button" href="#/settings">
                Set up
              </a>
              <button className="secondary" onClick={loadDemo}>
                Try with sample data
              </button>
            </div>
          </section>
        ) : page === "time" ? (
          <Time a={analysis} />
        ) : page === "money" ? (
          <Money a={analysis} />
        ) : page === "mood" ? (
          <Mood a={analysis} />
        ) : page === "patterns" ? (
          <Patterns a={analysis} />
        ) : page === "entries" ? (
          <Entries a={analysis} onCategory={setCategory} />
        ) : (
          <Overview a={analysis} />
        )}
      </main>
      <footer className="muted small">Your notes stay in your Dropbox. This page runs entirely in your browser.</footer>
    </div>
  );
}
