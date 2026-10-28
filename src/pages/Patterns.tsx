import { MIN_DAYS, type Pattern, type PatternKind } from "../analytics/patterns";
import type { Analysis } from "../App";

const LABELS: Record<PatternKind, string> = {
  correlation: "Mood link",
  recurrence: "Habit",
  anomaly: "Unusual week",
  streak: "Streak",
  people: "People & places",
  theme: "Theme",
};

export function PatternCard({ p }: { p: Pattern }) {
  return (
    <article className={`pattern ${p.kind}`}>
      <span className="tag">{LABELS[p.kind]}</span>
      <h3>{p.title}</h3>
      <p>{p.detail}</p>
    </article>
  );
}

export function Patterns({ a }: { a: Analysis }) {
  const { report, days } = a;
  const groups = (Object.keys(LABELS) as PatternKind[])
    .map((k) => ({ kind: k, items: report.patterns.filter((p) => p.kind === k) }))
    .filter((g) => g.items.length);

  return (
    <>
      <section className="card">
        <h2>How patterns are found</h2>
        <p className="muted">
          Mood links are only reported with at least {MIN_DAYS} days of mood scores, a correlation of 0.3 or more, and after
          correcting for how many pairs get checked at once, so random noise doesn't show up as a "pattern". They show what
          tends to happen together, not what causes what. Unusual weeks have to be at least 1.5× your usual week and well
          outside its normal swing. You have {days.length} days of entries.
        </p>
        {report.daysNeeded > 0 && <p className="notice">{report.daysNeeded} more days with a mood score before mood links are checked.</p>}
      </section>
      {groups.length ? (
        groups.map((g) => (
          <section className="card" key={g.kind}>
            <h2>{LABELS[g.kind]}</h2>
            <div className="patterns">
              {g.items.map((p) => (
                <PatternCard key={p.id} p={p} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <section className="card">
          <p className="muted">Nothing stands out yet.</p>
        </section>
      )}
    </>
  );
}
