'use client'

import { useState, useRef, useEffect } from 'react'

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L']

// ---------------------------------------------------------------------------
// Editable team name cell with autocomplete dropdown
// ---------------------------------------------------------------------------

function EditableTeam({ team, allTeams, onSave, onCancel }) {
  const [query, setQuery] = useState(team)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const filtered = query.length >= 1
    ? allTeams.filter(t => t.toLowerCase().includes(query.toLowerCase()) && t !== team).slice(0, 8)
    : []

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onCancel])

  function handleKey(e) {
    if (e.key === 'Escape') { onCancel(); return }
    if (e.key === 'Enter') {
      const trimmed = query.trim()
      if (trimmed && trimmed !== team) onSave(trimmed)
      else onCancel()
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKey}
        className="w-[110px] bg-elevated border border-emerald-400/40 rounded px-1.5 py-0.5 text-[11px] text-ink  focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15"
      />
      {filtered.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 py-1 z-50 bg-elevated border border-ink/15 rounded-md pop rise-in min-w-[140px]">
          {filtered.map(t => (
            <button
              key={t}
              onMouseDown={() => onSave(t)}
              className="w-full text-left px-2.5 py-1.5 text-[11px] text-ink/85 hover:text-ink hover:bg-ink/5 transition-colors "
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group table
// ---------------------------------------------------------------------------

function GroupTable({ letter, teams, results, editable, allTeams, onTeamChange }) {
  const [editing, setEditing] = useState(null) // team name being edited

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

  function handleSave(oldTeam, newTeam) {
    setEditing(null)
    onTeamChange?.(letter, oldTeam, newTeam)
  }

  return (
    <div className="border border-ink/10 rounded-xl overflow-hidden bg-surface surface hover:border-emerald-400/25 transition-colors duration-300">
      <div className="px-4 py-2.5 border-b border-ink/10 flex items-center gap-2">
        <span className="text-emerald-400 text-sm font-semibold">Group {letter}</span>
        {editable && (
          <span className="ml-auto text-ink/30 text-[10px] tracking-wider uppercase">click to edit</span>
        )}
      </div>
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-ink/40 tracking-wider uppercase">
            <th className="text-left px-4 py-1.5 font-medium text-[10px]">Team</th>
            <th className="px-1 py-1.5 font-medium text-[10px] w-6">P</th>
            <th className="px-1 py-1.5 font-medium text-[10px] w-6">W</th>
            <th className="px-1 py-1.5 font-medium text-[10px] w-6">D</th>
            <th className="px-1 py-1.5 font-medium text-[10px] w-6">L</th>
            <th className="px-1 py-1.5 font-medium text-[10px] w-8">GD</th>
            <th className="px-1 py-1.5 font-medium text-[10px] w-8">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr
              key={s.team}
              className={`border-t border-ink/5 hover:bg-ink/[0.03] transition-colors ${
                done && i < 2 ? 'text-ink font-medium' : 'text-ink/75'
              }`}
            >
              <td className="px-4 py-2">
                <div className="flex items-center gap-1.5">
                  {done && i < 2 && (
                    <span className="w-1 h-1 rounded-full bg-emerald-400 inline-block flex-shrink-0" />
                  )}
                  {done && i === 2 && (
                    <span className="w-1 h-1 rounded-full bg-yellow-400/60 inline-block flex-shrink-0" />
                  )}
                  {(!done || i > 2) && (
                    <span className="w-1 h-1 rounded-full inline-block flex-shrink-0" />
                  )}

                  {editable && editing === s.team ? (
                    <EditableTeam
                      team={s.team}
                      allTeams={allTeams}
                      onSave={newTeam => handleSave(s.team, newTeam)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : editable ? (
                    <button
                      onClick={() => setEditing(s.team)}
                      className="truncate max-w-[90px] text-left hover:text-emerald-400 hover:underline underline-offset-2 transition-colors cursor-pointer"
                    >
                      {s.team}
                    </button>
                  ) : (
                    <span className="truncate max-w-[90px]">{s.team}</span>
                  )}
                </div>
              </td>
              <td className="text-center px-1 py-2 font-mono text-xs">{s.played}</td>
              <td className="text-center px-1 py-2 font-mono text-xs">{s.w}</td>
              <td className="text-center px-1 py-2 font-mono text-xs">{s.d}</td>
              <td className="text-center px-1 py-2 font-mono text-xs">{s.l}</td>
              <td className="text-center px-1 py-2 font-mono text-xs">{s.gd > 0 ? `+${s.gd}` : s.gd}</td>
              <td className="text-center px-1 py-2 font-mono text-xs font-bold">{s.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group grid
// ---------------------------------------------------------------------------

export default function GroupGrid({ groups, groupResults, editable, allTeams, onTeamChange }) {
  if (!groups) return null

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-[1080px]">
      {GROUP_LETTERS.map(letter => (
        <GroupTable
          key={letter}
          letter={letter}
          teams={groups[letter] || []}
          results={groupResults ? groupResults[letter] : null}
          editable={editable}
          allTeams={allTeams || []}
          onTeamChange={onTeamChange}
        />
      ))}
    </div>
  )
}
