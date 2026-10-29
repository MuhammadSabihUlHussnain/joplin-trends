import { addDays, weekOf } from "../analytics/days";
import { sum, weekly, weekSummary } from "../analytics/rollups";
import type { Analysis } from "../App";
import { StackedWeeks } from "../ui/charts";
import { change, colorFor, fmtHours, fmtMoney, fmtNum, longDate } from "../ui/format";
import { PatternCard } from "./Patterns";

function Top({ values, fmt }: { values: Record<string, number>; fmt: (v: number) => string }) {
  const top = Object.entries(values)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (!top.length) return <p className="muted small">Nothing yet this week.</p>;
  return (
    <ul className="toplist">
      {top.map(([c, v]) => (
        <li key={c}>
          <span className="dot" style={{ background: colorFor(c) }} />
          {c}
          <b>{fmt(v)}</b>
        </li>
      ))}
    </ul>
  );
}

export function Overview({ a }: { a: Analysis }) {
  const { days, today, file, report } = a;
  const s = weekSummary(days, today);
  const hoursNow = sum(s.thisWeek.hours);
  const spendNow = sum(s.thisWeek.spend);
  const recent = weekly(days, "hours", file.categories.time, today).filter((r) => r.week >= addDays(weekOf(today), -7 * 7));
  const last = days[days.length - 1];

  return (
    <>
      <section className="cards">
        <div className="card stat">
          <h3>Tracked time this week</h3>
          <p className="big">{fmtHours(hoursNow)}</p>
          <p className="delta">{change(hoursNow, sum(s.lastWeek.hours)) ?? "–"} vs. same days last week</p>
          <Top values={s.thisWeek.hours} fmt={fmtHours} />
        </div>
        <div className="card stat">
          <h3>Spent this week</h3>
          <p className="big">{fmtMoney(spendNow)}</p>
          <p className="delta">{change(spendNow, sum(s.lastWeek.spend)) ?? "–"} vs. same days last week</p>
          <Top values={s.thisWeek.spend} fmt={fmtMoney} />
        </div>
        <div className="card stat">
          <h3>Average mood</h3>
          <p className="big">{fmtNum(s.thisWeek.mood)}</p>
          <p className="delta">last week {fmtNum(s.lastWeek.mood)}</p>
          <p className="muted small">
            {s.thisWeek.entries} {s.thisWeek.entries === 1 ? "entry" : "entries"} this week
            {last ? ` · latest ${longDate(last.date)}` : ""}
          </p>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Patterns</h2>
          <a href="#/patterns">See all</a>
        </div>
        {report.daysNeeded > 0 && (
          <p className="notice">
            {report.daysNeeded} more days with a mood score before mood patterns are checked. Recurring habits and unusual weeks
            show up sooner.
          </p>
        )}
        {report.patterns.length ? (
          <div className="patterns">
            {report.patterns.slice(0, 3).map((p) => (
              <PatternCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <p className="muted">No patterns yet. Keep writing; they show up once there's enough to compare.</p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Where the hours went</h2>
          <a href="#/trends/time">Details</a>
        </div>
        <StackedWeeks rows={recent} categories={file.categories.time} unit="hours" />
      </section>
    </>
  );
}
