import { CONFERENCE_LABEL, POSITION_LABEL, teamById, type Player, type Team } from '../data';

export function Img({ src, kind, alt = '' }: { src?: string | null; kind: 'logo' | 'photo'; alt?: string }) {
  if (!src) return <div className={`img ${kind} missing`}>?</div>;
  return <img className={`img ${kind}`} src={src} alt={alt} loading="lazy" draggable={false} />;
}

export function PlayerFacts({ p }: { p: Player }) {
  const facts = [
    p.position && (POSITION_LABEL[p.position] ?? p.position),
    p.heightCm && `${p.heightCm} cm`,
    p.age && `${p.age} anni`,
    p.country && p.country !== 'USA' ? p.country : null,
  ].filter(Boolean);
  return <div className="facts">{facts.join(' · ')}</div>;
}

export function PlayerReveal({ p }: { p: Player }) {
  const t = teamById.get(p.teamId)!;
  return (
    <div className="reveal" style={{ '--team': t.color } as React.CSSProperties}>
      <Img src={p.headshot} kind="photo" />
      <div>
        <div className="reveal-title">
          {p.name} {p.jersey && <span className="jersey">#{p.jersey}</span>}
        </div>
        <div className="reveal-team">
          <Img src={t.logo} kind="logo" /> {t.name} <span className="muted">· {CONFERENCE_LABEL[t.conference]}</span>
        </div>
        <PlayerFacts p={p} />
      </div>
    </div>
  );
}

export function TeamReveal({ t }: { t: Team }) {
  return (
    <div className="reveal" style={{ '--team': t.color } as React.CSSProperties}>
      <Img src={t.logo} kind="logo" />
      <div>
        <div className="reveal-title">{t.name}</div>
        <div className="facts">
          Conference {CONFERENCE_LABEL[t.conference]} · Division {t.division} · {t.location}
        </div>
      </div>
    </div>
  );
}
