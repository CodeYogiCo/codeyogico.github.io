import { useState } from 'react'

const W = 520, H = 300
const PAD = { top: 16, right: 16, bottom: 16, left: 16 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top - PAD.bottom

// Deterministic pseudo-random (LCG)
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0
    return s / 0x100000000
  }
}

// Cluster definitions: [cx, cy, label, color]
const CLUSTERS = [
  { cx: 0.15, cy: 0.20, label: 'electronics',  color: '#5b8dd9' },
  { cx: 0.72, cy: 0.18, label: 'footwear',     color: '#e06b5a' },
  { cx: 0.42, cy: 0.55, label: 'clothing',     color: '#56b368' },
  { cx: 0.14, cy: 0.78, label: 'home & garden',color: '#b88ac4' },
  { cx: 0.80, cy: 0.75, label: 'accessories',  color: '#d4a44c' },
]

// Two query positions
const QUERIES = [
  { x: 0.60, y: 0.30, label: '"red running shoes"' },
  { x: 0.25, y: 0.65, label: '"wireless earbuds"' },
]

// Generate cluster points deterministically
function makePoints() {
  const pts = []
  CLUSTERS.forEach((c, ci) => {
    const r = rng(ci * 7919 + 1)
    const n = 14 + (ci % 3)
    for (let i = 0; i < n; i++) {
      const angle = r() * Math.PI * 2
      const dist = r() * 0.11 + 0.02
      pts.push({
        x: Math.max(0.02, Math.min(0.98, c.cx + Math.cos(angle) * dist)),
        y: Math.max(0.02, Math.min(0.98, c.cy + Math.sin(angle) * dist * 1.1)),
        ci,
      })
    }
  })
  return pts
}

const POINTS = makePoints()

function dist2(ax, ay, bx, by) {
  return (ax - bx) ** 2 + (ay - by) ** 2
}

function closestClusters(qx, qy, n = 2) {
  return CLUSTERS
    .map((c, i) => ({ i, d: dist2(qx, qy, c.cx, c.cy) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(x => x.i)
}

function toSVG(nx, ny) {
  return [PAD.left + nx * CW, PAD.top + ny * CH]
}

export default function ScannPartitionDiagram() {
  const [qi, setQi] = useState(0)
  const q = QUERIES[qi]
  const searched = closestClusters(q.x, q.y)

  return (
    <div className="widget">
      <div className="widget-head">
        <span className="widget-title">partition search</span>
        <button
          type="button"
          className="widget-btn-ghost"
          onClick={() => setQi(i => (i + 1) % QUERIES.length)}
        >
          change query →
        </button>
      </div>
      <p className="widget-hint">
        Query: <strong style={{ color: 'var(--accent)' }}>{q.label}</strong>
        {' '}— ScaNN scores all 5 cluster centroids, then searches only the 2 nearest clusters
        ({CLUSTERS[searched[0]].label} + {CLUSTERS[searched[1]].label}).
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="ScaNN partition search diagram"
        style={{ display: 'block', width: '100%', maxWidth: W, height: 'auto', margin: '4px auto 0' }}
      >
        {/* background rects per cluster */}
        {CLUSTERS.map((c, ci) => {
          const isSearched = searched.includes(ci)
          const [cx, cy] = toSVG(c.cx, c.cy)
          return (
            <ellipse
              key={`bg-${ci}`}
              cx={cx} cy={cy}
              rx={CW * 0.12} ry={CH * 0.14}
              fill={isSearched ? c.color + '22' : 'var(--bg-alt)'}
              stroke={isSearched ? c.color : 'var(--rule)'}
              strokeWidth={isSearched ? 1.5 : 1}
              strokeDasharray={isSearched ? 'none' : '4 3'}
            />
          )
        })}

        {/* data points */}
        {POINTS.map((p, pi) => {
          const isSearched = searched.includes(p.ci)
          const [px, py] = toSVG(p.x, p.y)
          const c = CLUSTERS[p.ci]
          return (
            <circle
              key={`pt-${pi}`}
              cx={px} cy={py} r={3.5}
              fill={isSearched ? c.color : 'var(--ink-faint)'}
              opacity={isSearched ? 0.85 : 0.3}
            />
          )
        })}

        {/* centroids */}
        {CLUSTERS.map((c, ci) => {
          const isSearched = searched.includes(ci)
          const [cx, cy] = toSVG(c.cx, c.cy)
          return (
            <g key={`centroid-${ci}`}>
              <circle
                cx={cx} cy={cy} r={6}
                fill={isSearched ? c.color : 'var(--ink-faint)'}
                opacity={isSearched ? 1 : 0.4}
                stroke="var(--bg)" strokeWidth={1.5}
              />
              {isSearched && (
                <text
                  x={cx} y={cy - 11}
                  textAnchor="middle"
                  fill={c.color}
                  fontSize={9}
                  fontFamily="var(--mono)"
                  fontWeight="600"
                >
                  {c.label}
                </text>
              )}
              {!isSearched && (
                <text
                  x={cx} y={cy - 11}
                  textAnchor="middle"
                  fill="var(--ink-faint)"
                  fontSize={9}
                  fontFamily="var(--mono)"
                >
                  {c.label}
                </text>
              )}
            </g>
          )
        })}

        {/* dashed lines from query to searched centroids */}
        {searched.map(ci => {
          const c = CLUSTERS[ci]
          const [qx, qy] = toSVG(q.x, q.y)
          const [cx, cy] = toSVG(c.cx, c.cy)
          return (
            <line
              key={`line-${ci}`}
              x1={qx} y1={qy} x2={cx} y2={cy}
              stroke={c.color}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.6}
            />
          )
        })}

        {/* query point */}
        {(() => {
          const [qx, qy] = toSVG(q.x, q.y)
          return (
            <g>
              <circle cx={qx} cy={qy} r={9} fill="var(--accent)" opacity={0.18} />
              <circle cx={qx} cy={qy} r={5} fill="var(--accent)" />
              <text
                x={qx + 12} y={qy + 4}
                fill="var(--accent)"
                fontSize={10}
                fontFamily="var(--mono)"
                fontWeight="700"
              >
                query
              </text>
            </g>
          )
        })()}

        {/* legend */}
        <g>
          <circle cx={PAD.left + 8} cy={H - 12} r={4} fill="var(--accent)" />
          <text x={PAD.left + 17} y={H - 8} fill="var(--ink-soft)" fontSize={9} fontFamily="var(--mono)">query vector</text>
          <circle cx={PAD.left + 90} cy={H - 12} r={3.5} fill="var(--accent)" opacity={0.7} />
          <circle cx={PAD.left + 90} cy={H - 12} r={6} fill="none" stroke="var(--accent)" strokeWidth={1} />
          <text x={PAD.left + 100} y={H - 8} fill="var(--ink-soft)" fontSize={9} fontFamily="var(--mono)">centroid</text>
          <circle cx={PAD.left + 160} cy={H - 12} r={3} fill="var(--ink-faint)" opacity={0.35} />
          <text x={PAD.left + 170} y={H - 8} fill="var(--ink-faint)" fontSize={9} fontFamily="var(--mono)">skipped</text>
        </g>
      </svg>

      <p className="widget-foot">
        Vectors outside the searched clusters are never scored — no dot products computed, no memory read.
        Toggle the query to see which clusters get selected.
      </p>
    </div>
  )
}
