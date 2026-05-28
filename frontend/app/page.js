'use client'

import { useState, useEffect } from 'react'

export default function Home() {
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [teams, setTeams] = useState([])
  const [homeSearch, setHomeSearch] = useState([])
  const [awaySearch, setAwaySearch] = useState([])

  useEffect(() => {
    fetch('http://localhost:8000/teams')
      .then(r => r.json())
      .then(d => setTeams(d.teams))
  }, [])

  function filterTeams(query) {
    if (!query || query.length < 2) return []
    return teams.filter(t => t.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
  }

  async function handlePredict() {
    if (!homeTeam || !awayTeam) return
    setLoading(true)
    setResult(null)
    try {
      const response = await fetch(
        `http://localhost:8000/predict?home_team=${encodeURIComponent(homeTeam)}&away_team=${encodeURIComponent(awayTeam)}`
      )
      const data = await response.json()
      setResult(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white font-mono">

      {/* Header */}
      <header className="border-b border-white/10 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs tracking-[0.3em] uppercase">V11 // Prediction Engine</span>
        </div>
        <span className="text-white/30 text-xs tracking-widest">FIFA WORLD CUP 2026</span>
      </header>

      <div className="max-w-3xl mx-auto px-8 py-20">

        {/* Title */}
        <div className="mb-16">
          <p className="text-white/30 text-xs tracking-[0.4em] uppercase mb-4">Match Simulator</p>
          <h1 className="text-5xl font-bold tracking-tight leading-none mb-4">
            Who wins?
          </h1>
          <p className="text-white/40 text-sm">
            ML model trained on 45,000+ international matches
          </p>
        </div>

        {/* Team Inputs */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start mb-8">

          {/* Home Team */}
          <div className="relative">
            <label className="text-white/30 text-xs tracking-widest uppercase block mb-2">Home</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-emerald-400/50 transition-colors"
              placeholder="e.g. Brazil"
              value={homeTeam}
              onChange={e => {
                setHomeTeam(e.target.value)
                setHomeSearch(filterTeams(e.target.value))
              }}
            />
            {homeSearch.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#12121a] border border-white/10 rounded overflow-hidden z-10">
                {homeSearch.map(t => (
                  <button
                    key={t}
                    className="w-full text-left px-4 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                    onClick={() => { setHomeTeam(t); setHomeSearch([]) }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* VS */}
          <div className="pt-8 text-white/20 text-sm tracking-widest">VS</div>

          {/* Away Team */}
          <div className="relative">
            <label className="text-white/30 text-xs tracking-widest uppercase block mb-2">Away</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-emerald-400/50 transition-colors"
              placeholder="e.g. France"
              value={awayTeam}
              onChange={e => {
                setAwayTeam(e.target.value)
                setAwaySearch(filterTeams(e.target.value))
              }}
            />
            {awaySearch.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#12121a] border border-white/10 rounded overflow-hidden z-10">
                {awaySearch.map(t => (
                  <button
                    key={t}
                    className="w-full text-left px-4 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                    onClick={() => { setAwayTeam(t); setAwaySearch([]) }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Predict Button */}
        <button
          onClick={handlePredict}
          disabled={loading || !homeTeam || !awayTeam}
          className="w-full py-3 bg-emerald-400 text-black font-bold text-sm tracking-widest uppercase rounded hover:bg-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Running model...' : 'Predict Match'}
        </button>

        {/* Result */}
        {result && (
          <div className="mt-12 border border-white/10 rounded-lg p-8 bg-white/[0.02]">

            <p className="text-white/30 text-xs tracking-[0.4em] uppercase mb-6">Prediction Output</p>

            <div className="mb-8">
              <p className="text-white/40 text-xs mb-1 tracking-widest uppercase">Predicted Winner</p>
              <p className="text-3xl font-bold text-emerald-400">{result.predicted_winner}</p>
            </div>

            {/* Probability Bars */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-white/40 mb-2 tracking-widest uppercase">
                  <span>{result.home_team}</span>
                  <span>{(result.home_win_probability * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-700"
                    style={{ width: `${result.home_win_probability * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-white/40 mb-2 tracking-widest uppercase">
                  <span>{result.away_team}</span>
                  <span>{(result.away_win_probability * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/40 rounded-full transition-all duration-700"
                    style={{ width: `${result.away_win_probability * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <p className="mt-6 text-white/20 text-xs tracking-widest">
              MODEL // Logistic Regression · 45,000+ matches
            </p>
          </div>
        )}
      </div>
    </main>
  )
}