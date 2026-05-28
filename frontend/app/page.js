'use client'

import { useState } from 'react'

export default function Home() {
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [result, setResult] = useState(null)

  async function handlePredict() {
    const response = await fetch(
        `http://localhost:8000/predict?home_team=${homeTeam}&away_team=${awayTeam}`
    )
    const data = await response.json()
    console.log(data)
    setResult(data)
}
  return (
    <main>
      <h1>World Cup 2026 Simulator</h1>

      <input
        placeholder="Home Team (e.g. Brazil)"
        value={homeTeam}
        onChange={e => setHomeTeam(e.target.value)}
      />

      <input
        placeholder="Away Team (e.g. France)"
        value={awayTeam}
        onChange={e => setAwayTeam(e.target.value)}
      />

      <button onClick={handlePredict}>Predict</button>

      {result && (
        <div>
          <p>{result.home_team} vs {result.away_team}</p>
          <p>Predicted Winner: {result.predicted_winner}</p>
          <p>Home Win Probability: {result.home_win_probability}</p>
          <p>Away Win Probability: {result.away_win_probability}</p>
        </div>
      )}
    </main>
  )
}