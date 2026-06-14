'use client'

import { useState, useEffect } from 'react'

export default function EloRankings() {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all' | 'wc2026'
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/elo`)
      .then(r => r.json())
      .then(d => { setTeams(d.teams); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = teams.filter(t => {
    if (filter === 'wc2026' && !t.in_wc2026) return false
    if (search.length >= 2 && !t.team.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const maxElo = teams[0]?.elo || 2000
  const minElo = teams[teams.length - 1]?.elo || 1000

  function eloBar(elo) {
    return Math.max(4, ((elo - minElo) / (maxElo - minElo)) * 100)
  }

  function eloColor(elo) {
    if (elo >= 1900) return 'bg-emerald-400'
    if (elo >= 1800) return 'bg-emerald-400/70'
    if (elo >= 1700) return 'bg-emerald-400/40'
    return 'bg-white/15'
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-16">

      {/* Title */}
      <div className="mb-12">
        <p className="text-white/30 text-xs tracking-[0.4em] uppercase mb-4">Global Rankings</p>
        <h1 className="text-5xl font-bold tracking-tight leading-none mb-4">Elo Ratings</h1>
        <p className="text-white/40 text-sm">Rolling skill ratings updated after every international match since 1872</p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-8 flex-wrap">
        {/* Filter toggle */}
        <div className="flex rounded border border-white/10 overflow-hidden">
          {[
            { key: 'all',     label: 'All nations' },
            { key: 'wc2026', label: 'WC 2026 only' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 text-[10px] tracking-widest uppercase transition-all ${
                filter === f.key
                  ? 'bg-emerald-400/10 text-emerald-400 border-r border-emerald-400/20'
                  : 'text-white/30 hover:text-white/60 border-r border-white/10 last:border-r-0'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search team..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] bg-white/5 border border-white/10 rounded px-4 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-emerald-400/40 transition-colors"
        />

        {!loading && (
          <span className="text-white/20 text-[10px] tracking-widest">
            {filtered.length} teams
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-px">
          {filtered.map((t, i) => {
            const bar = eloBar(t.elo)
            const isTop = t.rank <= 10
            const isWC = t.in_wc2026

            return (
              <div
                key={t.team}
                className={`flex items-center gap-4 py-2.5 px-3 rounded transition-colors ${
                  isWC ? 'hover:bg-emerald-400/5' : 'hover:bg-white/[0.02]'
                }`}
              >
                {/* Rank */}
                <span className={`text-[10px] tabular-nums w-7 text-right flex-shrink-0 ${
                  t.rank === 1 ? 'text-emerald-400 font-bold' :
                  t.rank <= 3  ? 'text-white/50' :
                  t.rank <= 10 ? 'text-white/30' : 'text-white/15'
                }`}>
                  {t.rank}
                </span>

                {/* WC dot */}
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isWC ? 'bg-emerald-400' : 'bg-transparent'
                }`} />

                {/* Team name */}
                <span className={`text-xs w-36 flex-shrink-0 truncate ${
                  isWC && isTop ? 'text-white font-bold' :
                  isWC         ? 'text-white/70' :
                  isTop        ? 'text-white/60' : 'text-white/30'
                }`}>
                  {t.team}
                </span>

                {/* Bar */}
                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${eloColor(t.elo)}`}
                    style={{ width: `${bar}%` }}
                  />
                </div>

                {/* Elo number */}
                <span className={`text-[10px] tabular-nums w-12 text-right flex-shrink-0 ${
                  t.rank === 1 ? 'text-emerald-400 font-bold' :
                  isWC        ? 'text-white/50' : 'text-white/20'
                }`}>
                  {t.elo.toLocaleString()}
                </span>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <p className="text-white/20 text-xs py-8 text-center tracking-widest">No teams match</p>
          )}
        </div>
      )}

      {!loading && (
        <div className="mt-10 pt-6 border-t border-white/5 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-white/25 text-[10px] tracking-widest">WC 2026 qualifier</span>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            {[
              { color: 'bg-emerald-400',    label: '1900+' },
              { color: 'bg-emerald-400/70', label: '1800+' },
              { color: 'bg-emerald-400/40', label: '1700+' },
              { color: 'bg-white/15',       label: '<1700' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-6 h-1 rounded-full ${color}`} />
                <span className="text-white/20 text-[9px] tabular-nums">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
