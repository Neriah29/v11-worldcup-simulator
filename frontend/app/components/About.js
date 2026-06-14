'use client'

const MODELS = [
  {
    key: 'logistic_regression',
    label: 'Logistic Regression',
    description: 'Finds a linear decision boundary by fitting a sigmoid curve to match outcome probabilities. The most interpretable model and highest accuracy — each feature has a fixed learned weight.',
  },
  {
    key: 'svm',
    label: 'Support Vector Machine',
    description: 'Finds the maximum-margin hyperplane that separates wins from losses in feature space. Trained on a 3,000-match subsample with a linear kernel for efficiency.',
  },
  {
    key: 'naive_bayes',
    label: 'Naive Bayes',
    description: 'Assumes all features are independent given the match outcome, then uses Bayes\' theorem to compute win probability. Surprisingly competitive given its simple assumption.',
  },
  {
    key: 'mlp',
    label: 'Neural Network (MLP)',
    description: 'A two-hidden-layer network (64 → 32 neurons) with ReLU activations and sigmoid output. Trained via backpropagation on the full dataset to learn non-linear patterns.',
  },
  {
    key: 'knn',
    label: 'K-Nearest Neighbors',
    description: 'Predicts by finding the 10 most similar historical matches in feature space and taking a majority vote. No training step — pure similarity-based reasoning.',
  },
  {
    key: 'perceptron',
    label: 'Perceptron',
    description: 'The simplest possible classifier — a single layer of weights updated by misclassification. Output is clipped to soft probabilities to avoid hard 0/1 predictions.',
  },
  {
    key: 'decision_tree',
    label: 'Decision Tree',
    description: 'Recursively splits features into binary decision rules (e.g. "Elo diff > 120?"). Highly interpretable but prone to overfitting — lowest accuracy of the seven.',
  },
]

const FEATURES = [
  { label: 'Elo Rating', desc: 'A rolling skill rating updated after every match. The single strongest predictor.' },
  { label: 'Rolling Goals', desc: 'Exponentially-weighted average goals scored over the last 10 matches.' },
  { label: 'Rolling Conceded', desc: 'Exponentially-weighted average goals conceded — proxy for defensive strength.' },
  { label: 'Win Rate (Home/Away)', desc: 'Separate win rates for home and away contexts, since teams often perform differently.' },
  { label: 'FIFA Ranking & Points', desc: 'Official FIFA ranking position and points at match date.' },
  { label: 'Goal Difference', desc: 'Rolling GD captures margin of victory — a team winning 3-0 looks better than 1-0.' },
  { label: 'Streak', desc: '+1 per consecutive win, -1 per consecutive loss. Captures momentum.' },
  { label: 'Clean Sheet Rate', desc: 'Rolling proportion of matches without conceding — another defensive signal.' },
  { label: 'Days Rest', desc: 'Days since last match, capped at 90. Controls for fatigue.' },
  { label: 'Head-to-Head', desc: 'Win rate against this specific opponent over the last 10 meetings.' },
  { label: 'Same Confederation', desc: 'Whether both teams are from the same confederation.' },
  { label: 'Neutral Ground', desc: 'Binary flag — when true, home advantage features are averaged out.' },
]

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-16 space-y-20">

      {/* Intro */}
      <div>
        <p className="text-ink/30 text-xs tracking-[0.4em] uppercase mb-4">About</p>
        <h1 className="text-5xl font-bold tracking-tight leading-none mb-6">V11 Prediction Engine</h1>
        <p className="text-ink/50 text-sm leading-relaxed">
          A machine learning tournament simulator for FIFA World Cup 2026 made by Neriah Okolo. Seven from-scratch ML models — built in pure NumPy — are trained on 45,000+ international matches dating back to 1872. Each model predicts match outcomes using 21 hand-engineered features covering form, Elo, rankings, head-to-head history, and more.
        </p>
      </div>

      {/* Models */}
      <div>
        <p className="text-ink/30 text-xs tracking-[0.4em] uppercase mb-8">The Models</p>
        <div className="space-y-px">
          {MODELS.map((m, i) => (
            <div key={m.key} className="flex gap-6 py-5 border-b border-ink/5 group">
              <span className="text-ink/15 text-xs w-4 flex-shrink-0 pt-0.5">{i + 1}</span>
              <div>
                <p className="text-ink text-sm font-bold tracking-wide mb-1.5">{m.label}</p>
                <p className="text-ink/40 text-xs leading-relaxed">{m.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div>
        <p className="text-ink/30 text-xs tracking-[0.4em] uppercase mb-8">Features <span className="text-ink/15 ml-2">21 inputs per match</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-ink/5 rounded-lg overflow-hidden">
          {FEATURES.map(f => (
            <div key={f.label} className="bg-base px-5 py-4">
              <p className="text-ink/70 text-xs font-bold mb-1">{f.label}</p>
              <p className="text-ink/30 text-[11px] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-ink/5 pt-8">
        <p className="text-ink/20 text-xs leading-relaxed">
          Models learned in CMOR 438 / INDE 577 · Rice University · Made by Neriah Okolo · All models implemented from scratch in NumPy · Training data: international football results 1872–2024
        </p>
      </div>

    </div>
  )
}
