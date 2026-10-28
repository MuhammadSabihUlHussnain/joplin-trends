import { beforeEach, describe, expect, it } from "vitest";
import { AiError, type AiProvider } from "../src/ai/provider";
import { DATA_FILE } from "../src/settings";
import { refresh } from "../src/sync/refresh";
import type { Categories, Extraction } from "../src/types";
import { FakeDropbox, joplinFolder, joplinNote } from "./helpers";

const ROOT = "/Apps/Joplin";
const JOURNAL = "1".repeat(32);
const OTHER = "2".repeat(32);
const n = (k: number) => k.toString(16).padStart(32, "0");

class FakeAi implements AiProvider {
  readonly name = "fake";
  calls: string[] = [];
  failWith: AiError | null = null;
  async extract(input: { date: string; title: string; text: string }, _c: Categories): Promise<Extraction> {
    this.calls.push(input.title);
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

let dbx: FakeDropbox;
let ai: FakeAi;
const run = () => refresh({ dropbox: dbx, ai, joplinPath: ROOT, notebookName: "Journal" });

beforeEach(() => {
  dbx = new FakeDropbox();
  ai = new FakeAi();
  dbx.put(`${ROOT}/info.json`, '{"version":3}');
  dbx.put(`${ROOT}/${JOURNAL}.md`, joplinFolder(JOURNAL, "Journal"));
  dbx.put(`${ROOT}/${OTHER}.md`, joplinFolder(OTHER, "Recipes"));
  dbx.put(`${ROOT}/${n(1)}.md`, joplinNote({ id: n(1), parentId: JOURNAL, title: "2026-10-26", body: "## Time\n- class 3h\nWent to the gym." }));
  dbx.put(`${ROOT}/${n(2)}.md`, joplinNote({ id: n(2), parentId: JOURNAL, title: "2026-10-27", body: "## Money\n- $12 chipotle" }));
  dbx.put(`${ROOT}/${n(3)}.md`, joplinNote({ id: n(3), parentId: OTHER, title: "Pasta", body: "secret recipe" }));
});

describe("refresh", () => {
  it("reads only the journal notebook and saves data.json outside Joplin's folder", async () => {
    const res = await run();
    expect(Object.keys(res.file.entries).sort()).toEqual([n(1), n(2)]);
    expect(ai.calls.sort()).toEqual(["2026-10-26", "2026-10-27"]);
    expect(res.stats).toMatchObject({ analyzed: 2, journalEntries: 2, pending: 0 });
    const saved = JSON.parse(dbx.files.get(DATA_FILE.toLowerCase())!.text);
    expect(saved.cursor).toBeTruthy();
    expect(JSON.stringify(saved)).not.toContain("secret recipe");
    expect(JSON.stringify(saved)).not.toContain("Pasta");
  });

  it("sends nothing to the AI when nothing changed", async () => {
    await run();
    ai.calls = [];
    dbx.downloads = [];
    const res = await run();
    expect(ai.calls).toEqual([]);
    expect(dbx.downloads).toEqual([DATA_FILE.toLowerCase()]);
    expect(res.stats.journalEntries).toBe(2);
  });

  it("re-analyzes only the edited note and drops deleted ones", async () => {
    await run();
    ai.calls = [];
    dbx.put(`${ROOT}/${n(1)}.md`, joplinNote({ id: n(1), parentId: JOURNAL, title: "2026-10-26", body: "## Time\n- class 4h" }));
    dbx.remove(`${ROOT}/${n(2)}.md`);
    const res = await run();
    expect(ai.calls).toEqual(["2026-10-26"]);
    expect(Object.keys(res.file.entries)).toEqual([n(1)]);
    expect(res.file.entries[n(1)].record.activities.find((a) => a.name === "class")?.hours).toBe(4);
  });

  it("keeps entries pending on retryable AI errors and retries them next time", async () => {
    ai.failWith = new AiError("rate limited", true);
    const first = await run();
    expect(first.stats.pending).toBe(2);
    expect(first.file.entries[n(1)].record.activities.find((a) => a.name === "class")?.hours).toBe(3); // template still counts
    ai.failWith = null;
    ai.calls = [];
    const second = await run();
    expect(ai.calls.sort()).toEqual(["2026-10-26", "2026-10-27"]);
    expect(second.stats.pending).toBe(0);
  });

  it("stops after the first bad-key error instead of failing every entry", async () => {
    ai.failWith = new AiError("Claude rejected the API key. Check it in Settings.", false);
    const res = await refresh({ dropbox: dbx, ai, joplinPath: ROOT, notebookName: "Journal", aiConcurrency: 1 });
    expect(ai.calls).toHaveLength(1);
    expect(res.warnings.join(" ")).toMatch(/API key/);
  });

  it("works without an AI key and picks the notes up once a key is added", async () => {
    const res = await refresh({ dropbox: dbx, ai: null, joplinPath: ROOT, notebookName: "Journal" });
    expect(res.file.entries[n(1)].status).toBe("no-ai");
    expect(res.warnings.join(" ")).toMatch(/No AI key/);
    const later = await run();
    expect(ai.calls.sort()).toEqual(["2026-10-26", "2026-10-27"]);
    expect(later.file.entries[n(1)].status).toBe("ok");
  });

  it("also reads a second Journal nested in another notebook, and its sub-notebooks", async () => {
    // What Joplin mobile produced: Welcome! > Journal, next to the top-level Journal.
    const WELCOME = "3".repeat(32);
    const PHONE_JOURNAL = "4".repeat(32);
    const OCTOBER = "5".repeat(32);
    dbx.put(`${ROOT}/${WELCOME}.md`, joplinFolder(WELCOME, "Welcome!"));
    dbx.put(`${ROOT}/${PHONE_JOURNAL}.md`, joplinFolder(PHONE_JOURNAL, "Journal").replace("parent_id: ", `parent_id: ${WELCOME}`));
    dbx.put(`${ROOT}/${OCTOBER}.md`, joplinFolder(OCTOBER, "October").replace("parent_id: ", `parent_id: ${PHONE_JOURNAL}`));
    dbx.put(`${ROOT}/${n(5)}.md`, joplinNote({ id: n(5), parentId: PHONE_JOURNAL, title: "2026-10-25", body: "## Time\n- gym 1h" }));
    dbx.put(`${ROOT}/${n(6)}.md`, joplinNote({ id: n(6), parentId: OCTOBER, title: "2026-10-24", body: "## Money\n- $5 coffee" }));
    const res = await run();
    expect(Object.keys(res.file.entries).sort()).toEqual([n(1), n(2), n(5), n(6)]);
    expect(res.file.journalFolderId).toBe(JOURNAL); // the top-level one stays the main notebook
    expect(res.warnings.join(" ")).toMatch(/Found 2 notebooks named "Journal" \(one inside "Welcome!"\)/);
    expect(JSON.stringify(res.file.entries)).not.toContain("secret recipe");
  });

  it("explains a missing notebook or a wrong Joplin path", async () => {
    const res = await refresh({ dropbox: dbx, ai, joplinPath: ROOT, notebookName: "Diary" });
    expect(res.warnings.join(" ")).toMatch(/No notebook named "Diary"/);
    await expect(refresh({ dropbox: dbx, ai, joplinPath: "/Apps/Nope", notebookName: "Journal" })).rejects.toThrow(/no Joplin folder/);
  });

  it("merges when another device saved data.json in between", async () => {
    await run();
    // Another device adds a category fix and saves first.
    const remote = JSON.parse(dbx.files.get(DATA_FILE.toLowerCase())!.text);
    remote.overrides.push({ kind: "activity", match: "gym", category: "Health" });
    dbx.put(DATA_FILE, JSON.stringify(remote));
    dbx.put(`${ROOT}/${n(4)}.md`, joplinNote({ id: n(4), parentId: JOURNAL, title: "2026-10-28", body: "gym again" }));
    const res = await run();
    expect(Object.keys(res.file.entries)).toContain(n(4));
    expect(res.file.overrides).toEqual([{ kind: "activity", match: "gym", category: "Health" }]);
    expect(res.file.entries[n(4)].record.activities[0].category).toBe("Health");
  });
});
