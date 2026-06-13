'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import GroupGrid from './GroupGrid'
import Bracket from './Bracket'

const MODELS = [
  { key: 'logistic_regression', label: 'Logistic Regression' },
  { key: 'naive_bayes',         label: 'Naive Bayes' },
  { key: 'knn',                 label: 'K-Nearest Neighbors' },
  { key: 'decision_tree',       label: 'Decision Tree' },
  { key: 'perceptron',          label: 'Perceptron' },
  { key: 'mlp',                 label: 'Neural Network' },
  { key: 'svm',                 label: 'SVM' },
]

// Animation timing (ms)
const GROUP_MATCH_DELAY = 120
const GROUP_GAP = 80
const POST_GROUP_PAUSE = 600
const KO_MATCH_DELAY = 350
const KO_ROUND_GAP = 500

export default function TournamentMode() {
  const [selectedModel, setSelectedModel] = useState('logistic_regression')
  const [phase, setPhase] = useState('idle') // idle | loading | animating | done
  const [error, setError] = useState(null)

  // Static group list shown on load (blank stats until simulate)
  const [initialGroups, setInitialGroups] = useState(null)
  // Mutable copy the user can edit
  const [editableGroups, setEditableGroups] = useState(null)
  // All known teams for autocomplete
  const [allTeams, setAllTeams] = useState([])

  // Raw data from API
  const [tournamentData, setTournamentData] = useState(null)

  // Animation state
  const [groupResults, setGroupResults] = useState({})
  const [showBracket, setShowBracket] = useState(false)
  const [revealedRounds, setRevealedRounds] = useState({ r32: 0, r16: 0, qf: 0, sf: 0, final: 0 })

  const animationRef = useRef(null)

  // Fetch groups + team list on mount so the canvas is never blank
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/tournament/groups`)
      .then(r => r.json())
      .then(d => {
        setInitialGroups(d.groups)
        setEditableGroups(d.groups)
      })
      .catch(() => {})

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/teams`)
      .then(r => r.json())
      .then(d => setAllTeams(d.teams || []))
      .catch(() => {})
  }, [])

  function handleTeamChange(letter, oldTeam, newTeam) {
    setEditableGroups(prev => {
      if (!prev) return prev
      return {
        ...prev,
        [letter]: prev[letter].map(t => t === oldTeam ? newTeam : t),
      }
    })
  }

  function handleResetGroups() {
    setEditableGroups(initialGroups)
  }

  const isEdited = initialGroups && editableGroups &&
    JSON.stringify(initialGroups) !== JSON.stringify(editableGroups)

  // Teams currently assigned to any group slot — excluded from autocomplete
  const usedTeams = new Set(
    editableGroups ? Object.values(editableGroups).flat() : []
  )

  const sleep = (ms) => new Promise(res => { animationRef.current = setTimeout(res, ms) })

  const runAnimation = useCallback(async (data) => {
    setPhase('animating')
    setGroupResults({})
    setShowBracket(false)
    setRevealedRounds({ r32: 0, r16: 0, qf: 0, sf: 0, final: 0 })

    const groupLetters = Object.keys(data.groups || {})

    for (const letter of groupLetters) {
      const matches = data.groups[letter]?.matches || []
      for (let i = 0; i < matches.length; i++) {
        await sleep(GROUP_MATCH_DELAY)
        setGroupResults(prev => ({
          ...prev,
          [letter]: [...(prev[letter] || []), matches[i]]
        }))
      }
      await sleep(GROUP_GAP)
    }

    await sleep(POST_GROUP_PAUSE)
    setShowBracket(true)

    const rounds = ['r32', 'r16', 'qf', 'sf', 'final']
    const counts = { r32: 16, r16: 8, qf: 4, sf: 2, final: 1 }

    for (const round of rounds) {
      const total = counts[round]
      for (let i = 1; i <= total; i++) {
        await sleep(KO_MATCH_DELAY)
        setRevealedRounds(prev => ({ ...prev, [round]: i }))
      }
      await sleep(KO_ROUND_GAP)
    }

    setPhase('done')
  }, [])

  async function handleSimulate() {
    if (phase === 'animating') return
    clearTimeout(animationRef.current)

    setPhase('loading')
    setError(null)
    setTournamentData(null)
    setGroupResults({})
    setShowBracket(false)
    setRevealedRounds({ r32: 0, r16: 0, qf: 0, sf: 0, final: 0 })

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/tournament/simulate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel, groups: editableGroups || null }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Simulation failed')
      }
      const data = await res.json()
      setTournamentData(data)
      await runAnimation(data)
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  function handleReset() {
    clearTimeout(animationRef.current)
    setPhase('idle')
    setTournamentData(null)
    setGroupResults({})
    setShowBracket(false)
    setRevealedRounds({ r32: 0, r16: 0, qf: 0, sf: 0, final: 0 })
    setError(null)
    // keep editableGroups — user's team edits survive a reset
  }

  // Derive the group→teams map: prefer live data after simulate, fall back to editable groups
  const displayGroups = tournamentData
    ? Object.fromEntries(
        Object.entries(tournamentData.groups).map(([k, v]) => [
          k, v.standings.map(s => s.team)
        ])
      )
    : editableGroups

  const champion = phase === 'done' && tournamentData?.champion

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Controls bar */}
      <div className="flex-shrink-0 px-8 py-5 border-b border-white/10 flex items-center gap-6 flex-wrap">
        <div>
          <p className="text-white/30 text-[10px] tracking-[0.4em] uppercase mb-2">Model</p>
          <div className="flex gap-1.5 flex-wrap">
            {MODELS.map(m => (
              <button
                key={m.key}
                onClick={() => setSelectedModel(m.key)}
                disabled={phase === 'loading' || phase === 'animating'}
                className={`px-3 py-1 rounded text-[10px] tracking-wide border transition-all ${
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

        <div className="ml-auto flex items-center gap-3">
          {champion && (
            <div className="flex items-center gap-2 px-3 py-1.5 border border-emerald-400/30 rounded bg-emerald-400/5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 text-xs font-bold tracking-wide">{champion}</span>
              <span className="text-white/20 text-[10px] tracking-widest uppercase">Champion</span>
            </div>
          )}

          {isEdited && phase === 'idle' && (
            <button
              onClick={handleResetGroups}
              className="px-4 py-2 border border-white/10 text-white/30 text-xs tracking-widest uppercase rounded hover:border-white/20 hover:text-white/50 transition-all"
            >
              Reset Teams
            </button>
          )}

          {(phase === 'done' || phase === 'animating') && (
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-white/10 text-white/40 text-xs tracking-widest uppercase rounded hover:border-white/20 hover:text-white/60 transition-all"
            >
              Reset
            </button>
          )}

          <button
            onClick={handleSimulate}
            disabled={phase === 'loading' || phase === 'animating'}
            className="px-6 py-2 bg-emerald-400 text-black font-bold text-xs tracking-[0.2em] uppercase rounded hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {phase === 'loading' ? 'Simulating...' : phase === 'animating' ? 'Playing...' : 'Simulate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex-shrink-0 px-8 py-3 bg-red-400/10 border-b border-red-400/20">
          <p className="text-red-400 text-xs tracking-wide">{error}</p>
        </div>
      )}

      {/* Canvas — always visible */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#07070d] relative">

        {/* Loading overlay (sits on top of the canvas) */}
        {phase === 'loading' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#07070d]/80 backdrop-blur-sm">
            <div className="text-center space-y-3">
              <div className="w-6 h-6 border border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin mx-auto" />
              <p className="text-white/30 text-xs tracking-widest uppercase">Running simulation...</p>
            </div>
          </div>
        )}

        <TransformWrapper
          initialScale={0.81}
          minScale={0.2}
          maxScale={2}
          initialPositionX={20}
          initialPositionY={20}
          limitToBounds={false}
          wheel={{ step: 0.08 }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Zoom controls */}
              <div className="absolute top-4 right-4 z-10 flex flex-col gap-1">
                <button
                  onClick={() => zoomIn()}
                  className="w-8 h-8 border border-white/10 rounded text-white/40 hover:text-white/70 hover:border-white/20 transition-all text-lg leading-none flex items-center justify-center"
                >+</button>
                <button
                  onClick={() => zoomOut()}
                  className="w-8 h-8 border border-white/10 rounded text-white/40 hover:text-white/70 hover:border-white/20 transition-all text-lg leading-none flex items-center justify-center"
                >−</button>
                <button
                  onClick={() => resetTransform()}
                  className="w-8 h-8 border border-white/10 rounded text-white/30 hover:text-white/60 hover:border-white/20 transition-all text-[10px] leading-none flex items-center justify-center"
                >↺</button>
              </div>

              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ padding: '32px' }}
              >
                <div className="flex flex-col gap-10">

                  {/* Onboarding hints */}
                  {phase === 'idle' && !tournamentData && (
                    <div className="flex items-center gap-6 flex-wrap select-none mb-2">
                      <span className="text-white/50 text-2xl">Drag to pan</span>
                      <span className="text-white/20 text-2xl">·</span>
                      <span className="text-white/50 text-2xl">Scroll to zoom</span>
                      <span className="text-white/20 text-2xl">·</span>
                      <span className="text-white/50 text-2xl">Click a team to swap it</span>
                      <span className="text-white/20 text-2xl">·</span>
                      <span className="text-white/50 text-2xl">Then hit <span className="text-emerald-400 font-bold">Simulate</span></span>
                    </div>
                  )}

                  {/* Group Stage — always shown */}
                  <div>
                    <p className="text-white/20 text-[10px] tracking-[0.5em] uppercase mb-4">
                      Group Stage
                    </p>
                    <GroupGrid
                      groups={displayGroups}
                      groupResults={groupResults}
                      editable={phase === 'idle' && !tournamentData}
                      allTeams={allTeams.filter(t => !usedTeams.has(t))}
                      onTeamChange={handleTeamChange}
                    />
                  </div>

                  {/* Knockout Bracket — appears after group animation */}
                  {showBracket && (
                    <div>
                      <p className="text-white/20 text-[10px] tracking-[0.5em] uppercase mb-4">
                        Knockout Stage
                      </p>
                      <Bracket
                        data={tournamentData}
                        revealedRounds={revealedRounds}
                      />
                    </div>
                  )}

                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  )
}
