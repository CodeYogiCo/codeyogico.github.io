import { useState, useMemo } from 'react'

function logBinom(n, k) {
  let v = 0
  for (let i = 0; i < k; i++) v += Math.log(n - i) - Math.log(i + 1)
  return v
}

function pMatch(s, n, threshold) {
  if (s <= 0) return 0
  if (s >= 1) return 1
  let p = 0
  for (let k = threshold; k <= n; k++) {
    p += Math.exp(logBinom(n, k) + k * Math.log(s) + (n - k) * Math.log(1 - s))
  }
  return Math.min(1, Math.max(0, p))
}

const W = 480, H = 180
const PAD = { top: 16, right: 16, bottom: 36, left: 42 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top - PAD.bottom

function toSVG(s, p) {
  return [PAD.left + s * CW, PAD.top + (1 - p) * CH]
}

export default function LSHMatchCalculator() {
  const [n, setN] = useState(36)
  const [threshold, setThreshold] = useState(18)
  const clampedT = Math.min(threshold, n)

  const points = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 100; i++) {
      const s = i / 100
      pts.push(pMatch(s, n, clampedT))
    }
    return pts
  }, [n, clampedT])

  const pathD = points
    .map((p, i) => {
      const [x, y] = toSVG(i / 100, p)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const tp = pMatch(0.8, n, clampedT)
  const fp = pMatch(0.2, n, clampedT)

  function fmt(p) {
    if (p > 0.9995) return '>99.9%'
    if (p < 0.0005) return '<0.1%'
    return `${(p * 100).toFixed(1)}%`
  }

  const [tpX, tpY] = toSVG(0.8, tp)
  const [fpX, fpY] = toSVG(0.2, fp)

  const gridYs = [0, 0.25, 0.5, 0.75, 1]
  const gridXs = [0, 0.2, 0.4, 0.6, 0.8, 1]

  return (
    <div className="widget">
      <div className="widget-head">
        <span className="widget-title">LSH match probability</span>
        <button type="button" className="widget-btn-ghost" onClick={() => { setN(36); setThreshold(18) }}>reset</button>
      </div>
      <p className="widget-hint">
        How likely are two queries to be matched, given their Jaccard similarity?
        Adjust the number of hash functions and the vote threshold to see the S-curve shift.
      </p>

      <div className="widget-row-input" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
          <span>hash functions: <strong>{n}</strong></span>
          <input type="range" min={4} max={60} value={n}
            onChange={e => { const v = Number(e.target.value); setN(v); setThreshold(t => Math.min(t, v)) }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
          <span>min votes to match: <strong>{clampedT}</strong> / {n}</span>
          <input type="range" min={1} max={n} value={clampedT}
            onChange={e => setThreshold(Number(e.target.value))} />
        </label>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
        role="img" aria-label="LSH match probability S-curve"
        style={{ display: 'block', width: '100%', maxWidth: W, height: 'auto', margin: '16px auto 0' }}>
        <style>{`
          .lsh-axis { stroke: var(--rule); stroke-width: 1; }
          .lsh-grid { stroke: var(--rule); stroke-width: 0.5; stroke-dasharray: 2 3; }
          .lsh-label { fill: var(--ink-faint); font-family: var(--mono); font-size: 10px; }
          .lsh-curve { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round; }
          .lsh-dot-tp { fill: var(--accent); }
          .lsh-dot-fp { fill: var(--ink-soft); }
          .lsh-marker { stroke: var(--rule); stroke-width: 1; stroke-dasharray: 3 3; }
          .lsh-tag { fill: var(--ink-soft); font-family: var(--mono); font-size: 10px; }
          .lsh-tag-val { fill: var(--ink); font-family: var(--mono); font-size: 10px; font-weight: 600; }
        `}</style>

        {gridYs.map(p => {
          const [, y] = toSVG(0, p)
          return (
            <g key={p}>
              <line className="lsh-grid" x1={PAD.left} y1={y} x2={PAD.left + CW} y2={y} />
              <text className="lsh-label" x={PAD.left - 6} y={y + 3.5} textAnchor="end">
                {p === 0 ? '0' : p === 1 ? '1' : p.toString()}
              </text>
            </g>
          )
        })}

        {gridXs.map(s => {
          const [x] = toSVG(s, 0)
          return (
            <g key={s}>
              <line className="lsh-grid" x1={x} y1={PAD.top} x2={x} y2={PAD.top + CH} />
              <text className="lsh-label" x={x} y={PAD.top + CH + 14} textAnchor="middle">{s}</text>
            </g>
          )
        })}

        <line className="lsh-axis" x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CH} />
        <line className="lsh-axis" x1={PAD.left} y1={PAD.top + CH} x2={PAD.left + CW} y2={PAD.top + CH} />

        <text className="lsh-label" x={PAD.left + CW / 2} y={H - 2} textAnchor="middle">
          Jaccard similarity
        </text>
        <text className="lsh-label" x={10} y={PAD.top + CH / 2} textAnchor="middle"
          transform={`rotate(-90, 10, ${PAD.top + CH / 2})`}>
          P(match)
        </text>

        <path className="lsh-curve" d={pathD} />

        <line className="lsh-marker" x1={fpX} y1={PAD.top} x2={fpX} y2={fpY} />
        <line className="lsh-marker" x1={PAD.left} y1={fpY} x2={fpX} y2={fpY} />
        <circle className="lsh-dot-fp" cx={fpX} cy={fpY} r={4} />
        <text className="lsh-tag" x={fpX + 6} y={fpY - 8}>s=0.2</text>
        <text className="lsh-tag-val" x={fpX + 6} y={fpY + 4}>{fmt(fp)}</text>

        <line className="lsh-marker" x1={tpX} y1={PAD.top} x2={tpX} y2={tpY} />
        <line className="lsh-marker" x1={PAD.left} y1={tpY} x2={tpX} y2={tpY} />
        <circle className="lsh-dot-tp" cx={tpX} cy={tpY} r={4} />
        <text className="lsh-tag" x={tpX + 6} y={tpY - 8}>s=0.8</text>
        <text className="lsh-tag-val" x={tpX + 6} y={tpY + 4}>{fmt(tp)}</text>
      </svg>

      <dl className="widget-result">
        <dt>similar queries matched (Jaccard 0.8)</dt>
        <dd className="mono accent">{fmt(tp)}</dd>
        <dt>dissimilar queries matched (Jaccard 0.2)</dt>
        <dd className="mono">{fmt(fp)}</dd>
        <dt>threshold ratio</dt>
        <dd className="mono">{clampedT}/{n} = {((clampedT / n) * 100).toFixed(0)}%</dd>
      </dl>

      <p className="widget-foot">
        <code>{'P(match) = Σ_{k=t}^n C(n,k) · s^k · (1−s)^(n−k)'}</code>
        {' '}where s = Jaccard similarity, t = threshold, n = hash functions
      </p>
    </div>
  )
}
