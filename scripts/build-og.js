import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const POSTS_DIR = join(ROOT, 'src/posts')
const DIST_DIR = join(ROOT, 'dist')
const INDEX_HTML = join(DIST_DIR, 'index.html')

const SITE_URL = 'https://codeyogico.github.io'
const SITE_NAME = 'Vishal Vaibhav'

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (val === 'true') meta[key] = true
    else if (val === 'false') meta[key] = false
    else meta[key] = val
  }
  return { meta, body: m[2] }
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const baseHtml = readFileSync(INDEX_HTML, 'utf8')

const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'))
const posts = files
  .map((f) => {
    const slug = basename(f, '.md')
    const raw = readFileSync(join(POSTS_DIR, f), 'utf8')
    const { meta } = parseFrontmatter(raw)
    return { slug, ...meta }
  })
  .filter((p) => !p.hidden)

for (const p of posts) {
  const url = `${SITE_URL}/posts/${p.slug}/`
  const title = `${p.title} — ${SITE_NAME}`
  const desc = p.deck || `${p.title} — a post by ${SITE_NAME}.`

  const headTags = `
    <title>${escapeAttr(title)}</title>
    <meta name="description" content="${escapeAttr(desc)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${escapeAttr(SITE_NAME)}" />
    <meta property="og:title" content="${escapeAttr(p.title)}" />
    <meta property="og:description" content="${escapeAttr(desc)}" />
    <meta property="og:url" content="${url}" />
    <meta property="article:published_time" content="${p.date}" />
    <meta property="article:author" content="${escapeAttr(SITE_NAME)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeAttr(p.title)}" />
    <meta name="twitter:description" content="${escapeAttr(desc)}" />`

  const html = baseHtml
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*\/?>/, '')
    .replace(/(<\/head>)/, `${headTags}\n  $1`)

  const outDir = join(DIST_DIR, 'posts', p.slug)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), html)
}

copyFileSync(INDEX_HTML, join(DIST_DIR, '404.html'))

console.log(`og: wrote ${posts.length} per-post HTML files + 404.html (SPA fallback)`)
