'use client'

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L']

function GroupTable({ letter, teams, results }) {
  // Build standings from results
  const standings = teams.map(team => {
    const teamResults = results ? results.filter(r => r.home === team || r.away === team) : []
    let pts = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0
    for (const r of teamResults) {
      const isHome = r.home === team
      const tg = isHome ? r.home_score : r.away_score
      const og = isHome ? r.away_score : r.home_score
      gf += tg; ga += og
      if (tg > og) { pts += 3; w++ }
      else if (tg === og) { pts += 1; d++ }
      else { l++ }
    }
    return { team, pts, w, d, l, gf, ga, gd: gf - ga, played: w + d + l }
  })

  standings.sort((a, b) =>
    b.pts - a.pts || b.gd - a.gd || b.gf - a.gf
  )

  const done = results && results.length === 6

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-white/[0.02]">
      <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
        <span className="text-emerald-400 text-xs font-bold tracking-widest">GROUP {letter}</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-white/20 tracking-widest uppercase">
            <th className="text-left px-3 py-1.5 font-normal">Team</th>
            <th className="px-1 py-1.5 font-normal w-6">P</th>
            <th className="px-1 py-1.5 font-normal w-6">W</th>
            <th className="px-1 py-1.5 font-normal w-6">D</th>
            <th className="px-1 py-1.5 font-normal w-6">L</th>
            <th className="px-1 py-1.5 font-normal w-8">GD</th>
            <th className="px-1 py-1.5 font-normal w-8">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr
              key={s.team}
              className={`border-t border-white/5 ${
                done && i < 2 ? 'text-white' : 'text-white/50'
              }`}
            >
              <td className="px-3 py-2 flex items-center gap-1.5">
                {done && i < 2 && (
                  <span className="w-1 h-1 rounded-full bg-emerald-400 inline-block flex-shrink-0" />
                )}
                {done && i === 2 && (
                  <span className="w-1 h-1 rounded-full bg-yellow-400/60 inline-block flex-shrink-0" />
                )}
                {(!done || i > 2) && (
                  <span className="w-1 h-1 rounded-full inline-block flex-shrink-0" />
                )}
                <span className="truncate max-w-[90px]">{s.team}</span>
              </td>
              <td className="text-center px-1 py-2">{s.played}</td>
              <td className="text-center px-1 py-2">{s.w}</td>
              <td className="text-center px-1 py-2">{s.d}</td>
              <td className="text-center px-1 py-2">{s.l}</td>
              <td className="text-center px-1 py-2">{s.gd > 0 ? `+${s.gd}` : s.gd}</td>
              <td className="text-center px-1 py-2 font-bold">{s.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function GroupGrid({ groups, groupResults }) {
  if (!groups) return null

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {GROUP_LETTERS.map(letter => (
        <GroupTable
          key={letter}
          letter={letter}
          teams={groups[letter] || []}
          results={groupResults ? groupResults[letter] : null}
        />
      ))}
    </div>
  )
}
