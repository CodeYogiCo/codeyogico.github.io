import { useEffect, useState } from 'react'

const ENDPOINT = 'https://gh-pinned-repos.egoist.dev/?username=codeyogico'

function clean(r) {
  const repo = (r.repo || '').trim()
  const link = (r.link || '').trim() || `https://github.com/${r.owner}/${repo}`
  return {
    owner: r.owner,
    repo,
    link: link.replace(/\s+/g, ''),
    description: (r.description || '').trim(),
    language: (r.language || '').trim(),
    stars: Number(r.stars) || 0,
  }
}

export default function PinnedRepos() {
  const [repos, setRepos] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(ENDPOINT)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return
        setRepos(data.map(clean).filter((r) => r.repo))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!repos || repos.length === 0) return null

  return (
    <section className="pinned">
      <h2 className="pinned-title">github</h2>
      <ul className="pinned-list">
        {repos.map((r) => (
          <li key={`${r.owner}/${r.repo}`}>
            <a href={r.link} target="_blank" rel="noopener noreferrer" className="pinned-card">
              <div className="pinned-row">
                <span className="pinned-name">{r.repo}</span>
                <span className="pinned-meta">
                  {r.language && <span className="pinned-lang">{r.language}</span>}
                  {r.stars > 0 && <span className="pinned-stars">★ {r.stars}</span>}
                </span>
              </div>
              {r.description && <div className="pinned-desc">{r.description}</div>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
