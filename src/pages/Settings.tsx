import { useState } from "react";
import { CLAUDE_MODEL } from "../ai/provider";
import { disconnectDropbox, isDropboxConnected, redirectUri, startDropboxLogin } from "../dropbox/auth";
import { type AiChoice, DATA_ROOT, settings } from "../settings";
import type { DataSource } from "../state/useTrends";
import type { Categories } from "../types";
import { DEFAULT_CATEGORIES } from "../types";

export function Settings(props: {
  categories: Categories | null;
  source: DataSource;
  onCategories: (c: Categories) => void;
  onDemo: () => void;
  onClear: () => void;
}) {
  const [appKey, setAppKey] = useState(settings.get("dropboxAppKey"));
  const [aiKey, setAiKey] = useState(settings.get("anthropicKey"));
  const [ai, setAi] = useState<AiChoice>(settings.aiProvider());
  const [connected, setConnected] = useState(isDropboxConnected());
  const [error, setError] = useState<string | null>(null);
  const cats = props.categories ?? DEFAULT_CATEGORIES;
  const [time, setTime] = useState(cats.time.join("\n"));
  const [money, setMoney] = useState(cats.money.join("\n"));
  const [savedCats, setSavedCats] = useState(false);
  const bakedKey = Boolean(import.meta.env.VITE_DROPBOX_APP_KEY);

  const chooseAi = (v: AiChoice) => {
    setAi(v);
    settings.set("aiProvider", v);
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <h3 className="section-label">Storage</h3>
      <section className="group list">
        <div className="list-row">
          <span className="list-title">Dropbox</span>
          {connected ? <span className="status ok">Connected</span> : <span className="status">Not connected</span>}
        </div>
        {!bakedKey && (
          <label className="list-row input-row">
            <span className="list-title">App key</span>
            <input value={appKey} onChange={(e) => setAppKey(e.target.value)} onBlur={() => settings.set("dropboxAppKey", appKey.trim())} placeholder="From dropbox.com/developers" />
          </label>
        )}
        <div className="list-row">
          {connected ? (
            <button
              className="link destructive"
              onClick={() => {
                disconnectDropbox();
                setConnected(false);
              }}
            >
              Disconnect Dropbox
            </button>
          ) : (
            <button
              className="link"
              onClick={async () => {
                settings.set("dropboxAppKey", appKey.trim());
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
      </section>
      {error && <p className="footnote error">{error}</p>}
      <p className="footnote">
        Notes are saved as one Markdown file per day in <code>{DATA_ROOT}/notes</code>, and the results in <code>{DATA_ROOT}/data.json</code>.
        {!bakedKey && ` The Dropbox app needs this redirect URI: ${redirectUri()}`}
      </p>

      <h3 className="section-label">AI</h3>
      <section className="group list">
        <div className="list-row">
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={ai === "claude"} className={ai === "claude" ? "on" : ""} onClick={() => chooseAi("claude")}>
              Claude
            </button>
            <button role="tab" aria-selected={ai === "chatgpt"} className={ai === "chatgpt" ? "on" : ""} onClick={() => chooseAi("chatgpt")}>
              ChatGPT
            </button>
          </div>
        </div>
        {ai === "claude" ? (
          <label className="list-row input-row">
            <span className="list-title">API key</span>
            <input
              type="password"
              autoComplete="off"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              onBlur={() => settings.set("anthropicKey", aiKey.trim())}
              placeholder="sk-ant-…"
            />
          </label>
        ) : (
          <div className="list-row column">
            <button className="chatgpt-btn" disabled>
              Continue with ChatGPT
            </button>
            <span className="muted small">
              Not available on this site yet. OpenAI only lets apps use your ChatGPT plan when they run on your own computer, or
              after OpenAI approves a hosted site.
            </span>
          </div>
        )}
      </section>
      <p className="footnote">
        {ai === "claude"
          ? `Each new or edited note is read once by ${CLAUDE_MODEL}. The key stays in this browser and only goes to api.anthropic.com. Give it a monthly spend limit in the Claude Console; a journal costs well under a dollar a month.`
          : "Until then, choose Claude, or leave AI off and only the Time and Money lists are counted."}
      </p>

      <h3 className="section-label">Categories</h3>
      <section className="group">
        <div className="grid2">
          <label className="field">
            <span>Time</span>
            <textarea rows={12} value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Money</span>
            <textarea rows={12} value={money} onChange={(e) => setMoney(e.target.value)} />
          </label>
        </div>
        <button
          className="btn"
          disabled={!props.categories}
          title={props.categories ? "" : "Refresh once first"}
          onClick={() => {
            const list = (s: string) => [...new Set(s.split("\n").map((x) => x.trim()).filter(Boolean))];
            const t = list(time);
            const m = list(money);
            if (!t.includes("Other")) t.push("Other");
            if (!m.includes("Other")) m.push("Other");
            props.onCategories({ time: t, money: m });
            setSavedCats(true);
            setTimeout(() => setSavedCats(false), 1500);
          }}
        >
          {savedCats ? "Saved" : "Save categories"}
        </button>
      </section>
      <p className="footnote">One per line. New lists apply to notes the AI reads from now on; fix older ones from the note itself.</p>

      <h3 className="section-label">Sample data</h3>
      <section className="group list">
        <div className="list-row">
          <button className="link" onClick={props.onDemo}>
            Load ten weeks of sample notes
          </button>
        </div>
        {props.source !== "none" && (
          <div className="list-row">
            <button className="link destructive" onClick={props.onClear}>
              {props.source === "demo" ? "Remove sample data" : "Clear this browser's copy"}
            </button>
          </div>
        )}
      </section>

      <h3 className="section-label">Privacy</h3>
      <section className="group">
        <p className="small">
          This page runs entirely in your browser. Your notes go only to your Dropbox and, when you press Refresh, to the AI you chose.
          Keys and sign-ins are kept in this browser, so each device connects once.
        </p>
      </section>
    </div>
  );
}
