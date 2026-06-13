'use client'

import { useState, useRef } from 'react'

const MODELS = [
  { key: 'logistic_regression', label: 'Logistic Regression' },
  { key: 'naive_bayes',         label: 'Naive Bayes' },
  { key: 'knn',                 label: 'K-Nearest Neighbors' },
  { key: 'decision_tree',       label: 'Decision Tree' },
  { key: 'perceptron',          label: 'Perceptron' },
]

const PRESETS = [100, 500, 1000, 5000, 10000]

const VIEW_LABELS = {
  champion: 'Champion',
  finalist: 'Reached Final',
  semi:     'Reached Semis',
  quarter:  'Reached Quarters',
}

const PCT_KEY = {
  champion: 'champion_pct',
  finalist: 'finalist_pct',
  semi:     'semi_pct',
  quarter:  'quarter_pct',
}

export default function MonteCarlo() {
  const [runs, setRuns] = useState(1000)
  const [inputVal, setInputVal] = useState('1000')
  const [selectedModel, setSelectedModel] = useState('logistic_regression')
  const [phase, setPhase] = useState('idle') // idle | running | done
  const [results, setResults] = useState(null)   // latest cumulative snapshot
  const [runsDone, setRunsDone] = useState(0)
  const [error, setError] = useState(null)
  const [view, setView] = useState('champion')

  const readerRef = useRef(null)

  function handleRunsInput(val) {
    setInputVal(val)
    const n = parseInt(val, 10)
    if (!isNaN(n) && n >= 1 && n <= 10000) setRuns(n)
  }

  function applyPreset(n) {
    setRuns(n)
    setInputVal(String(n))
  }

  async function handleRun() {
    if (phase === 'running') return

    setPhase('running')
    setError(null)
    setResults(null)
    setRunsDone(0)

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/tournament/monte_carlo/stream?runs=${runs}&model=${selectedModel}`
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Simulation failed')
      }

      const reader = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        // SSE messages are separated by double newlines
        const parts = buffer.split('\n\n')
        buffer = parts.pop()   // keep any partial message

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          if (raw === '[DONE]') continue

          try {
            const snapshot = JSON.parse(raw)
            setRunsDone(snapshot.runs_done)
            setResults(snapshot)
          } catch { /* malformed chunk, skip */ }
        }
      }

      setPhase('done')
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message)
        setPhase('idle')
      }
    }
  }

  function handleStop() {
    readerRef.current?.cancel()
    setPhase('done')
  }

  // Sort by active view tab
  const sortedTeams = results
    ? [...results.teams].sort((a, b) => b[PCT_KEY[view]] - a[PCT_KEY[view]])
    : null

  const maxPct = sortedTeams?.[0]?.[PCT_KEY[view]] || 1
  const topTeam = sortedTeams?.[0]
  const progress = results ? runsDone / results.total : 0

  return (
    <div className="max-w-3xl mx-auto px-8 py-16">

      {/* Title */}
      <div className="mb-12">
        <p className="text-white/30 text-xs tracking-[0.4em] uppercase mb-4">Monte Carlo Simulation</p>
        <h1 className="text-5xl font-bold tracking-tight leading-none mb-4">Who usually wins?</h1>
        <p className="text-white/40 text-sm">Run the tournament up to 10,000 times to see probability distributions</p>
      </div>

      {/* Controls */}
      <div className="space-y-6 mb-10">

        {/* Run count */}
        <div>
          <p className="text-white/30 text-[10px] tracking-[0.4em] uppercase mb-3">Simulations</p>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Presets */}
            {PRESETS.map(n => (
              <button
                key={n}
                onClick={() => applyPreset(n)}
                disabled={phase === 'running'}
                className={`px-3 py-1.5 rounded border text-[10px] tracking-widest transition-all ${
                  runs === n && inputVal === String(n)
                    ? 'border-emerald-400/50 text-emerald-400 bg-emerald-400/10'
                    : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {n.toLocaleString()}
              </button>
            ))}
            {/* Custom input */}
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-white/20 text-[10px] tracking-widest">or</span>
              <input
                type="number"
                min="1"
                max="10000"
                value={inputVal}
                onChange={e => handleRunsInput(e.target.value)}
                disabled={phase === 'running'}
                className="w-24 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-emerald-400/50 transition-colors disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="custom"
              />
            </div>
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
                disabled={phase === 'running'}
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

        {/* Run / Stop button */}
        <div className="flex gap-3">
          <button
            onClick={handleRun}
            disabled={phase === 'running' || isNaN(runs) || runs < 1}
            className="flex-1 py-3 bg-emerald-400 text-black font-bold text-sm tracking-widest uppercase rounded hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {phase === 'running'
              ? `${runsDone.toLocaleString()} / ${runs.toLocaleString()} runs...`
              : `Run ${isNaN(runs) ? '—' : runs.toLocaleString()} Simulations`}
          </button>
          {phase === 'running' && (
            <button
              onClick={handleStop}
              className="px-5 py-3 border border-white/10 text-white/40 text-xs tracking-widest uppercase rounded hover:border-white/20 hover:text-white/60 transition-all"
            >
              Stop
            </button>
          )}
        </div>

        {/* Progress bar */}
        {phase === 'running' && (
          <div className="h-px bg-white/5 rounded-full overflow-hidden -mt-2">
            <div
              className="h-full bg-emerald-400/50 rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-400/10 border border-red-400/20 rounded">
          <p className="text-red-400 text-xs tracking-wide">{error}</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div>
          {/* Summary */}
          <div className="mb-6 pb-6 border-b border-white/10 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-white/20 text-[10px] tracking-[0.4em] uppercase mb-1">Most likely champion</p>
              <p className="text-emerald-400 text-2xl font-bold tracking-tight">{topTeam?.team}</p>
              <p className="text-white/30 text-xs mt-1">
                wins in <span className="text-white/50">{topTeam?.champion_pct}%</span> of simulations
                <span className="text-white/15 mx-2">·</span>
                {topTeam?.champion_n} / {runsDone.toLocaleString()} runs
              </p>
            </div>
            <div className="text-right text-white/20 text-[10px] tracking-widest uppercase leading-relaxed">
              <p>{runsDone.toLocaleString()} runs{phase === 'running' ? '…' : ''}</p>
              <p>{MODELS.find(m => m.key === results.model)?.label}</p>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex gap-1 mb-6 flex-wrap">
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
                <div key={t.team} className="flex items-center gap-3">
                  <span className={`text-[10px] w-5 text-right flex-shrink-0 ${
                    i === 0 ? 'text-emerald-400' : 'text-white/15'
                  }`}>
                    {i + 1}
                  </span>

                  <span className={`text-xs w-36 flex-shrink-0 truncate font-mono ${
                    isTop3 ? 'text-white/80' : pct === 0 ? 'text-white/20' : 'text-white/50'
                  }`}>
                    {t.team}
                  </span>

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
