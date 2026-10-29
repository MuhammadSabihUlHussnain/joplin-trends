// Sample data so the app can be explored before Dropbox is connected.
// It has a few real patterns built in: gym days lift mood, short nights drag it down,
// and food spending doubles in an exam week.

import { addDays, weekOf } from "./analytics/days";
import { seededRandom } from "./analytics/stats";
import { localDate } from "./entry/template";
import { recomputeRecords } from "./sync/refresh";
import { type Activity, emptyTrendsFile, type Entry, type Expense, type TrendsFile } from "./types";

export function demoFile(days = 70): TrendsFile {
  const rand = seededRandom(424);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const today = localDate(new Date());
  const start = addDays(today, -(days - 1));
  const examWeeks = new Set([addDays(weekOf(today), -21), addDays(weekOf(today), -7)]);
  const file = emptyTrendsFile();

  for (let i = 0; i < days; i++) {
    if (rand() < 0.1) continue; // some days have no entry
    const date = addDays(start, i);
    const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const weekend = weekday >= 5;
    const exam = examWeeks.has(weekOf(date));
    const gym = weekday === 0 || weekday === 3 ? rand() < 0.85 : rand() < 0.25;
    const sleep = Math.round(((exam ? 5.4 : 6.8) + gauss() * 0.9) * 2) / 2;
    const activities: Activity[] = [];
    const a = (name: string, category: string, hours: number | null, source: "template" | "ai" = "template") =>
      activities.push({ name, category, hours: hours === null ? null : Math.max(0.25, Math.round(hours * 4) / 4), source });
    if (!weekend) a("class", "Class/Study", 3 + gauss() * 0.7);
    a(exam ? "exam prep" : "homework", "Class/Study", (exam ? 4 : 1.5) + gauss() * 0.6);
    if (!weekend || rand() < 0.5) a("infalytics", "Work", 2.5 + gauss() * 1.2);
    if (rand() < 0.3) a("research", "Research", 1.5 + gauss() * 0.5);
    if (gym) a("gym", "Exercise", 1 + gauss() * 0.2);
    if (weekend && rand() < 0.7) a("friends", "Social", 3 + gauss(), "ai");
    if (weekday === 6 && rand() < 0.8) a("call with family", "Family", 1, "ai");
    a(rand() < 0.5 ? "youtube" : "gaming", "Entertainment", (exam ? 0.5 : 1.5) + rand(), rand() < 0.5 ? "ai" : "template");
    if (!weekend) a("commute", "Commute", 0.75);
    if (rand() < 0.35) a("laundry", "Chores", 1, "ai");

    const expenses: Expense[] = [];
    const e = (merchant: string, category: string, amount: number, source: "template" | "ai" = "template") =>
      expenses.push({ merchant, category, amount: Math.round(Math.max(1, amount) * 100) / 100, source });
    if (rand() < 0.6) e(rand() < 0.5 ? "chipotle" : "starbucks", "Food", (exam ? 22 : 11) + gauss() * 3);
    if (exam && rand() < 0.6) e("doordash", "Food", 24 + gauss() * 5, "ai");
    if (weekday === 6) e("walmart", "Groceries", 48 + gauss() * 10);
    if (weekday === 2 && rand() < 0.8) e("gas", "Transport/Gas", 38 + gauss() * 5);
    if (rand() < 0.08) e("amazon", "Shopping", 30 + rand() * 40, "ai");
    if (date.endsWith("-05")) e("spotify", "Subscriptions", 11.99);
    if (date.endsWith("-01")) e("phone bill", "Bills", 45);

    let mood = 6.1 + (gym ? 1.6 : 0) + 0.7 * (sleep - 6.5) + (weekend ? 0.5 : 0) - (exam ? 0.8 : 0) + gauss() * 0.9;
    mood = Math.round(Math.min(10, Math.max(1, mood)));
    const energy = Math.round(Math.min(10, Math.max(1, mood - 0.5 + gauss() * 0.8)));
    const people = [...(weekend && rand() < 0.6 ? ["Ali"] : []), ...(rand() < 0.25 ? ["Zain"] : [])];
    const themes = [...(exam ? ["exams"] : []), ...(rand() < 0.3 ? ["fundraising"] : []), ...(rand() < 0.2 ? ["health"] : [])];

    const id = date;
    const journal = [
      exam ? "Exam week, so most of the day went to prep." : weekend ? "Slower day." : "Classes, then work on Infalytics.",
      gym ? "Got to the gym, which helped." : sleep < 6 ? "Running on not much sleep." : "",
      people.includes("Ali") ? "Caught up with Ali in the evening." : "",
    ]
      .filter(Boolean)
      .join(" ");
    // Stored the way a real Refresh stores it (template numbers + an AI result), so category fixes
    // recompute demo entries exactly like real ones.
    const typed = activities.filter((x) => x.source === "template");
    const typedMoney = expenses.filter((x) => x.source === "template");
    const entry: Entry = {
      id,
      title: date,
      date,
      updatedTime: `${date}T23:00:00.000Z`,
      textHash: `demo-${i}`,
      status: "ok",
      template: {
        date: null,
        mood,
        energy: null,
        sleep,
        time: typed.map((x) => ({ name: x.name, hours: x.hours })),
        money: typedMoney.map((x) => ({ merchant: x.merchant, amount: x.amount })),
        freeText: journal,
      },
      ai: {
        mood,
        energy,
        sleep_hours: sleep,
        activities: activities.map(({ name, category, hours }) => ({ name, category, hours })),
        expenses: expenses.map(({ merchant, category, amount }) => ({ merchant, category, amount })),
        people,
        places: rand() < 0.3 ? ["library"] : [],
        themes,
        sentiment: Math.round(((mood - 5.5) / 4.5) * 100) / 100,
        notable_events: exam && rand() < 0.3 ? ["CSC 424 exam"] : [],
      },
      record: null as unknown as Entry["record"],
    };
    file.entries[date] = entry;
  }
  recomputeRecords(file);
  file.updatedAt = new Date().toISOString();
  return file;
}
