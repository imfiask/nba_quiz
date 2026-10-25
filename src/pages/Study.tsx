import { useState } from 'react';
import { CONFERENCE_LABEL, DIVISIONS, rosterOf, teamById, teams } from '../data';
import { navigate } from '../router';
import { Img, PlayerFacts } from '../components/Cards';

export default function Study({ teamId }: { teamId?: string }) {
  const team = teamId ? teamById.get(teamId) : undefined;
  if (team) return <TeamRoster teamId={team.id} />;

  return (
    <div className="study">
      <p className="muted">Scegli una squadra per vedere il roster. Le squadre sono divise per conference e division.</p>
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
    </div>
  );
}

function TeamRoster({ teamId }: { teamId: string }) {
  const t = teamById.get(teamId)!;
  const roster = rosterOf(teamId);
  const [hideNames, setHideNames] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const scope = `team:${teamId}`;

  const toggle = (id: string) =>
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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
        </div>
        <div className="actions">
          <button className="primary" onClick={() => navigate('quiz', { mode: 'player-photo-name', scope, n: 0 })}>
            📸 Quiz foto
          </button>
          <button onClick={() => navigate('quiz', { mode: 'player-photo-type', scope, n: 0 })}>⌨️ Scrivi nomi</button>
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

      <div className="player-grid">
        {roster.map((p) => {
          const hidden = hideNames && !revealed.has(p.id);
          return (
            <button key={p.id} className="player-card" onClick={() => hideNames && toggle(p.id)}>
              <Img src={p.headshot} kind="photo" />
              {p.jersey && <span className="jersey-badge">#{p.jersey}</span>}
              {hidden ? (
                <div className="hidden-name">Clicca per scoprire</div>
              ) : (
                <>
                  <div className="player-name">{p.name}</div>
                  <PlayerFacts p={p} />
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
