import { useState } from "react";
import { finishDropboxCodeLogin, isHomeScreenApp, startDropboxCodeLogin, startDropboxLogin } from "../dropbox/auth";

/**
 * The Connect Dropbox button. In a normal browser tab it goes to Dropbox and comes straight back.
 * From a home-screen app (or by choice) it opens Dropbox's approval page in a new window, and the
 * code Dropbox shows is pasted back here.
 */
export function ConnectDropbox({ compact = false }: { compact?: boolean }) {
  const [waiting, setWaiting] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openCodePage = () =>
    run(async () => {
      await startDropboxCodeLogin();
      setWaiting(true);
    });

  const connect = () => (isHomeScreenApp() ? openCodePage() : run(startDropboxLogin));

  const finish = () =>
    run(async () => {
      if (!code.trim()) throw new Error("Paste the code Dropbox showed you.");
      setBusy(true);
      try {
        await finishDropboxCodeLogin(code);
        location.hash = "#/notes";
        location.reload();
      } finally {
        setBusy(false);
      }
    });

  if (waiting) {
    return (
      <div className={`connect ${compact ? "compact" : ""}`}>
        <ol className="connect-steps">
          <li>In the Dropbox page that just opened, press <b>Allow</b>.</li>
          <li>Copy the code Dropbox shows.</li>
          <li>Come back here and paste it.</li>
        </ol>
        <div className="code-row">
          <input
            className="code-input"
            placeholder="Paste the code"
            value={code}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void finish()}
          />
          <button className="btn primary" disabled={busy} onClick={() => void finish()}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
        <button className="link small" onClick={() => void openCodePage()}>
          Open the Dropbox page again
        </button>
        {error && <p className="footnote error">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`connect ${compact ? "compact" : ""}`}>
      <button className="btn primary" onClick={() => void connect()}>
        Connect Dropbox
      </button>
      {!isHomeScreenApp() && (
        <button className="link small" onClick={() => void openCodePage()}>
          Use a code instead
        </button>
      )}
      {error && <p className="footnote error">{error}</p>}
    </div>
  );
}
