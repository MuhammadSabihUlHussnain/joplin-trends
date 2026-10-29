// Dropbox OAuth 2 with PKCE. No client secret is involved, so it runs entirely in the browser.
// The refresh token is kept in this browser's localStorage. Disconnecting clears it.

import { settings } from "../settings";

const AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const SCOPES = "files.metadata.read files.content.read files.content.write";
const PKCE_KEY = "jt.dropbox.pkce";

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

/** The page URL without query or hash. Dropbox must have this exact value as a redirect URI. */
export function redirectUri(): string {
  return `${location.origin}${location.pathname}`;
}

function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkcePair() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

function requireAppKey(): string {
  const appKey = settings.dropboxAppKey();
  if (!appKey) throw new Error("Add your Dropbox app key in Settings first.");
  return appKey;
}

/**
 * True when Daybook runs as a home-screen app. There, a sign-in that leaves the app finishes in the
 * browser instead (which has separate storage), so the copy-the-code flow is used.
 */
export function isHomeScreenApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || matchMedia("(display-mode: standalone)").matches;
}

/** Sign in by leaving for Dropbox and coming straight back (normal browser tabs). */
export async function startDropboxLogin(): Promise<void> {
  const appKey = requireAppKey();
  const { verifier, challenge } = await pkcePair();
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const params = new URLSearchParams({
    client_id: appKey,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
  });
  location.assign(`${AUTHORIZE_URL}?${params}`);
}

const CODE_KEY = "jt.dropbox.pkce.code";

/**
 * Sign in by opening Dropbox's approval page in a new window; Dropbox then shows a code to paste back
 * into the app. Nothing leaves the app's own storage, so it works from a home-screen app too.
 */
export async function startDropboxCodeLogin(): Promise<void> {
  const appKey = requireAppKey();
  const { verifier, challenge } = await pkcePair();
  localStorage.setItem(CODE_KEY, verifier);
  const params = new URLSearchParams({
    client_id: appKey,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
    scope: SCOPES,
  });
  const url = `${AUTHORIZE_URL}?${params}`;
  // A new tab/window keeps this page (and the code box) open; fall back to this tab if blocked.
  const w = window.open(url, "_blank");
  if (w) w.opener = null;
  else location.assign(url);
}

/** Finish the copy-the-code sign-in with the code Dropbox showed. */
export async function finishDropboxCodeLogin(code: string): Promise<void> {
  const verifier = localStorage.getItem(CODE_KEY);
  if (!verifier) throw new Error("Press Connect Dropbox first, then paste the code it shows.");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: code.trim(), client_id: requireAppKey(), code_verifier: verifier }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(/invalid_grant|code/i.test(text) ? "That code didn't work. Codes only work once and expire after a few minutes, so press Connect Dropbox for a new one." : `Dropbox sign-in failed (${res.status}).`);
  }
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  localStorage.removeItem(CODE_KEY);
  saveTokens({ accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: Date.now() + json.expires_in * 1000 });
}

/** Call once on page load. Finishes a login if Dropbox just redirected back with ?code=. */
export async function completeDropboxLogin(): Promise<boolean> {
  const query = new URLSearchParams(location.search);
  const code = query.get("code");
  const error = query.get("error");
  if (!code && !error) return false;
  const saved = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  history.replaceState(null, "", redirectUri() + location.hash);
  if (error) throw new Error(`Dropbox sign-in was cancelled (${error}).`);
  if (!saved) throw new Error("Dropbox sign-in expired. Try Connect again.");
  const { verifier, state } = JSON.parse(saved) as { verifier: string; state: string };
  if (query.get("state") !== state) throw new Error("Dropbox sign-in didn't match this session. Try Connect again.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code!,
      client_id: settings.dropboxAppKey(),
      code_verifier: verifier,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Dropbox sign-in failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  saveTokens({ accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: Date.now() + json.expires_in * 1000 });
  return true;
}

function saveTokens(t: Tokens) {
  settings.set("dropboxTokens", JSON.stringify(t));
}

function loadTokens(): Tokens | null {
  const raw = settings.get("dropboxTokens");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

export function isDropboxConnected(): boolean {
  return loadTokens() !== null;
}

export function disconnectDropbox() {
  settings.remove("dropboxTokens");
}

/** A valid access token, refreshed a minute before it expires. */
export async function dropboxAccessToken(): Promise<string> {
  const t = loadTokens();
  if (!t) throw new Error("Dropbox isn't connected. Connect it in Settings.");
  if (Date.now() < t.expiresAt - 60_000) return t.accessToken;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refreshToken, client_id: settings.dropboxAppKey() }),
  });
  if (res.status === 400 || res.status === 401) {
    disconnectDropbox();
    throw new Error("Dropbox access was revoked or expired. Connect it again in Settings.");
  }
  if (!res.ok) throw new Error(`Couldn't refresh Dropbox access (${res.status}).`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  saveTokens({ ...t, accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}
