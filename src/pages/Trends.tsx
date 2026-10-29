import type { Analysis } from "../App";
import { Money } from "./Money";
import { Mood } from "./Mood";
import { Time } from "./Time";

export type TrendsView = "time" | "money" | "mood";

const VIEWS: [TrendsView, string][] = [
  ["time", "Time"],
  ["money", "Money"],
  ["mood", "Mood & Sleep"],
];

export function Trends({ a, view }: { a: Analysis; view: TrendsView }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Trends</h1>
      </header>
      <div className="segmented" role="tablist">
        {VIEWS.map(([id, label]) => (
          <a key={id} role="tab" aria-selected={view === id} className={view === id ? "on" : ""} href={`#/trends/${id}`}>
            {label}
          </a>
        ))}
      </div>
      <div className="stack">{view === "money" ? <Money a={a} /> : view === "mood" ? <Mood a={a} /> : <Time a={a} />}</div>
    </div>
  );
}
