import { useState } from 'react'

const SEED_RESULTS = [true, true, false, true, false, true, false, false, true, false]
const SEED_TOTAL = 15

function fmt(n) {
  return n.toFixed(3)
}

export default function PrecisionRecallCalculator() {
  const [results, setResults] = useState(SEED_RESULTS)
  const [totalRelevant, setTotalRelevant] = useState(SEED_TOTAL)

  const k = results.length
  const relInTopK = results.filter(Boolean).length
  const precision = k > 0 ? relInTopK / k : 0
  const recall = totalRelevant > 0 ? relInTopK / totalRelevant : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  const hit = relInTopK > 0 ? 1 : 0

  const toggleRow = (i) => {
    const next = [...results]
    next[i] = !next[i]
    setResults(next)
  }

  const addRow = () => setResults([...results, false])
  const removeRow = (i) => setResults(results.filter((_, j) => j !== i))
  const reset = () => {
    setResults(SEED_RESULTS)
    setTotalRelevant(SEED_TOTAL)
  }

  return (
    <div className="widget">
      <div className="widget-head">
        <span className="widget-title">precision / recall @ k calculator</span>
        <button type="button" className="widget-btn-ghost" onClick={reset}>reset</button>
      </div>
      <p className="widget-hint">
        Toggle which of the top-k results were relevant. Set the total number of relevant
        documents in the collection (this is the denominator for recall).
      </p>

      <div className="widget-row-input">
        <label>
          total relevant in collection:{' '}
          <input
            type="number"
            min="0"
            value={totalRelevant}
            onChange={(e) => setTotalRelevant(Math.max(0, Number(e.target.value) || 0))}
            className="widget-input mono num inline"
          />
        </label>
      </div>

      <div className="widget-grid widget-grid-pr">
        <div className="wg-head">rank</div>
        <div className="wg-head">relevant?</div>
        <div className="wg-head" />

        {results.map((rel, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <div className="wg-cell mono">{i + 1}</div>
            <div className="wg-cell">
              <button
                type="button"
                className={`widget-toggle ${rel ? 'on' : ''}`}
                onClick={() => toggleRow(i)}
              >
                {rel ? '✓ relevant' : '— not relevant'}
              </button>
            </div>
            <div className="wg-cell">
              <button type="button" className="widget-btn-x" onClick={() => removeRow(i)} aria-label="remove">×</button>
            </div>
          </div>
        ))}
      </div>

      <div className="widget-actions">
        <button type="button" className="widget-btn" onClick={addRow}>+ add result</button>
      </div>

      <dl className="widget-result">
        <dt>k</dt><dd className="mono">{k}</dd>
        <dt># relevant in top-k</dt><dd className="mono">{relInTopK}</dd>
        <dt>hit@k</dt><dd className="mono">{hit}</dd>
        <dt>precision@k</dt><dd className="mono accent">{fmt(precision)}</dd>
        <dt>recall@k</dt><dd className="mono accent">{fmt(recall)}</dd>
        <dt>F1@k</dt><dd className="mono">{fmt(f1)}</dd>
      </dl>

      <p className="widget-foot">
        <code>precision@k = relevant_in_top_k / k</code> &nbsp;·&nbsp;
        <code>recall@k = relevant_in_top_k / total_relevant</code>
      </p>
    </div>
  )
}
