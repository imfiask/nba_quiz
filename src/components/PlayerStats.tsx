import { useEffect } from 'react';
import { CONFERENCE_LABEL, POSITION_LABEL, STARTER_SLOTS, teamById, type Player } from '../data';
import { currentSeasonYear, tierOf, usePlayerStats, type SeasonStats } from '../espn';
import { Img } from './Cards';

/** Colonne della tabella: etichetta breve, spiegazione al passaggio del mouse, valore. */
const COLUMNS: { label: string; title: string; value: (s: SeasonStats) => string }[] = [
  { label: 'Partite', title: 'Partite giocate (da titolare)', value: (s) => `${s.games} (${s.starts})` },
  { label: 'Min', title: 'Minuti a partita', value: (s) => s.minutes.toFixed(1) },
  { label: 'Punti', title: 'Punti a partita', value: (s) => s.points.toFixed(1) },
  { label: 'Rimb', title: 'Rimbalzi a partita', value: (s) => s.rebounds.toFixed(1) },
  { label: 'Assist', title: 'Assist a partita', value: (s) => s.assists.toFixed(1) },
  { label: 'Rub', title: 'Palle rubate a partita', value: (s) => s.steals.toFixed(1) },
  { label: 'Stop', title: 'Stoppate a partita', value: (s) => s.blocks.toFixed(1) },
  { label: 'Perse', title: 'Palle perse a partita', value: (s) => s.turnovers.toFixed(1) },
  { label: '%Tiro', title: 'Percentuale al tiro dal campo', value: (s) => `${s.fgPct.toFixed(1)}%` },
  { label: '%3P', title: 'Percentuale da tre punti', value: (s) => `${s.threePct.toFixed(1)}%` },
  { label: '%TL', title: 'Percentuale ai tiri liberi', value: (s) => `${s.ftPct.toFixed(1)}%` },
];

/** Finestra con scheda e statistiche del giocatore: stagione in corso e precedente. */
export function PlayerStatsModal({ player: p, onClose }: { player: Player; onClose: () => void }) {
  const stats = usePlayerStats(p.id);
  const t = teamById.get(p.teamId)!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const facts = [
    p.position && (POSITION_LABEL[p.position] ?? p.position),
    p.starter && `Titolare (${STARTER_SLOTS[p.starter] ?? p.starter})`,
    p.heightCm && `${p.heightCm} cm`,
    p.weightKg && `${p.weightKg} kg`,
    p.age && `${p.age} anni`,
    p.experience !== null && (p.experience === 0 ? 'Rookie' : `${p.experience} ${p.experience === 1 ? 'anno' : 'anni'} in NBA`),
    p.country,
    p.college && `College: ${p.college}`,
  ].filter(Boolean);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" style={{ '--team': t.color } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close link" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
        <div className="stats-header">
          <Img src={p.headshot} kind="photo" />
          <div>
            <h2>
              {p.name} {p.jersey && <span className="jersey">#{p.jersey}</span>}
            </h2>
            <div className="reveal-team">
              <Img src={t.logo} kind="logo" /> {t.name} <span className="muted">· {CONFERENCE_LABEL[t.conference]}</span>
            </div>
            <div className="facts">{facts.join(' · ')}</div>
          </div>
        </div>

        {stats.status === 'loading' && <p className="muted">Carico le statistiche da ESPN…</p>}
        {stats.status === 'error' && (
          <p className="muted">Statistiche non disponibili al momento ({stats.message}). Riprova più tardi.</p>
        )}
        {stats.status === 'ok' && <StatsBody seasons={stats.data} />}
      </div>
    </div>
  );
}

function StatsBody({ seasons }: { seasons: SeasonStats[] }) {
  const rows = seasons
    .filter((s) => s.year === currentSeasonYear || s.year === currentSeasonYear - 1)
    .sort((a, b) => b.year - a.year);
  const verdict = tierOf(seasons);
  const careerLength = new Set(seasons.map((s) => s.year)).size;

  return (
    <>
      {verdict ? (
        <div className={`tier tier-${verdict.tier.rank}`}>
          <span className="tier-icon">{verdict.tier.icon}</span>
          <div>
            <div className="tier-label">{verdict.tier.label}</div>
            <div className="muted small">
              Valutazione indicativa su punti, rimbalzi e assist della stagione {verdict.basedOn.label}
              {verdict.basedOn.year !== currentSeasonYear && ' (quest\'anno ha ancora poche partite)'}.
            </div>
          </div>
        </div>
      ) : (
        <p className="muted">Non ha ancora giocato partite di stagione regolare in NBA.</p>
      )}

      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Stagione</th>
                {COLUMNS.map((c) => (
                  <th key={c.label} title={c.title}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const team = s.teamId ? teamById.get(s.teamId) : undefined;
                return (
                  <tr key={`${s.year}-${s.teamId}-${i}`}>
                    <td>
                      {s.label}
                      {team && <span className="muted small"> · {team.abbr}</span>}
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.label}>{c.value(s)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.every((s) => s.year === currentSeasonYear) && careerLength <= 1 && rows.length > 0 && (
        <p className="muted small">Prima stagione in NBA: non ci sono dati dell'anno scorso.</p>
      )}
      <p className="muted small">Medie a partita in stagione regolare, aggiornate da ESPN. Passa il mouse sulle colonne per la spiegazione.</p>
    </>
  );
}
