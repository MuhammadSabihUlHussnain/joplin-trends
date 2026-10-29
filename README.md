# Daybook

A daily journal that shows you where your time and money go.

Write one note a day in the app, or say it: the **Voice** button turns speech into text in the journal as you talk, and the note stays open so you can add details before you press **Save**. Each note opens on a short template: mood, energy and sleep, a Time list, a Money list, then free writing. Saved notes go to your own Dropbox as plain Markdown files. Until you save, edits stay on your device as a draft. When you press **Refresh**, an AI reads new and edited notes, pulls out activities, purchases, people and themes, and turns them into weekly hours, spending, mood charts and the patterns that keep repeating ("mood is higher on gym days", "food spending jumped the week of Oct 5").

There's no server and no database. The page is static (GitHub Pages), and everything it stores lives in your Dropbox:

```
/Daybook/notes/2026-10-28.md   one file per day, readable anywhere
/Daybook/data.json             what the AI found, your category fixes
```

Try it without setting anything up: open the site with `?demo` at the end of the URL to load ten weeks of sample notes.

## Set up

1. **Dropbox app.** At [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps), create a scoped app. Give it the scopes `files.metadata.read`, `files.content.read` and `files.content.write`. Add the site's URL as a redirect URI (for example `https://<you>.github.io/joplin-trends/`; the repository kept its old name), plus `http://localhost:5173/` for local development.
2. **The app.** Open Settings, paste the Dropbox app key, press **Connect Dropbox**, and add a Claude API key. Set a monthly spend limit on that key in the Claude Console.
3. Write today's note, then press **Refresh**.

What you type in the Time and Money lists always wins over the AI's guesses. Without an AI key, only those lists are counted.

## How patterns are found

- **Mood links** need at least 14 days of mood scores and a correlation of at least 0.3. They also have to survive a 1% false-discovery-rate correction across every pair checked at once. On random test data, no correlations are reported.
- **Unusual weeks** must be at least 1.5× your usual week and well outside its normal swing.
- **Habits, streaks and themes** are simple counts.

These are things that tend to happen together. None of them proves cause and effect.

## Voice notes

Voice uses the browser's built-in speech recognition (Chrome, Edge and Safari; Firefox doesn't have it). The app never records or stores audio, only the text. Chrome sends the audio to Google to transcribe it, and Safari uses Apple's speech service.

## Privacy

- The page is static code. Notes go only to your Dropbox and, when you press Refresh, to the AI you chose (today, Claude via `api.anthropic.com`, with your own key).
- Dropbox tokens and the AI key live in your browser's localStorage, so each device connects once.
- The production build ships a Content Security Policy that allows only Dropbox and Anthropic.

## Develop

```
npm install
npm run dev        # http://localhost:5173
npm test           # parsers, note files, merge rule, pattern engine, refresh pipeline
JT_LIVE=1 npm test # also one real Claude call; needs ANTHROPIC_API_KEY
npm run build
```

To bake the Dropbox app key into the deployed site, set a repository variable `DROPBOX_APP_KEY`. The deploy workflow passes it to the build.

## ChatGPT

Using your ChatGPT plan instead of an API key ("Sign in with ChatGPT") is planned. OpenAI currently allows that only for open-source apps running on the user's own computer, or for hosted sites it has approved. The AI sits behind one interface (`src/ai/provider.ts`), so adding it is a drop-in.
