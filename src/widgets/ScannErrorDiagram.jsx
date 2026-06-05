import { useState } from 'react'

const W = 480, H = 280
const OX = 80, OY = 220  // origin

function polar(angle, len) {
  return [OX + Math.cos(angle) * len, OY - Math.sin(angle) * len]
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function Arrow({ x1, y1, x2, y2, color, width = 2, dash, id, label, labelOffset = [8, -6] }) {
  const markerId = `arrow-${id}`
  return (
    <g>
      <defs>
        <marker id={markerId} markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <polygon points="0 0, 7 2.5, 0 5" fill={color} />
        </marker>
      </defs>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash}
        markerEnd={`url(#${markerId})`}
      />
      {label && (
        <text
          x={x2 + labelOffset[0]} y={y2 + labelOffset[1]}
          fill={color} fontSize={11} fontFamily="var(--mono)" fontWeight="600"
        >
          {label}
        </text>
      )}
    </g>
  )
}

const STATES = [
  {
    key: 'original',
    title: 'vector x and its quantized approximation x̃',
    desc: 'Each product is stored as a high-dimensional vector x. Quantization compresses it to x̃. The difference is the error e = x̃ − x.',
  },
  {
    key: 'decompose',
    title: 'decomposing the error',
    desc: 'The error e can be split into two parts: e∥ (parallel to x, along the same direction) and e⊥ (perpendicular to x, sideways).',
  },
  {
    key: 'query',
    title: 'why parallel error hurts more',
    desc: 'The query q points in roughly the same direction as x (high similarity). The dot product error ⟨q, e⟩ is dominated by the parallel component — e⊥ mostly cancels out. Standard PQ treats both equally; ScaNN penalises e∥ more.',
  },
]

export default function ScannErrorDiagram() {
  const [step, setStep] = useState(0)
  const state = STATES[step]

  // Vector angles and lengths
  const xAngle = Math.PI * 0.32    // x vector: going upper-right
  const xLen = 160
  const xTip = polar(xAngle, xLen)

  const xTildeAngle = xAngle + 0.22  // x̃: slightly different angle
  const xTildeLen = 148
  const xTildeTip = polar(xTildeAngle, xTildeLen)

  // Error vector: from xTip to xTildeTip
  const eTip = xTildeTip

  // Parallel component: project (xTildeTip - xTip) onto xAngle direction
  // e_parallel = ((e · x̂)) * x̂
  const ex = eTip[0] - xTip[0]
  const ey = eTip[1] - xTip[1]
  const xUx = Math.cos(xAngle), xUy = -Math.sin(xAngle)
  const dot = ex * xUx + ey * xUy
  const eParaTip = [xTip[0] + dot * xUx, xTip[1] + dot * xUy]
  const ePerpTip = eTip  // e_perp goes from eParaTip to eTip

  // Query vector: roughly parallel to x but slightly offset
  const qAngle = xAngle - 0.10
  const qLen = 130
  const qTip = polar(qAngle, qLen)

  const showXTilde = step >= 0
  const showDecompose = step >= 1
  const showQuery = step >= 2

  return (
    <div className="widget">
      <div className="widget-head">
        <span className="widget-title">quantization error decomposition</span>
      </div>

      {/* step buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {STATES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(i)}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 3,
              border: `1px solid ${i === step ? 'var(--accent)' : 'var(--rule)'}`,
              background: i === step ? 'var(--accent-soft)' : 'var(--bg-alt)',
              color: i === step ? 'var(--accent)' : 'var(--ink-soft)',
              cursor: 'pointer',
              letterSpacing: '0.03em',
            }}
          >
            {i + 1}. {s.key}
          </button>
        ))}
      </div>

      <p className="widget-hint" style={{ marginBottom: 4 }}>
        <strong style={{ color: 'var(--ink)' }}>{state.title}</strong>
        <br />{state.desc}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Quantization error decomposition diagram"
        style={{ display: 'block', width: '100%', maxWidth: W, height: 'auto', margin: '4px auto 0' }}
      >
        {/* origin dot */}
        <circle cx={OX} cy={OY} r={4} fill="var(--ink-soft)" />
        <text x={OX - 14} y={OY + 4} fill="var(--ink-faint)" fontSize={11} fontFamily="var(--mono)">O</text>

        {/* query vector q */}
        {showQuery && (
          <Arrow
            x1={OX} y1={OY} x2={qTip[0]} y2={qTip[1]}
            color="var(--accent)" width={2.5}
            id="q" label="q (query)"
            labelOffset={[-20, -10]}
          />
        )}

        {/* x vector */}
        <Arrow
          x1={OX} y1={OY} x2={xTip[0]} y2={xTip[1]}
          color="var(--ink)" width={2.5}
          id="x" label="x"
          labelOffset={[6, -6]}
        />

        {/* x̃ vector */}
        {showXTilde && (
          <Arrow
            x1={OX} y1={OY} x2={xTildeTip[0]} y2={xTildeTip[1]}
            color="#5b8dd9" width={2} dash="6 3"
            id="xtilde" label="x̃ (quantized)"
            labelOffset={[6, 4]}
          />
        )}

        {/* error vector e: from xTip to xTildeTip */}
        {showXTilde && !showDecompose && (
          <>
            <Arrow
              x1={xTip[0]} y1={xTip[1]} x2={eTip[0]} y2={eTip[1]}
              color="#e06b5a" width={2}
              id="e" label="e = x̃ − x"
              labelOffset={[6, -2]}
            />
          </>
        )}

        {/* decomposed error */}
        {showDecompose && (
          <>
            {/* e parallel (along x direction) */}
            <Arrow
              x1={xTip[0]} y1={xTip[1]} x2={eParaTip[0]} y2={eParaTip[1]}
              color="#e06b5a" width={2.5}
              id="epara" label="e∥  parallel error"
              labelOffset={[8, -6]}
            />
            {/* e perpendicular (from eParaTip to eTip) */}
            <Arrow
              x1={eParaTip[0]} y1={eParaTip[1]} x2={ePerpTip[0]} y2={ePerpTip[1]}
              color="#56b368" width={2.5}
              id="eperp" label="e⊥  perpendicular error"
              labelOffset={[6, 4]}
            />
            {/* right-angle mark at eParaTip */}
            {(() => {
              const perpUx = -xUy, perpUy = xUx  // rotate x-unit 90°
              const sz = 7
              const c1 = [eParaTip[0] - xUx * sz, eParaTip[1] - xUy * sz]
              const c2 = [eParaTip[0] - xUx * sz + perpUx * sz, eParaTip[1] - xUy * sz + perpUy * sz]
              const c3 = [eParaTip[0] + perpUx * sz, eParaTip[1] + perpUy * sz]
              return (
                <path
                  d={`M ${c1[0]} ${c1[1]} L ${c2[0]} ${c2[1]} L ${c3[0]} ${c3[1]}`}
                  fill="none" stroke="var(--rule)" strokeWidth={1}
                />
              )
            })()}
          </>
        )}

        {/* annotation box for step 3 */}
        {showQuery && (
          <>
            <rect x={270} y={40} width={190} height={72} rx={4}
              fill="var(--bg-alt)" stroke="var(--rule)" strokeWidth={1} />
            <text x={280} y={58} fill="var(--ink-soft)" fontSize={9.5} fontFamily="var(--mono)" fontWeight="600">
              dot product error:
            </text>
            <text x={280} y={74} fill="var(--ink-soft)" fontSize={9} fontFamily="var(--mono)">
              {'⟨q, e⟩ = ⟨q, e∥⟩ + ⟨q, e⊥⟩'}
            </text>
            <text x={280} y={88} fill="#e06b5a" fontSize={9} fontFamily="var(--mono)">
              {'⟨q, e∥⟩ ≈ large  ← hurts ranking'}
            </text>
            <text x={280} y={102} fill="#56b368" fontSize={9} fontFamily="var(--mono)">
              {'⟨q, e⊥⟩ ≈ 0      ← mostly cancels'}
            </text>
          </>
        )}

        {/* x-axis (reference) */}
        <line x1={OX} y1={OY} x2={OX + 240} y2={OY}
          stroke="var(--rule)" strokeWidth={1} strokeDasharray="3 4" />
      </svg>

      <p className="widget-foot">
        ScaNN's anisotropic quantization penalises e∥ more during training, producing compressed vectors
        that are more accurate in the direction that matters for similarity ranking.
      </p>
    </div>
  )
}
