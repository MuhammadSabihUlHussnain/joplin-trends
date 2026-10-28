import { addDays, weekOf } from "../analytics/days";
import { byMerchant, byWeekday, topExpenses, totalsBetween, weekly } from "../analytics/rollups";
import type { Analysis } from "../App";
import { SimpleBars, StackedWeeks } from "../ui/charts";
import { colorFor, fmtMoney, shortDate } from "../ui/format";

export function Money({ a }: { a: Analysis }) {
  const { days, today, file } = a;
  const rows = weekly(days, "spend", file.categories.money, today).filter((r) => r.week >= addDays(weekOf(today), -7 * 11));
  const from = addDays(today, -29);
  const totals = Object.entries(totalsBetween(days, from, today, "spend")).sort((x, y) => y[1] - x[1]);
  const all = totals.reduce((s, [, v]) => s + v, 0);

  return (
    <>
      <section className="card">
        <h2>Spending per week</h2>
        <StackedWeeks rows={rows} categories={file.categories.money} unit="money" height={320} />
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
                    <td className="num">{fmtMoney(v)}</td>
                    <td className="num muted">{Math.round((v / all) * 100)}%</td>
                    <td className="bar-cell">
                      <span style={{ width: `${(v / all) * 100}%`, background: colorFor(c) }} />
                    </td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Total</td>
                  <td className="num">{fmtMoney(all)}</td>
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="empty">No spending in the last 30 days.</p>
          )}
        </section>
        <section className="card">
          <h2>Where it went</h2>
          <table className="table">
            <tbody>
              {byMerchant(days, from).map((m) => (
                <tr key={m.merchant}>
                  <td>
                    <span className="dot" style={{ background: colorFor(m.category) }} />
                    {m.merchant}
                  </td>
                  <td className="num">{fmtMoney(m.amount)}</td>
                  <td className="num muted">{m.count}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <div className="grid2">
        <section className="card">
          <h2>Biggest purchases, last 30 days</h2>
          <table className="table">
            <tbody>
              {topExpenses(days, from, 8).map((e, i) => (
                <tr key={i}>
                  <td className="muted">{shortDate(e.date)}</td>
                  <td>{e.merchant}</td>
                  <td className="num">{fmtMoney(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Average spend by weekday</h2>
          <SimpleBars data={byWeekday(days, (d) => d.totalSpend)} dataKey="value" label="weekday" format={fmtMoney} />
        </section>
      </div>
    </>
  );
}
