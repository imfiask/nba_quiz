import { memo } from 'react';
import { DIVISION_COLOR, teamById } from '../data';
import { cities, cityOf, divisionOf, map } from '../geo';

export interface Dot {
  key: string;
  x: number;
  y: number;
  color?: string;
  size?: 'small' | 'big';
  label?: string;
  /** Numero dentro il punto, per scegliere da tastiera. */
  number?: number;
  state?: 'correct' | 'wrong' | 'dim' | 'selected';
}

/** Oltre questa distanza (in unità della mappa) un tocco non sceglie nessun punto. */
const PICK_RADIUS = 60;

function radius(d: Dot): number {
  if (d.state === 'selected') return 15;
  if (d.state === 'correct' || d.state === 'wrong') return 13;
  return d.size === 'big' ? 11 : d.size === 'small' ? 5 : 7;
}

const Base = memo(function Base() {
  return (
    <>
      <path className="map-neighbours" d={map.neighbours} />
      <path className="map-usa" d={map.usa} />
      <path className="map-states" d={map.states} />
      <path className="map-lakes" d={map.lakes} />
    </>
  );
});

/** Mappa di USA e Canada con dei punti; se c'è `onPick`, un tocco sceglie il punto più vicino. */
export function UsMap({ dots, onPick, className = '' }: { dots: Dot[]; onPick?: (key: string) => void; className?: string }) {
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const svg = e.currentTarget;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    let best: Dot | null = null;
    let bestDist = PICK_RADIUS;
    for (const d of dots) {
      const dist = Math.hypot(d.x - pt.x, d.y - pt.y);
      if (dist < bestDist) [best, bestDist] = [d, dist];
    }
    if (best) onPick(best.key);
  };

  // le etichette vanno sopra a tutti i punti
  const labelled = dots.filter((d) => d.label);
  return (
    <svg
      className={`us-map ${onPick ? 'pickable' : ''} ${className}`}
      viewBox={`0 0 ${map.width} ${map.height}`}
      onClick={pick}
      role="img"
    >
      <Base />
      {dots.map((d) => (
        <g key={d.key} className={`map-dot ${d.size ?? ''} ${d.state ?? ''}`} style={d.color ? ({ '--dot': d.color } as React.CSSProperties) : undefined}>
          <circle cx={d.x} cy={d.y} r={radius(d)} />
          {d.number !== undefined && (
            <text x={d.x} y={d.y} className="map-number">
              {d.number}
            </text>
          )}
        </g>
      ))}
      {labelled.map((d) => {
        // vicino al bordo destro il nome va a sinistra del punto
        const end = d.x > map.width - 160;
        return (
          <text key={d.key} x={d.x} y={d.y} className={`map-label ${d.state ?? ''} ${end ? 'end' : ''}`} dx={end ? -16 : 16} textAnchor={end ? 'end' : 'start'}>
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * Le squadre evidenziate, con le altre città della loro division nello stesso colore:
 * così si vede anche dove sta la division intera.
 */
export function TeamsMap({ teamIds }: { teamIds: string[] }) {
  const highlighted = new Set(teamIds.map((id) => cityOf(id).city));
  const divisions = new Set(teamIds.map((id) => teamById.get(id)!.division));
  const dots: Dot[] = cities.map((c) => {
    const division = divisionOf(c);
    const inDivision = divisions.has(division);
    return {
      key: c.city,
      x: c.x,
      y: c.y,
      color: inDivision ? DIVISION_COLOR[division] : undefined,
      size: highlighted.has(c.city) ? 'big' : inDivision ? undefined : 'small',
      label: highlighted.has(c.city) ? c.city : undefined,
    };
  });
  // i punti grandi per ultimi, sopra gli altri
  dots.sort((a, b) => Number(a.size === 'big') - Number(b.size === 'big'));
  return <UsMap dots={dots} className="mini" />;
}
