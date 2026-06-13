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
        isWinner ? 'text-emerald-400 font-bold' : team ? 'text-white/60' : 'text-white/15'
      }`}>
        {team || '—'}
      </span>
      {score != null && (
        <span className={`text-[11px] font-bold w-4 text-right flex-shrink-0 ${
          isWinner ? 'text-emerald-400' : 'text-white/40'
        }`}>
          {score}
        </span>
      )}
    </div>
  )
}

function MatchCard({ match, revealed }) {
  if (!match) {
    return <div className="w-[140px] h-[56px] border border-white/5 rounded bg-white/[0.01]" />
  }
  const { team1, team2, score1, score2, winner } = match
  return (
    <div className={`w-[140px] border rounded overflow-hidden transition-all duration-300 ${
      revealed ? 'border-white/15 bg-[#0f0f17]' : 'border-white/5 bg-white/[0.01]'
    }`}>
      <TeamRow team={team1} score={revealed ? score1 : null} isWinner={revealed && winner === team1} />
      <div className="h-px bg-white/5" />
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
      <p className="text-[9px] tracking-[0.25em] uppercase text-white/20 mb-3 text-center whitespace-nowrap">
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
    <div className="flex items-start gap-3 px-4 pb-8 select-none">

      {/* ── Left half ── */}
      <Column
        label="Round of 32"
        matches={build(LEFT.r32, 'r32')}
        revealed={lv.r32}
        offset={COLS.r32.offset}
        gap={COLS.r32.gap}
      />
      <Column
        label="Round of 16"
        matches={build(LEFT.r16, 'r16')}
        revealed={lv.r16}
        offset={COLS.r16.offset}
        gap={COLS.r16.gap}
      />
      <Column
        label="Quarters"
        matches={build(LEFT.qf, 'qf')}
        revealed={lv.qf}
        offset={COLS.qf.offset}
        gap={COLS.qf.gap}
      />
      <Column
        label="Semis"
        matches={[buildMatch(data.sf?.[LEFT.sf])]}
        revealed={lv.sf}
        offset={COLS.sf.offset}
        gap={COLS.sf.gap}
      />

      {/* ── Final ── */}
      <div className="flex flex-col items-center w-[140px] flex-shrink-0">
        <p className="text-[9px] tracking-[0.25em] uppercase text-white/20 mb-3">Final</p>
        <div style={{ paddingTop: COLS.final.offset }}>
          <MatchCard
            match={finalRevealed ? finalMatch : null}
            revealed={finalRevealed}
          />
          {finalRevealed && finalMatch?.winner && (
            <div className="mt-5 text-center">
              <p className="text-white/20 text-[9px] tracking-[0.3em] uppercase mb-1">Champion</p>
              <p className="text-emerald-400 text-xs font-bold tracking-wide leading-tight">
                {finalMatch.winner}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Right half (mirrored — SF closest to center) ── */}
      <Column
        label="Semis"
        matches={[buildMatch(data.sf?.[RIGHT.sf])]}
        revealed={rv2.sf}
        offset={COLS.sf.offset}
        gap={COLS.sf.gap}
      />
      <Column
        label="Quarters"
        matches={build(RIGHT.qf, 'qf')}
        revealed={rv2.qf}
        offset={COLS.qf.offset}
        gap={COLS.qf.gap}
      />
      <Column
        label="Round of 16"
        matches={build(RIGHT.r16, 'r16')}
        revealed={rv2.r16}
        offset={COLS.r16.offset}
        gap={COLS.r16.gap}
      />
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
