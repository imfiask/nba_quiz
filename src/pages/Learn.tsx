import { useEffect, useMemo, useState } from 'react';
import { CONFERENCE_LABEL, DIVISIONS, teamById, teams, type Player } from '../data';
import { Img } from '../components/Cards';
import { navigate } from '../router';
import {
  finalQuestions,
  getLessonProgress,
  hooksOf,
  lessonUnits,
  practiceQuestions,
  roleOf,
  saveLessonProgress,
  type LessonQuestion,
} from '../learn/lessons';

/** "Impara": percorso guidato per imparare una squadra da zero, una lezione alla volta. */
export default function Learn({ teamId }: { teamId?: string }) {
  const team = teamId ? teamById.get(teamId) : undefined;
  if (team) return <TeamPath key={team.id} teamId={team.id} />;

  return (
    <div className="learn">
      <section className="panel learn-intro">
        <h2>🎓 Impara una squadra</h2>
        <p>
          Per chi parte da zero. Ogni lezione ti <b>presenta 2-3 giocatori</b>, poi ti fa domande facili <b>solo su quelli che
          hai appena visto</b>; quella dopo ne aggiunge altri e ripassa i precedenti. Prima il quintetto, poi chi entra dalla
          panchina. Alla fine c'è un test su tutta la squadra.
        </p>
        <p className="muted small">Consiglio: una squadra alla volta, partendo da quella di cui guardi più partite.</p>
      </section>
      <div className="conferences">
        {(['West', 'East'] as const).map((conf) => (
          <section key={conf} className="panel">
            <h2>Conference {CONFERENCE_LABEL[conf]}</h2>
            {DIVISIONS.filter((d) => d.conference === conf).map((d) => (
              <div key={d.name} className="division">
                <h3>{d.name}</h3>
                <div className="team-row">
                  {teams
                    .filter((t) => t.division === d.name)
                    .map((t) => {
                      const units = lessonUnits(t.id).length;
                      const progress = getLessonProgress(t.id);
                      const status = progress.completed
                        ? '✅ Imparata'
                        : progress.unitsDone >= units
                          ? 'Manca il test finale'
                          : progress.unitsDone > 0
                            ? `Lezione ${progress.unitsDone + 1} di ${units}`
                          : `${units} lezioni`;
                      return (
                        <a
                          key={t.id}
                          className={`team-tile ${progress.completed ? 'learned' : ''}`}
                          href={`#/learn?team=${t.id}`}
                          style={{ '--team': t.color } as React.CSSProperties}
                        >
                          <Img src={t.logo} kind="logo" />
                          <span>{t.name}</span>
                          <span className="learn-status">{status}</span>
                        </a>
                      );
                    })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

type Phase =
  | { kind: 'start' }
  | { kind: 'intro'; unit: number; index: number }
  | { kind: 'practice'; unit: number }
  | { kind: 'unit-done'; unit: number }
  | { kind: 'final' }
  | { kind: 'completed' };

function TeamPath({ teamId }: { teamId: string }) {
  const t = teamById.get(teamId)!;
  const units = useMemo(() => lessonUnits(teamId), [teamId]);
  const [progress, setProgress] = useState(() => getLessonProgress(teamId));
  const [phase, setPhase] = useState<Phase>({ kind: 'start' });

  const save = (p: typeof progress) => {
    setProgress(p);
    saveLessonProgress(teamId, p);
  };
  // la prossima tappa: la prima lezione non fatta, oppure il test finale
  const nextStep = (done: number): Phase => (done < units.length ? { kind: 'intro', unit: done, index: 0 } : { kind: 'final' });

  if (units.length === 0) {
    return (
      <div className="panel center">
        <p>Non ci sono abbastanza dati su questa squadra per una lezione.</p>
        <a href="#/learn">← Torna alle squadre</a>
      </div>
    );
  }

  return (
    <div className="learn-path" style={{ '--team': t.color } as React.CSSProperties}>
      <a href="#/learn" className="link">
        ← Tutte le squadre
      </a>
      <div className="panel learn-header">
        <Img src={t.logo} kind="logo" />
        <div>
          <h2>{t.name}</h2>
          <PathDots units={units.length} progress={progress} phase={phase} />
        </div>
      </div>

      {phase.kind === 'start' && (
        <div className="panel learn-card center">
          {progress.completed ? (
            <>
              <h2>Squadra imparata ✅</h2>
              <p>Puoi ripetere il test finale o rifare il percorso dall'inizio.</p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                <button className="primary" onClick={() => setPhase({ kind: 'final' })}>
                  Ripeti il test finale
                </button>
                <button onClick={() => setPhase({ kind: 'intro', unit: 0, index: 0 })}>Rifai dall'inizio</button>
              </div>
            </>
          ) : (
            <>
              <h2>{progress.unitsDone === 0 ? 'Si parte!' : 'Bentornato'}</h2>
              <p>
                {progress.unitsDone < units.length
                  ? `Lezione ${progress.unitsDone + 1} di ${units.length}: ${units[progress.unitsDone].length} giocatori nuovi.`
                  : 'Hai fatto tutte le lezioni: manca il test finale su tutta la squadra.'}
              </p>
              <div className="actions" style={{ justifyContent: 'center' }}>
                <button className="primary" autoFocus onClick={() => setPhase(nextStep(progress.unitsDone))}>
                  {progress.unitsDone < units.length ? 'Inizia la lezione' : 'Inizia il test finale'}
                </button>
                {progress.unitsDone > 0 && (
                  <button onClick={() => setPhase({ kind: 'intro', unit: progress.unitsDone - 1, index: 0 })}>Ripeti la lezione precedente</button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {phase.kind === 'intro' && (
        <IntroCard
          key={`${phase.unit}-${phase.index}`}
          player={units[phase.unit][phase.index]}
          team={units.flat()}
          position={`Lezione ${phase.unit + 1} · giocatore ${phase.index + 1} di ${units[phase.unit].length}`}
          isLast={phase.index === units[phase.unit].length - 1}
          onNext={() =>
            setPhase(
              phase.index < units[phase.unit].length - 1
                ? { ...phase, index: phase.index + 1 }
                : { kind: 'practice', unit: phase.unit },
            )
          }
        />
      )}

      {phase.kind === 'practice' && (
        <Practice
          key={`practice-${phase.unit}`}
          title={`Lezione ${phase.unit + 1}: esercizi`}
          build={() => practiceQuestions(units, phase.unit)}
          onDone={() => {
            save({ ...progress, unitsDone: Math.max(progress.unitsDone, phase.unit + 1) });
            setPhase({ kind: 'unit-done', unit: phase.unit });
          }}
        />
      )}

      {phase.kind === 'unit-done' && (
        <div className="panel learn-card center">
          <h2>Lezione completata 🎉</h2>
          <p>Hai imparato:</p>
          <div className="learn-faces">
            {units[phase.unit].map((p) => (
              <div key={p.id}>
                <Img src={p.headshot} kind="photo" />
                <span>{p.name}</span>
              </div>
            ))}
          </div>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <button className="primary" autoFocus onClick={() => setPhase(nextStep(phase.unit + 1))}>
              {phase.unit + 1 < units.length ? 'Prossima lezione' : 'Vai al test finale'}
            </button>
            <button onClick={() => navigate('learn')}>Basta per oggi</button>
          </div>
        </div>
      )}

      {phase.kind === 'final' && (
        <Practice
          key="final"
          title="Test finale: tutta la squadra"
          build={() => finalQuestions(units)}
          onDone={() => {
            save({ unitsDone: units.length, completed: true });
            setPhase({ kind: 'completed' });
          }}
        />
      )}

      {phase.kind === 'completed' && (
        <div className="panel learn-card center">
          <h2>{t.name}: squadra imparata! 🏆</h2>
          <p>
            Ora conosci il quintetto e la rotazione. Per fissarla, giocala nei quiz scegliendola in "Squadre a scelta" insieme
            a quelle che hai già imparato.
          </p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <button className="primary" onClick={() => navigate('home', { scope: `team:${teamId}` })}>
              Gioca con questa squadra
            </button>
            <button onClick={() => navigate('learn')}>Impara un'altra squadra</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Il percorso come una fila di tappe: una per lezione più il test finale. */
function PathDots({ units, progress, phase }: { units: number; progress: { unitsDone: number; completed: boolean }; phase: Phase }) {
  const current = phase.kind === 'intro' || phase.kind === 'practice' ? phase.unit : phase.kind === 'final' ? units : -1;
  return (
    <div className="path-dots">
      {Array.from({ length: units + 1 }, (_, i) => {
        const done = i < units ? i < progress.unitsDone : progress.completed;
        return (
          <span key={i} className={`path-dot ${done ? 'done' : ''} ${i === current ? 'current' : ''}`} title={i < units ? `Lezione ${i + 1}` : 'Test finale'}>
            {i < units ? i + 1 : '🏆'}
          </span>
        );
      })}
    </div>
  );
}

/** Scheda di presentazione: nessuna domanda, si guarda e si va avanti. */
function IntroCard({
  player: p,
  team,
  position,
  isLast,
  onNext,
}: {
  player: Player;
  team: Player[];
  position: string;
  isLast: boolean;
  onNext: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext]);

  return (
    <div className="panel learn-card intro-card">
      <div className="muted small">{position} · nuovo giocatore</div>
      <Img src={p.headshot} kind="photo" />
      <h2>
        {p.name} {p.jersey && <span className="jersey">#{p.jersey}</span>}
      </h2>
      <div className="intro-role">
        {p.starter ? '⭐ Titolare' : '🔄 Dalla panchina'} · {roleOf(p)} · ~{Math.round(p.minutes)} min a partita
      </div>
      <ul className="intro-hooks">
        {hooksOf(p, team).map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <button className="primary" onClick={onNext}>
        {isLast ? 'Agli esercizi →' : 'Avanti →'} <span className="muted small">(Invio)</span>
      </button>
    </div>
  );
}

/** Esercizi: le domande sbagliate tornano in fondo finché non sono tutte giuste. */
function Practice({ title, build, onDone }: { title: string; build: () => LessonQuestion[]; onDone: () => void }) {
  const [queue, setQueue] = useState(build);
  const [total] = useState(() => queue.length);
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState<string | null>(null);
  const [rightCount, setRightCount] = useState(0);

  const q = queue[index];
  const correct = given !== null && given === q?.answer;

  const next = () => {
    if (index + 1 >= queue.length) return onDone();
    setGiven(null);
    setIndex((i) => i + 1);
  };

  const pick = (key: string) => {
    if (given !== null) return;
    setGiven(key);
    if (key === q.answer) {
      setRightCount((n) => n + 1);
    } else {
      // stessa domanda più avanti, con le scelte rimescolate
      setQueue((list) => [...list, { ...q, choices: [...q.choices].sort(() => Math.random() - 0.5) }]);
    }
  };

  // giusto: si va avanti da soli; sbagliato: si guarda la soluzione e si preme Continua
  useEffect(() => {
    if (!correct) return;
    const t = setTimeout(next, 800);
    return () => clearTimeout(t);
  }, [correct]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (given !== null && e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (given === null) {
        const c = q?.choices[Number(e.key) - 1];
        if (c) pick(c.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!q) return null;
  const subject = q.subject;

  return (
    <div className="panel learn-card practice">
      <div className="practice-head">
        <span className="muted small">{title}</span>
        <span className="muted small">
          {Math.min(rightCount, total)}/{total}
        </span>
      </div>
      <div className="bar thin">
        <span style={{ width: `${(Math.min(rightCount, total) / total) * 100}%` }} />
      </div>
      {q.image && <Img src={q.image} kind="photo" />}
      <div className="prompt-text">{q.text}</div>
      {q.sub && <div className="prompt-sub">{q.sub}</div>}
      <div className={`choices ${q.choices.every((c) => !c.label) ? 'images' : ''} n4`}>
        {q.choices.map((c, i) => {
          let cls = 'choice';
          if (c.image && c.label) cls += ' with-image';
          if (given !== null) cls += c.key === q.answer ? ' correct' : c.key === given ? ' wrong' : ' dim';
          return (
            <button key={c.key} className={cls} onClick={() => pick(c.key)} disabled={given !== null}>
              <span className="kbd">{i + 1}</span>
              {c.image && <Img src={c.image} kind="photo" />}
              {c.label && <span>{c.label}</span>}
            </button>
          );
        })}
      </div>
      {given !== null && (
        <div className={`feedback ${correct ? 'ok' : 'ko'}`}>
          <div className="feedback-title">{correct ? 'Giusto! ✅' : 'Non ancora: eccolo 👇'}</div>
          {!correct && (
            <>
              <div className="learn-solution">
                <Img src={subject.headshot} kind="photo" />
                <div>
                  <b>{subject.name}</b> {subject.jersey && <span className="jersey">#{subject.jersey}</span>}
                  <div className="muted small">{roleOf(subject)}</div>
                  <div className="muted small">Te lo richiedo tra poco.</div>
                </div>
              </div>
              <button className="primary" onClick={next} autoFocus>
                Continua (Invio)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
