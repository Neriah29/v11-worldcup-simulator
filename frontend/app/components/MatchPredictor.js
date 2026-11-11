'use client'

import { useState, useEffect, useId } from 'react'

export default function MatchPredictor() {
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [teams, setTeams] = useState([])
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

  function swapTeams() {
    setHomeTeam(awayTeam)
    setAwayTeam(homeTeam)
    setResult(null)
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
        <p className="text-ink/50 text-xs tracking-[0.14em] uppercase mb-4">Match Simulator</p>
        <h1 className="text-5xl font-semibold tracking-tight leading-none mb-4">Who wins?</h1>
        <p className="text-ink/60 text-sm">ML model trained on 45,000+ international matches</p>
      </div>

      {/* Model Selector */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <p className="text-ink/50 text-xs tracking-[0.14em] uppercase">Select Model</p>
          <span className="text-ink/25">|</span>
          <button
            onClick={() => setShowAccuracy(!showAccuracy)}
            aria-expanded={showAccuracy}
            className={`text-[11px] tracking-[0.14em] uppercase px-2.5 py-1 rounded-full border transition-all ${
              showAccuracy
                ? 'border-ink/20 text-ink/75 bg-ink/[0.06]'
                : 'border-ink/10 text-ink/50 bg-ink/[0.02] hover:border-ink/20 hover:text-ink/75 hover:bg-ink/[0.04]'
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
                relative text-left px-4 py-3.5 rounded-xl border transition-all duration-200
                ${!m.available
                  ? 'border-ink/5 opacity-30 cursor-not-allowed'
                  : selectedModel === m.key
                    ? 'border-emerald-400/60 bg-emerald-400/10 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.15)]'
                    : 'border-ink/10 bg-surface surface hover:border-ink/25 hover:-translate-y-px active:translate-y-0'
                }
              `}
            >
              <p className={`text-xs font-bold tracking-wide ${selectedModel === m.key && m.available ? 'text-emerald-400' : 'text-ink/85'}`}>
                {m.label}
              </p>
              {m.accuracy != null && (
                <p className={`text-[11px] mt-1 font-mono tabular-nums ${selectedModel === m.key ? 'text-emerald-400/60' : 'text-ink/45'}`}>
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
          <div className="mt-3 border border-ink/10 rounded-xl p-5 bg-surface surface rise-in">
            <p className="text-ink/40 text-[11px] tracking-[0.14em] uppercase mb-4">
              Test accuracy on held-out match data
            </p>
            <div className="space-y-3">
              {sortedByAccuracy.map((m, i) => (
                <div key={m.key} className="flex items-center gap-3">
                  <span className="text-ink/40 text-[11px] w-4">{i + 1}</span>
                  <span className="text-ink/65 text-xs w-40 truncate">{m.label}</span>
                  <div className="flex-1 h-1 bg-ink/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400/70 rounded-full bar-grow"
                      style={{ width: m.accuracy != null ? `${m.accuracy * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-ink/60 text-xs w-12 text-right font-mono tabular-nums">
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
          <p className="text-ink/65 text-xs font-bold tracking-wide">World Cup Mode</p>
          <p className="text-ink/40 text-[11px] tracking-wider uppercase mt-0.5">Neutral venue — no home advantage</p>
        </div>
        <button
          role="switch"
          aria-checked={isNeutral}
          aria-label="World Cup Mode"
          onClick={() => setIsNeutral(!isNeutral)}
          className={`
            relative w-10 h-5 rounded-full transition-colors duration-200
            ${isNeutral ? 'bg-emerald-400' : 'bg-ink/10 hover:bg-ink/15'}
          `}
        >
          <div className={`
            absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out
            ${isNeutral ? 'translate-x-5' : 'translate-x-0.5'}
          `} />
        </button>
      </div>

      {/* Team Inputs */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start mb-8">
        <TeamInput
          label="Home"
          placeholder="e.g. Brazil"
          value={homeTeam}
          onChange={setHomeTeam}
          suggest={filterTeams}
        />

        <button
          type="button"
          onClick={swapTeams}
          disabled={!homeTeam && !awayTeam}
          title="Swap home and away"
          aria-label="Swap home and away"
          className="group mt-7 rounded-md h-[46px] px-1 text-ink/40 text-sm tracking-wider hover:text-emerald-400 disabled:hover:text-ink/40 transition-colors"
        >
          <span className="[.group:hover:enabled_&]:hidden">VS</span>
          <span className="hidden [.group:hover:enabled_&]:inline">⇄</span>
        </button>

        <TeamInput
          label="Away"
          placeholder="e.g. France"
          value={awayTeam}
          onChange={setAwayTeam}
          suggest={filterTeams}
        />
      </div>

      {/* Predict Button */}
      <button
        onClick={handlePredict}
        disabled={loading || !homeTeam || !awayTeam}
        className="w-full bg-emerald-400 text-black font-semibold text-sm tracking-wider uppercase rounded-xl py-3.5 hover:bg-emerald-300 active:scale-[0.995] accent-glow shadow-[0_8px_24px_-10px_rgba(52,211,153,0.7)] disabled:bg-ink/[0.06] disabled:text-ink/30 disabled:shadow-none disabled:cursor-not-allowed transition-all"
      >
        {loading ? 'Running model...' : 'Predict Match'}
      </button>

      {/* Result */}
      {result && (
        <div className="mt-12 border border-ink/10 rounded-2xl p-8 bg-surface surface rise-in">
          <p className="text-ink/50 text-xs tracking-[0.14em] uppercase mb-6">Prediction Output</p>

          <div className="mb-8">
            <p className="text-ink/60 text-xs mb-1 tracking-wider uppercase">Predicted Winner</p>
            <p className="text-4xl font-semibold tracking-tight text-emerald-400">{result.predicted_winner}</p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-ink/60 mb-2 tracking-wider uppercase">
                <span>{result.home_team} win</span>
                <span className="font-mono tabular-nums">{(result.home_win_probability * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bar-grow ${result.home_win_probability >= result.away_win_probability ? 'bg-emerald-400' : 'bg-ink/40'}`}
                  style={{ width: `${result.home_win_probability * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-ink/60 mb-2 tracking-wider uppercase">
                <span>Draw</span>
                <span className="font-mono tabular-nums">{(result.draw_probability * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bar-grow bg-ink/20"
                  style={{ width: `${result.draw_probability * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-ink/60 mb-2 tracking-wider uppercase">
                <span>{result.away_team} win</span>
                <span className="font-mono tabular-nums">{(result.away_win_probability * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bar-grow ${result.away_win_probability > result.home_win_probability ? 'bg-emerald-400' : 'bg-ink/40'}`}
                  style={{ width: `${result.away_win_probability * 100}%` }}
                />
              </div>
            </div>
          </div>

          <p className="mt-6 text-ink/40 text-xs tracking-wider">
            MODEL // {result.model_label} · 45,000+ matches
          </p>
        </div>
      )}
    </div>
  )
}

function TeamInput({ label, placeholder, value, onChange, suggest }) {
  const [options, setOptions] = useState([])
  const [active, setActive] = useState(-1)
  const listId = useId()

  function pick(t) {
    onChange(t)
    setOptions([])
    setActive(-1)
  }

  function handleKey(e) {
    if (!options.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % options.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? options.length - 1 : i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(options[active >= 0 ? active : 0]) }
    else if (e.key === 'Escape') { setOptions([]); setActive(-1) }
  }

  return (
    <div className="relative">
      <label className="text-ink/50 text-xs tracking-wider uppercase block mb-2">{label}</label>
      <input
        className="w-full bg-surface surface border border-ink/10 rounded-xl px-4 py-3 text-ink placeholder-ink/40 hover:border-ink/20 focus:outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/10 focus-visible:outline-none transition-all"
        placeholder={placeholder}
        value={value}
        onChange={e => {
          onChange(e.target.value)
          setOptions(suggest(e.target.value))
          setActive(-1)
        }}
        onKeyDown={handleKey}
        onBlur={() => setOptions([])}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {options.length > 0 && (
        <div id={listId} role="listbox" className="absolute top-full left-0 right-0 mt-1.5 py-1.5 bg-elevated border border-ink/10 rounded-xl overflow-hidden z-10 pop rise-in">
          {options.map((t, i) => (
            <button
              key={t}
              role="option"
              aria-selected={i === active}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                i === active ? 'bg-ink/[0.06] text-ink' : 'text-ink/85 hover:bg-ink/5 hover:text-ink'
              }`}
              onMouseDown={e => { e.preventDefault(); pick(t) }}
              onMouseEnter={() => setActive(i)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
