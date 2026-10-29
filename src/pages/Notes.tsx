import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays } from "../analytics/days";
import { localDate } from "../entry/template";
import { emptyNote, formatDuration, fromMarkdown, isBlank, type NoteDraft, parseHours, toMarkdown } from "../notes/format";
import { forceSaveNote, listNoteDates, loadNote, NoteConflictError, saveNote } from "../notes/store";
import { dropboxClient } from "../state/useTrends";
import type { Categories, Entry, Override, TrendsFile } from "../types";
import { colorFor, fmtHours, fmtMoney, longDate } from "../ui/format";
import { CheckIcon, ChevronLeft, ChevronRight, MicIcon, MinusCircle, PlusIcon, SearchIcon } from "../ui/icons";
import { appendSpoken, dictationSupported, startDictation } from "../voice/dictation";

type SaveState = "loading" | "new" | "saved" | "dirty" | "saving" | "error" | "conflict" | "readonly";

const DRAFT_PREFIX = "jt.draft.";

function readDraft(date: string): NoteDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + date);
    return raw ? (JSON.parse(raw) as NoteDraft) : null;
  } catch {
    return null;
  }
}
function writeDraft(note: NoteDraft | null, date: string) {
  try {
    if (note) localStorage.setItem(DRAFT_PREFIX + date, JSON.stringify(note));
    else localStorage.removeItem(DRAFT_PREFIX + date);
  } catch {
    /* storage blocked */
  }
}

function datesWithDrafts(): Set<string> {
  const out = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) out.add(k.slice(DRAFT_PREFIX.length));
    }
  } catch {
    /* storage blocked */
  }
  return out;
}

/** Set by the list's mic button so the editor starts listening as soon as today's note opens. */
let dictateOnOpen = false;

function draftFromEntry(e: Entry): NoteDraft {
  return fromMarkdown(
    e.date,
    toMarkdown({
      date: e.date,
      mood: e.template.mood,
      energy: e.template.energy,
      sleep: e.template.sleep,
      time: e.template.time,
      money: e.template.money,
      journal: e.template.freeText,
    }),
  );
}

function monthLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export interface NotesProps {
  file: TrendsFile | null;
  mode: "dropbox" | "demo" | "disconnected";
  selected: string | null;
  wide: boolean;
  onSelect: (date: string | null) => void;
  onCategory: (kind: Override["kind"], name: string, category: string) => void;
}

export function Notes({ file, mode, selected, wide, onSelect, onCategory }: NotesProps) {
  const today = localDate(new Date());
  const [dates, setDates] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const entries = file?.entries ?? {};
  const suggestions = useSuggestions(file);

  useEffect(() => {
    if (mode !== "dropbox") {
      setDates(Object.keys(entries).sort().reverse());
      return;
    }
    listNoteDates(dropboxClient())
      .then(setDates)
      .catch((err: Error) => setListError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // On a wide screen there's always a note open; start with today.
  useEffect(() => {
    if (wide && !selected && mode !== "disconnected") onSelect(mode === "demo" ? (dates[0] ?? today) : today);
  }, [wide, selected, mode, dates, today, onSelect]);

  const all = useMemo(() => {
    const set = new Set([...dates, ...Object.keys(entries)]);
    if (mode === "dropbox") set.add(today);
    return [...set].sort().reverse();
  }, [dates, entries, mode, today]);

  const q = query.trim().toLowerCase();
  const shown = all.filter((d) => {
    if (!q) return true;
    const e = entries[d];
    return longDate(d).toLowerCase().includes(q) || (e && JSON.stringify(e.template).toLowerCase().includes(q));
  });

  const groups: { month: string; dates: string[] }[] = [];
  for (const d of shown) {
    const m = monthLabel(d);
    if (groups[groups.length - 1]?.month !== m) groups.push({ month: m, dates: [] });
    groups[groups.length - 1].dates.push(d);
  }

  const [drafts, setDrafts] = useState<Set<string>>(datesWithDrafts);
  const onSaved = useCallback((date: string) => {
    setDates((ds) => (ds.includes(date) ? ds : [date, ...ds]));
    setDrafts(datesWithDrafts());
  }, []);
  const onDraft = useCallback(() => setDrafts(datesWithDrafts()), []);

  if (mode === "disconnected") {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Notes</h1>
        </header>
        <section className="group welcome">
          <h2>Write your first note</h2>
          <p className="muted">
            Notes are saved as plain files in your own Dropbox, one per day. Connect Dropbox in Settings to start, or look around with
            the sample data first.
          </p>
          <a className="btn primary" href="#/settings">
            Open Settings
          </a>
        </section>
      </div>
    );
  }

  const list = (
    <aside className="note-list">
      <header className="page-head compact">
        <h1>Notes</h1>
        {mode === "dropbox" && (
          <span className="head-actions">
            {dictationSupported() && (
              <button
                className="icon-btn"
                aria-label="Voice note for today"
                title="Voice note for today"
                onClick={() => {
                  dictateOnOpen = true;
                  onSelect(today);
                }}
              >
                <MicIcon />
              </button>
            )}
            <button className="icon-btn" aria-label="Today's note" title="Today's note" onClick={() => onSelect(today)}>
              <PlusIcon />
            </button>
          </span>
        )}
      </header>
      <label className="search">
        <SearchIcon size={16} />
        <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {listError && <p className="error small">{listError}</p>}
      {groups.map((g) => (
        <section key={g.month}>
          <h3 className="section-label">{g.month}</h3>
          <ul className="rows">
            {g.dates.map((d) => {
              const e = entries[d];
              const preview = e
                ? (e.template.freeText.split("\n").find((l) => l.trim()) ??
                  (e.record.activities.map((a) => a.name).slice(0, 4).join(" · ") || "No journal text"))
                : dates.includes(d)
                  ? "Not read yet. Press Refresh."
                  : "Tap to write today's note";
              return (
                <li key={d}>
                  <button className={`row ${selected === d ? "selected" : ""}`} onClick={() => onSelect(d)}>
                    <span className="row-main">
                      <span className="row-title">
                        {d === today ? "Today" : longDate(d)}
                        {drafts.has(d) && <span className="unsaved-tag">Unsaved</span>}
                      </span>
                      <span className="row-sub">{preview}</span>
                    </span>
                    {e?.record.mood != null && <span className="mood-pill">{Math.round(e.record.mood)}</span>}
                    {!wide && <ChevronRight size={16} className="chev" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );

  const editor = selected ? (
    <Editor
      key={selected}
      date={selected}
      readOnly={mode === "demo"}
      entry={entries[selected] ?? null}
      categories={file?.categories ?? null}
      suggestions={suggestions}
      wide={wide}
      onBack={() => onSelect(null)}
      onNavigate={onSelect}
      onSaved={onSaved}
      onDraft={onDraft}
      onCategory={onCategory}
    />
  ) : null;

  if (!wide) return <div className="page">{editor ?? list}</div>;
  return (
    <div className="notes-split">
      {list}
      <div className="note-pane">{editor}</div>
    </div>
  );
}

function useSuggestions(file: TrendsFile | null) {
  return useMemo(() => {
    const count = new Map<string, number>();
    for (const e of Object.values(file?.entries ?? {})) for (const a of e.record.activities) count.set(a.name, (count.get(a.name) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([n]) => n);
  }, [file]);
}

function Editor(props: {
  date: string;
  readOnly: boolean;
  entry: Entry | null;
  categories: Categories | null;
  suggestions: string[];
  wide: boolean;
  onBack: () => void;
  onNavigate: (date: string) => void;
  onSaved: (date: string) => void;
  onDraft: () => void;
  onCategory: NotesProps["onCategory"];
}) {
  const { date, readOnly, entry } = props;
  const [note, setNote] = useState<NoteDraft | null>(null);
  const [state, setState] = useState<SaveState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [remote, setRemote] = useState<NoteDraft | null>(null);
  const [savedThisVisit, setSavedThisVisit] = useState(false);
  const rev = useRef<string | null>(null);
  const latest = useRef<NoteDraft | null>(null);
  const saving = useRef(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const dictation = useRef<{ stop: () => void } | null>(null);
  const newParagraph = useRef(true);

  // Load the note (or today's blank template); an unsaved local draft wins if one is left over.
  useEffect(() => {
    let cancelled = false;
    if (readOnly) {
      const d = entry ? draftFromEntry(entry) : emptyNote(date);
      setNote(d);
      setState("readonly");
      return;
    }
    loadNote(dropboxClient(), date)
      .then((loaded) => {
        if (cancelled) return;
        rev.current = loaded.rev;
        const draft = readDraft(date);
        latest.current = draft ?? loaded.draft;
        setNote(latest.current);
        setState(draft ? "dirty" : loaded.rev ? "saved" : "new");
        if (dictateOnOpen) {
          dictateOnOpen = false;
          startVoice();
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        const draft = readDraft(date);
        latest.current = draft ?? emptyNote(date);
        setNote(latest.current);
        setState("error");
        setError(`Couldn't open this note from Dropbox: ${err.message}`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, readOnly]);

  const save = useCallback(async () => {
    const n = latest.current;
    if (!n || readOnly || saving.current) return;
    // A note that was never saved and is still blank isn't written, so opening a day doesn't create a file.
    if (rev.current === null && isBlank(n)) {
      writeDraft(null, n.date);
      setState("new");
      props.onDraft();
      return;
    }
    setState("saving");
    saving.current = true;
    try {
      const res = await saveNote(dropboxClient(), n, rev.current);
      rev.current = res.rev;
      if (latest.current === n) {
        writeDraft(null, n.date);
        setState("saved");
      } else setState("dirty");
      setSavedThisVisit(true);
      setError(null);
      props.onSaved(n.date);
    } catch (err) {
      if (err instanceof NoteConflictError) {
        setRemote(err.remote.draft);
        rev.current = err.remote.rev;
        setState("conflict");
      } else {
        setState("error");
        setError(`Not saved to Dropbox yet (kept on this device): ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      saving.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // Nothing goes to Dropbox until Save. Unsaved changes stay on this device as a draft, and the
  // browser warns before closing the tab with unsaved changes.
  useEffect(() => {
    const dirty = state === "dirty" || state === "error";
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    addEventListener("beforeunload", warn);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("beforeunload", warn);
      removeEventListener("keydown", key);
    };
  }, [state, save]);

  // Stop listening when the note closes.
  useEffect(() => () => dictation.current?.stop(), []);

  const update = (fn: (n: NoteDraft) => NoteDraft) => {
    if (readOnly || !note || state === "conflict") return;
    const next = fn(note);
    latest.current = next;
    setNote(next);
    setState("dirty");
    writeDraft(next, next.date);
    props.onDraft();
  };

  // Each finished sentence is added to the journal straight away; the note stays open and unsaved
  // so more can be typed or said before pressing Save.
  function startVoice() {
    if (readOnly || dictation.current) return;
    setVoiceError(null);
    newParagraph.current = true;
    setListening(true);
    dictation.current = startDictation({
      onInterim: setInterim,
      onFinal: (text) => {
        const n = latest.current;
        if (!n) return;
        const next = { ...n, journal: appendSpoken(n.journal, text, newParagraph.current) };
        newParagraph.current = false;
        latest.current = next;
        setNote(next);
        setState((st) => (st === "conflict" ? st : "dirty"));
        writeDraft(next, next.date);
        props.onDraft();
      },
      onError: setVoiceError,
      onEnd: () => {
        dictation.current = null;
        setListening(false);
        setInterim("");
      },
    });
  }

  const stopVoice = () => dictation.current?.stop();

  const resolve = async (keep: "mine" | "theirs") => {
    if (!remote || !latest.current) return;
    if (keep === "theirs") {
      latest.current = remote;
      setNote(remote);
      writeDraft(null, date);
      setRemote(null);
      setState("saved");
      return;
    }
    setState("saving");
    try {
      const res = await forceSaveNote(dropboxClient(), latest.current);
      rev.current = res.rev;
      writeDraft(null, date);
      setRemote(null);
      setState("saved");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const d = new Date(`${date}T12:00:00`);
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  const title = d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  const today = localDate(new Date());

  return (
    <article className="editor">
      <nav className="editor-bar">
        {!props.wide && (
          <button className="back" onClick={props.onBack}>
            <ChevronLeft size={20} /> Notes
          </button>
        )}
        <span className="spacer" />
        <SaveBadge state={state} />
        {!readOnly && (
          <button className="btn primary save-btn" disabled={!(state === "dirty" || state === "error") || listening} onClick={() => void save()}>
            Save
          </button>
        )}
        <button className="icon-btn" aria-label="Previous day" onClick={() => props.onNavigate(addDays(date, -1))}>
          <ChevronLeft />
        </button>
        <button className="icon-btn" aria-label="Next day" disabled={date >= today} onClick={() => props.onNavigate(addDays(date, 1))}>
          <ChevronRight />
        </button>
      </nav>
      <header className="editor-title">
        <p className="eyebrow">{date === today ? `Today · ${weekday}` : weekday}</p>
        <h1>{title}</h1>
      </header>

      {readOnly && <p className="notice">This is sample data. Connect Dropbox in Settings to write your own notes.</p>}
      {error && <p className="notice error">{error}</p>}
      {state === "conflict" && (
        <div className="notice warn">
          This note was changed on another device while you were writing.
          <div className="row-actions">
            <button className="btn" onClick={() => resolve("theirs")}>
              Use the other version
            </button>
            <button className="btn primary" onClick={() => resolve("mine")}>
              Keep mine
            </button>
          </div>
        </div>
      )}

      {!note ? (
        <p className="muted pad">Opening…</p>
      ) : (
        <>
          <section className="group">
            <h3 className="group-title">How was today?</h3>
            <ScoreRow label="Mood" value={note.mood} disabled={readOnly} onChange={(v) => update((n) => ({ ...n, mood: v }))} />
            <ScoreRow label="Energy" value={note.energy} disabled={readOnly} onChange={(v) => update((n) => ({ ...n, energy: v }))} />
            <div className="field-row">
              <span className="field-label">Sleep</span>
              <div className="stepper">
                <button disabled={readOnly} aria-label="Less sleep" onClick={() => update((n) => ({ ...n, sleep: Math.max(0, (n.sleep ?? 7) - 0.5) }))}>
                  −
                </button>
                <span className="stepper-value">{note.sleep === null ? "–" : `${note.sleep} h`}</span>
                <button disabled={readOnly} aria-label="More sleep" onClick={() => update((n) => ({ ...n, sleep: Math.min(24, (n.sleep ?? 6.5) + 0.5) }))}>
                  +
                </button>
              </div>
            </div>
          </section>

          <section className="group">
            <h3 className="group-title">Time</h3>
            <datalist id="activity-names">
              {props.suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {note.time.map((r, i) => (
              <div className="item-row" key={i}>
                <button className="remove" disabled={readOnly} aria-label="Remove" onClick={() => update((n) => ({ ...n, time: n.time.filter((_, j) => j !== i) }))}>
                  <MinusCircle size={20} />
                </button>
                <input
                  className="grow"
                  list="activity-names"
                  placeholder="Activity"
                  value={r.name}
                  disabled={readOnly}
                  onChange={(e) => update((n) => ({ ...n, time: n.time.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))}
                />
                <DurationInput
                  hours={r.hours}
                  disabled={readOnly}
                  onChange={(h) => update((n) => ({ ...n, time: n.time.map((x, j) => (j === i ? { ...x, hours: h } : x)) }))}
                />
              </div>
            ))}
            {!readOnly && (
              <button className="add-row" onClick={() => update((n) => ({ ...n, time: [...n.time, { name: "", hours: null }] }))}>
                <PlusIcon size={18} /> Add activity
              </button>
            )}
          </section>

          <section className="group">
            <h3 className="group-title">Money</h3>
            {note.money.map((r, i) => (
              <div className="item-row" key={i}>
                <button className="remove" disabled={readOnly} aria-label="Remove" onClick={() => update((n) => ({ ...n, money: n.money.filter((_, j) => j !== i) }))}>
                  <MinusCircle size={20} />
                </button>
                <input
                  className="grow"
                  placeholder="Where or what"
                  value={r.merchant}
                  disabled={readOnly}
                  onChange={(e) => update((n) => ({ ...n, money: n.money.map((x, j) => (j === i ? { ...x, merchant: e.target.value } : x)) }))}
                />
                <label className="amount">
                  <span>$</span>
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={r.amount ?? ""}
                    disabled={readOnly}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      update((n) => ({ ...n, money: n.money.map((x, j) => (j === i ? { ...x, amount: v === "" ? null : Number(v) } : x)) }));
                    }}
                  />
                </label>
              </div>
            ))}
            {!readOnly && (
              <button className="add-row" onClick={() => update((n) => ({ ...n, money: [...n.money, { merchant: "", amount: null }] }))}>
                <PlusIcon size={18} /> Add purchase
              </button>
            )}
          </section>

          <section className="group">
            <div className="group-head">
              <h3 className="group-title">Journal</h3>
              {!readOnly && dictationSupported() && (
                <button className={`mic-btn ${listening ? "on" : ""}`} onClick={listening ? stopVoice : startVoice} aria-pressed={listening}>
                  <MicIcon size={18} />
                  {listening ? "Stop" : "Voice"}
                </button>
              )}
            </div>
            {listening && (
              <p className="listening">
                <span className="pulse" aria-hidden />
                {interim ? <span className="interim">{interim}</span> : "Listening. Speak and your words go into the journal. Press Stop when you're done, then Save."}
              </p>
            )}
            {voiceError && <p className="footnote error">{voiceError}</p>}
            <AutoTextarea
              value={note.journal}
              disabled={readOnly}
              placeholder="Write about your day. Anything you mention here (people, places, extra spending) is picked up on Refresh."
              onChange={(v) => update((n) => ({ ...n, journal: v }))}
            />
          </section>

          <Extracted entry={entry} categories={props.categories} stale={savedThisVisit} onCategory={props.onCategory} readOnly={readOnly} />
        </>
      )}
    </article>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const label: Record<SaveState, string> = {
    loading: "",
    new: "",
    saved: "Saved",
    dirty: "Unsaved changes",
    saving: "Saving…",
    error: "Not saved",
    conflict: "Conflict",
    readonly: "Sample",
  };
  if (!label[state]) return null;
  return (
    <span className={`save-badge ${state}`}>
      {state === "saved" && <CheckIcon size={14} />}
      {label[state]}
    </span>
  );
}

function ScoreRow({ label, value, disabled, onChange }: { label: string; value: number | null; disabled: boolean; onChange: (v: number | null) => void }) {
  return (
    <div className="field-row score">
      <span className="field-label">{label}</span>
      <div className="score-buttons" role="radiogroup" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            className={value === n ? "on" : ""}
            disabled={disabled}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function DurationInput({ hours, disabled, onChange }: { hours: number | null; disabled: boolean; onChange: (h: number | null) => void }) {
  const [text, setText] = useState(formatDuration(hours));
  useEffect(() => setText(formatDuration(hours)), [hours]);
  return (
    <input
      className="duration"
      placeholder="1h 30m"
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const h = parseHours(text);
        onChange(h);
        setText(formatDuration(h));
      }}
    />
  );
}

function AutoTextarea({ value, disabled, placeholder, onChange }: { value: string; disabled: boolean; placeholder: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(160, el.scrollHeight)}px`;
  }, [value]);
  return <textarea ref={ref} className="journal" value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function Extracted({
  entry,
  categories,
  stale,
  readOnly,
  onCategory,
}: {
  entry: Entry | null;
  categories: Categories | null;
  stale: boolean;
  readOnly: boolean;
  onCategory: NotesProps["onCategory"];
}) {
  if (!entry || !categories) {
    return <p className="footnote">Press Refresh to read this note into your trends.</p>;
  }
  const r = entry.record;
  const status: Record<Entry["status"], string> = {
    ok: "",
    pending: "Waiting for the AI. It retries on the next Refresh.",
    error: entry.error ?? "The AI couldn't read this note.",
    "no-ai": "Only the Time and Money lists were counted. Connect an AI in Settings to read the journal too.",
  };
  return (
    <section className="group">
      <h3 className="group-title">What was counted</h3>
      {stale && <p className="footnote">You've edited this note since the last Refresh.</p>}
      {status[entry.status] && <p className="footnote">{status[entry.status]}</p>}
      {r.activities.map((a, i) => (
        <div className="item-row counted" key={`a${i}`}>
          <span className="dot" style={{ background: colorFor(a.category) }} />
          <span className="grow">{a.name}</span>
          <span className="muted num">{a.hours === null ? "" : fmtHours(a.hours)}</span>
          <CategoryPicker value={a.category} options={categories.time} disabled={readOnly} onChange={(c) => onCategory("activity", a.name, c)} />
        </div>
      ))}
      {r.expenses.map((x, i) => (
        <div className="item-row counted" key={`e${i}`}>
          <span className="dot" style={{ background: colorFor(x.category) }} />
          <span className="grow">{x.merchant}</span>
          <span className="muted num">{fmtMoney(x.amount)}</span>
          <CategoryPicker value={x.category} options={categories.money} disabled={readOnly} onChange={(c) => onCategory("expense", x.merchant, c)} />
        </div>
      ))}
      {!r.activities.length && !r.expenses.length && <p className="footnote">Nothing counted yet.</p>}
      {(r.people.length > 0 || r.themes.length > 0) && (
        <p className="chips">
          {r.people.map((p) => (
            <span className="chip" key={p}>
              {p}
            </span>
          ))}
          {r.themes.map((t) => (
            <span className="chip tint" key={t}>
              {t}
            </span>
          ))}
        </p>
      )}
      <p className="footnote">Change a category and it's fixed for that name in every note.</p>
    </section>
  );
}

function CategoryPicker({ value, options, disabled, onChange }: { value: string; options: string[]; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <select className="picker" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {(options.includes(value) ? options : [...options, value]).map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
}
