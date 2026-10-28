import { useEffect } from 'react';
import { DIVISIONS, pickedTeamIds, teams, teamsScope, scopeLabel, type Scope } from '../data';
import { Img } from '../components/Cards';
import { MODES, effectiveDifficulty, modeAvailable, statsKey, type ModeDef } from '../quiz/modes';
import { getStats, isLearned, needsReview } from '../progress';
import { setPref, usePrefs } from '../prefs';
import { navigate } from '../router';

const LAST_PICKED_KEY = 'nba-quiz-last-picked';

/** Ultima scelta di squadre, per ritrovarla passando da "Tutta la NBA" a "Squadre a scelta". */
function lastPicked(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LAST_PICKED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function setPicked(ids: string[]) {
  setPref('scope', teamsScope(ids));
  try {
    localStorage.setItem(LAST_PICKED_KEY, JSON.stringify(ids));
  } catch {
    /* ignora */
  }
}

/** Griglia di loghi per scegliere più squadre: clic sul logo o sul nome della division. */
function TeamPicker({ selected }: { selected: string[] }) {
  const set = new Set(selected);
  const toggle = (ids: string[]) => {
    const allOn = ids.every((id) => set.has(id));
    const next = new Set(set);
    for (const id of ids) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    setPicked(teams.filter((t) => next.has(t.id)).map((t) => t.id));
  };
  return (
    <section className="panel team-picker">
      <div className="picker-head">
        <span>
          <b>{selected.length}</b> {selected.length === 1 ? 'squadra scelta' : 'squadre scelte'}
        </span>
        <button className="link" onClick={() => setPicked([])} disabled={selected.length === 0}>
          Deseleziona tutte
        </button>
      </div>
      <div className="picker-divisions">
        {DIVISIONS.map((d) => {
          const divTeams = teams.filter((t) => t.division === d.name);
          return (
            <div key={d.name} className="picker-division">
              <button className="link division-toggle" onClick={() => toggle(divTeams.map((t) => t.id))}>
                {d.name} <span className="muted">({d.conference === 'East' ? 'Est' : 'Ovest'})</span>
              </button>
              {divTeams.map((t) => (
                <button
                  key={t.id}
                  className={`picker-team ${set.has(t.id) ? 'on' : ''}`}
                  style={{ '--team': t.color } as React.CSSProperties}
                  onClick={() => toggle([t.id])}
                  title={t.name}
                >
                  <Img src={t.logo} kind="logo" />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const LENGTHS = [
  { n: 10, label: '10' },
  { n: 20, label: '20' },
  { n: 50, label: '50' },
  { n: 0, label: 'Tutti' },
];

export default function Home({ initialScope }: { initialScope?: Scope }) {
  const { scope, count, difficulty } = usePrefs();
  const picked = pickedTeamIds(scope);

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
          <select
            value={picked ? 'pick' : scope}
            onChange={(e) => setPref('scope', e.target.value === 'pick' ? teamsScope(lastPicked()) : (e.target.value as Scope))}
          >
            <option value="all">🌎 Tutta la NBA</option>
            <option value="West">⬅️ Conference Ovest</option>
            <option value="East">➡️ Conference Est</option>
            <option value="pick">🎯 Squadre a scelta…</option>
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

      {picked && <TeamPicker selected={picked} />}

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
                  <button className="mode-main" disabled={!available || items.length === 0} onClick={() => start(m)}>
                    <span className="mode-icon">{m.icon}</span>
                    <span className="mode-title">
                      {m.title}
                      {hard && <span className="badge hard">Difficile</span>}
                      {!m.hard && <span className="badge">Livello unico</span>}
                    </span>
                    <span className="mode-desc">
                      {picked?.length === 0
                        ? 'Scegli almeno una squadra qui sopra.'
                        : available
                          ? hard
                            ? m.hard
                            : m.description
                          : 'Scegli più squadre per questa modalità.'}
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
