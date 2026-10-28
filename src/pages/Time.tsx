import { addDays, weekOf } from "../analytics/days";
import { byWeekday, totalsBetween, weekly } from "../analytics/rollups";
import type { Analysis } from "../App";
import { normalizeName } from "../sync/merge";
import { SimpleBars, StackedWeeks } from "../ui/charts";
import { colorFor, fmtHours } from "../ui/format";

export function Time({ a }: { a: Analysis }) {
  const { days, today, file } = a;
  const rows = weekly(days, "hours", file.categories.time, today).filter((r) => r.week >= addDays(weekOf(today), -7 * 11));
  const from = addDays(today, -29);
  const totals = Object.entries(totalsBetween(days, from, today, "hours")).sort((x, y) => y[1] - x[1]);
  const all = totals.reduce((s, [, v]) => s + v, 0);

  const named = new Map<string, { name: string; category: string; hours: number; days: number }>();
  for (const d of days) {
    if (d.date < from) continue;
    for (const act of d.activities) {
      const key = normalizeName(act.name);
      const t = named.get(key) ?? { name: act.name, category: act.category, hours: 0, days: 0 };
      t.hours += act.hours ?? 0;
      t.days++;
      named.set(key, t);
    }
  }
  const topNamed = [...named.values()].sort((x, y) => y.hours - x.hours || y.days - x.days).slice(0, 12);

  return (
    <>
      <section className="card">
        <h2>Hours per week</h2>
        <StackedWeeks rows={rows} categories={file.categories.time} unit="hours" height={320} />
        <p className="muted small">Only activities with a duration count toward hours. Mentions without one still feed the patterns.</p>
      </section>
      <div className="grid2">
        <section className="card">
          <h2>Last 30 days by category</h2>
          {totals.length ? (
            <table className="table">
              <tbody>
                {totals.map(([c, v]) => (
                  <tr key={c}>
                    <td>
                      <span className="dot" style={{ background: colorFor(c) }} />
                      {c}
                    </td>
                    <td className="num">{fmtHours(v)}</td>
                    <td className="num muted">{fmtHours(v / (30 / 7))}/wk</td>
                    <td className="bar-cell">
                      <span style={{ width: `${(v / all) * 100}%`, background: colorFor(c) }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">No hours in the last 30 days.</p>
          )}
        </section>
        <section className="card">
          <h2>Most time on</h2>
          {topNamed.length ? (
            <table className="table">
              <tbody>
                {topNamed.map((t) => (
                  <tr key={t.name}>
                    <td>
                      <span className="dot" style={{ background: colorFor(t.category) }} />
                      {t.name}
                    </td>
                    <td className="num">{t.hours ? fmtHours(t.hours) : "–"}</td>
                    <td className="num muted">
                      {t.days} {t.days === 1 ? "day" : "days"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">Nothing yet.</p>
          )}
        </section>
      </div>
      <section className="card">
        <h2>Tracked hours by weekday</h2>
        <SimpleBars data={byWeekday(days, (d) => d.totalHours)} dataKey="value" label="weekday" format={fmtHours} />
      </section>
    </>
  );
}
