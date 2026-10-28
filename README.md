# Joplin Trends

See where your time and money go, straight from your Joplin journal.

You write one note a day in Joplin. When you press **Refresh**, this page reads the new and edited notes from Joplin's Dropbox sync folder, has an AI pull out activities, purchases, mood and people, and turns it all into weekly hours, spending, mood charts and the patterns that keep repeating ("mood is higher on gym days", "food spending jumped the week of Oct 5").

There's no server and no database. The page is static (GitHub Pages), your notes stay in your Dropbox, and the app keeps its results in one file next to them: `/Joplin Trends/data.json`.

## Set up

1. **Joplin.** On desktop and phone, set Tools › Options › Synchronisation to **Dropbox**. Leave end-to-end encryption off (encrypted notes can't be read). Make a notebook called **Journal** and title each day's note like `2026-10-28`.
2. **Dropbox app.** At [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps), create an app with **Full Dropbox** access, so it can read Joplin's `/Apps/Joplin` folder. Give it the scopes `files.metadata.read`, `files.content.read` and `files.content.write`. Then add the site's URL as a redirect URI, for example `https://<you>.github.io/joplin-trends/`, plus `http://localhost:5173/` for local development.
3. **The app.** Open Settings, paste the Dropbox app key, press **Connect Dropbox**, and add a Claude API key. Set a monthly spend limit on that key in the Claude Console. Then press Refresh.

Each entry starts with a short template, followed by free writing:

```
---
mood: 7
energy: 6
sleep: 6.5
---
## Time
- class 3h
- gym 1h
## Money
- $12 chipotle
## Journal
...
```

Numbers you type win over anything the AI guesses. Without an AI key, only the Time and Money lists are counted.

## How patterns are found

- **Mood links** need at least 14 days of mood scores and a correlation of at least 0.3. They also have to survive a 1% false-discovery-rate correction across every pair checked at once. On random test data, no correlations are reported.
- **Unusual weeks** must be at least 1.5× your usual week and well outside its normal swing.
- **Habits, streaks and themes** are simple counts.

These are things that tend to happen together. None of them proves cause and effect.

## Privacy

- The page is static code. Journal text goes only to the AI provider you configure (today, Claude via `api.anthropic.com`, with your own key).
- Dropbox tokens and the AI key live in your browser's localStorage, and the production build ships a Content Security Policy allowing only Dropbox and Anthropic.
- The app never writes into Joplin's sync folder.

## Develop

```
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (parsers, merge rule, pattern engine, refresh pipeline)
JT_LIVE=1 npm test # also one real Claude call; needs ANTHROPIC_API_KEY
npm run build
```

To bake the Dropbox app key into the deployed site, set a repository variable `DROPBOX_APP_KEY`. The deploy workflow passes it to the build.

## Roadmap

- "Sign in with ChatGPT", so each user runs the AI on their own ChatGPT plan instead of an API key. The AI sits behind one interface (`src/ai/provider.ts`), so it's a drop-in.
