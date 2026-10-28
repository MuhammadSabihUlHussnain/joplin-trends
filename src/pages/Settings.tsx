import { useState } from "react";
import { CLAUDE_MODEL } from "../ai/provider";
import { disconnectDropbox, isDropboxConnected, redirectUri, startDropboxLogin } from "../dropbox/auth";
import { ENTRY_TEMPLATE } from "../entry/template";
import { settings, DATA_FILE } from "../settings";
import type { DataSource } from "../state/useTrends";
import type { Categories } from "../types";
import { DEFAULT_CATEGORIES } from "../types";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function Settings(props: {
  categories: Categories | null;
  source: DataSource;
  onCategories: (c: Categories) => void;
  onDemo: () => void;
  onClear: () => void;
}) {
  const [appKey, setAppKey] = useState(settings.get("dropboxAppKey"));
  const [path, setPath] = useState(settings.get("joplinPath"));
  const [notebook, setNotebook] = useState(settings.get("journalNotebook"));
  const [aiKey, setAiKey] = useState(settings.get("anthropicKey"));
  const [connected, setConnected] = useState(isDropboxConnected());
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cats = props.categories ?? DEFAULT_CATEGORIES;
  const [time, setTime] = useState(cats.time.join("\n"));
  const [money, setMoney] = useState(cats.money.join("\n"));
  const bakedKey = Boolean(import.meta.env.VITE_DROPBOX_APP_KEY);

  const persist = (key: Parameters<typeof settings.set>[0], value: string) => settings.set(key, value.trim());

  return (
    <>
      <section className="card">
        <h2>1. Dropbox</h2>
        <p className="muted small">
          Joplin syncs your notes to Dropbox, and this app reads them from there. It saves its results to <code>{DATA_FILE}</code> and
          never writes into Joplin's folder.
        </p>
        {!bakedKey && (
          <Field
            label="Dropbox app key"
            hint={`Create an app at dropbox.com/developers/apps with "Full Dropbox" access and the scopes files.metadata.read, files.content.read and files.content.write. Add this redirect URI: ${redirectUri()}`}
          >
            <input value={appKey} onChange={(e) => setAppKey(e.target.value)} onBlur={() => persist("dropboxAppKey", appKey)} placeholder="e.g. a1b2c3d4e5f6g7h" />
          </Field>
        )}
        <div className="row">
          {connected ? (
            <>
              <span className="ok">● Connected</span>
              <button
                className="secondary"
                onClick={() => {
                  disconnectDropbox();
                  setConnected(false);
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={async () => {
                persist("dropboxAppKey", appKey);
                setError(null);
                try {
                  await startDropboxLogin();
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              Connect Dropbox
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        <Field label="Joplin sync folder in Dropbox" hint="Joplin uses /Apps/Joplin unless you changed it.">
          <input value={path} onChange={(e) => setPath(e.target.value)} onBlur={() => persist("joplinPath", path || "/Apps/Joplin")} />
        </Field>
        <Field label="Journal notebook" hint="Only notes in this Joplin notebook are read.">
          <input value={notebook} onChange={(e) => setNotebook(e.target.value)} onBlur={() => persist("journalNotebook", notebook || "Journal")} />
        </Field>
      </section>

      <section className="card">
        <h2>2. AI</h2>
        <p className="muted small">
          The AI reads each new or edited entry once and pulls out activities, purchases, mood and people. Right now that's Claude (
          {CLAUDE_MODEL}) with your own API key. Signing in with ChatGPT is planned. Without a key, only the Time and Money lists
          in your template are counted.
        </p>
        <Field
          label="Claude API key"
          hint="Kept only in this browser and sent only to api.anthropic.com. Give the key a monthly spend limit in the Claude Console; a journal costs well under a dollar a month."
        >
          <input type="password" autoComplete="off" value={aiKey} onChange={(e) => setAiKey(e.target.value)} onBlur={() => persist("anthropicKey", aiKey)} placeholder="sk-ant-..." />
        </Field>
      </section>

      <section className="card">
        <h2>3. Joplin</h2>
        <ol className="steps">
          <li>In Joplin (desktop and phone): Tools › Options › Synchronisation › target <b>Dropbox</b>.</li>
          <li>
            Leave <b>end-to-end encryption off</b>. Encrypted notes can't be read by this app.
          </li>
          <li>
            Make a notebook called <b>{notebook || "Journal"}</b>, and one note per day titled like <code>2026-10-28</code>.
          </li>
          <li>Start each note with this template, then write freely under Journal:</li>
        </ol>
        <pre className="template">{ENTRY_TEMPLATE}</pre>
        <button
          className="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(ENTRY_TEMPLATE);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy template"}
        </button>
      </section>

      <section className="card">
        <h2>Categories</h2>
        <p className="muted small">One per line. New lists apply to entries the AI reads from now on; fix older ones on the Entries page.</p>
        <div className="grid2">
          <Field label="Time">
            <textarea rows={12} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Money">
            <textarea rows={12} value={money} onChange={(e) => setMoney(e.target.value)} />
          </Field>
        </div>
        <button
          className="secondary"
          disabled={!props.categories}
          title={props.categories ? "" : "Refresh once first"}
          onClick={() => {
            const list = (s: string) => [...new Set(s.split("\n").map((x) => x.trim()).filter(Boolean))];
            const t = list(time);
            const m = list(money);
            if (!t.includes("Other")) t.push("Other");
            if (!m.includes("Other")) m.push("Other");
            props.onCategories({ time: t, money: m });
          }}
        >
          Save categories
        </button>
      </section>

      <section className="card">
        <h2>Sample data</h2>
        <p className="muted small">Explore the dashboard with ten weeks of made-up entries before setting anything up.</p>
        <div className="row">
          <button className="secondary" onClick={props.onDemo}>
            Load sample data
          </button>
          {props.source !== "none" && (
            <button className="secondary" onClick={props.onClear}>
              {props.source === "demo" ? "Remove sample data" : "Clear this browser's copy"}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
