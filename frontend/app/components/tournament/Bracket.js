'use client'

// Each match card in the bracket
function MatchCard({ match, revealed, isWinner }) {
  if (!match) return (
    <div className="w-[140px] h-[56px] border border-white/5 rounded bg-white/[0.01]" />
  )

  const { team1, team2, score1, score2, winner } = match

  return (
    <div className={`w-[140px] border rounded transition-all duration-300 overflow-hidden ${
      revealed ? 'border-white/15 bg-[#0f0f17]' : 'border-white/5 bg-white/[0.01]'
    }`}>
      <TeamRow
        team={team1}
        score={revealed ? score1 : null}
        isWinner={revealed && winner === team1}
      />
      <div className="h-px bg-white/5" />
      <TeamRow
        team={team2}
        score={revealed ? score2 : null}
        isWinner={revealed && winner === team2}
      />
    </div>
  )
}

function TeamRow({ team, score, isWinner }) {
  return (
    <div className={`flex items-center justify-between px-2 py-1.5 gap-2 ${
      isWinner ? 'bg-emerald-400/10' : ''
    }`}>
      <span className={`text-[11px] truncate max-w-[90px] font-mono ${
        isWinner ? 'text-emerald-400 font-bold' : team ? 'text-white/60' : 'text-white/15'
      }`}>
        {team || '—'}
      </span>
      {score !== null && score !== undefined && (
        <span className={`text-[11px] font-bold w-4 text-right ${
          isWinner ? 'text-emerald-400' : 'text-white/40'
        }`}>
          {score}
        </span>
      )}
    </div>
  )
}

// Connector line between rounds
function Connector({ top, height, side = 'right' }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top,
        height,
        width: 16,
        right: side === 'right' ? -16 : undefined,
        left: side === 'left' ? -16 : undefined,
      }}
    >
      <div className={`absolute top-1/2 w-full h-px bg-white/10`} />
      <div className="absolute h-full w-px bg-white/10" style={{ left: side === 'right' ? undefined : 0, right: side === 'right' ? 0 : undefined }} />
    </div>
  )
}

// A column of matches for one round
function RoundColumn({ title, matches, revealedCount, totalCount, matchHeight = 80, gap = 40 }) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-[10px] tracking-[0.3em] uppercase text-white/20 mb-4">{title}</p>
      <div className="flex flex-col" style={{ gap }}>
        {matches.map((match, i) => (
          <MatchCard
            key={i}
            match={i < revealedCount ? match : null}
            revealed={i < revealedCount}
          />
        ))}
      </div>
    </div>
  )
}

// Map raw tournament data into bracket display order
// R32 display order: pairs that flow into the same R16 match are adjacent
const R32_DISPLAY = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const R16_DISPLAY = [0, 1, 2, 3, 4, 5, 6, 7]
const QF_DISPLAY = [0, 1, 2, 3]
const SF_DISPLAY = [0, 1]

function buildMatch(rawMatch) {
  if (!rawMatch) return null
  return {
    team1: rawMatch.home,
    team2: rawMatch.away,
    score1: rawMatch.home_score,
    score2: rawMatch.away_score,
    winner: rawMatch.winner,
  }
}

export default function Bracket({ data, revealedRounds }) {
  // revealedRounds: { r32: N, r16: N, qf: N, sf: N, final: N }
  // data: { r32: [...], r16: [...], qf: [...], sf: [...], final: {...} }

  if (!data) return null

  const r32Matches = R32_DISPLAY.map(i => buildMatch(data.r32?.[i]))
  const r16Matches = R16_DISPLAY.map(i => buildMatch(data.r16?.[i]))
  const qfMatches = QF_DISPLAY.map(i => buildMatch(data.qf?.[i]))
  const sfMatches = SF_DISPLAY.map(i => buildMatch(data.sf?.[i]))
  const finalMatch = buildMatch(Array.isArray(data.final) ? data.final[0] : data.final)

  const rv = revealedRounds || {}

  // Gap doubles each round so matches are vertically centered
  const R32_GAP = 8
  const R16_GAP = R32_GAP * 2 + 56  // 56 = match card height
  const QF_GAP = R16_GAP * 2 + 56
  const SF_GAP = QF_GAP * 2 + 56
  const FINAL_GAP = 0

  return (
    <div className="flex items-start gap-8 px-4 pb-8 select-none">
      <RoundColumn
        title="Round of 32"
        matches={r32Matches}
        revealedCount={rv.r32 ?? 0}
        totalCount={16}
        gap={R32_GAP}
      />
      <RoundColumn
        title="Round of 16"
        matches={r16Matches}
        revealedCount={rv.r16 ?? 0}
        totalCount={8}
        gap={R16_GAP}
      />
      <RoundColumn
        title="Quarterfinals"
        matches={qfMatches}
        revealedCount={rv.qf ?? 0}
        totalCount={4}
        gap={QF_GAP}
      />
      <RoundColumn
        title="Semifinals"
        matches={sfMatches}
        revealedCount={rv.sf ?? 0}
        totalCount={2}
        gap={SF_GAP}
      />
      <div className="flex flex-col items-center">
        <p className="text-[10px] tracking-[0.3em] uppercase text-white/20 mb-4">Final</p>
        <div style={{ marginTop: SF_GAP / 2 + 28 }}>
          <MatchCard
            match={(rv.final ?? 0) > 0 ? finalMatch : null}
            revealed={(rv.final ?? 0) > 0}
          />
        </div>
        {(rv.final ?? 0) > 0 && finalMatch?.winner && (
          <div className="mt-6 text-center">
            <p className="text-white/20 text-[10px] tracking-[0.4em] uppercase mb-1">Champion</p>
            <p className="text-emerald-400 text-sm font-bold tracking-wide">{finalMatch.winner}</p>
          </div>
        )}
      </div>
    </div>
  )
}
