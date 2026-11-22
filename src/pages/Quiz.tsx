import { Fragment, useEffect, useRef, useState } from 'react';
import { STARTER_SLOTS, playerById, scopeLabel, teamById, type Scope } from '../data';
import {
  dailyQuestions,
  effectiveDifficulty,
  modeById,
  searchOptions,
  setRotationOnly,
  statsKey,
  type Choice,
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
  /** "daily" = Ripasso del giorno: domande di tutte le modalità */
  mode: ModeId | 'daily';
  scope: Scope;
  /** 0 = tutti gli elementi dell'ambito */
  count: number;
  difficulty: Difficulty;
  reviewOnly: boolean;
  /** Anche i giocatori fuori rotazione (di base solo quelli che giocano davvero). */
  allPlayers: boolean;
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
  const choices =
    q.input.kind === 'choice' ? q.input.choices : q.input.kind === 'lineup' ? q.input.candidates : (q.input.kind === 'clues' && q.input.choices) || [];
  const clues = q.input.kind === 'clues' ? q.input.clues : [];
  for (const u of [q.prompt.image, ...choices.map((c) => c.image), ...clues.map((c) => c.image)]) if (u) new Image().src = u;
}

const isHard = (q: Question) => !!q.statsKey?.endsWith(':hard');

export default function Quiz({ mode, scope, count, difficulty: requested, reviewOnly, allPlayers }: Props) {
  const daily = mode === 'daily';
  const def = daily ? undefined : modeById.get(mode);
  const difficulty = def ? effectiveDifficulty(def, requested) : requested;
  const key = def ? statsKey(def, difficulty) : mode;
  const prefs = usePrefs();

  const buildQueue = (): Question[] => {
    setRotationOnly(!allPlayers);
    if (daily) return dailyQuestions(count);
    if (!def) return [];
    let items = def.items(scope);
    if (reviewOnly) items = items.filter((id) => needsReview(getStats(key, id)));
    const n = count || items.length;
    // con "Tutti" non serve bilanciare: escono comunque tutti
    const picked = def.category && count ? balancedPick(key, items, n, def.category) : weightedPick(key, items, n);
    return picked.map((id) => ({ ...def.build(id, scope, difficulty), statsKey: key }));
  };

  // le modalità "in diretta" scaricano prima i dati: finché non arrivano la coda è null
  const [queue, setQueue] = useState<Question[] | null>(() => (def?.load ? null : buildQueue()));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [missed, setMissed] = useState<Question[]>([]);
  const retries = useRef(new Map<string, number>());

  useEffect(() => {
    if (!def?.load) return;
    let alive = true;
    def.load().then(
      () => alive && setQueue(buildQueue()),
      (err: Error) => alive && setLoadError(err.message),
    );
    return () => {
      alive = false;
    };
  }, []);

  const q = queue?.[index];
  const done = !!queue && index >= queue.length;

  useEffect(() => preload(queue?.[index + 1]), [queue, index]);

  const next = () => {
    setAnswer(null);
    setIndex((i) => i + 1);
  };

  const submit = (given: string) => {
    if (!q || answer) return;
    const correct = q.input.kind === 'text' ? q.input.check(given) : given === q.input.answer;
    const itemKey = q.statsKey ?? key;
    record(itemKey, q.itemId, correct);
    setAnswer({ given, correct });
    setScore((s) => (correct ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }));
    if (!correct) {
      const id = `${itemKey}|${q.itemId}`;
      setMissed((m) => (m.some((x) => `${x.statsKey}|${x.itemId}` === id) ? m : [...m, q]));
      const n = retries.current.get(id) ?? 0;
      const qDef = modeById.get(q.mode);
      if (n < MAX_RETRIES && qDef) {
        retries.current.set(id, n + 1);
        try {
          const again = { ...qDef.build(q.itemId, daily ? 'all' : scope, isHard(q) ? 'hard' : 'easy'), statsKey: q.statsKey };
          setQueue((list) => {
            const copy = list!.slice();
            copy.splice(Math.min(index + 1 + RETRY_GAP, copy.length), 0, again);
            return copy;
          });
        } catch {
          // se non si riesce a ricreare la domanda, pazienza: niente secondo tentativo
        }
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

  if (!daily && !def) return <p>Modalità sconosciuta. <a href="#/">Torna alla home</a></p>;

  const title = daily
    ? '🔁 Ripasso del giorno'
    : `${def!.icon} ${def!.title}${def!.hard ? ` · ${difficulty === 'hard' ? 'Difficile' : 'Facile'}` : ''}`;
  const where = daily || def?.ignoresScope ? '' : ` · ${scopeLabel(scope)}`;
  const home = () => navigate('home', { scope });

  if (loadError) {
    return (
      <div className="panel center">
        <h2>Dati non disponibili</h2>
        <p className="muted">ESPN non ha risposto ({loadError}). Riprova tra poco.</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={() => location.reload()}>
            Riprova
          </button>
          <button onClick={home}>Torna alla home</button>
        </div>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="panel center">
        <h2>{title}</h2>
        <p className="muted">Carico i dati da ESPN…</p>
      </div>
    );
  }

  if (queue.length === 0) {
    const [heading, text] = daily
      ? ['Niente da ripassare oggi 🎉', 'Gioca qualche quiz: quello che sbagli o impari torna qui nei giorni giusti.']
      : reviewOnly
        ? ['Niente da ripassare 🎉', `Non ci sono errori recenti per questa modalità${where}.`]
        : mode === 'last-night'
          ? ['Nessuna partita', 'Non ho trovato partite finite negli ultimi giorni.']
          : ['Nessuna domanda', `Non ci sono domande per questa modalità${where}.`];
    return (
      <div className="panel center">
        <h2>{heading}</h2>
        <p>{text}</p>
        <button className="primary" onClick={home}>
          Torna alla home
        </button>
      </div>
    );
  }

  if (done || !q) {
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
              {missed.map((m) => (
                <div key={`${m.statsKey}|${m.itemId}`} className="missed-group">
                  <RevealCards q={m} />
                </div>
              ))}
            </div>
          </>
        )}
        <div className="actions">
          <button className="primary" onClick={() => location.reload()}>
            Rigioca
          </button>
          {missed.length > 0 && !daily && !def?.load && (
            <button onClick={() => navigate('quiz', { mode, scope, n: 0, d: difficulty, review: 1, p: allPlayers ? 'all' : undefined })}>
              Ripassa errori
            </button>
          )}
          <button onClick={home}>Altre modalità</button>
        </div>
      </div>
    );
  }

  const qDef = modeById.get(q.mode);
  const qHard = isHard(q);
  const showJersey = prefs.showJersey && !qDef?.hidesJersey;
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

  const accent = q.accentTeamId ? teamById.get(q.accentTeamId)?.color : undefined;
  // In facile segnaliamo se il giocatore della domanda è titolare, solo quando la domanda è su di lui
  // (nel quiz "Ruolo" senza dire il ruolo, che è la risposta)
  const subjectId = q.prompt.playerId ?? (q.prompt.imageKind === 'photo' ? q.reveal.playerId : undefined);
  const starter = !qHard && subjectId ? playerById.get(subjectId)?.starter : null;
  const correctLabel =
    q.input.kind === 'search'
      ? q.input.options.find((o) => o.key === q.input.answer)?.label
      : q.input.kind === 'clues'
        ? playerById.get(q.input.answer)?.name
        : q.input.kind === 'text' || q.input.kind === 'map'
          ? q.input.answer
          : null;

  return (
    <div className="quiz" style={accent ? ({ '--team': accent } as React.CSSProperties) : undefined}>
      <div className="quiz-head">
        <button className="link" onClick={home}>
          ← Esci
        </button>
        <span>
          {title}
          {where}
          {daily && qDef && <span className="muted"> · {qDef.icon} {qDef.title}</span>}
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
        {starter && (
          <div className="starter-badge">
            ⭐ Titolare{q.mode !== 'player-position' && ` · ${STARTER_SLOTS[starter] ?? starter}`}
          </div>
        )}

        {q.input.kind === 'choice' && (
          <ChoiceGrid
            choices={q.input.choices}
            correctKey={q.input.answer}
            layout={q.input.layout}
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
            answered={answer}
            onSubmit={submit}
            label={(o) => withJersey(o.label, o.playerId)}
          />
        )}
        {q.input.kind === 'map' && <MapAnswer input={q.input} answer={answer} onPick={submit} />}
        {q.input.kind === 'text' && (
          <TextAnswer key={index} placeholder={q.input.placeholder} disabled={!!answer} onSubmit={submit} />
        )}
        {q.input.kind === 'lineup' && (
          <LineupAnswer key={index} input={q.input} answer={answer} onSubmit={submit} label={(c) => withJersey(c.label ?? '', c.playerId)} />
        )}
        {q.input.kind === 'clues' && (
          <ClueAnswer key={index} input={q.input} answer={answer} onSubmit={submit} label={(text, id) => withJersey(text, id)} />
        )}

        {answer && (
          <div className={`feedback ${answer.correct ? 'ok' : 'ko'}`}>
            <div className="feedback-title">
              {answer.correct ? (
                'Giusto! ✅'
              ) : (
                <>
                  Sbagliato ❌
                  {correctLabel && (
                    <>
                      {' '}
                      — era <b>{correctLabel}</b>
                    </>
                  )}
                </>
              )}
            </div>
            <RevealCards q={q} />
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

/** Le schede della soluzione: giocatore, squadre e una riga di spiegazione. */
function RevealCards({ q }: { q: Question }) {
  const p = q.reveal.playerId ? playerById.get(q.reveal.playerId) : undefined;
  const t = q.reveal.teamId ? teamById.get(q.reveal.teamId) : undefined;
  return (
    <>
      {q.reveal.note && <div className="reveal-note">{q.reveal.note}</div>}
      {p && <PlayerReveal p={p} />}
      {t && <TeamReveal t={t} />}
      {q.reveal.teamIds?.map((id) => <TeamReveal key={id} t={teamById.get(id)!} />)}
    </>
  );
}

function ChoiceGrid({
  choices,
  correctKey,
  layout,
  answer,
  onPick,
  label,
  numbered = true,
}: {
  choices: Choice[];
  correctKey: string;
  layout?: string;
  answer: Answer | null;
  onPick: (key: string) => void;
  label: (c: Choice) => React.ReactNode;
  numbered?: boolean;
}) {
  const n = choices.length;
  const imagesOnly = choices.some((c) => c.image && !c.label);
  const size = n <= 2 ? 'n2' : n <= 4 ? 'n4' : n <= 9 ? 'n6' : 'many';
  return (
    <div className={`choices ${imagesOnly ? 'images' : ''} ${size} ${layout ?? ''}`}>
      {choices.map((c, i) => {
        let cls = 'choice';
        if (c.image && c.label) cls += ' with-image';
        if (answer) {
          if (c.key === correctKey) cls += ' correct';
          else if (c.key === answer.given) cls += ' wrong';
          else cls += ' dim';
        }
        return (
          <button key={c.key} className={cls} onClick={() => onPick(c.key)} disabled={!!answer}>
            {numbered && n <= 9 && <span className="kbd">{i + 1}</span>}
            {c.image && <Img src={c.image} kind={c.imageKind ?? 'logo'} />}
            {c.label && <span>{label(c)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Quintetto: si sceglie un giocatore per il ruolo evidenziato; clic su un ruolo già pieno per svuotarlo. */
function LineupAnswer({
  input,
  answer,
  onSubmit,
  label,
}: {
  input: Extract<Question['input'], { kind: 'lineup' }>;
  answer: Answer | null;
  onSubmit: (given: string) => void;
  label: (c: Choice) => React.ReactNode;
}) {
  const [picks, setPicks] = useState<(string | null)[]>(input.slots.map(() => null));
  const correct = input.answer.split(',');
  const active = picks.indexOf(null);
  const byKey = new Map(input.candidates.map((c) => [c.key, c]));

  const pick = (key: string) => {
    if (answer || active === -1 || picks.includes(key)) return;
    setPicks((p) => p.map((x, i) => (i === active ? key : x)));
  };
  const clear = (i: number) => !answer && setPicks((p) => p.map((x, j) => (j === i ? null : x)));

  return (
    <div className="lineup">
      <div className="lineup-slots">
        {input.slots.map((slot, i) => {
          const chosen = picks[i] ? byKey.get(picks[i]!) : undefined;
          const state = answer ? (picks[i] === correct[i] ? 'correct' : 'wrong') : i === active ? 'active' : '';
          const right = answer && picks[i] !== correct[i] ? byKey.get(correct[i]) : undefined;
          return (
            <button key={slot.key} className={`lineup-slot ${state}`} onClick={() => clear(i)} disabled={!!answer}>
              <span className="slot-name">
                <b>{slot.key}</b> {slot.label}
              </span>
              {chosen ? (
                <>
                  <Img src={chosen.image} kind="photo" />
                  {chosen.label && <span className="small">{label(chosen)}</span>}
                </>
              ) : (
                <span className="slot-empty">{i === active ? 'Scegli qui sotto' : '—'}</span>
              )}
              {right && <span className="small slot-right">Era: {playerById.get(right.key)?.name}</span>}
            </button>
          );
        })}
      </div>
      <div className="choices images many">
        {input.candidates.map((c) => (
          <button
            key={c.key}
            className={`choice ${picks.includes(c.key) ? 'dim' : ''}`}
            onClick={() => pick(c.key)}
            disabled={!!answer || picks.includes(c.key)}
          >
            <Img src={c.image} kind="photo" />
            {c.label && <span>{label(c)}</span>}
          </button>
        ))}
      </div>
      {!answer && (
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button className="primary" disabled={active !== -1} onClick={() => onSubmit(picks.join(','))}>
            Conferma quintetto
          </button>
          <button onClick={() => onSubmit('')}>Non lo so</button>
        </div>
      )}
    </div>
  );
}

/** Indizi uno alla volta; si può rispondere in qualsiasi momento. */
function ClueAnswer({
  input,
  answer,
  onSubmit,
  label,
}: {
  input: Extract<Question['input'], { kind: 'clues' }>;
  answer: Answer | null;
  onSubmit: (given: string) => void;
  label: (text: string, playerId?: string) => React.ReactNode;
}) {
  const [shown, setShown] = useState(1);
  const total = input.clues.length;
  const visible = answer ? total : shown;
  return (
    <div className="clues">
      <ol className="clue-list">
        {input.clues.slice(0, visible).map((c, i) => (
          <li key={i} className={answer && i >= shown ? 'extra' : ''}>
            {c.image && <Img src={c.image} kind={c.imageKind ?? 'logo'} />}
            {c.text && <span>{c.text}</span>}
          </li>
        ))}
      </ol>
      {!answer && shown < total && (
        <button className="more-clue" onClick={() => setShown((n) => n + 1)}>
          🔎 Altro indizio ({shown}/{total})
        </button>
      )}
      {answer?.correct && (
        <div className="muted small">
          Indovinato con {shown} {shown === 1 ? 'indizio' : 'indizi'} su {total}
        </div>
      )}
      {input.choices && (
        <ChoiceGrid
          choices={input.choices}
          correctKey={input.answer}
          answer={answer}
          onPick={onSubmit}
          label={(c) => label(c.label ?? '', c.playerId)}
          numbered={false}
        />
      )}
      {input.options && (
        <SearchAnswer
          options={input.options}
          placeholder="Scrivi il nome…"
          answered={answer}
          onSubmit={onSubmit}
          label={(o) => label(o.label, o.playerId)}
        />
      )}
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
  answered: Answer | null;
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
