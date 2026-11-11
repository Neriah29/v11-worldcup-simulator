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

function getBanner(status) {
  if (status === 'checking' || status === 'online') return null

  const utcHour = new Date().getUTCHours()
  const utcMin  = new Date().getUTCMinutes()
  const inRetrainWindow = utcHour === 6 && utcMin <= 45

  if (status === 'slow') {
    return {
      bg:   'bg-yellow-400/10 border-yellow-400/20',
      dot:  'bg-yellow-400 animate-pulse',
      text: 'text-yellow-400',
      msg:  inRetrainWindow
        ? 'Models are retraining on the latest match data — this happens daily at 6:00 AM UTC and takes ~45 minutes. Predictions will be back shortly.'
        : 'API is warming up — Railway cold start in progress. This usually takes 20–40 seconds.',
    }
  }

  if (status === 'offline') {
    return {
      bg:   'bg-red-400/10 border-red-400/20',
      dot:  'bg-red-400 animate-pulse',
      text: 'text-red-400',
      msg:  inRetrainWindow
        ? 'Models are retraining on the latest match data — this happens daily at 6:00 AM UTC and takes ~45 minutes. Check back soon.'
        : 'API is unreachable. The server may be down or still starting — retrying automatically.',
    }
  }

  return null
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('tournament')
  const apiStatus = useApiStatus()
  const banner = getBanner(apiStatus)
  const { theme, toggle } = useTheme()
  const trainedAt = useTrainedAt()

  return (
    <main className="min-h-screen bg-base text-ink font-mono flex flex-col">

      {/* Ambient top glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 55% 40% at 50% 0%, rgba(52,211,153,0.11), transparent 70%), radial-gradient(ellipse 45% 50% at 100% 0%, rgba(99,102,241,0.12), transparent 70%), radial-gradient(ellipse 40% 40% at 0% 100%, rgba(99,102,241,0.06), transparent 70%)' }}
        />
      </div>

      {/* Navbar — brand · tabs · status, one sticky row */}
      <header className="sticky top-0 z-30 flex-shrink-0 border-b border-ink/10 bg-base/75 backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_32px_-20px_rgba(0,0,0,0.8)]">
        <div className="grid grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_1fr] items-stretch px-8">

          {/* Brand */}
          <div className="flex items-center gap-3 py-3">
            <Image
              src="/v11-logo.png"
              alt="V11"
              width={34}
              height={34}
              className="rounded-lg ring-1 ring-ink/10"
            />
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="text-ink font-bold text-sm tracking-wider">V11</span>
                <span className="text-ink/25 text-sm">//</span>
                <span className="text-emerald-400 text-[11px] tracking-[0.3em] uppercase">Prediction Engine</span>
              </div>
              <p className="text-ink/35 text-[10px] tracking-wider mt-0.5">by Neriah Okolo</p>
            </div>
          </div>

          {/* Tabs — underline style */}
          <nav className="order-last lg:order-none col-span-2 lg:col-span-1 flex items-stretch justify-center -mx-8 lg:mx-0 px-4 lg:px-0 overflow-x-auto border-t border-ink/5 lg:border-t-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`
                  group relative flex items-center whitespace-nowrap px-4 py-4 text-[11px] tracking-[0.2em] uppercase transition-colors duration-200
                  ${activeTab === tab.id
                    ? 'text-ink'
                    : 'text-ink/45 hover:text-ink/85'
                  }
                `}
              >
                {tab.label}
                {activeTab === tab.id ? (
                  <div className="absolute bottom-0 inset-x-2 h-0.5 rounded-full bg-emerald-400 rise-in"
                    style={{ boxShadow: '0 0 10px rgba(52,211,153,0.9)' }}
                  />
                ) : (
                  <div className="absolute bottom-0 inset-x-2 h-0.5 rounded-full bg-ink/20 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 ease-out" />
                )}
              </button>
            ))}
          </nav>

          {/* Status + theme */}
          <div className="flex items-center justify-end gap-2 py-3">
            <div
              role="status"
              title={trainedAt ? `API ${apiStatus} · models as of ${trainedAt}` : `API ${apiStatus}`}
              className="hidden sm:flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full border border-ink/10 bg-ink/[0.03]"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                apiStatus === 'online'   ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]' :
                apiStatus === 'slow'     ? 'bg-yellow-400 animate-pulse' :
                apiStatus === 'offline'  ? 'bg-red-400' :
                                           'bg-ink/30 animate-pulse'
              }`} />
              <span className="text-ink/70 text-[11px] tracking-wider">WC 2026</span>
              {trainedAt && (
                <>
                  <span className="text-ink/20 text-[11px]">·</span>
                  <span className="text-ink/40 text-[10px] tracking-wide">models {trainedAt.split(',')[0]}</span>
                </>
              )}
            </div>

            <button
              onClick={toggle}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-ink/10 bg-ink/[0.03] text-ink/60 hover:text-ink hover:border-ink/25 hover:bg-ink/[0.06] active:scale-95 transition-all"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
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
          </div>
        </div>
      </header>

      {/* API status banner */}
      {banner && (
        <div className={`relative z-10 flex-shrink-0 border-b ${banner.bg} px-8 py-3 flex items-center gap-3`}>
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${banner.dot}`} />
          <p className={`text-xs tracking-wide ${banner.text}`}>{banner.msg}</p>
        </div>
      )}

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
