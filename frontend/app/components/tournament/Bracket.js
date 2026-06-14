'use client'

// ---------------------------------------------------------------------------
// Bracket index maps — derived from R32_BRACKET → R16_PAIRS → QF_PAIRS → SF_PAIRS
// in app/tournament.py.
//
// Adjacent pairs within each array feed the same match in the next round,
// so the visual tree is correctly connected when rendered top-to-bottom.
// ---------------------------------------------------------------------------

// Left half → SF[0] → Final
const LEFT = {
  r32: [1, 4, 0, 2, 10, 11, 8, 9],
  r16: [0, 1, 4, 5],
  qf:  [0, 1],
  sf:  0,
}

// Right half → SF[1] → Final
const RIGHT = {
  r32: [3, 5, 6, 7, 13, 15, 12, 14],
  r16: [2, 3, 6, 7],
  qf:  [2, 3],
  sf:  1,
}

// ---------------------------------------------------------------------------
// Vertical geometry
// CARD_H=56, R32_GAP=8, UNIT=64
//
// Column paddingTop (aligns each round's cards to the correct tree position):
//   R32: 0    R16: 32    QF: 96    SF: 224    Final: 224
//
// Column internal gap (space between cards within a round):
//   R32: 8    R16: 72    QF: 200
// ---------------------------------------------------------------------------

const COLS = {
  r32:   { offset: 0,   gap: '8px'   },
  r16:   { offset: 32,  gap: '72px'  },
  qf:    { offset: 96,  gap: '200px' },
  sf:    { offset: 224, gap: '0px'   },
  final: { offset: 224 },
}

// ---------------------------------------------------------------------------
// Connector geometry
//
// LABEL_H: approximate height of the column label element (text-[9px] ≈ 14px
//          line-height + mb-3 = 12px → 26px total).
//
// ctr(offset, gap, i) gives the vertical centre of card i in a column whose
// flex stack starts at `offset` px below the label, with `gap` px between cards.
//
// Card centres verified: midpoint of each adjacent pair equals the destination
// centre in the next round.
// ---------------------------------------------------------------------------

const LABEL_H = 26
const CARD_H  = 56
const CONN_W  = 16   // width of each connector SVG (replaces the column gap)
const SVG_H   = 540  // tall enough to cover all 8 R32 cards + padding

function ctr(offset, gap, i) {
  return LABEL_H + offset + i * (CARD_H + gap) + CARD_H / 2
}

const Y = {
  r32: [0,1,2,3,4,5,6,7].map(i => ctr(0,   8,   i)),  // 54,118,182,246,310,374,438,502
  r16: [0,1,2,3]        .map(i => ctr(32,  72,  i)),  // 86,214,342,470
  qf:  [0,1]            .map(i => ctr(96,  200, i)),  // 150,406
  sf:                         ctr(224, 0,   0),        // 278
}

// Pairs: each {s1, s2} are the two source card centres that merge into {d}
const PAIRS = {
  r32_r16: [[0,1],[2,3],[4,5],[6,7]].map(([a,b], i) => ({ s1: Y.r32[a], s2: Y.r32[b], d: Y.r16[i] })),
  r16_qf:  [[0,1],[2,3]]            .map(([a,b], i) => ({ s1: Y.r16[a], s2: Y.r16[b], d: Y.qf[i]  })),
  qf_sf:   [{ s1: Y.qf[0], s2: Y.qf[1], d: Y.sf }],
}

const LINE = 'var(--bracket-line)'

// Connector SVG between two rounds.
// dir="left"  → sources exit from x=0 (left edge), destination enters at x=W (right edge)
// dir="right" → sources exit from x=W (right edge), destination enters at x=0 (left edge)
function Conn({ pairs, dir = 'left' }) {
  const half = CONN_W / 2
  const [fromX, toX] = dir === 'right' ? [CONN_W, 0] : [0, CONN_W]
  return (
    <svg width={CONN_W} height={SVG_H} className="flex-shrink-0" style={{ overflow: 'visible' }}>
      {pairs.map(({ s1, s2, d }, i) => (
        <g key={i} stroke={LINE} strokeWidth="1" fill="none">
          <line x1={fromX} y1={s1} x2={half}  y2={s1} />
          <line x1={fromX} y1={s2} x2={half}  y2={s2} />
          <line x1={half}  y1={s1} x2={half}  y2={s2} />
          <line x1={half}  y1={d}  x2={toX}   y2={d}  />
        </g>
      ))}
    </svg>
  )
}

// Straight horizontal connector between SF and Final (same y on both sides)
function StraightConn() {
  return (
    <svg width={CONN_W} height={SVG_H} className="flex-shrink-0" style={{ overflow: 'visible' }}>
      <line x1={0} y1={Y.sf} x2={CONN_W} y2={Y.sf} stroke={LINE} strokeWidth="1" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function buildMatch(raw) {
  if (!raw) return null
  return {
    team1:  raw.home,
    team2:  raw.away,
    score1: raw.home_score,
    score2: raw.away_score,
    winner: raw.winner,
  }
}

function TeamRow({ team, score, isWinner }) {
  return (
    <div className={`flex items-center justify-between px-2 py-1.5 gap-2 ${isWinner ? 'bg-emerald-400/10' : ''}`}>
      <span className={`text-[11px] truncate max-w-[90px] font-mono ${
        isWinner ? 'text-emerald-400 font-bold' : team ? 'text-ink/60' : 'text-ink/15'
      }`}>
        {team || '—'}
      </span>
      {score != null && (
        <span className={`text-[11px] font-bold w-4 text-right flex-shrink-0 ${
          isWinner ? 'text-emerald-400' : 'text-ink/40'
        }`}>
          {score}
        </span>
      )}
    </div>
  )
}

function MatchCard({ match, revealed }) {
  if (!match) {
    return <div className="w-[140px] h-[56px] border border-ink/5 rounded bg-ink/[0.01]" />
  }
  const { team1, team2, score1, score2, winner } = match
  return (
    <div className={`w-[140px] border rounded overflow-hidden transition-all duration-300 ${
      revealed ? 'border-ink/15 bg-elevated' : 'border-ink/5 bg-ink/[0.01]'
    }`}>
      <TeamRow team={team1} score={revealed ? score1 : null} isWinner={revealed && winner === team1} />
      <div className="h-px bg-ink/5" />
      <TeamRow team={team2} score={revealed ? score2 : null} isWinner={revealed && winner === team2} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column — a vertical stack of match cards with top offset + internal gap
// ---------------------------------------------------------------------------

function Column({ label, matches, revealed, offset, gap }) {
  return (
    <div className="flex flex-col items-center w-[140px] flex-shrink-0">
      <p className="text-[9px] tracking-[0.25em] uppercase text-ink/20 mb-3 text-center whitespace-nowrap">
        {label}
      </p>
      <div
        className="flex flex-col"
        style={{ paddingTop: offset, gap }}
      >
        {matches.map((match, i) => (
          <MatchCard
            key={i}
            match={i < revealed ? match : null}
            revealed={i < revealed}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bracket
// ---------------------------------------------------------------------------

export default function Bracket({ data, revealedRounds }) {
  if (!data) return null

  const rv = revealedRounds || {}

  // Split reveal counts: left half fills first, then right half
  const lv = {
    r32: Math.min(rv.r32 ?? 0, 8),
    r16: Math.min(rv.r16 ?? 0, 4),
    qf:  Math.min(rv.qf  ?? 0, 2),
    sf:  Math.min(rv.sf  ?? 0, 1),
  }
  const rv2 = {
    r32: Math.max(0, (rv.r32 ?? 0) - 8),
    r16: Math.max(0, (rv.r16 ?? 0) - 4),
    qf:  Math.max(0, (rv.qf  ?? 0) - 2),
    sf:  Math.max(0, (rv.sf  ?? 0) - 1),
  }

  const build = (indices, round) =>
    indices.map(i => buildMatch(data[round]?.[i]))

  const finalMatch = buildMatch(
    Array.isArray(data.final) ? data.final[0] : data.final
  )
  const finalRevealed = (rv.final ?? 0) > 0

  return (
    <div className="flex items-start gap-0 px-4 pb-8 select-none">

      {/* ── Left half ── */}
      <Column
        label="Round of 32"
        matches={build(LEFT.r32, 'r32')}
        revealed={lv.r32}
        offset={COLS.r32.offset}
        gap={COLS.r32.gap}
      />
      <Conn pairs={PAIRS.r32_r16} dir="left" />
      <Column
        label="Round of 16"
        matches={build(LEFT.r16, 'r16')}
        revealed={lv.r16}
        offset={COLS.r16.offset}
        gap={COLS.r16.gap}
      />
      <Conn pairs={PAIRS.r16_qf} dir="left" />
      <Column
        label="Quarters"
        matches={build(LEFT.qf, 'qf')}
        revealed={lv.qf}
        offset={COLS.qf.offset}
        gap={COLS.qf.gap}
      />
      <Conn pairs={PAIRS.qf_sf} dir="left" />
      <Column
        label="Semis"
        matches={[buildMatch(data.sf?.[LEFT.sf])]}
        revealed={lv.sf}
        offset={COLS.sf.offset}
        gap={COLS.sf.gap}
      />
      <StraightConn />

      {/* ── Final ── */}
      <div className="flex flex-col items-center w-[140px] flex-shrink-0">
        <p className="text-[9px] tracking-[0.25em] uppercase text-ink/20 mb-3">Final</p>
        <div style={{ paddingTop: COLS.final.offset }}>
          <MatchCard
            match={finalRevealed ? finalMatch : null}
            revealed={finalRevealed}
          />
          {finalRevealed && finalMatch?.winner && (
            <div className="mt-5 text-center">
              <p className="text-ink/20 text-[9px] tracking-[0.3em] uppercase mb-1">Champion</p>
              <p className="text-emerald-400 text-xs font-bold tracking-wide leading-tight">
                {finalMatch.winner}
              </p>
            </div>
          )}
        </div>
      </div>

      <StraightConn />
      {/* ── Right half (mirrored — SF closest to center) ── */}
      <Column
        label="Semis"
        matches={[buildMatch(data.sf?.[RIGHT.sf])]}
        revealed={rv2.sf}
        offset={COLS.sf.offset}
        gap={COLS.sf.gap}
      />
      <Conn pairs={PAIRS.qf_sf} dir="right" />
      <Column
        label="Quarters"
        matches={build(RIGHT.qf, 'qf')}
        revealed={rv2.qf}
        offset={COLS.qf.offset}
        gap={COLS.qf.gap}
      />
      <Conn pairs={PAIRS.r16_qf} dir="right" />
      <Column
        label="Round of 16"
        matches={build(RIGHT.r16, 'r16')}
        revealed={rv2.r16}
        offset={COLS.r16.offset}
        gap={COLS.r16.gap}
      />
      <Conn pairs={PAIRS.r32_r16} dir="right" />
      <Column
        label="Round of 32"
        matches={build(RIGHT.r32, 'r32')}
        revealed={rv2.r32}
        offset={COLS.r32.offset}
        gap={COLS.r32.gap}
      />

    </div>
  )
}
