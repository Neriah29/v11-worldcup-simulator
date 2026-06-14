'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import MatchPredictor from './components/MatchPredictor'
import TournamentMode from './components/tournament/TournamentMode'
import MonteCarlo from './components/MonteCarlo'
import About from './components/About'
import EloRankings from './components/EloRankings'

const TABS = [
  { id: 'tournament', label: 'Tournament' },
  { id: 'monte',      label: 'Monte Carlo' },
  { id: 'match',      label: 'Match Predictor' },
  { id: 'elo',        label: 'Elo Rankings' },
  { id: 'about',      label: 'About' },
]

// API status: 'checking' | 'online' | 'offline' | 'slow'
function useApiStatus() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false

    async function check() {
      const start = Date.now()
      // Timeout after 8s — Railway cold starts can take 5-7s
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/`, { signal: controller.signal })
        clearTimeout(timeout)
        if (!cancelled) setStatus('online')
      } catch (e) {
        clearTimeout(timeout)
        if (cancelled) return
        // If it aborted due to timeout, mark slow; otherwise offline
        setStatus(e.name === 'AbortError' ? 'slow' : 'offline')

        // Keep retrying every 5s until online
        setTimeout(check, 5000)
      }
    }

    check()
    return () => { cancelled = true }
  }, [])

  return status
}

const BANNER = {
  checking: null,
  online:   null,
  slow: {
    bg:   'bg-yellow-400/10 border-yellow-400/20',
    dot:  'bg-yellow-400 animate-pulse',
    text: 'text-yellow-400',
    msg:  'API is warming up — Railway cold start in progress. This usually takes 20–40 seconds.',
  },
  offline: {
    bg:   'bg-red-400/10 border-red-400/20',
    dot:  'bg-red-400',
    text: 'text-red-400',
    msg:  'API is unreachable. The Railway server may be down or still starting — retrying automatically.',
  },
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('tournament')
  const apiStatus = useApiStatus()
  const banner = BANNER[apiStatus]

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white font-mono flex flex-col">

      {/* Ambient top glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-x-0 top-0 h-72"
          style={{ background: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(52,211,153,0.07), transparent)' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex-shrink-0 border-b border-white/10 px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/v11-logo.png"
            alt="V11"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm tracking-wider">V11</span>
            <span className="text-white/20 text-sm">//</span>
            <span className="text-emerald-400 text-[11px] tracking-[0.3em] uppercase">Prediction Engine</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live API status indicator */}
          <div className={`w-1.5 h-1.5 rounded-full ${
            apiStatus === 'online'   ? 'bg-emerald-400 animate-pulse' :
            apiStatus === 'slow'     ? 'bg-yellow-400 animate-pulse' :
            apiStatus === 'offline'  ? 'bg-red-400' :
                                       'bg-white/20 animate-pulse'
          }`} />
          <span className="text-white/30 text-xs tracking-widest">FIFA WORLD CUP 2026</span>
        </div>
      </header>

      {/* API status banner */}
      {banner && (
        <div className={`relative z-10 flex-shrink-0 border-b ${banner.bg} px-8 py-3 flex items-center gap-3`}>
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${banner.dot}`} />
          <p className={`text-xs tracking-wide ${banner.text}`}>{banner.msg}</p>
        </div>
      )}

      {/* Tab Bar */}
      <div className="relative z-10 flex-shrink-0 flex items-end gap-0 px-8 border-b border-white/10 justify-between">
        <div className="flex items-end">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative px-6 py-3.5 text-[11px] tracking-[0.2em] uppercase transition-all
                ${activeTab === tab.id
                  ? 'text-white'
                  : 'text-white/30 hover:text-white/60'
                }
              `}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-px bg-emerald-400"
                  style={{ boxShadow: '0 0 8px rgba(52,211,153,0.8)' }}
                />
              )}
            </button>
          ))}
        </div>

        <span className="text-white/20 text-[10px] tracking-widest pb-3.5">Made by Neriah Okolo</span>
      </div>

      {/* Tab Content */}
      <div className="relative z-10 flex-1 min-h-0 overflow-auto">
        {activeTab === 'tournament' && <TournamentMode />}
        {activeTab === 'match' && <MatchPredictor />}
        {activeTab === 'monte' && <MonteCarlo />}
        {activeTab === 'elo' && <EloRankings />}
        {activeTab === 'about' && <About />}
      </div>

    </main>
  )
}
