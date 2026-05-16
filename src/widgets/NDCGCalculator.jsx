import { useMemo, useState } from 'react'

const REL_OPTIONS = [
  { v: 0, label: '0 · not relevant' },
  { v: 1, label: '1 · marginal' },
  { v: 2, label: '2 · relevant' },
  { v: 3, label: '3 · highly relevant' },
]

function dcg(rels) {
  return rels.reduce((sum, rel, i) => sum + (Math.pow(2, rel) - 1) / Math.log2(i + 2), 0)
}

function fmt(n) {
  return n.toFixed(3)
}

export default function NDCGCalculator() {
  const [rels, setRels] = useState([3, 2, 0, 1, 0, 2])

  const ideal = useMemo(() => [...rels].sort((a, b) => b - a), [rels])
  const totalDcg = useMemo(() => dcg(rels), [rels])
  const totalIdcg = useMemo(() => dcg(ideal), [ideal])
  const ndcg = totalIdcg === 0 ? 0 : totalDcg / totalIdcg

  const setRel = (i, v) => {
    const next = [...rels]
    next[i] = Number(v)
    setRels(next)
  }

  const addRow = () => setRels([...rels, 0])
  const removeRow = (i) => setRels(rels.filter((_, j) => j !== i))
  const reset = () => setRels([3, 2, 0, 1, 0, 2])

  return (
    <div className="widget">
      <div className="widget-head">
        <span className="widget-title">NDCG calculator</span>
        <button type="button" className="widget-btn-ghost" onClick={reset}>reset</button>
      </div>
      <p className="widget-hint">
        Set the graded relevance of each retrieved result, in rank order. NDCG compares
        the ranking you got against the best possible ranking of the same scores.
      </p>

      <div className="widget-grid">
        <div className="wg-head">rank</div>
        <div className="wg-head">rel</div>
        <div className="wg-head right">contribution to DCG</div>
        <div className="wg-head" />

        {rels.map((rel, i) => {
          const contrib = (Math.pow(2, rel) - 1) / Math.log2(i + 2)
          return (
            <div key={i} className="wg-row" style={{ display: 'contents' }}>
              <div className="wg-cell mono">{i + 1}</div>
              <div className="wg-cell">
                <select value={rel} onChange={(e) => setRel(i, e.target.value)} className="widget-select">
                  {REL_OPTIONS.map((o) => (
                    <option key={o.v} value={o.v}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="wg-cell mono right">{fmt(contrib)}</div>
              <div className="wg-cell">
                <button type="button" className="widget-btn-x" onClick={() => removeRow(i)} aria-label="remove">×</button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="widget-actions">
        <button type="button" className="widget-btn" onClick={addRow}>+ add result</button>
      </div>

      <dl className="widget-result">
        <dt>DCG</dt><dd className="mono">{fmt(totalDcg)}</dd>
        <dt>IDCG</dt><dd className="mono">{fmt(totalIdcg)}</dd>
        <dt>NDCG</dt><dd className="mono accent">{fmt(ndcg)}</dd>
      </dl>

      <p className="widget-foot">
        Formula: <code>DCG = Σ (2^rel_i − 1) / log₂(i + 1)</code>, where <code>i</code> is the 1-indexed rank.
      </p>
    </div>
  )
}
