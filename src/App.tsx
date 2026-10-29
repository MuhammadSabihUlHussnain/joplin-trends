import { useCallback, useEffect, useMemo, useState } from "react";
import { buildDays, type Day } from "./analytics/days";
import { findPatterns, type PatternReport } from "./analytics/patterns";
import { completeDropboxLogin, isDropboxConnected } from "./dropbox/auth";
import { localDate } from "./entry/template";
import { Notes } from "./pages/Notes";
import { Overview } from "./pages/Overview";
import { Patterns } from "./pages/Patterns";
import { Settings } from "./pages/Settings";
import { Trends, type TrendsView } from "./pages/Trends";
import { useTrends } from "./state/useTrends";
import type { TrendsFile } from "./types";
import { GearIcon, NoteIcon, OverviewIcon, RefreshIcon, SparklesIcon, TrendsIcon } from "./ui/icons";
import { AppLogo } from "./ui/logo";

export interface Analysis {
  file: TrendsFile;
  days: Day[];
  today: string;
  report: PatternReport;
}

type Tab = "notes" | "overview" | "trends" | "patterns" | "settings";

interface Route {
  tab: Tab;
  note: string | null;
  view: TrendsView;
}

const TABS: { id: Tab; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: "notes", label: "Notes", Icon: NoteIcon },
  { id: "overview", label: "Overview", Icon: OverviewIcon },
  { id: "trends", label: "Trends", Icon: TrendsIcon },
  { id: "patterns", label: "Patterns", Icon: SparklesIcon },
  { id: "settings", label: "Settings", Icon: GearIcon },
];

function parseRoute(): Route {
  const [tab, arg] = location.hash.replace(/^#\/?/, "").split("/");
  const t = (TABS.find((x) => x.id === tab)?.id ?? "notes") as Tab;
  return {
    tab: t,
    note: t === "notes" && /^\d{4}-\d{2}-\d{2}$/.test(arg ?? "") ? arg : null,
    view: arg === "money" || arg === "mood" ? arg : "time",
  };
}

function useWide() {
  const query = "(min-width: 900px)";
  const [wide, setWide] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

const PHASES: Record<string, string> = {
  loading: "Loading saved results",
  listing: "Looking for new and edited notes",
  downloading: "Opening notes",
  analyzing: "Reading notes with AI",
  saving: "Saving to Dropbox",
  done: "Done",
};

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [loginError, setLoginError] = useState<string | null>(null);
  const wide = useWide();
  const { state, refresh, setCategory, setCategories, loadDemo, clearData, dismissError } = useTrends();

  useEffect(() => {
    // A shareable "?demo" link opens straight into the sample data.
    if (new URLSearchParams(location.search).has("demo")) loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    addEventListener("hashchange", onHash);
    completeDropboxLogin()
      .then((justConnected) => {
        if (justConnected) location.hash = "#/notes";
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

  const selectNote = useCallback((date: string | null) => {
    const hash = date ? `#/notes/${date}` : "#/notes";
    if (location.hash !== hash) location.hash = hash;
  }, []);

  const notesMode = state.source === "demo" ? "demo" : isDropboxConnected() ? "dropbox" : "disconnected";
  const hasData = Boolean(analysis && analysis.days.length);
  const p = state.progress;

  const empty = (title: string) => (
    <div className="page">
      <header className="page-head">
        <h1>{title}</h1>
      </header>
      <section className="group welcome">
        <h2>Nothing to show yet</h2>
        <p className="muted">Write a few notes, then press Refresh. Each note becomes hours, spending and mood here.</p>
        <div className="row-actions">
          <a className="btn primary" href="#/notes">
            Write today's note
          </a>
          <button className="btn" onClick={loadDemo}>
            Try sample data
          </button>
        </div>
      </section>
    </div>
  );

  const page = (() => {
    switch (route.tab) {
      case "notes":
        return <Notes file={state.file} mode={notesMode} selected={route.note} wide={wide} onSelect={selectNote} onCategory={setCategory} />;
      case "overview":
        return hasData ? (
          <div className="page">
            <header className="page-head">
              <h1>Overview</h1>
            </header>
            <div className="stack">
              <Overview a={analysis!} />
            </div>
          </div>
        ) : (
          empty("Overview")
        );
      case "trends":
        return hasData ? <Trends a={analysis!} view={route.view} /> : empty("Trends");
      case "patterns":
        return hasData ? (
          <div className="page">
            <header className="page-head">
              <h1>Patterns</h1>
            </header>
            <div className="stack">
              <Patterns a={analysis!} />
            </div>
          </div>
        ) : (
          empty("Patterns")
        );
      case "settings":
        return <Settings categories={state.file?.categories ?? null} source={state.source} onCategories={setCategories} onDemo={loadDemo} onClear={clearData} />;
    }
  })();

  const refreshButton = (
    <button className={`refresh-btn ${state.busy ? "spinning" : ""}`} onClick={refresh} disabled={state.busy} aria-label="Refresh">
      <RefreshIcon size={18} />
      <span>{state.busy ? "Refreshing" : "Refresh"}</span>
    </button>
  );

  return (
    <div className={`shell ${wide ? "wide" : "narrow"}`}>
      {wide && (
        <aside className="sidebar">
          <div className="brand">
            <AppLogo size={30} />
            Daybook
          </div>
          <nav>
            {TABS.map(({ id, label, Icon }) => (
              <a key={id} href={`#/${id}`} className={route.tab === id ? "active" : ""}>
                <Icon size={20} />
                {label}
              </a>
            ))}
          </nav>
          <div className="sidebar-foot">
            {refreshButton}
            {state.source === "demo" && <span className="badge demo">Sample data</span>}
          </div>
        </aside>
      )}

      <main className="content">
        {!wide && <div className="top-actions">{refreshButton}</div>}
        <div className="banners">
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
              <span>{state.error ?? loginError}</span>
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
              {state.lastStats.changedNotes} new or edited {state.lastStats.changedNotes === 1 ? "note" : "notes"}, {state.lastStats.analyzed} read by AI
              {state.lastStats.pending ? `, ${state.lastStats.pending} waiting to retry` : ""}. {state.lastStats.entries} days in your trends.
            </div>
          )}
        </div>
        {page}
      </main>

      {!wide && (
        <nav className="tabbar">
          {TABS.map(({ id, label, Icon }) => (
            <a key={id} href={`#/${id}`} className={route.tab === id ? "active" : ""}>
              <Icon size={24} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
