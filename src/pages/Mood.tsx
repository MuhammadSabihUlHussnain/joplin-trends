import { byWeekday, rolling, series } from "../analytics/rollups";
import type { Analysis } from "../App";
import { LineSeries, SimpleBars } from "../ui/charts";

export function Mood({ a }: { a: Analysis }) {
  const { days } = a;
  const mood = rolling(series(days, (d) => d.mood), 7);
  const energy = rolling(series(days, (d) => d.energy), 7);
  const sleep = rolling(series(days, (d) => d.sleep), 7);
  const data = mood.map((m, i) => ({ date: m.date, mood: m.value, moodAvg: m.avg, energyAvg: energy[i].avg }));
  const sleepData = sleep.map((s) => ({ date: s.date, sleep: s.value, sleepAvg: s.avg }));
  const hasMood = days.some((d) => d.mood !== null);

  return (
    <>
      <section className="card">
        <h2>Mood and energy</h2>
        {hasMood ? (
          <LineSeries
            data={data}
            domain={[1, 10]}
            lines={[
              { key: "mood", label: "Mood", color: "#4f7cff" },
              { key: "moodAvg", label: "Mood, 7-entry average", color: "#4f7cff", dashed: true },
              { key: "energyAvg", label: "Energy, 7-entry average", color: "#f2a33a", dashed: true },
            ]}
          />
        ) : (
          <p className="empty">Add "mood: 7" at the top of your entries (1 to 10) to see this chart.</p>
        )}
      </section>
      <section className="card">
        <h2>Sleep</h2>
        {days.some((d) => d.sleep !== null) ? (
          <LineSeries
            data={sleepData}
            lines={[
              { key: "sleep", label: "Hours slept", color: "#6b7fa8" },
              { key: "sleepAvg", label: "7-entry average", color: "#6b7fa8", dashed: true },
            ]}
          />
        ) : (
          <p className="empty">Add "sleep: 7" at the top of your entries to see this chart.</p>
        )}
      </section>
      <section className="card">
        <h2>Mood by weekday</h2>
        <SimpleBars data={byWeekday(days, (d) => d.mood)} dataKey="value" label="weekday" />
      </section>
    </>
  );
}
