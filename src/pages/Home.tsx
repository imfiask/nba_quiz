import { useEffect } from 'react';
import { DIVISIONS, teams, scopeLabel, type Scope } from '../data';
import { MODES, effectiveDifficulty, modeAvailable, statsKey, type ModeDef } from '../quiz/modes';
import { getStats, isLearned, needsReview } from '../progress';
import { setPref, usePrefs } from '../prefs';
import { navigate } from '../router';

const LENGTHS = [
  { n: 10, label: '10' },
  { n: 20, label: '20' },
  { n: 50, label: '50' },
  { n: 0, label: 'Tutti' },
];

export default function Home({ initialScope }: { initialScope?: Scope }) {
  const { scope, count, difficulty } = usePrefs();

  // Se arrivi da un quiz lanciato da "Studia", l'ambito diventa quella squadra
  useEffect(() => {
    if (initialScope) setPref('scope', initialScope);
  }, [initialScope]);

  const start = (mode: ModeDef, review = false) =>
    navigate('quiz', {
      mode: mode.id,
      scope,
      n: count,
      d: effectiveDifficulty(mode, difficulty),
      review: review ? 1 : undefined,
    });

  const groups: { title: string; group: ModeDef['group'] }[] = [
    { title: 'Squadre', group: 'team' },
    { title: 'Giocatori', group: 'player' },
  ];

  return (
    <div className="home">
      <section className="panel settings">
        <label>
          <span>Cosa vuoi studiare?</span>
          <select value={scope} onChange={(e) => setPref('scope', e.target.value as Scope)}>
            <option value="all">🌎 Tutta la NBA</option>
            <option value="West">⬅️ Conference Ovest</option>
            <option value="East">➡️ Conference Est</option>
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
              <button key={l.n} className={count === l.n ? 'on' : ''} onClick={() => setPref('count', l.n)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="length">
          <span>Difficoltà</span>
          <div className="segmented">
            <button className={difficulty === 'easy' ? 'on' : ''} onClick={() => setPref('difficulty', 'easy')}>
              Facile
            </button>
            <button className={difficulty === 'hard' ? 'on hard' : ''} onClick={() => setPref('difficulty', 'hard')}>
              Difficile
            </button>
          </div>
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.group}>
          <h2>{g.title}</h2>
          <div className="mode-grid">
            {MODES.filter((m) => m.group === g.group).map((m) => {
              const available = modeAvailable(m, scope);
              const key = statsKey(m, difficulty);
              const items = available ? m.items(scope) : [];
              const learned = items.filter((id) => isLearned(getStats(key, id))).length;
              const review = items.filter((id) => needsReview(getStats(key, id))).length;
              const hard = effectiveDifficulty(m, difficulty) === 'hard';
              return (
                <div key={m.id} className={`mode-card ${available ? '' : 'disabled'}`}>
                  <button className="mode-main" disabled={!available} onClick={() => start(m)}>
                    <span className="mode-icon">{m.icon}</span>
                    <span className="mode-title">
                      {m.title}
                      {hard && <span className="badge hard">Difficile</span>}
                      {!m.hard && <span className="badge">Livello unico</span>}
                    </span>
                    <span className="mode-desc">
                      {available ? (hard ? m.hard : m.description) : 'Scegli più squadre per questa modalità.'}
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
        risposte giuste di fila. Facile e difficile hanno progressi separati.
      </p>
    </div>
  );
}
