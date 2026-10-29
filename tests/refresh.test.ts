import { beforeEach, describe, expect, it } from "vitest";
import { AiError, type AiProvider } from "../src/ai/provider";
import { emptyNote, fromMarkdown, isBlank, notePath, toMarkdown } from "../src/notes/format";
import { NoteConflictError, saveNote } from "../src/notes/store";
import { DATA_FILE } from "../src/settings";
import { refresh } from "../src/sync/refresh";
import type { Categories, Extraction } from "../src/types";
import { FakeDropbox } from "./helpers";

class FakeAi implements AiProvider {
  readonly name = "fake";
  calls: string[] = [];
  failWith: AiError | null = null;
  async extract(input: { date: string; title: string; text: string }, _c: Categories): Promise<Extraction> {
    this.calls.push(input.date);
    if (this.failWith) throw this.failWith;
    return {
      mood: 6,
      energy: null,
      sleep_hours: null,
      activities: [{ name: "gym", category: "Exercise", hours: null }],
      expenses: [],
      people: [],
      places: [],
      themes: [],
      sentiment: 0,
      notable_events: [],
    };
  }
}

const note = (date: string, over: Partial<ReturnType<typeof emptyNote>>) => toMarkdown({ ...emptyNote(date), ...over });

let dbx: FakeDropbox;
let ai: FakeAi;
const run = () => refresh({ dropbox: dbx, ai });
const saved = () => JSON.parse(dbx.files.get(DATA_FILE.toLowerCase())!.text);

beforeEach(() => {
  dbx = new FakeDropbox();
  ai = new FakeAi();
  dbx.put(notePath("2026-10-26"), note("2026-10-26", { mood: 7, time: [{ name: "class", hours: 3 }], journal: "Went to the gym." }));
  dbx.put(notePath("2026-10-27"), note("2026-10-27", { money: [{ merchant: "chipotle", amount: 12 }] }));
});

describe("note files", () => {
  it("round-trip between the editor and Markdown", () => {
    const draft = { ...emptyNote("2026-10-28"), mood: 7, sleep: 6.5, time: [{ name: "class", hours: 1.25 }], money: [{ merchant: "gas", amount: 38 }], journal: "Long day.\n\nSecond paragraph." };
    const md = toMarkdown(draft);
    expect(md).toContain("- class 1h 15m");
    expect(md).toContain("- $38 gas");
    expect(fromMarkdown("2026-10-28", md)).toEqual(draft);
  });

  it("knows a freshly opened note is blank", () => {
    expect(isBlank(fromMarkdown("2026-10-28", toMarkdown(emptyNote("2026-10-28"))))).toBe(true);
  });

  it("refuses to overwrite a note that changed on another device", async () => {
    const first = await saveNote(dbx, { ...emptyNote("2026-10-29"), journal: "phone" }, null);
    await saveNote(dbx, { ...emptyNote("2026-10-29"), journal: "laptop" }, first.rev);
    const err = await saveNote(dbx, { ...emptyNote("2026-10-29"), journal: "phone again" }, first.rev).catch((e) => e);
    expect(err).toBeInstanceOf(NoteConflictError);
    expect((err as NoteConflictError).remote.draft.journal).toBe("laptop");
  });
});

describe("refresh", () => {
  it("analyzes every note and saves the results next to them", async () => {
    const res = await run();
    expect(Object.keys(res.file.entries).sort()).toEqual(["2026-10-26", "2026-10-27"]);
    expect(ai.calls.sort()).toEqual(["2026-10-26", "2026-10-27"]);
    expect(res.stats).toMatchObject({ analyzed: 2, entries: 2, pending: 0 });
    expect(res.file.entries["2026-10-26"].record.mood).toBe(7); // typed value wins over the AI's 6
    expect(saved().notesCursor).toBeTruthy();
  });

  it("sends nothing to the AI when nothing changed", async () => {
    await run();
    ai.calls = [];
    dbx.downloads = [];
    const res = await run();
    expect(ai.calls).toEqual([]);
    expect(dbx.downloads).toEqual([DATA_FILE.toLowerCase()]);
    expect(res.stats.entries).toBe(2);
  });

  it("re-analyzes only the edited note and drops deleted ones", async () => {
    await run();
    ai.calls = [];
    dbx.put(notePath("2026-10-26"), note("2026-10-26", { time: [{ name: "class", hours: 4 }] }));
    dbx.remove(notePath("2026-10-27"));
    const res = await run();
    expect(ai.calls).toEqual(["2026-10-26"]);
    expect(Object.keys(res.file.entries)).toEqual(["2026-10-26"]);
    expect(res.file.entries["2026-10-26"].record.activities.find((a) => a.name === "class")?.hours).toBe(4);
  });

  it("skips days that were opened but left blank", async () => {
    dbx.put(notePath("2026-10-28"), toMarkdown(emptyNote("2026-10-28")));
    const res = await run();
    expect(res.file.entries["2026-10-28"]).toBeUndefined();
    expect(ai.calls).not.toContain("2026-10-28");
  });

  it("keeps notes pending on retryable AI errors and retries them next time", async () => {
    ai.failWith = new AiError("rate limited", true);
    const first = await run();
    expect(first.stats.pending).toBe(2);
    expect(first.file.entries["2026-10-26"].record.activities.find((a) => a.name === "class")?.hours).toBe(3);
    ai.failWith = null;
    ai.calls = [];
    const second = await run();
    expect(ai.calls.sort()).toEqual(["2026-10-26", "2026-10-27"]);
    expect(second.stats.pending).toBe(0);
  });

  it("stops after the first bad-key error instead of failing every note", async () => {
    ai.failWith = new AiError("Claude rejected the API key. Check it in Settings.", false);
    const res = await refresh({ dropbox: dbx, ai, aiConcurrency: 1 });
    expect(ai.calls).toHaveLength(1);
    expect(res.warnings.join(" ")).toMatch(/API key/);
  });

  it("works without AI and picks the notes up once AI is connected", async () => {
    const res = await refresh({ dropbox: dbx, ai: null });
    expect(res.file.entries["2026-10-26"].status).toBe("no-ai");
    expect(res.warnings.join(" ")).toMatch(/No AI connected/);
    const later = await run();
    expect(ai.calls.sort()).toEqual(["2026-10-26", "2026-10-27"]);
    expect(later.file.entries["2026-10-26"].status).toBe("ok");
  });

  it("starts cleanly when there are no notes yet", async () => {
    dbx = new FakeDropbox();
    const res = await refresh({ dropbox: dbx, ai });
    expect(res.stats.entries).toBe(0);
    expect(saved().version).toBe(2);
  });

  it("turns entries from the Joplin era into notes without paying for the AI again", async () => {
    dbx = new FakeDropbox();
    const oldAi: Extraction = { mood: 7, energy: null, sleep_hours: 7, activities: [{ name: "class", category: "Class/Study", hours: 2 }], expenses: [{ amount: 10, merchant: "shawarma", category: "Food" }], people: [], places: [], themes: ["coursework"], sentiment: 0.3, notable_events: [] };
    const template = { date: null, mood: 7, energy: null, sleep: 7, time: [{ name: "class", hours: 2 }], money: [{ merchant: "canes", amount: 12 }], freeText: "## Journal\nWatched Iron Man." };
    const blank = { date: null, mood: null, energy: null, sleep: null, time: [], money: [], freeText: "## Journal" };
    dbx.put(DATA_FILE, JSON.stringify({
      version: 1,
      cursor: "x",
      cursorPath: "/Apps/Joplin",
      journalFolderId: "j",
      items: {},
      overrides: [{ kind: "expense", match: "canes", category: "Food" }],
      categories: { time: ["Class/Study", "Other"], money: ["Food", "Other"] },
      entries: {
        abc: { id: "abc", title: "2026-10-27", date: "2026-10-27", updatedTime: "2026-10-28T07:05:00Z", textHash: "h", status: "ok", template, ai: oldAi, record: {} },
        def: { id: "def", title: "2026-10-28", date: "2026-10-28", updatedTime: "2026-10-28T06:52:00Z", textHash: "h2", status: "ok", template: blank, ai: null, record: {} },
      },
    }));
    const res = await refresh({ dropbox: dbx, ai });
    expect(ai.calls).toEqual([]); // the old AI result was kept
    expect(Object.keys(res.file.entries)).toEqual(["2026-10-27"]); // the blank day was dropped
    const md = dbx.files.get(notePath("2026-10-27").toLowerCase())!.text;
    expect(md).toContain("- $12 canes");
    expect(md).toContain("Watched Iron Man.");
    expect(md.match(/## Journal/g)).toHaveLength(1);
    expect(res.file.entries["2026-10-27"].record.expenses.map((e) => e.merchant).sort()).toEqual(["canes", "shawarma"]);
    expect(res.file.overrides).toHaveLength(1);
    expect(res.warnings.join(" ")).toMatch(/Moved 1 earlier entry/);
    expect(saved().version).toBe(2);
  });

  it("merges when another device saved data.json in between", async () => {
    await run();
    const remote = saved();
    remote.overrides.push({ kind: "activity", match: "gym", category: "Health" });
    dbx.put(DATA_FILE, JSON.stringify(remote));
    dbx.put(notePath("2026-10-28"), note("2026-10-28", { journal: "gym again" }));
    const res = await run();
    expect(Object.keys(res.file.entries)).toContain("2026-10-28");
    expect(res.file.overrides).toEqual([{ kind: "activity", match: "gym", category: "Health" }]);
    expect(res.file.entries["2026-10-28"].record.activities[0].category).toBe("Health");
  });
});
