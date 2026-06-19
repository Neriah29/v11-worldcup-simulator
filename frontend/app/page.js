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

function useTrainedAt() {
  const [trainedAt, setTrainedAt] = useState(null)

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/status`)
      .then(r => r.json())
      .then(data => {
        if (data.trained_at) {
          const d = new Date(data.trained_at)
          const formatted = d.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
          })
          setTrainedAt(formatted)
        }
      })
      .catch(() => {})
  }, [])

  return trainedAt
}

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

function useTheme() {
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    // sync from DOM (set by inline script before hydration)
    setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark')
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('light', next === 'light')
    try { localStorage.setItem('v11-theme', next) } catch(e) {}
  }

  return { theme, toggle }
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
  const { theme, toggle } = useTheme()
  const trainedAt = useTrainedAt()

  return (
    <main className="min-h-screen bg-base text-ink font-mono flex flex-col">

      {/* Ambient top glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-x-0 top-0 h-72"
          style={{ background: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(52,211,153,0.07), transparent)' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex-shrink-0 border-b border-ink/10 px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/v11-logo.png"
            alt="V11"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <div className="flex items-center gap-2">
            <span className="text-ink font-bold text-sm tracking-wider">V11</span>
            <span className="text-ink/20 text-sm">//</span>
            <span className="text-emerald-400 text-[11px] tracking-[0.3em] uppercase">Prediction Engine</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="w-7 h-7 flex items-center justify-center rounded border border-ink/10 text-ink/40 hover:text-ink/70 hover:border-ink/20 transition-all"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          {/* Live API status indicator */}
          <div className={`w-1.5 h-1.5 rounded-full ${
            apiStatus === 'online'   ? 'bg-emerald-400 animate-pulse' :
            apiStatus === 'slow'     ? 'bg-yellow-400 animate-pulse' :
            apiStatus === 'offline'  ? 'bg-red-400' :
                                       'bg-ink/20 animate-pulse'
          }`} />
          <span className="text-ink/30 text-xs tracking-widest">FIFA WORLD CUP 2026</span>
          {trainedAt && (
            <span className="text-ink/20 text-[10px] tracking-wide">· models as of {trainedAt}</span>
          )}
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
      <div className="relative z-10 flex-shrink-0 flex items-end gap-0 px-8 border-b border-ink/10 justify-between">
        <div className="flex items-end">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative px-6 py-3.5 text-[11px] tracking-[0.2em] uppercase transition-all
                ${activeTab === tab.id
                  ? 'text-ink'
                  : 'text-ink/30 hover:text-ink/60'
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

        <span className="text-ink/20 text-[10px] tracking-widest pb-3.5">Made by Neriah Okolo</span>
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
