# Afterglow demo

[Try the hosted demo](https://afterglow-demo-hstewartjr12.new-shell-7108.chatgpt.site)

A separate, publicly shareable demo of [Afterglow](https://github.com/hstewartjr12/afterglow). It uses the same interface and recommendation scoring as the local app, with each visitor's library, notes, and taste preferences stored in their browser using IndexedDB. No account or API key is needed.

The hosted server only fetches and caches public VNDB catalogue data and covers. Personal libraries and notes are never sent to it. Selected positive theme IDs are sent to VNDB through the server to choose recommendation candidates. Browser data does not sync across devices and can be removed by clearing site data or choosing **Reset demo**.

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
