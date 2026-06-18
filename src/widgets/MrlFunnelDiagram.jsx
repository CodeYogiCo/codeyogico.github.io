const W = 560, H = 250
const PAD = { top: 20, left: 20, right: 20 }

const ACCENT = 'var(--accent)'
const INK = 'var(--ink)'
const INK_SOFT = 'var(--ink-soft)'
const INK_FAINT = 'var(--ink-faint)'
const BG_ALT = 'var(--bg-alt)'
const RULE = 'var(--rule)'
const ARROW_COLOR = 'var(--ink-faint)'

const STAGES = [
  { id: 'corpus', count: '10M', unit: 'vectors', dims: '—',    note: 'full catalog', w: 520 },
  { id: 'shortlist', count: '10K', unit: 'candidates', dims: '64d', note: 'cheap ANN on truncated prefix', w: 300 },
  { id: 'rerank', count: '200', unit: 'candidates', dims: '256d', note: 'mid-size rescore', w: 120 },
  { id: 'final', count: '10', unit: 'results', dims: '768d', note: 'exact, full-dim', w: 36 },
]

const BOX_H = 46
const ROW_GAP = 56
const START_X = W / 2

export default function MrlFunnelDiagram() {
  return (
    <div className="widget">
      <div className="widget-head">
        <span className="widget-title">Coarse-to-fine search</span>
        <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>cheap prefixes shortlist, full vectors decide</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Coarse-to-fine retrieval using progressively longer embedding prefixes"
        style={{ display: 'block', width: '100%', maxWidth: W, height: 'auto', margin: '8px auto 0' }}
      >
        <style>{`
          .mf-count { fill: ${INK}; font-family: var(--mono); font-size: 15px; font-weight: 700; }
          .mf-unit  { fill: ${INK_SOFT}; font-family: var(--mono); font-size: 10px; }
          .mf-note  { fill: ${INK_FAINT}; font-family: var(--mono); font-size: 10px; }
          .mf-dim   { fill: ${ACCENT}; font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 0.04em; }
          .mf-arrow { stroke: ${ARROW_COLOR}; stroke-width: 1.5; fill: none; marker-end: url(#mf-arrowhead); }
          .mf-tag   { fill: ${BG_ALT}; stroke: ${RULE}; stroke-width: 1; }
        `}</style>

        <defs>
          <marker id="mf-arrowhead" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill={ARROW_COLOR} />
          </marker>
        </defs>

        {STAGES.map((s, i) => {
          const x = START_X - s.w / 2
          const y = PAD.top + i * ROW_GAP
          const first = i === 0
          return (
            <g key={s.id}>
              {i > 0 && (
                <line className="mf-arrow" x1={START_X} y1={y - ROW_GAP + BOX_H + 1} x2={START_X} y2={y - 3} />
              )}
              <rect x={x} y={y} width={s.w} height={BOX_H} rx={4}
                fill={first ? BG_ALT : 'var(--accent-soft)'}
                stroke={first ? RULE : ACCENT} strokeWidth={first ? 1 : 1.5} />

              {/* dim tag to the right of each narrowing stage */}
              {!first && (
                <>
                  <rect className="mf-tag" x={x + s.w + 10} y={y + 13} width={46} height={18} rx={3} />
                  <text className="mf-dim" x={x + s.w + 33} y={y + 25} textAnchor="middle">{s.dims}</text>
                </>
              )}

              <text className="mf-count" x={START_X} y={y + 21} textAnchor="middle">{s.count}</text>
              <text className="mf-unit"  x={START_X} y={y + 33} textAnchor="middle">{s.unit}</text>
              <text className="mf-note"  x={START_X} y={y + 43} textAnchor="middle">{s.note}</text>
            </g>
          )
        })}
      </svg>

      <p className="widget-foot">
        Each stage uses a longer prefix on a smaller set. The expensive full-dimension comparison only ever touches a
        few hundred vectors — most of the catalog is eliminated using 64 dims at a fraction of the cost.
      </p>
    </div>
  )
}
