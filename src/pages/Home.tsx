import { useState } from 'react';
import { DIVISIONS, teams, scopeLabel, type Scope } from '../data';
import { MODES, modeAvailable, type ModeDef } from '../quiz/modes';
import { getStats, isLearned, needsReview } from '../progress';
import { navigate } from '../router';

const LENGTHS = [
  { n: 10, label: '10' },
  { n: 20, label: '20' },
  { n: 50, label: '50' },
  { n: 0, label: 'Tutti' },
];

const SCOPE_KEY = 'nba-quiz-scope';

function loadScope(): Scope {
  try {
    return (localStorage.getItem(SCOPE_KEY) as Scope) || 'all';
  } catch {
    return 'all';
  }
}

export default function Home({ initialScope }: { initialScope?: Scope }) {
  const [scope, setScopeState] = useState<Scope>(initialScope ?? loadScope);
  const [count, setCount] = useState(10);

  const setScope = (s: Scope) => {
    setScopeState(s);
    try {
      localStorage.setItem(SCOPE_KEY, s);
    } catch {
      /* ignora */
    }
  };

  const start = (mode: ModeDef, review = false) =>
    navigate('quiz', { mode: mode.id, scope, n: count, review: review ? 1 : undefined });

  const groups: { title: string; group: ModeDef['group'] }[] = [
    { title: 'Squadre', group: 'team' },
    { title: 'Giocatori', group: 'player' },
  ];

  return (
    <div className="home">
      <section className="panel settings">
        <label>
          <span>Cosa vuoi studiare?</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="all">🌎 Tutta la NBA</option>
            <option value="East">⬅️ Conference Est</option>
            <option value="West">➡️ Conference Ovest</option>
            {DIVISIONS.map((d) => (
              <optgroup key={d.name} label={`${d.name} (${d.conference === 'East' ? 'Est' : 'Ovest'})`}>
                {teams
                  .filter((t) => t.division === d.name)
                  .map((t) => (
                    <option key={t.id} value={`team:${t.id}`}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="length">
          <span>Domande</span>
          <div className="segmented">
            {LENGTHS.map((l) => (
              <button key={l.n} className={count === l.n ? 'on' : ''} onClick={() => setCount(l.n)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.group}>
          <h2>{g.title}</h2>
          <div className="mode-grid">
            {MODES.filter((m) => m.group === g.group).map((m) => {
              const available = modeAvailable(m, scope);
              const items = available ? m.items(scope) : [];
              const learned = items.filter((id) => isLearned(getStats(m.id, id))).length;
              const review = items.filter((id) => needsReview(getStats(m.id, id))).length;
              return (
                <div key={m.id} className={`mode-card ${available ? '' : 'disabled'}`}>
                  <button className="mode-main" disabled={!available} onClick={() => start(m)}>
                    <span className="mode-icon">{m.icon}</span>
                    <span className="mode-title">{m.title}</span>
                    <span className="mode-desc">
                      {available ? m.description : 'Scegli più squadre per questa modalità.'}
                    </span>
                    {available && (
                      <span className="progress">
                        <span className="bar">
                          <span style={{ width: `${(learned / Math.max(items.length, 1)) * 100}%` }} />
                        </span>
                        {learned}/{items.length} imparati
                      </span>
                    )}
                  </button>
                  {review > 0 && (
                    <button className="review-btn" onClick={() => start(m, true)}>
                      🔁 Ripassa {review} errori
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="muted small">
        Ambito: <b>{scopeLabel(scope)}</b>. Le domande escono più spesso su ciò che sbagli; un elemento è "imparato" dopo 3
        risposte giuste di fila.
      </p>
    </div>
  );
}
