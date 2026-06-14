'use client'

import { useState, useEffect } from 'react'

export default function MatchPredictor() {
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [teams, setTeams] = useState([])
  const [homeSearch, setHomeSearch] = useState([])
  const [awaySearch, setAwaySearch] = useState([])
  const [availableModels, setAvailableModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('logistic_regression')
  const [showAccuracy, setShowAccuracy] = useState(false)
  const [isNeutral, setIsNeutral] = useState(false)

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/teams`)
      .then(r => r.json())
      .then(d => setTeams(d.teams))

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/models`)
      .then(r => r.json())
      .then(d => setAvailableModels(d.models))
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
        `${process.env.NEXT_PUBLIC_API_URL}/predict?home_team=${encodeURIComponent(homeTeam)}&away_team=${encodeURIComponent(awayTeam)}&model=${selectedModel}&neutral=${isNeutral ? 1 : 0}`
      )
      const data = await response.json()
      setResult(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const sortedByAccuracy = [...availableModels]
    .filter(m => m.available)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))

  return (
    <div className="max-w-3xl mx-auto px-8 py-16">

      {/* Title */}
      <div className="mb-16">
        <p className="text-ink/30 text-xs tracking-[0.4em] uppercase mb-4">Match Simulator</p>
        <h1 className="text-5xl font-bold tracking-tight leading-none mb-4">Who wins?</h1>
        <p className="text-ink/40 text-sm">ML model trained on 45,000+ international matches</p>
      </div>

      {/* Model Selector */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <p className="text-ink/30 text-xs tracking-[0.4em] uppercase">Select Model</p>
          <span className="text-ink/10">|</span>
          <button
            onClick={() => setShowAccuracy(!showAccuracy)}
            className={`text-[10px] tracking-[0.3em] uppercase px-2.5 py-1 rounded-full border transition-all ${
              showAccuracy
                ? 'border-ink/20 text-ink/50 bg-ink/[0.06]'
                : 'border-ink/10 text-ink/30 bg-ink/[0.02] hover:border-ink/20 hover:text-ink/50'
            }`}
          >
            {showAccuracy ? 'Hide accuracy ▴' : 'How accurate is each model? ▾'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {availableModels.map(m => (
            <button
              key={m.key}
              disabled={!m.available}
              onClick={() => m.available && setSelectedModel(m.key)}
              className={`
                relative text-left px-4 py-3 rounded border transition-all
                ${!m.available
                  ? 'border-ink/5 opacity-30 cursor-not-allowed'
                  : selectedModel === m.key
                    ? 'border-emerald-400/60 bg-emerald-400/10'
                    : 'border-ink/10 hover:border-ink/20 bg-ink/[0.02]'
                }
              `}
            >
              <p className={`text-xs font-bold tracking-wide ${selectedModel === m.key && m.available ? 'text-emerald-400' : 'text-ink/70'}`}>
                {m.label}
              </p>
              {m.accuracy != null && (
                <p className={`text-[10px] mt-1 tabular-nums ${selectedModel === m.key ? 'text-emerald-400/60' : 'text-ink/25'}`}>
                  {(m.accuracy * 100).toFixed(1)}% accuracy
                </p>
              )}
              {selectedModel === m.key && m.available && (
                <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          ))}
        </div>

        {showAccuracy && (
          <div className="mt-2 border border-ink/10 rounded p-4 bg-ink/[0.02]">
            <p className="text-ink/20 text-[10px] tracking-[0.3em] uppercase mb-4">
              Test accuracy on held-out match data
            </p>
            <div className="space-y-3">
              {sortedByAccuracy.map((m, i) => (
                <div key={m.key} className="flex items-center gap-3">
                  <span className="text-ink/20 text-[10px] w-4">{i + 1}</span>
                  <span className="text-ink/50 text-xs w-40 truncate">{m.label}</span>
                  <div className="flex-1 h-px bg-ink/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400/40 rounded-full"
                      style={{ width: m.accuracy != null ? `${m.accuracy * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-ink/40 text-xs w-12 text-right tabular-nums">
                    {m.accuracy != null ? `${(m.accuracy * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* World Cup Mode Toggle */}
      <div className="flex items-center justify-between mb-8 px-1">
        <div>
          <p className="text-ink/50 text-xs font-bold tracking-wide">World Cup Mode</p>
          <p className="text-ink/20 text-[10px] tracking-widest uppercase mt-0.5">Neutral venue — no home advantage</p>
        </div>
        <button
          onClick={() => setIsNeutral(!isNeutral)}
          className={`
            relative w-10 h-5 rounded-full transition-colors duration-200
            ${isNeutral ? 'bg-emerald-400' : 'bg-ink/10'}
          `}
        >
          <div className={`
            absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200
            ${isNeutral ? 'translate-x-5' : 'translate-x-0.5'}
          `} />
        </button>
      </div>

      {/* Team Inputs */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start mb-8">

        <div className="relative">
          <label className="text-ink/30 text-xs tracking-widest uppercase block mb-2">Home</label>
          <input
            className="w-full bg-ink/5 border border-ink/10 rounded px-4 py-3 text-ink placeholder-ink/20 focus:outline-none focus:border-emerald-400/50 transition-colors"
            placeholder="e.g. Brazil"
            value={homeTeam}
            onChange={e => {
              setHomeTeam(e.target.value)
              setHomeSearch(filterTeams(e.target.value))
            }}
          />
          {homeSearch.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-elevated border border-ink/10 rounded overflow-hidden z-10">
              {homeSearch.map(t => (
                <button
                  key={t}
                  className="w-full text-left px-4 py-2 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink transition-colors"
                  onClick={() => { setHomeTeam(t); setHomeSearch([]) }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pt-8 text-ink/20 text-sm tracking-widest">VS</div>

        <div className="relative">
          <label className="text-ink/30 text-xs tracking-widest uppercase block mb-2">Away</label>
          <input
            className="w-full bg-ink/5 border border-ink/10 rounded px-4 py-3 text-ink placeholder-ink/20 focus:outline-none focus:border-emerald-400/50 transition-colors"
            placeholder="e.g. France"
            value={awayTeam}
            onChange={e => {
              setAwayTeam(e.target.value)
              setAwaySearch(filterTeams(e.target.value))
            }}
          />
          {awaySearch.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-elevated border border-ink/10 rounded overflow-hidden z-10">
              {awaySearch.map(t => (
                <button
                  key={t}
                  className="w-full text-left px-4 py-2 text-sm text-ink/70 hover:bg-ink/5 hover:text-ink transition-colors"
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
        <div className="mt-12 border border-ink/10 rounded-lg p-8 bg-ink/[0.02]">
          <p className="text-ink/30 text-xs tracking-[0.4em] uppercase mb-6">Prediction Output</p>

          <div className="mb-8">
            <p className="text-ink/40 text-xs mb-1 tracking-widest uppercase">Predicted Winner</p>
            <p className="text-3xl font-bold text-emerald-400">{result.predicted_winner}</p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-ink/40 mb-2 tracking-widest uppercase">
                <span>{result.home_team} win</span>
                <span>{(result.home_win_probability * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${result.home_win_probability >= result.away_win_probability ? 'bg-emerald-400' : 'bg-ink/40'}`}
                  style={{ width: `${result.home_win_probability * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-ink/40 mb-2 tracking-widest uppercase">
                <span>Draw</span>
                <span>{(result.draw_probability * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 bg-ink/20"
                  style={{ width: `${result.draw_probability * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-ink/40 mb-2 tracking-widest uppercase">
                <span>{result.away_team} win</span>
                <span>{(result.away_win_probability * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${result.away_win_probability > result.home_win_probability ? 'bg-emerald-400' : 'bg-ink/40'}`}
                  style={{ width: `${result.away_win_probability * 100}%` }}
                />
              </div>
            </div>
          </div>

          <p className="mt-6 text-ink/20 text-xs tracking-widest">
            MODEL // {result.model_label} · 45,000+ matches
          </p>
        </div>
      )}
    </div>
  )
}
