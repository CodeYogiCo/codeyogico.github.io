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

## Analytics

[GoatCounter](https://www.goatcounter.com/) script in `index.html`, route-change counter in `App.jsx`. Per-post view counts rendered by `src/widgets/ViewCount.jsx`.

## Pinned GitHub repos

Generated at build time by `scripts/fetch-pinned.js` into `src/pinned.json`. Requires a `GH_TOKEN` repo secret.

## Deploy

`.github/workflows/deploy.yml` runs on every push to `main`. Builds, uploads `dist/`, publishes via `actions/deploy-pages@v4`.

## Editing identity

`src/data.jsx` holds `name`, `role`, `email`, `linkedin`, `location` — change there.
