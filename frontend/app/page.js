'use client'

import { useState } from 'react'
import MatchPredictor from './components/MatchPredictor'
import TournamentMode from './components/tournament/TournamentMode'
import MonteCarlo from './components/MonteCarlo'

const TABS = [
  { id: 'tournament', label: 'Tournament' },
  { id: 'monte',      label: 'Monte Carlo' },
  { id: 'match',      label: 'Match Predictor' },
]

export default function Home() {
  const [activeTab, setActiveTab] = useState('tournament')

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white font-mono flex flex-col">

      {/* Header */}
      <header className="flex-shrink-0 border-b border-white/10 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs tracking-[0.3em] uppercase">V11 // Prediction Engine</span>
        </div>
        <span className="text-white/30 text-xs tracking-widest">FIFA WORLD CUP 2026</span>
      </header>

      {/* Tab Bar */}
      <div className="flex-shrink-0 flex items-end gap-0 px-8 border-b border-white/10">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              relative px-5 py-3 text-[11px] tracking-[0.25em] uppercase transition-all
              ${activeTab === tab.id
                ? 'text-white'
                : 'text-white/30 hover:text-white/50'
              }
            `}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-px bg-emerald-400" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'tournament' && <TournamentMode />}
        {activeTab === 'match' && <MatchPredictor />}
        {activeTab === 'monte' && <MonteCarlo />}
      </div>

    </main>
  )
}
