import { useEffect, useRef, useState } from 'react';
import { playerById, scopeLabel, teamById, type Scope } from '../data';
import { modeById, type ModeId, type Question } from '../quiz/modes';
import type { MatchResult } from '../quiz/match';
import { getStats, needsReview, record, weightedPick } from '../progress';
import { navigate } from '../router';
import { Img, PlayerReveal, TeamReveal } from '../components/Cards';

interface Props {
  mode: ModeId;
  scope: Scope;
  /** 0 = tutti gli elementi dell'ambito */
  count: number;
  reviewOnly: boolean;
}

interface Answer {
  given: string;
  result: MatchResult;
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

export default function Quiz({ mode, scope, count, reviewOnly }: Props) {
  const def = modeById.get(mode);

  const [queue, setQueue] = useState<Question[]>(() => {
    if (!def) return [];
    let items = def.items(scope);
    if (reviewOnly) items = items.filter((id) => needsReview(getStats(mode, id)));
    return weightedPick(mode, items, count || items.length).map((id) => def.build(id, scope));
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
    const result: MatchResult =
      q.input.kind === 'choice' ? (given === q.input.answer ? 'exact' : 'wrong') : q.input.check(given);
    const correct = result !== 'wrong';
    record(mode, q.itemId, correct);
    setAnswer({ given, result });
    setScore((s) => (correct ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }));
    if (!correct) {
      setMissed((m) => (m.includes(q.itemId) ? m : [...m, q.itemId]));
      const n = retries.current.get(q.itemId) ?? 0;
      if (n < MAX_RETRIES && def) {
        retries.current.set(q.itemId, n + 1);
        setQueue((list) => {
          const copy = list.slice();
          copy.splice(Math.min(index + 1 + RETRY_GAP, copy.length), 0, def.build(q.itemId, scope));
          return copy;
        });
      }
    }
  };

  // Avanza da solo se hai risposto giusto
  useEffect(() => {
    if (!answer || answer.result === 'wrong') return;
    const t = setTimeout(next, answer.result === 'close' ? 1800 : 900);
    return () => clearTimeout(t);
  }, [answer]);

  // Tastiera: 1-6 per scegliere, Invio per andare avanti
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (answer && e.key === 'Enter') {
        e.preventDefault();
        next();
        return;
      }
      if (!answer && q?.input.kind === 'choice' && !(e.target instanceof HTMLInputElement)) {
        const n = Number(e.key);
        const choice = q.input.choices[n - 1];
        if (choice) submit(choice.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!def) return <p>Modalità sconosciuta. <a href="#/">Torna alla home</a></p>;

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
        <h2>
          {def.icon} {def.title} — fatto!
        </h2>
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
                  <TeamReveal key={id} t={teamById.get(id)!} />
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
            <button onClick={() => navigate('quiz', { mode, scope, n: 0, review: 1 })}>Ripassa errori</button>
          )}
          <button onClick={() => navigate('home', { scope })}>Altre modalità</button>
        </div>
      </div>
    );
  }

  const accent = q.accentTeamId ? teamById.get(q.accentTeamId)?.color : undefined;
  const revealPlayer = q.reveal.playerId ? playerById.get(q.reveal.playerId) : undefined;
  const revealTeam = q.reveal.teamId ? teamById.get(q.reveal.teamId) : undefined;

  return (
    <div className="quiz" style={accent ? ({ '--team': accent } as React.CSSProperties) : undefined}>
      <div className="quiz-head">
        <button className="link" onClick={() => navigate('home', { scope })}>
          ← Esci
        </button>
        <span>
          {def.icon} {def.title} · {scopeLabel(scope)}
        </span>
        <span className="score">
          ✅ {score.right} ❌ {score.wrong} · {index + 1}/{queue.length}
        </span>
      </div>
      <div className="bar thin">
        <span style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      <div className="panel question">
        {q.prompt.image && <Img src={q.prompt.image} kind={q.prompt.imageKind ?? 'logo'} />}
        {q.prompt.text && <div className="prompt-text">{q.prompt.text}</div>}
        {q.prompt.sub && <div className="prompt-sub">{q.prompt.sub}</div>}

        {q.input.kind === 'choice' ? (
          <div className={`choices ${q.input.choices.some((c) => c.image && !c.label) ? 'images' : ''} n${q.input.choices.length}`}>
            {q.input.choices.map((c, i) => {
              let cls = 'choice';
              if (answer) {
                if (c.key === q.input.answer) cls += ' correct';
                else if (c.key === answer.given) cls += ' wrong';
                else cls += ' dim';
              }
              return (
                <button key={c.key} className={cls} onClick={() => submit(c.key)} disabled={!!answer}>
                  <span className="kbd">{i + 1}</span>
                  {c.image && <Img src={c.image} kind={c.imageKind ?? 'logo'} />}
                  {c.label && <span>{c.label}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <TextAnswer key={index} placeholder={q.input.placeholder} disabled={!!answer} onSubmit={submit} />
        )}

        {answer && (
          <div className={`feedback ${answer.result}`}>
            <div className="feedback-title">
              {answer.result === 'exact' && 'Giusto! ✅'}
              {answer.result === 'close' && <>Quasi perfetto ✅ — si scrive <b>{q.input.answer}</b></>}
              {answer.result === 'wrong' && (
                <>
                  Sbagliato ❌
                  {q.input.kind === 'text' && (
                    <>
                      {' '}
                      — era <b>{q.input.answer}</b>
                    </>
                  )}
                </>
              )}
            </div>
            {revealPlayer && <PlayerReveal p={revealPlayer} />}
            {!revealPlayer && revealTeam && <TeamReveal t={revealTeam} />}
            {answer.result === 'wrong' && (
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
