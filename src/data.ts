import raw from './data/nba.json';

export type Conference = 'East' | 'West';

export interface Team {
  id: string;
  abbr: string;
  name: string;
  location: string;
  nickname: string;
  color: string;
  altColor: string;
  logo: string | null;
  conference: Conference;
  division: string;
}

export interface Player {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  teamId: string;
  jersey: string | null;
  position: string | null;
  positionName: string | null;
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  experience: number | null;
  college: string | null;
  country: string | null;
  headshot: string | null;
  /** Ruolo nel quintetto base (PG, SG, SF, PF, C) secondo il depth chart ESPN; null se in panchina. */
  starter: string | null;
}

export const season: string = raw.season ?? '';
export const updatedAt: string = raw.updatedAt;
/** Usa il ridimensionatore del CDN ESPN: gli originali pesano ~200KB l'uno. */
function resized(url: string | null, w: number, h: number): string | null {
  if (!url?.startsWith('https://a.espncdn.com/i/')) return url;
  return `https://a.espncdn.com/combiner/i?img=${url.slice('https://a.espncdn.com'.length)}&w=${w}&h=${h}&scale=crop&cquality=80`;
}

export const teams = (raw.teams as Team[])
  .map((t) => ({ ...t, logo: resized(t.logo, 200, 200) }))
  .sort((a, b) => a.name.localeCompare(b.name));
export const players = (raw.players as Player[]).map((p) => ({ ...p, headshot: resized(p.headshot, 260, 190) }));

export const teamById = new Map(teams.map((t) => [t.id, t]));
export const playerById = new Map(players.map((p) => [p.id, p]));

export const CONFERENCE_LABEL: Record<Conference, string> = { East: 'Est', West: 'Ovest' };

export const DIVISIONS: { name: string; conference: Conference }[] = [
  { name: 'Atlantic', conference: 'East' },
  { name: 'Central', conference: 'East' },
  { name: 'Southeast', conference: 'East' },
  { name: 'Northwest', conference: 'West' },
  { name: 'Pacific', conference: 'West' },
  { name: 'Southwest', conference: 'West' },
];

/** Ordine e nomi dei ruoli del quintetto base. */
export const STARTER_SLOTS: Record<string, string> = {
  PG: 'Playmaker',
  SG: 'Guardia tiratrice',
  SF: 'Ala piccola',
  PF: 'Ala grande',
  C: 'Centro',
};

export const POSITION_LABEL: Record<string, string> = {
  G: 'Guardia',
  F: 'Ala',
  C: 'Centro',
};

/** Ambito del quiz: tutta la lega, una conference o una singola squadra. */
export type Scope = 'all' | Conference | `team:${string}`;

export function scopeLabel(scope: Scope): string {
  if (scope === 'all') return 'Tutta la NBA';
  if (scope === 'East' || scope === 'West') return `Conference ${CONFERENCE_LABEL[scope]}`;
  return teamById.get(scope.slice(5))?.name ?? scope;
}

export function teamsInScope(scope: Scope): Team[] {
  if (scope === 'all') return teams;
  if (scope === 'East' || scope === 'West') return teams.filter((t) => t.conference === scope);
  return teams.filter((t) => t.id === scope.slice(5));
}

export function playersInScope(scope: Scope): Player[] {
  const ids = new Set(teamsInScope(scope).map((t) => t.id));
  return players.filter((p) => ids.has(p.teamId));
}

export function rosterOf(teamId: string): Player[] {
  return players
    .filter((p) => p.teamId === teamId)
    .sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999));
}
