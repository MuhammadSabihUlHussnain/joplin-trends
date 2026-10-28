import { useState } from "react";
import type { Analysis } from "../App";
import type { Entry, Override } from "../types";
import { colorFor, fmtHours, fmtMoney, fmtNum, longDate } from "../ui/format";

const STATUS: Record<Entry["status"], string> = {
  ok: "",
  pending: "Waiting for AI",
  error: "AI failed",
  "no-ai": "Template only",
};

function CategorySelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select className="cat" value={value} onChange={(e) => onChange(e.target.value)} style={{ borderColor: colorFor(value) }}>
      {(options.includes(value) ? options : [...options, value]).map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
}

export function Entries({ a, onCategory }: { a: Analysis; onCategory: (kind: Override["kind"], name: string, category: string) => void }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(20);
  const q = query.trim().toLowerCase();
  const entries = Object.values(a.file.entries)
    .sort((x, y) => y.date.localeCompare(x.date))
    .filter(
      (e) =>
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.record.activities.some((x) => x.name.includes(q) || x.category.toLowerCase().includes(q)) ||
        e.record.expenses.some((x) => x.merchant.includes(q) || x.category.toLowerCase().includes(q)) ||
        e.record.people.some((p) => p.toLowerCase().includes(q)) ||
        e.record.themes.some((t) => t.includes(q)),
    );

  return (
    <>
      <section className="card">
        <h2>Entries</h2>
        <p className="muted small">
          Fix a category here and it applies to that name in every entry, past and future. Your journal text itself isn't stored by
          this app, only what was pulled out of it.
        </p>
        <input className="search" placeholder="Filter by name, category, person or theme" value={query} onChange={(e) => setQuery(e.target.value)} />
      </section>
      {entries.slice(0, shown).map((e) => (
        <section className="card entry" key={e.id}>
          <div className="entry-head">
            <h3>{longDate(e.date)}</h3>
            {e.title !== e.date && <span className="muted">{e.title}</span>}
            {STATUS[e.status] && <span className={`badge ${e.status}`}>{STATUS[e.status]}</span>}
            <span className="spacer" />
            <span className="muted small">
              mood {fmtNum(e.record.mood)} · sleep {e.record.sleep === null ? "–" : fmtHours(e.record.sleep)}
            </span>
          </div>
          {e.error && <p className="error small">{e.error}</p>}
          {e.record.activities.length > 0 && (
            <ul className="items">
              {e.record.activities.map((x, i) => (
                <li key={`a${i}`}>
                  <span className="name">{x.name}</span>
                  <span className="num">{x.hours === null ? "" : fmtHours(x.hours)}</span>
                  <CategorySelect value={x.category} options={a.file.categories.time} onChange={(c) => onCategory("activity", x.name, c)} />
                  {x.source === "ai" && <span className="src" title="Found in the free writing">AI</span>}
                </li>
              ))}
            </ul>
          )}
          {e.record.expenses.length > 0 && (
            <ul className="items">
              {e.record.expenses.map((x, i) => (
                <li key={`e${i}`}>
                  <span className="name">{x.merchant}</span>
                  <span className="num">{fmtMoney(x.amount)}</span>
                  <CategorySelect value={x.category} options={a.file.categories.money} onChange={(c) => onCategory("expense", x.merchant, c)} />
                  {x.source === "ai" && <span className="src" title="Found in the free writing">AI</span>}
                </li>
              ))}
            </ul>
          )}
          {(e.record.people.length > 0 || e.record.themes.length > 0) && (
            <p className="chips">
              {e.record.people.map((p) => (
                <span key={p} className="chip">
                  {p}
                </span>
              ))}
              {e.record.themes.map((t) => (
                <span key={t} className="chip theme">
                  #{t}
                </span>
              ))}
            </p>
          )}
        </section>
      ))}
      {entries.length > shown && (
        <button className="secondary more" onClick={() => setShown((n) => n + 20)}>
          Show {Math.min(20, entries.length - shown)} more of {entries.length - shown}
        </button>
      )}
      {!entries.length && (
        <section className="card">
          <p className="empty">No entries match.</p>
        </section>
      )}
    </>
  );
}
