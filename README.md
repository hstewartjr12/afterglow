# Afterglow demo

[Try the hosted demo](https://afterglow-demo-hstewartjr12.hstew21.chatgpt.site)

A separate, publicly shareable demo of [Afterglow](https://github.com/hstewartjr12/afterglow). It uses the same interface and recommendation scoring as the local app, with each visitor's library, notes, and taste preferences stored in their browser using IndexedDB. No account or API key is needed.

The hosted server only fetches and caches public VNDB catalogue data and covers. Personal libraries and notes are never sent to it. Selected positive theme IDs are sent to VNDB through the server to choose recommendation candidates. Browser data does not sync across devices and can be removed by clearing site data or choosing **Reset demo**.

## Using your library and recommendations

- **Wishlist:** use the button on a card or the featured story to save it without opening details. An existing story shows its reading status; quick saves never replace your notes, rating, progress, or status.
- **Backup & restore:** open Library and download a JSON backup of your library, notes, taste profile, and recommendation choices. Choose a backup to preview new and matching stories. Restore keeps existing stories and your current taste profile by default. Select the separate replacement and profile options only when you want the backup's versions. Invalid files are rejected before any changes; a failed restore rolls back together.
- **Recommendations:** candidate stories now draw from both your selected themes and themes in favorites and highly rated stories. Avoided themes, low ratings, and spoiler settings remain respected; titles already collected or hidden are excluded, with a bounded wider search when needed.
- **Not tonight / Hide:** Not tonight postpones a story for 24 hours; Hide keeps it out until you restore it. Undo reverses either choice. My taste lists hidden and postponed stories with a Restore action. These choices don't change ratings or reading status.
- **Find by theme:** choose a theme in Discover or use a spoiler-free theme's detail popover to find similar stories. Combine it with language, platform, and other filters.
- **Browse URLs:** filters and result pages are reflected in the address bar and survive refresh. Library filters stay selected when switching views. Browser Back closes details and returns to browsing; Forward reopens them. Copy story link shares a clean URL containing only the VNDB ID.

Backups can move personal data between the local app and the browser demo. The demo still keeps personal data in the browser; use a backup before clearing site data.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open the printed local address, normally `http://127.0.0.1:5174`. This command builds the demo and starts a local preview. After editing, stop it and run it again. For live interface editing, keep `npm start` running and run `npm run dev -w @afterglow/client` in another terminal; Vite prints its own address.

```sh
npm run typecheck
npm test
npm run build
npm start
```

## Publish and maintain

This folder is linked to its Site through `.openai/hosting.json`. Ask Codex to publish changes through Sites. The published build contains `dist/client` and a Worker-compatible server in `dist/server/index.js`; it needs neither D1 nor R2 and does not contain the original app's database.

The main app in `../VN app` keeps its existing npm commands and SQLite storage. This demo is maintained separately: interface and scoring changes should be copied deliberately, then checked and published here. Do not copy `data/`, `.env`, `.git`, or `node_modules` from the main app.

VN metadata and covers come from the [VNDB Kana API](https://api.vndb.org/kana) and remain subject to its terms and data license. The Site platform supplies traffic analytics; the demo adds no analytics SDK.
