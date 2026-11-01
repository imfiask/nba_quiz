import { useState } from 'react';
import { CONFERENCE_LABEL, DIVISIONS, teamById, type Conference } from '../data';
import { useStandings, type StandingRow } from '../espn';
import { Img } from './Cards';

/** Posizioni 1-6 ai playoff, 7-10 al play-in, dalla 11 fuori. */
function zoneOf(seed: number): 'playoff' | 'playin' | 'out' {
  return seed <= 6 ? 'playoff' : seed <= 10 ? 'playin' : 'out';
}

export function StandingsTable() {
  const standings = useStandings();
  const [view, setView] = useState<'conference' | 'division'>('conference');

  if (standings.status === 'loading') return <p className="muted">Carico la classifica da ESPN…</p>;
  if (standings.status === 'error') {
    return <p className="muted">Classifica non disponibile al momento ({standings.message}). Riprova più tardi.</p>;
  }
  const data = standings.data;

  return (
    <div className="standings">
      <div className="standings-head">
        <span className="muted">Stagione {data.season} · aggiornata da ESPN</span>
        <div className="segmented">
          <button className={view === 'conference' ? 'on' : ''} onClick={() => setView('conference')}>
            Conference
          </button>
          <button className={view === 'division' ? 'on' : ''} onClick={() => setView('division')}>
            Division
          </button>
        </div>
      </div>

      <div className="conferences">
        {(['West', 'East'] as Conference[]).map((conf) => (
          <section key={conf} className="panel">
            <h2>Conference {CONFERENCE_LABEL[conf]}</h2>
            {view === 'conference' ? (
              <Table rows={data[conf]} showZones />
            ) : (
              DIVISIONS.filter((d) => d.conference === conf).map((d) => (
                <div key={d.name}>
                  <h3>{d.name}</h3>
                  <Table
                    rows={data[conf]
                      .filter((r) => teamById.get(r.teamId)?.division === d.name)
                      .sort((a, b) => b.winPct - a.winPct || a.seed - b.seed)}
                  />
                </div>
              ))
            )}
          </section>
        ))}
      </div>

      {view === 'conference' && (
        <p className="muted small legend">
          <span className="zone-dot playoff" /> 1-6 playoff diretti <span className="zone-dot playin" /> 7-10 play-in{' '}
          <span className="zone-dot out" /> 11-15 fuori
        </p>
      )}
    </div>
  );
}

function Table({ rows, showZones = false }: { rows: StandingRow[]; showZones?: boolean }) {
  return (
    <div className="table-scroll">
      <table className="standings-table">
        <thead>
          <tr>
            <th title="Posizione nella conference">#</th>
            <th>Squadra</th>
            <th title="Vittorie">V</th>
            <th title="Sconfitte">P</th>
            <th title="Percentuale di vittorie">%</th>
            <th title="Partite di distacco dalla prima">Dist.</th>
            <th title="Serie in corso (W = vittorie, L = sconfitte)">Serie</th>
            <th title="Ultime 10 partite">Ult. 10</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = teamById.get(r.teamId)!;
            return (
              <tr key={r.teamId} className={showZones ? `zone-${zoneOf(r.seed)}` : ''}>
                <td>{r.seed}</td>
                <td>
                  <a className="standings-team" href={`#/study?team=${t.id}`}>
                    <Img src={t.logo} kind="logo" />
                    <span>{t.name}</span>
                  </a>
                </td>
                <td>{r.wins}</td>
                <td>{r.losses}</td>
                <td>{r.winPct.toFixed(3).replace(/^0/, '')}</td>
                <td>{r.gamesBehind}</td>
                <td className={r.streak.startsWith('W') ? 'streak-w' : r.streak.startsWith('L') ? 'streak-l' : ''}>
                  {r.streak}
                </td>
                <td>{r.lastTen}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Riga breve per l'intestazione della squadra: "3-2 · 5° a Est". */
export function TeamRecord({ teamId }: { teamId: string }) {
  const standings = useStandings();
  if (standings.status !== 'ok') return null;
  const t = teamById.get(teamId)!;
  const row = standings.data[t.conference].find((r) => r.teamId === teamId);
  if (!row) return null;
  return (
    <span className="team-record">
      {row.wins}-{row.losses} · {row.seed}° a {CONFERENCE_LABEL[t.conference]}
      {row.streak !== '-' && <span className="muted"> · serie {row.streak}</span>}
    </span>
  );
}
