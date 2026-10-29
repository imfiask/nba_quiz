import { Fragment, useEffect, useRef, useState } from 'react';
import { playerById, scopeLabel, teamById, type Scope } from '../data';
import {
  effectiveDifficulty,
  modeById,
  searchOptions,
  statsKey,
  type ModeId,
  type Question,
  type SearchOption,
} from '../quiz/modes';
import { balancedPick, getStats, needsReview, record, weightedPick } from '../progress';
import { setPref, usePrefs, type Difficulty } from '../prefs';
import { navigate } from '../router';
import { Img, PlayerReveal, TeamReveal } from '../components/Cards';
import { TeamsMap, UsMap, type Dot } from '../components/UsMap';
import { cityByName } from '../geo';

interface Props {
  mode: ModeId;
  scope: Scope;
  /** 0 = tutti gli elementi dell'ambito */
  count: number;
  difficulty: Difficulty;
  reviewOnly: boolean;
}

interface Answer {
  given: string;
  correct: boolean;
}

/** Quante volte un elemento sbagliato viene riproposto nella stessa sessione. */
const MAX_RETRIES = 2;
/** Dopo quante domande riappare un elemento sbagliato. */
const RETRY_GAP = 3;

function preload(q?: Question) {
  if (!q) return;
  const urls = [q.prompt.image, ...(q.input.kind === 'choice' ? q.input.choices.map((c) => c.image) : [])];
  for (const u of urls) if (u) new Image().src = u;
}

export default function Quiz({ mode, scope, count, difficulty: requested, reviewOnly }: Props) {
  const def = modeById.get(mode);
  const difficulty = def ? effectiveDifficulty(def, requested) : 'easy';
  const key = def ? statsKey(def, difficulty) : mode;
  const prefs = usePrefs();
  const showJersey = prefs.showJersey && !def?.hidesJersey;

  /** Nome del giocatore con il numero di maglia, se l'interruttore è attivo. */
  const withJersey = (text: string, playerId?: string) => {
    const jersey = playerId && showJersey ? playerById.get(playerId)?.jersey : null;
    return jersey ? (
      <>
        {text} <span className="jersey">#{jersey}</span>
      </>
    ) : (
      text
    );
  };

  const [queue, setQueue] = useState<Question[]>(() => {
    if (!def) return [];
    let items = def.items(scope);
    if (reviewOnly) items = items.filter((id) => needsReview(getStats(key, id)));
    const n = count || items.length;
    // con "Tutti" non serve bilanciare: escono comunque tutti
    const picked = def.category && count ? balancedPick(key, items, n, def.category) : weightedPick(key, items, n);
    return picked.map((id) => def.build(id, scope, difficulty));
  });
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [missed, setMissed] = useState<string[]>([]);
  const retries = useRef(new Map<string, number>());

  const q = queue[index];
  const done = !!def && index >= queue.length;

  useEffect(() => preload(queue[index + 1]), [queue, index]);

  const next = () => {
    setAnswer(null);
    setIndex((i) => i + 1);
  };

  const submit = (given: string) => {
    if (!q || answer) return;
    const correct = q.input.kind === 'text' ? q.input.check(given) : given === q.input.answer;
    record(key, q.itemId, correct);
    setAnswer({ given, correct });
    setScore((s) => (correct ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }));
    if (!correct) {
      setMissed((m) => (m.includes(q.itemId) ? m : [...m, q.itemId]));
      const n = retries.current.get(q.itemId) ?? 0;
      if (n < MAX_RETRIES && def) {
        retries.current.set(q.itemId, n + 1);
        setQueue((list) => {
          const copy = list.slice();
          copy.splice(Math.min(index + 1 + RETRY_GAP, copy.length), 0, def.build(q.itemId, scope, difficulty));
          return copy;
        });
      }
    }
  };

  // Se hai risposto giusto avanza da solo, a meno che tu non voglia fermarti sulla soluzione
  const waitForNext = !!answer && (!answer.correct || prefs.holdOnCorrect);
  useEffect(() => {
    if (!answer || waitForNext) return;
    const t = setTimeout(next, 900);
    return () => clearTimeout(t);
  }, [answer, waitForNext]);

  // Tastiera: 1-9 per scegliere, Invio per andare avanti
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (answer && e.key === 'Enter') {
        e.preventDefault();
        next();
        return;
      }
      if (answer || !q || e.target instanceof HTMLInputElement) return;
      if (q.input.kind === 'choice' && q.input.choices.length <= 9) {
        const choice = q.input.choices[Number(e.key) - 1];
        if (choice) submit(choice.key);
      }
      if (q.input.kind === 'map' && q.input.numbered) {
        const city = q.input.cities[Number(e.key) - 1];
        if (city) submit(city);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!def) return <p>Modalità sconosciuta. <a href="#/">Torna alla home</a></p>;

  const title = `${def.icon} ${def.title}${def.hard ? ` · ${difficulty === 'hard' ? 'Difficile' : 'Facile'}` : ''}`;

  if (queue.length === 0) {
    return (
      <div className="panel center">
        <h2>Niente da ripassare 🎉</h2>
        <p>Non ci sono errori recenti per questa modalità in {scopeLabel(scope)}.</p>
        <button className="primary" onClick={() => navigate('home', { scope })}>
          Torna alla home
        </button>
      </div>
    );
  }

  if (done) {
    const total = score.right + score.wrong;
    return (
      <div className="panel summary">
        <h2>{title} — fatto!</h2>
        <div className="big-score">
          {score.right}/{total} <span>({Math.round((score.right / Math.max(total, 1)) * 100)}%)</span>
        </div>
        {missed.length > 0 && (
          <>
            <h3>Da rivedere</h3>
            <div className="missed">
              {missed.map((id) =>
                def.group === 'player' ? (
                  <PlayerReveal key={id} p={playerById.get(id)!} />
                ) : (
                  // "Scontro" ha come id una coppia di squadre: "idA-idB"
                  <div key={id} className="missed-group">
                    {id.split('-').map((teamId) => (
                      <TeamReveal key={teamId} t={teamById.get(teamId)!} />
                    ))}
                  </div>
                ),
              )}
            </div>
          </>
        )}
        <div className="actions">
          <button className="primary" onClick={() => location.reload()}>
            Rigioca
          </button>
          {missed.length > 0 && (
            <button onClick={() => navigate('quiz', { mode, scope, n: 0, d: difficulty, review: 1 })}>Ripassa errori</button>
          )}
          <button onClick={() => navigate('home', { scope })}>Altre modalità</button>
        </div>
      </div>
    );
  }

  const accent = q.accentTeamId ? teamById.get(q.accentTeamId)?.color : undefined;
  const revealPlayer = q.reveal.playerId ? playerById.get(q.reveal.playerId) : undefined;
  const revealTeam = q.reveal.teamId ? teamById.get(q.reveal.teamId) : undefined;
  const correctLabel =
    q.input.kind === 'search' ? q.input.options.find((o) => o.key === q.input.answer)?.label : q.input.answer;

  return (
    <div className="quiz" style={accent ? ({ '--team': accent } as React.CSSProperties) : undefined}>
      <div className="quiz-head">
        <button className="link" onClick={() => navigate('home', { scope })}>
          ← Esci
        </button>
        <span>
          {title} · {scopeLabel(scope)}
        </span>
        <span className="quiz-right">
          <button
            className={`toggle ${prefs.holdOnCorrect ? 'on' : ''}`}
            title="Se attivo, anche dopo una risposta giusta resti sulla soluzione finché non premi Avanti"
            onClick={() => setPref('holdOnCorrect', !prefs.holdOnCorrect)}
          >
            ⏸ Fermati sempre {prefs.holdOnCorrect ? 'ON' : 'OFF'}
          </button>
          <span className="score">
            ✅ {score.right} ❌ {score.wrong} · {index + 1}/{queue.length}
          </span>
        </span>
      </div>
      <div className="bar thin">
        <span style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      <div className="panel question">
        {q.prompt.image && <Img src={q.prompt.image} kind={q.prompt.imageKind ?? 'logo'} />}
        {q.prompt.matchup && (
          <div className="matchup">
            {q.prompt.matchup.map((teamId, i) => {
              const t = teamById.get(teamId)!;
              return (
                <Fragment key={teamId}>
                  {i === 1 && <span className="vs">VS</span>}
                  <div className="matchup-team" style={{ '--team': t.color } as React.CSSProperties}>
                    <Img src={t.logo} kind="logo" />
                    <span>{t.name}</span>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
        {q.prompt.text && <div className="prompt-text">{withJersey(q.prompt.text, q.prompt.playerId)}</div>}
        {q.prompt.sub && <div className="prompt-sub">{q.prompt.sub}</div>}

        {q.input.kind === 'choice' && (
          <ChoiceGrid
            input={q.input}
            answer={answer}
            onPick={submit}
            label={(c) => withJersey(c.label ?? '', c.playerId)}
          />
        )}
        {q.input.kind === 'search' && (
          <SearchAnswer
            key={index}
            options={q.input.options}
            placeholder={q.input.placeholder}
            answered={answer ? { ...answer, correctKey: q.input.answer } : null}
            onSubmit={submit}
            label={(o) => withJersey(o.label, o.playerId)}
          />
        )}
        {q.input.kind === 'map' && <MapAnswer input={q.input} answer={answer} onPick={submit} />}
        {q.input.kind === 'text' && (
          <TextAnswer key={index} placeholder={q.input.placeholder} disabled={!!answer} onSubmit={submit} />
        )}

        {answer && (
          <div className={`feedback ${answer.correct ? 'ok' : 'ko'}`}>
            <div className="feedback-title">
              {answer.correct ? (
                'Giusto! ✅'
              ) : (
                <>
                  Sbagliato ❌
                  {q.input.kind !== 'choice' && correctLabel && (
                    <>
                      {' '}
                      — era <b>{correctLabel}</b>
                    </>
                  )}
                </>
              )}
            </div>
            {revealPlayer && <PlayerReveal p={revealPlayer} />}
            {!revealPlayer && revealTeam && <TeamReveal t={revealTeam} />}
            {q.reveal.teamIds?.map((teamId) => <TeamReveal key={teamId} t={teamById.get(teamId)!} />)}
            {q.reveal.map && <TeamsMap teamIds={q.reveal.teamIds ?? (q.reveal.teamId ? [q.reveal.teamId] : [])} />}
            {waitForNext && (
              <button className="primary" onClick={next} autoFocus>
                Avanti (Invio)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChoiceGrid({
  input,
  answer,
  onPick,
  label,
}: {
  input: Extract<Question['input'], { kind: 'choice' }>;
  answer: Answer | null;
  onPick: (key: string) => void;
  label: (c: (typeof input.choices)[number]) => React.ReactNode;
}) {
  const n = input.choices.length;
  const imagesOnly = input.choices.some((c) => c.image && !c.label);
  const size = n <= 2 ? 'n2' : n <= 4 ? 'n4' : n <= 9 ? 'n6' : 'many';
  return (
    <div className={`choices ${imagesOnly ? 'images' : ''} ${size} ${input.columns === 2 ? 'cols2' : ''}`}>
      {input.choices.map((c, i) => {
        let cls = 'choice';
        if (answer) {
          if (c.key === input.answer) cls += ' correct';
          else if (c.key === answer.given) cls += ' wrong';
          else cls += ' dim';
        }
        return (
          <button key={c.key} className={cls} onClick={() => onPick(c.key)} disabled={!!answer}>
            {n <= 9 && <span className="kbd">{i + 1}</span>}
            {c.image && <Img src={c.image} kind={c.imageKind ?? 'logo'} />}
            {c.label && <span>{label(c)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Le città sulla mappa: dopo la risposta compaiono i nomi di quella giusta e di quella scelta. */
function MapAnswer({
  input,
  answer,
  onPick,
}: {
  input: Extract<Question['input'], { kind: 'map' }>;
  answer: Answer | null;
  onPick: (city: string) => void;
}) {
  const dots: Dot[] = input.cities.map((name, i) => {
    const c = cityByName.get(name)!;
    const isAnswer = name === input.answer;
    const isGiven = name === answer?.given;
    return {
      key: name,
      x: c.x,
      y: c.y,
      number: input.numbered ? i + 1 : undefined,
      size: input.numbered ? 'big' : undefined,
      label: answer && (isAnswer || isGiven) ? name : undefined,
      state: !answer ? undefined : isAnswer ? 'correct' : isGiven ? 'wrong' : 'dim',
    };
  });
  return <UsMap dots={dots} onPick={answer ? undefined : onPick} className="answer" />;
}

/** Casella con suggerimenti istantanei: frecce per muoversi, Invio o clic per scegliere. */
function SearchAnswer({
  options,
  placeholder,
  answered,
  onSubmit,
  label,
}: {
  options: SearchOption[];
  placeholder: string;
  answered: (Answer & { correctKey: string }) | null;
  onSubmit: (key: string) => void;
  label: (o: SearchOption) => React.ReactNode;
}) {
  const [value, setValue] = useState('');
  const [active, setActive] = useState(0);
  const matches = answered ? [] : searchOptions(options, value);

  const pick = (o: SearchOption) => {
    setValue(o.label);
    onSubmit(o.key);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (matches[active]) pick(matches[active]);
    }
  };

  const state = answered ? (answered.correct ? 'correct' : 'wrong') : '';

  return (
    <div className="search-answer">
      <div className="text-answer">
        <input
          autoFocus
          className={state}
          value={value}
          placeholder={placeholder}
          disabled={!!answered}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" disabled={!!answered} onClick={() => onSubmit('')}>
          Non lo so
        </button>
      </div>
      {matches.length > 0 && (
        <ul className="suggestions">
          {matches.map((o, i) => (
            <li
              key={o.key}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // non perdere il focus dalla casella
                pick(o);
              }}
            >
              {label(o)}
            </li>
          ))}
        </ul>
      )}
      {!answered && value.trim() && matches.length === 0 && <div className="muted small">Nessuna corrispondenza</div>}
    </div>
  );
}

function TextAnswer({
  placeholder,
  disabled,
  onSubmit,
}: {
  placeholder: string;
  disabled: boolean;
  onSubmit: (s: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      className="text-answer"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (value.trim()) onSubmit(value);
      }}
    >
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <button className="primary" disabled={disabled || !value.trim()}>
        Conferma
      </button>
      <button type="button" disabled={disabled} onClick={() => onSubmit('')}>
        Non lo so
      </button>
    </form>
  );
}
