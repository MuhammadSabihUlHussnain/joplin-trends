// Items exactly as Joplin 3.7 (CLI) wrote them to Dropbox on 2026-10-28: the Journal notebook and a
// blank daily entry made from the template.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTemplate } from "../src/entry/template";
import { parseJoplinItem } from "../src/joplin/parseItem";
import { refresh } from "../src/sync/refresh";
import { FakeDropbox } from "./helpers";

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const NOTE = read("real-note.md");
const NOTEBOOK = read("real-notebook.md");

describe("real Joplin sync items", () => {
  it("parses the notebook and the note", () => {
    const folder = parseJoplinItem(NOTEBOOK);
    expect(folder).toMatchObject({ id: "df550c134b5a42d29317f9afce153bcf", type: 2, title: "Journal", encrypted: false });
    const note = parseJoplinItem(NOTE);
    expect(note).toMatchObject({ id: "da51e859407a477cb40bb06156af3afb", type: 1, title: "2026-10-28", parentId: folder.id, isConflict: false });
    expect(note.body.startsWith("---\nmood: ")).toBe(true);
    expect(note.createdTime).toBe("2026-10-28T06:52:36.048Z");
  });

  it("reads the blank template as an entry with nothing filled in yet", () => {
    const t = parseTemplate(parseJoplinItem(NOTE).body);
    expect(t).toMatchObject({ mood: null, energy: null, sleep: null, time: [], money: [] });
  });

  it("runs a full Refresh over the real folder layout", async () => {
    const dbx = new FakeDropbox();
    dbx.put("/Apps/Joplin/info.json", '{"version":3}');
    dbx.put("/Apps/Joplin/da51e859407a477cb40bb06156af3afb.md", NOTE);
    dbx.put("/Apps/Joplin/df550c134b5a42d29317f9afce153bcf.md", NOTEBOOK);
    const res = await refresh({ dropbox: dbx, ai: null, joplinPath: "/Apps/Joplin", notebookName: "Journal" });
    expect(Object.values(res.file.entries).map((e) => [e.title, e.date])).toEqual([["2026-10-28", "2026-10-28"]]);
    expect(res.file.journalFolderId).toBe("df550c134b5a42d29317f9afce153bcf");
  });
});
