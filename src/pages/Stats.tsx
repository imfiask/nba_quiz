import { useState } from 'react';
import { playerById, teamById, updatedAt } from '../data';
import { MODES, modeById, type ModeId } from '../quiz/modes';
import { allStats, isLearned, needsReview, resetProgress } from '../progress';
import { Img } from '../components/Cards';

export default function Stats() {
  const [, force] = useState(0);
  const stats = allStats();

  const byMode = MODES.map((m) => {
    const rows = stats.filter(([mode]) => mode === m.id);
    const right = rows.reduce((s, [, , r]) => s + r.right, 0);
    const wrong = rows.reduce((s, [, , r]) => s + r.wrong, 0);
    return {
      mode: m,
      seen: rows.length,
      total: m.items('all').length,
      learned: rows.filter(([, , r]) => isLearned(r)).length,
      accuracy: right + wrong ? Math.round((right / (right + wrong)) * 100) : null,
    };
  });

  const worst = stats
    .filter(([, , s]) => needsReview(s))
    .sort((a, b) => b[2].wrong - a[2].wrong)
    .slice(0, 24);

  const label = (mode: string, id: string) => {
    const def = modeById.get(mode as ModeId);
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
              <tr key={r.mode.id}>
                <td>
                  {r.mode.icon} {r.mode.title}
                </td>
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
                      {modeById.get(mode as ModeId)?.title} · ❌ {s.wrong} ✅ {s.right}
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
