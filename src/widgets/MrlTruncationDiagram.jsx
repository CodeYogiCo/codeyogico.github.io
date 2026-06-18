const W = 560, H = 230

const ACCENT = 'var(--accent)'
const INK = 'var(--ink)'
const INK_SOFT = 'var(--ink-soft)'
const INK_FAINT = 'var(--ink-faint)'
const BG_ALT = 'var(--bg-alt)'
const RULE = 'var(--rule)'

// prefix cut points: each prefix of an MRL vector is itself a usable embedding
const CUTS = [
  { dims: 64,  frac: 64 / 768,  quality: '94.8%' },
  { dims: 128, frac: 128 / 768, quality: '97.1%' },
  { dims: 256, frac: 256 / 768, quality: '98.4%' },
  { dims: 768, frac: 1,         quality: '100%'  },
]

const BAR_X = 40
const BAR_W = 400
const STD_Y = 56
const MRL_Y = 150
const BAR_H = 30

export default function MrlTruncationDiagram() {
  return (
    <div className="widget">
      <div className="widget-head">
        <span className="widget-title">One vector, many embeddings</span>
        <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>768-dim vector, truncated to a prefix</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Standard versus Matryoshka embedding truncation"
        style={{ display: 'block', width: '100%', maxWidth: W, height: 'auto', margin: '8px auto 0' }}
      >
        <style>{`
          .mt-cap { fill: ${INK_SOFT}; font-family: var(--mono); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
          .mt-dim { fill: ${INK_FAINT}; font-family: var(--mono); font-size: 9px; }
          .mt-q   { fill: ${ACCENT}; font-family: var(--mono); font-size: 9.5px; font-weight: 700; }
          .mt-tick { stroke: ${RULE}; stroke-width: 1; stroke-dasharray: 2 2; }
        `}</style>

        <defs>
          <linearGradient id="mt-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0"   stopColor={ACCENT} stopOpacity="0.95" />
            <stop offset="0.33" stopColor={ACCENT} stopOpacity="0.55" />
            <stop offset="1"   stopColor={ACCENT} stopOpacity="0.10" />
          </linearGradient>
        </defs>

        {/* ---- standard model ---- */}
        <text className="mt-cap" x={BAR_X} y={STD_Y - 12}>Standard model</text>
        <rect x={BAR_X} y={STD_Y} width={BAR_W} height={BAR_H} rx={4}
          fill={BG_ALT} stroke={RULE} strokeWidth="1" />
        {/* uniform hatch — information spread evenly across all dims */}
        {Array.from({ length: 24 }).map((_, i) => (
          <line key={i} className="mt-tick"
            x1={BAR_X + (i + 0.5) * (BAR_W / 24)} y1={STD_Y + 2}
            x2={BAR_X + (i + 0.5) * (BAR_W / 24)} y2={STD_Y + BAR_H - 2} />
        ))}
        <text className="mt-dim" x={BAR_X + BAR_W + 10} y={STD_Y + 19}>truncate → breaks</text>

        {/* ---- MRL model ---- */}
        <text className="mt-cap" x={BAR_X} y={MRL_Y - 12}>Matryoshka model</text>
        <rect x={BAR_X} y={MRL_Y} width={BAR_W} height={BAR_H} rx={4}
          fill="url(#mt-grad)" stroke={ACCENT} strokeWidth="1.5" />

        {/* prefix cut markers */}
        {CUTS.map((c) => {
          const x = BAR_X + BAR_W * c.frac
          const last = c.dims === 768
          return (
            <g key={c.dims}>
              {!last && (
                <line className="mt-tick" x1={x} y1={MRL_Y - 4} x2={x} y2={MRL_Y + BAR_H + 22}
                  stroke={INK_FAINT} strokeDasharray="3 2" />
              )}
              <text className="mt-dim" x={x} y={MRL_Y + BAR_H + 14} textAnchor={last ? 'end' : 'middle'}
                fill={INK_SOFT}>{c.dims}d</text>
              <text className="mt-q" x={x} y={MRL_Y + BAR_H + 26} textAnchor={last ? 'end' : 'middle'}>{c.quality}</text>
            </g>
          )
        })}
        <text className="mt-dim" x={BAR_X} y={MRL_Y - 1} fill={INK} fontWeight="700"
          style={{ fontSize: '9px' }}>most signal here</text>
      </svg>

      <p className="widget-foot">
        In a standard model the signal is smeared across all 768 dimensions — lop off the tail and the vector breaks.
        Matryoshka training packs the important information into the early dimensions, so every prefix is a valid,
        renormalizable embedding. The quality figures show how much of full-size accuracy each prefix keeps.
      </p>
    </div>
  )
}
