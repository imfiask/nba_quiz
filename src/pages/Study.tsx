import { useState } from 'react';
import { CONFERENCE_LABEL, DIVISIONS, STARTER_SLOTS, rosterOf, teamById, teams, type Player } from '../data';
import { navigate } from '../router';
import { Img, PlayerFacts } from '../components/Cards';
import { PlayerStatsModal } from '../components/PlayerStats';
import { StandingsTable, TeamRecord } from '../components/StandingsTable';

export default function Study({ teamId, view }: { teamId?: string; view?: string }) {
  const team = teamId ? teamById.get(teamId) : undefined;
  if (team) return <TeamRoster teamId={team.id} />;

  return (
    <div className="study">
      <div className="segmented study-tabs">
        <a href="#/study" className={view !== 'standings' ? 'on' : ''}>
          Squadre
        </a>
        <a href="#/study?view=standings" className={view === 'standings' ? 'on' : ''}>
          Classifica
        </a>
      </div>
      {view === 'standings' ? <StandingsTable /> : <TeamsByDivision />}
    </div>
  );
}

function TeamsByDivision() {
  return (
    <>
      <p className="muted">
        Scegli una squadra per vedere il roster; clicca un giocatore per le sue statistiche. Le squadre sono divise per
        conference e division.
      </p>
      <div className="conferences">
        {(['East', 'West'] as const).map((conf) => (
          <section key={conf} className="panel">
            <h2>Conference {CONFERENCE_LABEL[conf]}</h2>
            {DIVISIONS.filter((d) => d.conference === conf).map((d) => (
              <div key={d.name} className="division">
                <h3>{d.name}</h3>
                <div className="team-row">
                  {teams
                    .filter((t) => t.division === d.name)
                    .map((t) => (
                      <a key={t.id} className="team-tile" href={`#/study?team=${t.id}`} style={{ '--team': t.color } as React.CSSProperties}>
                        <Img src={t.logo} kind="logo" />
                        <span>{t.name}</span>
                      </a>
                    ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

function TeamRoster({ teamId }: { teamId: string }) {
  const t = teamById.get(teamId)!;
  const roster = rosterOf(teamId);
  const slots = Object.keys(STARTER_SLOTS);
  const starters = roster.filter((p) => p.starter).sort((a, b) => slots.indexOf(a.starter!) - slots.indexOf(b.starter!));
  const bench = roster.filter((p) => !p.starter);
  const [hideNames, setHideNames] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [statsFor, setStatsFor] = useState<Player | null>(null);
  const scope = `team:${teamId}`;

  const toggle = (id: string) =>
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const card = (p: Player) => {
    const hidden = hideNames && !revealed.has(p.id);
    return (
      // in modalità flashcard il primo clic scopre il nome; poi (o sempre, senza flashcard) apre le statistiche
      <button key={p.id} className="player-card" onClick={() => (hidden ? toggle(p.id) : setStatsFor(p))}>
        {p.starter && (
          <span className="slot-badge" title={STARTER_SLOTS[p.starter]}>
            {p.starter}
          </span>
        )}
        <Img src={p.headshot} kind="photo" />
        {p.jersey && <span className="jersey-badge">#{p.jersey}</span>}
        {hidden ? (
          <div className="hidden-name">Clicca per scoprire</div>
        ) : (
          <>
            <div className="player-name">{p.name}</div>
            <PlayerFacts p={p} starter={false} />
          </>
        )}
      </button>
    );
  };

  return (
    <div className="roster" style={{ '--team': t.color } as React.CSSProperties}>
      <a href="#/study" className="link">
        ← Tutte le squadre
      </a>
      <div className="panel team-header">
        <Img src={t.logo} kind="logo" />
        <div>
          <h2>{t.name}</h2>
          <div className="muted">
            Conference {CONFERENCE_LABEL[t.conference]} · Division {t.division} · {roster.length} giocatori
          </div>
          <TeamRecord teamId={t.id} />
        </div>
        <div className="actions">
          <button className="primary" onClick={() => navigate('quiz', { mode: 'player-photo-name', scope, n: 0 })}>
            📸 Quiz foto
          </button>
          <button onClick={() => navigate('quiz', { mode: 'player-photo-name', scope, n: 0, d: 'hard' })}>
            ⌨️ Scrivi nomi
          </button>
          <button onClick={() => navigate('quiz', { mode: 'player-jersey', scope, n: 0 })}>🔢 Numeri</button>
          <label className="check">
            <input
              type="checkbox"
              checked={hideNames}
              onChange={(e) => {
                setHideNames(e.target.checked);
                setRevealed(new Set());
              }}
            />
            Nascondi nomi (flashcard)
          </label>
        </div>
      </div>

      {starters.length > 0 && (
        <>
          <h3>
            Quintetto base{' '}
            <a className="help-link" href="#/guide">
              cosa vogliono dire PG, SG…?
            </a>
          </h3>
          <div className="player-grid starters">{starters.map(card)}</div>
          <h3>Panchina</h3>
        </>
      )}
      <div className="player-grid">{(starters.length > 0 ? bench : roster).map(card)}</div>
      {statsFor && <PlayerStatsModal player={statsFor} onClose={() => setStatsFor(null)} />}
    </div>
  );
}
