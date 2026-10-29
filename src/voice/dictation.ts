// Voice dictation with the browser's built-in speech recognition (Chrome, Edge, Safari).
// Nothing is recorded or stored by the app: the browser turns speech into text and the text goes
// into the note like typing would.

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictationSupported(): boolean {
  return ctor() !== null;
}

export interface DictationHandlers {
  /** Words heard so far in the current sentence, still being refined. */
  onInterim: (text: string) => void;
  /** A finished sentence, ready to add to the note. */
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  /** Recognition stopped for good (the user pressed Stop, or an error ended it). */
  onEnd: () => void;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings and try again.",
  "service-not-allowed": "This browser doesn't allow speech recognition here.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection in this browser.",
  "language-not-supported": "Speech recognition doesn't support your browser's language.",
};

export function startDictation(handlers: DictationHandlers, lang = navigator.language || "en-US"): { stop: () => void } {
  const Ctor = ctor();
  if (!Ctor) {
    handlers.onError("Voice notes need Chrome, Edge or Safari.");
    handlers.onEnd();
    return { stop: () => {} };
  }
  let stopped = false;
  let rec: Recognition | null = null;

  const begin = () => {
    rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript;
        if (r.isFinal) {
          if (text.trim()) handlers.onFinal(text);
        } else interim += text;
      }
      handlers.onInterim(interim);
    };
    rec.onerror = (e) => {
      // "no-speech" and "aborted" just mean a pause; recognition restarts below.
      if (e.error === "no-speech" || e.error === "aborted") return;
      stopped = true;
      handlers.onError(ERRORS[e.error] ?? `Voice input stopped (${e.error}).`);
    };
    rec.onend = () => {
      handlers.onInterim("");
      // Browsers end a session after a pause even in continuous mode; keep listening until Stop.
      if (!stopped) {
        try {
          begin();
          return;
        } catch {
          stopped = true;
        }
      }
      handlers.onEnd();
    };
    rec.start();
  };

  try {
    begin();
  } catch (err) {
    handlers.onError(err instanceof Error ? err.message : String(err));
    handlers.onEnd();
  }
  return {
    stop: () => {
      stopped = true;
      rec?.stop();
    },
  };
}

/** Turns one spoken chunk into a tidy sentence: trimmed, capitalized, ending in punctuation. */
export function tidySentence(chunk: string): string {
  const t = chunk.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const cap = t.charAt(0).toLocaleUpperCase() + t.slice(1);
  return /[.!?…]$/.test(cap) ? cap : `${cap}.`;
}

/**
 * Adds a spoken sentence to the journal text. The first sentence of a dictation session starts a new
 * paragraph when the journal already has text; later ones continue the same paragraph.
 */
export function appendSpoken(journal: string, chunk: string, newParagraph: boolean): string {
  const sentence = tidySentence(chunk);
  if (!sentence) return journal;
  const base = journal.replace(/\s+$/, "");
  if (!base) return sentence;
  return `${base}${newParagraph ? "\n\n" : " "}${sentence}`;
}
