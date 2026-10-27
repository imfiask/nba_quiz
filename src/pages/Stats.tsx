import { useState } from 'react';
import { playerById, teamById, updatedAt } from '../data';
import { MODES, modeById, statsKey, type ModeId } from '../quiz/modes';
import { allStats, isLearned, needsReview, resetProgress } from '../progress';
import { Img } from '../components/Cards';

export default function Stats() {
  const [, force] = useState(0);
  const stats = allStats();

  // una riga per ogni modalità e livello
  const levels = MODES.flatMap((m) =>
    (m.hard ? (['easy', 'hard'] as const) : (['easy'] as const)).map((d) => ({ mode: m, difficulty: d, key: statsKey(m, d) })),
  );
  const titleOf = (key: string) => {
    const level = levels.find((l) => l.key === key);
    if (!level) return null;
    return `${level.mode.icon} ${level.mode.title}${level.mode.hard ? (level.difficulty === 'hard' ? ' · Difficile' : ' · Facile') : ''}`;
  };

  const byMode = levels.map(({ mode: m, key }) => {
    const rows = stats.filter(([mode]) => mode === key);
    const right = rows.reduce((s, [, , r]) => s + r.right, 0);
    const wrong = rows.reduce((s, [, , r]) => s + r.wrong, 0);
    return {
      key,
      title: titleOf(key),
      seen: rows.length,
      total: m.items('all').length,
      learned: rows.filter(([, , r]) => isLearned(r)).length,
      accuracy: right + wrong ? Math.round((right / (right + wrong)) * 100) : null,
    };
  });

  const worst = stats
    .filter(([mode, , s]) => titleOf(mode) && needsReview(s))
    .sort((a, b) => b[2].wrong - a[2].wrong)
    .slice(0, 24);

  const label = (mode: string, id: string) => {
    const def = modeById.get(mode.split(':')[0] as ModeId);
    if (def?.group === 'player') {
      const p = playerById.get(id);
      return { name: p?.name ?? id, img: p?.headshot, kind: 'photo' as const };
    }
    const t = teamById.get(id);
    return { name: t?.name ?? id, img: t?.logo, kind: 'logo' as const };
  };

  return (
    <div className="stats">
      <section className="panel">
        <h2>Per modalità (tutta la NBA)</h2>
        <table>
          <thead>
            <tr>
              <th>Modalità</th>
              <th>Visti</th>
              <th>Imparati</th>
              <th>Precisione</th>
            </tr>
          </thead>
          <tbody>
            {byMode.map((r) => (
              <tr key={r.key}>
                <td>{r.title}</td>
                <td>
                  {r.seen}/{r.total}
                </td>
                <td>{r.learned}</td>
                <td>{r.accuracy === null ? '—' : `${r.accuracy}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Da ripassare</h2>
        {worst.length === 0 ? (
          <p className="muted">Nessun errore in sospeso. Gioca qualche quiz!</p>
        ) : (
          <div className="worst">
            {worst.map(([mode, id, s]) => {
              const l = label(mode, id);
              return (
                <div key={`${mode}|${id}`} className="worst-item">
                  <Img src={l.img} kind={l.kind} />
                  <div>
                    <div>{l.name}</div>
                    <div className="muted small">
                      {titleOf(mode)} · ❌ {s.wrong} ✅ {s.right}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="muted small">
        Dati roster aggiornati al {new Date(updatedAt).toLocaleDateString('it-IT')}.{' '}
        <button
          className="link danger"
          onClick={() => {
            if (confirm('Cancellare tutti i progressi?')) {
              resetProgress();
              force((n) => n + 1);
            }
          }}
        >
          Azzera progressi
        </button>
      </p>
    </div>
  );
}
