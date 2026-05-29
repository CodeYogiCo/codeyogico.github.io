import pinned from '../pinned.json'

export default function PinnedRepos() {
  if (!Array.isArray(pinned) || pinned.length === 0) return null

  return (
    <section className="pinned">
      <h2 className="pinned-title">github</h2>
      <ul className="pinned-list">
        {pinned.map((r) => (
          <li key={r.name}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="pinned-card">
              <div className="pinned-row">
                <span className="pinned-name">{r.name}</span>
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
