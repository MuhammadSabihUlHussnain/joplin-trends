// Per-browser settings. Secrets (AI key, sign-in tokens) never leave this browser except to their own API.

const PREFIX = "jt.";

export type SettingKey = "dropboxAppKey" | "dropboxTokens" | "anthropicKey" | "aiProvider" | "openaiTokens" | "openaiClientId";

export type AiChoice = "claude" | "chatgpt";

function read(key: SettingKey): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

export const settings = {
  get: read,
  set(key: SettingKey, value: string) {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      /* storage blocked: settings last for this page only */
    }
  },
  remove(key: SettingKey) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
  /** Baked into the build with VITE_DROPBOX_APP_KEY, or typed into Settings. The app key is public by design. */
  dropboxAppKey(): string {
    return read("dropboxAppKey") || (import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined) || "";
  },
  aiProvider(): AiChoice {
    return read("aiProvider") === "chatgpt" ? "chatgpt" : "claude";
  },
};

/** Everything the app stores lives under this folder in the user's Dropbox. */
export const DATA_ROOT = "/Daybook";
/** Where it lived when the app was called Joplin Trends; moved to DATA_ROOT on first use. */
export const LEGACY_DATA_ROOT = "/Joplin Trends";
export const DATA_FILE = `${DATA_ROOT}/data.json`;
