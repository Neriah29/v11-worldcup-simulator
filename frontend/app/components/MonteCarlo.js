'use client'

import { useState } from 'react'

const MODELS = [
  { key: 'logistic_regression', label: 'Logistic Regression' },
  { key: 'naive_bayes',         label: 'Naive Bayes' },
  { key: 'knn',                 label: 'K-Nearest Neighbors' },
  { key: 'decision_tree',       label: 'Decision Tree' },
  { key: 'perceptron',          label: 'Perceptron' },
]

const RUN_OPTIONS = [100, 500, 1000]

export default function MonteCarlo() {
  const [runs, setRuns] = useState(500)
  const [selectedModel, setSelectedModel] = useState('logistic_regression')
  const [phase, setPhase] = useState('idle') // idle | loading | done
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('champion') // champion | finalist | semi | quarter

  async function handleRun() {
    setPhase('loading')
    setError(null)
    setResults(null)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/tournament/monte_carlo?runs=${runs}&model=${selectedModel}`
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Simulation failed')
      }
      const data = await res.json()
      setResults(data)
      setPhase('done')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  const PCT_KEY = {
    champion: 'champion_pct',
    finalist: 'finalist_pct',
    semi:     'semi_pct',
    quarter:  'quarter_pct',
  }

  const VIEW_LABELS = {
    champion: 'Champion',
    finalist: 'Reached Final',
    semi:     'Reached Semis',
    quarter:  'Reached Quarters',
  }

  // Sort teams by whichever view is active
  const sortedTeams = results
    ? [...results.teams].sort((a, b) => b[PCT_KEY[view]] - a[PCT_KEY[view]])
    : null

  const maxPct = sortedTeams ? (sortedTeams[0]?.[PCT_KEY[view]] || 1) : 1

  const topTeam = results?.teams[0]

  return (
    <div className="max-w-3xl mx-auto px-8 py-16">

      {/* Title */}
      <div className="mb-12">
        <p className="text-white/30 text-xs tracking-[0.4em] uppercase mb-4">Monte Carlo Simulation</p>
        <h1 className="text-5xl font-bold tracking-tight leading-none mb-4">Who usually wins?</h1>
        <p className="text-white/40 text-sm">Run the tournament hundreds of times to see probability distributions</p>
      </div>

      {/* Controls */}
      <div className="space-y-6 mb-10">

        {/* Run count */}
        <div>
          <p className="text-white/30 text-[10px] tracking-[0.4em] uppercase mb-3">Simulations</p>
          <div className="flex gap-2">
            {RUN_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setRuns(n)}
                disabled={phase === 'loading'}
                className={`px-5 py-2 rounded border text-xs tracking-widest transition-all ${
                  runs === n
                    ? 'border-emerald-400/50 text-emerald-400 bg-emerald-400/10'
                    : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {n.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div>
          <p className="text-white/30 text-[10px] tracking-[0.4em] uppercase mb-3">Model</p>
          <div className="flex gap-1.5 flex-wrap">
            {MODELS.map(m => (
              <button
                key={m.key}
                onClick={() => setSelectedModel(m.key)}
                disabled={phase === 'loading'}
                className={`px-3 py-1.5 rounded border text-[10px] tracking-wide transition-all ${
                  selectedModel === m.key
                    ? 'border-emerald-400/50 text-emerald-400 bg-emerald-400/10'
                    : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={phase === 'loading'}
          className="w-full py-3 bg-emerald-400 text-black font-bold text-sm tracking-widest uppercase rounded hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-3"
        >
          {phase === 'loading' ? (
            <>
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Running {runs.toLocaleString()} simulations...
            </>
          ) : (
            `Run ${runs.toLocaleString()} Simulations`
          )}
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-400/10 border border-red-400/20 rounded">
          <p className="text-red-400 text-xs tracking-wide">{error}</p>
        </div>
      )}

      {/* Results */}
      {phase === 'done' && sortedTeams && (
        <div>
          {/* Summary */}
          <div className="mb-6 pb-6 border-b border-white/10 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-white/20 text-[10px] tracking-[0.4em] uppercase mb-1">Most likely champion</p>
              <p className="text-emerald-400 text-2xl font-bold tracking-tight">{topTeam?.team}</p>
              <p className="text-white/30 text-xs mt-1">
                wins in {topTeam?.champion_pct}% of simulations
                <span className="text-white/15 mx-2">·</span>
                {topTeam?.champion_n} / {results.runs} runs
              </p>
            </div>
            <div className="text-right text-white/20 text-[10px] tracking-widest uppercase leading-relaxed">
              <p>{results.runs.toLocaleString()} runs</p>
              <p>{MODELS.find(m => m.key === results.model)?.label}</p>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex gap-1 mb-6">
            {Object.entries(VIEW_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`px-3 py-1.5 rounded text-[10px] tracking-wide border transition-all ${
                  view === key
                    ? 'border-emerald-400/50 text-emerald-400 bg-emerald-400/10'
                    : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Bar chart */}
          <div className="space-y-1.5">
            {sortedTeams.map((t, i) => {
              const pct = t[PCT_KEY[view]]
              const barWidth = maxPct > 0 ? (pct / maxPct) * 100 : 0
              const isTop3 = i < 3

              return (
                <div key={t.team} className="flex items-center gap-3 group">
                  {/* Rank */}
                  <span className={`text-[10px] w-5 text-right flex-shrink-0 ${
                    i === 0 ? 'text-emerald-400' : 'text-white/15'
                  }`}>
                    {i + 1}
                  </span>

                  {/* Team name */}
                  <span className={`text-xs w-36 flex-shrink-0 truncate font-mono ${
                    isTop3 ? 'text-white/80' : pct === 0 ? 'text-white/20' : 'text-white/50'
                  }`}>
                    {t.team}
                  </span>

                  {/* Bar */}
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        i === 0
                          ? 'bg-emerald-400'
                          : isTop3
                            ? 'bg-emerald-400/60'
                            : pct === 0
                              ? 'bg-transparent'
                              : 'bg-white/20'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  {/* Percentage */}
                  <span className={`text-[10px] w-10 text-right flex-shrink-0 tabular-nums ${
                    i === 0 ? 'text-emerald-400' : pct === 0 ? 'text-white/10' : 'text-white/30'
                  }`}>
                    {pct > 0 ? `${pct}%` : '—'}
                  </span>
                </div>
              )
            })}
          </div>

          <p className="mt-8 text-white/10 text-[10px] tracking-widest uppercase">
            All 48 qualified teams · sorted by {VIEW_LABELS[view].toLowerCase()}
          </p>
        </div>
      )}
    </div>
  )
}
