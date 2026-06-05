const W = 560, H = 220
const PAD = { top: 20, right: 20, bottom: 20, left: 20 }

const PHASES = [
  { id: 'corpus',    label: 'corpus',      count: '10M',   unit: 'vectors',          note: 'full dataset' },
  { id: 'partition', label: 'partition',   count: '300K',  unit: 'vectors scored',   note: 'top 100 of 3,000 clusters' },
  { id: 'aq',        label: 'AQ score',    count: '200',   unit: 'candidates',       note: 'approx. inner products' },
  { id: 'rescore',   label: 'rescore',     count: '10',    unit: 'results',          note: 'exact dot products' },
]

const BAR_WIDTHS = [520, 260, 80, 24]
const BOX_H = 52
const START_X = (W - PAD.left - PAD.right) / 2 + PAD.left
const START_Y = PAD.top + 12
const ROW_GAP = 52

const ARROW_COLOR = 'var(--ink-faint)'
const ACCENT = 'var(--accent)'
const INK = 'var(--ink)'
const INK_SOFT = 'var(--ink-soft)'
const INK_FAINT = 'var(--ink-faint)'
const BG_ALT = 'var(--bg-alt)'
const RULE = 'var(--rule)'

export default function ScannPipelineDiagram() {
  return (
    <div className="widget">
      <div className="widget-head">
        <span className="widget-title">ScaNN search pipeline</span>
        <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>example: 10M product vectors, returning top 10</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="ScaNN three-phase pipeline diagram"
        style={{ display: 'block', width: '100%', maxWidth: W, height: 'auto', margin: '8px auto 0' }}
      >
        <style>{`
          .sp-bar-bg { fill: ${BG_ALT}; stroke: ${RULE}; stroke-width: 1; rx: 4; }
          .sp-bar-fill { fill: var(--accent-soft); stroke: ${ACCENT}; stroke-width: 1.5; }
          .sp-count { fill: ${INK}; font-family: var(--mono); font-size: 15px; font-weight: 700; }
          .sp-unit { fill: ${INK_SOFT}; font-family: var(--mono); font-size: 10px; }
          .sp-label { fill: ${ACCENT}; font-family: var(--mono); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
          .sp-note { fill: ${INK_FAINT}; font-family: var(--mono); font-size: 10px; }
          .sp-arrow { stroke: ${ARROW_COLOR}; stroke-width: 1.5; fill: none; marker-end: url(#arrowhead); }
          .sp-phase-tag { fill: ${BG_ALT}; stroke: ${RULE}; stroke-width: 1; }
          .sp-phase-label { fill: ${INK_SOFT}; font-family: var(--mono); font-size: 9px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
        `}</style>

        <defs>
          <marker id="arrowhead" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill={ARROW_COLOR} />
          </marker>
        </defs>

        {PHASES.map((phase, i) => {
          const bw = BAR_WIDTHS[i]
          const x = START_X - bw / 2
          const y = START_Y + i * ROW_GAP
          const isFirst = i === 0

          return (
            <g key={phase.id}>
              {/* connector arrow from previous bar */}
              {i > 0 && (
                <line
                  className="sp-arrow"
                  x1={START_X}
                  y1={y - ROW_GAP + BOX_H + 1}
                  x2={START_X}
                  y2={y - 3}
                />
              )}

              {/* bar background */}
              <rect
                className={isFirst ? 'sp-bar-bg' : 'sp-bar-fill'}
                x={x} y={y} width={bw} height={BOX_H} rx={4}
              />

              {/* phase label (right of bar for non-first) */}
              {!isFirst && (
                <>
                  <rect className="sp-phase-tag" x={x + bw + 8} y={y + 12} width={72} height={16} rx={3} />
                  <text className="sp-phase-label" x={x + bw + 44} y={y + 23} textAnchor="middle">
                    {phase.label}
                  </text>
                </>
              )}

              {/* count */}
              <text className="sp-count" x={START_X} y={y + 24} textAnchor="middle">
                {phase.count}
              </text>
              {/* unit */}
              <text className="sp-unit" x={START_X} y={y + 37} textAnchor="middle">
                {phase.unit}
              </text>
              {/* note */}
              <text className="sp-note" x={START_X} y={y + 48} textAnchor="middle">
                {phase.note}
              </text>
            </g>
          )
        })}
      </svg>

      <p className="widget-foot">
        Each phase narrows the candidate set. The work at each stage is proportional to the number entering it — not to the full corpus size.
      </p>
    </div>
  )
}
