import { useMemo, useState } from 'react'

const SEED = [
  { label: 'query 1', rank: 1 },
  { label: 'query 2', rank: 3 },
  { label: 'query 3', rank: 0 },
  { label: 'query 4', rank: 2 },
  { label: 'query 5', rank: 5 },
]

function fmt(n) {
  return n.toFixed(3)
}

export default function MRRCalculator() {
  const [queries, setQueries] = useState(SEED)

  const reciprocals = useMemo(
    () => queries.map((q) => (q.rank > 0 ? 1 / q.rank : 0)),
    [queries]
  )

  const mrr = useMemo(() => {
    if (!queries.length) return 0
    return reciprocals.reduce((a, b) => a + b, 0) / queries.length
  }, [queries, reciprocals])

  const setRank = (i, v) => {
    const next = [...queries]
    next[i] = { ...next[i], rank: Math.max(0, Number(v) || 0) }
    setQueries(next)
  }

  const setLabel = (i, v) => {
    const next = [...queries]
    next[i] = { ...next[i], label: v }
    setQueries(next)
  }

  const addRow = () =>
    setQueries([...queries, { label: `query ${queries.length + 1}`, rank: 1 }])
  const removeRow = (i) => setQueries(queries.filter((_, j) => j !== i))
  const reset = () => setQueries(SEED)

  return (
    <div className="widget">
      <div className="widget-head">
        <span className="widget-title">MRR calculator</span>
        <button type="button" className="widget-btn-ghost" onClick={reset}>reset</button>
      </div>
      <p className="widget-hint">
        For each query, enter the rank of the <em>first</em> relevant result.
        Use <code>0</code> if there was no relevant result in the top-k.
      </p>

      <div className="widget-grid widget-grid-mrr">
        <div className="wg-head">query</div>
        <div className="wg-head right">first rel. rank</div>
        <div className="wg-head right">1 / rank</div>
        <div className="wg-head" />

        {queries.map((q, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <div className="wg-cell">
              <input
                type="text"
                value={q.label}
                onChange={(e) => setLabel(i, e.target.value)}
                className="widget-input"
              />
            </div>
            <div className="wg-cell right">
              <input
                type="number"
                min="0"
                value={q.rank}
                onChange={(e) => setRank(i, e.target.value)}
                className="widget-input mono num"
              />
            </div>
            <div className="wg-cell mono right">{fmt(reciprocals[i])}</div>
            <div className="wg-cell">
              <button type="button" className="widget-btn-x" onClick={() => removeRow(i)} aria-label="remove">×</button>
            </div>
          </div>
        ))}
      </div>

      <div className="widget-actions">
        <button type="button" className="widget-btn" onClick={addRow}>+ add query</button>
      </div>

      <dl className="widget-result">
        <dt>queries</dt><dd className="mono">{queries.length}</dd>
        <dt>Σ (1/rank)</dt><dd className="mono">{fmt(reciprocals.reduce((a, b) => a + b, 0))}</dd>
        <dt>MRR</dt><dd className="mono accent">{fmt(mrr)}</dd>
      </dl>

      <p className="widget-foot">
        Formula: <code>MRR = (1/|Q|) · Σ_q (1 / rank_q)</code>, where <code>rank_q</code> is the rank of the first relevant result for query <code>q</code> (0 if none).
      </p>
    </div>
  )
}
