# codeyogico.github.io

Personal site for Vishal Vaibhav — live at https://codeyogico.github.io/

Static blog built with Vite + React. Posts are plain Markdown in `src/posts/`. Auto-deployed to GitHub Pages on every push to `main` via `.github/workflows/deploy.yml`.

## Local dev

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # produce dist/
npm run preview  # serve dist/ locally
npm run feed     # regenerate public/feed.xml only
```

## Project layout

```
.
├── .github/workflows/deploy.yml   # Pages deploy
├── public/                        # static assets (feed.xml is generated)
├── scripts/                       # build-time helpers
│   ├── build-feed.js              # writes public/feed.xml from posts
│   ├── fetch-pinned.js            # GraphQL → src/pinned.json
│   └── build-og.js                # per-post HTML w/ OG tags + 404.html
├── src/
│   ├── App.jsx                    # routing, layout, components
│   ├── data.jsx                   # profile (name, links, etc.)
│   ├── index.css                  # all CSS
│   ├── loadPosts.js               # parses frontmatter, builds posts[]
│   ├── main.jsx                   # entry
│   ├── pinned.json                # generated at build (initial [])
│   ├── posts/*.md                 # blog posts
│   └── widgets/                   # React components for posts + chrome
├── index.html
├── package.json
└── vite.config.js
```

## Writing a post

Drop a Markdown file into `src/posts/`. The filename (without `.md`) becomes the URL slug — the post lives at `/posts/<slug>/`.

Frontmatter:

```markdown
---
date: 2026-05-27
tag: search
title: When collision is good
read: 11 min
deck: One-line subtitle shown under the title.
hidden: true        # optional — hides from index list; URL still works
---

Body in Markdown. Standard syntax: `## headings`, `- lists`,
`> blockquotes`, `**bold**`, code fences, tables.
```

Posts are sorted by `date` descending in the index list.

## Interactive widgets in posts

A post can embed a React component by inserting a placeholder div anywhere in its Markdown body:

```markdown
<div data-widget="lsh-match-calc"></div>
```

After Marked renders the body, every `[data-widget]` node gets a React root mounted with the matching component.

Currently registered (`src/widgets/index.js`):

| name | component |
|---|---|
| `ndcg-calc` | `NDCGCalculator` |
| `mrr-calc` | `MRRCalculator` |
| `precision-recall-calc` | `PrecisionRecallCalculator` |
| `kv-cache-calc` | `KVCacheCalculator` |
| `lsh-match-calc` | `LSHMatchCalculator` |

To add a new widget: write the component in `src/widgets/`, register it in `src/widgets/index.js`, and reference it in the post by name.

Two widgets — `ViewCount` and `PinnedRepos` — are mounted directly from `App.jsx` (page chrome) rather than embedded inside post bodies.

## Build pipeline

`npm run build` runs four steps in order:

1. **`scripts/build-feed.js`** — writes `public/feed.xml` from `src/posts/`.
2. **`scripts/fetch-pinned.js`** — queries GitHub's GraphQL API for pinned items on `codeyogico` and writes `src/pinned.json`. Requires `GH_TOKEN`; if absent, the script warns and keeps the existing file so local builds still succeed.
3. **`vite build`** — bundles to `dist/`.
4. **`scripts/build-og.js`** — writes per-post HTML files in `dist/` with the correct OG meta tags, plus a `404.html` SPA fallback.

## Analytics & per-post view counts

The site uses [GoatCounter](https://www.goatcounter.com/) — privacy-friendly, no cookies. The tracking script lives in `index.html` with `data-goatcounter-settings='{"no_onload": true}'`, and the app calls `goatcounter.count()` on every SPA route change (handled in `App.jsx`).

Per-post view counts come from `https://codeyogico.goatcounter.com/counter/<path>.json` and render in the post meta row (next to date/read-time). This requires **"Allow viewing statistics without logging in"** to be enabled in the GoatCounter dashboard settings.

## Pinned GitHub repos

The "github" section at the bottom of the index is generated at build time. `scripts/fetch-pinned.js` calls GitHub's GraphQL API for the pinned items on `codeyogico` (works for both User and Organization accounts) and writes `src/pinned.json`. The component (`src/widgets/PinnedRepos.jsx`) imports that file as static JSON — no client-side fetch.

To deploy end-to-end:

1. Create a Personal Access Token at https://github.com/settings/tokens. A classic token with no scopes is enough for public profile data.
2. Add it as the `GH_TOKEN` repo secret at **Settings → Secrets and variables → Actions → New repository secret**.

To update the displayed list later, change pinned repos on github.com/codeyogico and re-run the Deploy workflow.

## Deploy

`.github/workflows/deploy.yml` runs on every push to `main` and via `workflow_dispatch`. It installs deps, runs `npm run build` (with `GH_TOKEN` injected from secrets), uploads `dist/` as a Pages artifact, and publishes via `actions/deploy-pages@v4`.

Repo secrets:

| name | purpose |
|---|---|
| `GH_TOKEN` | build-time GraphQL fetch for pinned repos |

## Editing identity

`src/data.jsx` holds `name`, `role`, `email`, `linkedin`, `location` — change there.
