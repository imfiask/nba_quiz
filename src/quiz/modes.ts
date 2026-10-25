import {
  CONFERENCE_LABEL,
  DIVISIONS,
  POSITION_LABEL,
  playerById,
  players,
  playersInScope,
  teamById,
  teams,
  teamsInScope,
  type Player,
  type Scope,
  type Team,
} from '../data';
import { matchName, type MatchResult } from './match';

export interface Choice {
  key: string;
  label?: string;
  image?: string;
  imageKind?: 'logo' | 'photo';
}

export interface Question {
  mode: ModeId;
  itemId: string;
  prompt: {
    text?: string;
    sub?: string;
    image?: string;
    imageKind?: 'logo' | 'photo';
  };
  /** Squadra da usare come colore d'accento della domanda. */
  accentTeamId?: string;
  input:
    | { kind: 'choice'; choices: Choice[]; answer: string }
    | { kind: 'text'; placeholder: string; answer: string; check: (s: string) => MatchResult };
  /** Cosa mostrare come "scheda" dopo la risposta. */
  reveal: { playerId?: string; teamId?: string };
}

export type ModeId =
  | 'team-logo-name'
  | 'team-name-logo'
  | 'team-conference'
  | 'team-division'
  | 'player-photo-name'
  | 'player-photo-type'
  | 'player-name-photo'
  | 'player-team'
  | 'player-jersey'
  | 'player-position';

export interface ModeDef {
  id: ModeId;
  group: 'team' | 'player';
  icon: string;
  title: string;
  description: string;
  /** false = non ha senso su una singola squadra (es. "dove gioca?"). */
  singleTeamOk: boolean;
  items: (scope: Scope) => string[];
  build: (itemId: string, scope: Scope) => Question;
}

// ---------- utilità ----------

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Prende `n` distrattori dal pool preferito, completando dal fallback se serve. */
function distractors<T extends { id: string }>(correct: T, preferred: T[], fallback: T[], n = 3): T[] {
  const picked = shuffle(preferred.filter((x) => x.id !== correct.id)).slice(0, n);
  if (picked.length < n) {
    const used = new Set([correct.id, ...picked.map((x) => x.id)]);
    picked.push(...shuffle(fallback.filter((x) => !used.has(x.id))).slice(0, n - picked.length));
  }
  return picked;
}

const team = (id: string) => teamById.get(id)!;
const player = (id: string) => playerById.get(id)!;

const withPhoto = (list: Player[]) => list.filter((p) => p.headshot);

/** Distrattori per un giocatore: stessa squadra/ambito se possibile, meglio se stesso ruolo. */
function playerDistractors(p: Player, scope: Scope): Player[] {
  const pool = withPhoto(playersInScope(scope));
  const samePos = pool.filter((x) => x.position === p.position);
  return distractors(p, samePos.length >= 4 ? samePos : pool, withPhoto(players));
}

const teamChoice = (t: Team): Choice => ({ key: t.id, label: t.name, image: t.logo ?? undefined, imageKind: 'logo' });

// ---------- modalità ----------

export const MODES: ModeDef[] = [
  {
    id: 'team-logo-name',
    group: 'team',
    icon: '🛡️',
    title: 'Logo → Squadra',
    description: 'Vedi il logo, scegli il nome della squadra.',
    singleTeamOk: false,
    items: (scope) => teamsInScope(scope).map((t) => t.id),
    build(id, scope) {
      const t = team(id);
      const others = distractors(t, teamsInScope(scope), teams);
      return {
        mode: 'team-logo-name',
        itemId: id,
        prompt: { image: t.logo ?? undefined, imageKind: 'logo', text: 'Che squadra è?' },
        input: {
          kind: 'choice',
          answer: t.id,
          choices: shuffle([t, ...others]).map((x) => ({ key: x.id, label: x.name })),
        },
        reveal: { teamId: id },
      };
    },
  },
  {
    id: 'team-name-logo',
    group: 'team',
    icon: '🎯',
    title: 'Squadra → Logo',
    description: 'Leggi il nome, trova il logo giusto.',
    singleTeamOk: false,
    items: (scope) => teamsInScope(scope).map((t) => t.id),
    build(id, scope) {
      const t = team(id);
      const others = distractors(t, teamsInScope(scope), teams);
      return {
        mode: 'team-name-logo',
        itemId: id,
        prompt: { text: t.name, sub: 'Qual è il suo logo?' },
        input: {
          kind: 'choice',
          answer: t.id,
          choices: shuffle([t, ...others]).map((x) => ({ key: x.id, image: x.logo ?? undefined, imageKind: 'logo' })),
        },
        reveal: { teamId: id },
      };
    },
  },
  {
    id: 'team-conference',
    group: 'team',
    icon: '🧭',
    title: 'Est o Ovest?',
    description: 'In quale conference gioca questa squadra?',
    singleTeamOk: false,
    items: (scope) => teamsInScope(scope).map((t) => t.id),
    build(id) {
      const t = team(id);
      return {
        mode: 'team-conference',
        itemId: id,
        accentTeamId: id,
        prompt: { image: t.logo ?? undefined, imageKind: 'logo', text: t.name, sub: 'Est o Ovest?' },
        input: {
          kind: 'choice',
          answer: t.conference,
          choices: [
            { key: 'East', label: `⬅️ ${CONFERENCE_LABEL.East}` },
            { key: 'West', label: `${CONFERENCE_LABEL.West} ➡️` },
          ],
        },
        reveal: { teamId: id },
      };
    },
  },
  {
    id: 'team-division',
    group: 'team',
    icon: '🗺️',
    title: 'Division',
    description: 'In quale delle 6 division gioca? (livello avanzato)',
    singleTeamOk: false,
    items: (scope) => teamsInScope(scope).map((t) => t.id),
    build(id) {
      const t = team(id);
      return {
        mode: 'team-division',
        itemId: id,
        accentTeamId: id,
        prompt: { image: t.logo ?? undefined, imageKind: 'logo', text: t.name, sub: 'Quale division?' },
        input: {
          kind: 'choice',
          answer: t.division,
          choices: DIVISIONS.map((d) => ({ key: d.name, label: `${d.name} (${CONFERENCE_LABEL[d.conference]})` })),
        },
        reveal: { teamId: id },
      };
    },
  },
  {
    id: 'player-photo-name',
    group: 'player',
    icon: '📸',
    title: 'Foto → Nome',
    description: 'Vedi la foto, scegli tra 4 nomi.',
    singleTeamOk: true,
    items: (scope) => withPhoto(playersInScope(scope)).map((p) => p.id),
    build(id, scope) {
      const p = player(id);
      return {
        mode: 'player-photo-name',
        itemId: id,
        accentTeamId: p.teamId,
        prompt: { image: p.headshot!, imageKind: 'photo', text: 'Chi è?' },
        input: {
          kind: 'choice',
          answer: p.id,
          choices: shuffle([p, ...playerDistractors(p, scope)]).map((x) => ({ key: x.id, label: x.name })),
        },
        reveal: { playerId: id },
      };
    },
  },
  {
    id: 'player-photo-type',
    group: 'player',
    icon: '⌨️',
    title: 'Foto → Scrivi il nome',
    description: 'Vedi la foto e scrivi il nome (basta il cognome, perdona i refusi).',
    singleTeamOk: true,
    items: (scope) => withPhoto(playersInScope(scope)).map((p) => p.id),
    build(id) {
      const p = player(id);
      return {
        mode: 'player-photo-type',
        itemId: id,
        accentTeamId: p.teamId,
        prompt: { image: p.headshot!, imageKind: 'photo', text: 'Chi è?', sub: team(p.teamId).name },
        input: {
          kind: 'text',
          placeholder: 'Nome o cognome…',
          answer: p.name,
          check: (s) => matchName(s, p),
        },
        reveal: { playerId: id },
      };
    },
  },
  {
    id: 'player-name-photo',
    group: 'player',
    icon: '🔍',
    title: 'Nome → Foto',
    description: 'Leggi il nome, riconosci il giocatore tra 4 foto.',
    singleTeamOk: true,
    items: (scope) => withPhoto(playersInScope(scope)).map((p) => p.id),
    build(id, scope) {
      const p = player(id);
      return {
        mode: 'player-name-photo',
        itemId: id,
        accentTeamId: p.teamId,
        prompt: { text: p.name, sub: 'Chi è tra questi?' },
        input: {
          kind: 'choice',
          answer: p.id,
          choices: shuffle([p, ...playerDistractors(p, scope)]).map((x) => ({
            key: x.id,
            image: x.headshot!,
            imageKind: 'photo',
          })),
        },
        reveal: { playerId: id },
      };
    },
  },
  {
    id: 'player-team',
    group: 'player',
    icon: '🏟️',
    title: 'Dove gioca?',
    description: 'Dato un giocatore, scegli la sua squadra.',
    singleTeamOk: false,
    items: (scope) => playersInScope(scope).map((p) => p.id),
    build(id, scope) {
      const p = player(id);
      const t = team(p.teamId);
      const others = distractors(t, teamsInScope(scope), teams);
      return {
        mode: 'player-team',
        itemId: id,
        // niente foto: la maglia svelerebbe la risposta
        prompt: { text: p.name, sub: 'In che squadra gioca?' },
        input: { kind: 'choice', answer: t.id, choices: shuffle([t, ...others]).map(teamChoice) },
        reveal: { playerId: id },
      };
    },
  },
  {
    id: 'player-jersey',
    group: 'player',
    icon: '🔢',
    title: 'Numero di maglia',
    description: 'Che numero indossa? Scrivilo.',
    singleTeamOk: true,
    items: (scope) => playersInScope(scope).filter((p) => p.jersey).map((p) => p.id),
    build(id) {
      const p = player(id);
      return {
        mode: 'player-jersey',
        itemId: id,
        accentTeamId: p.teamId,
        prompt: { image: p.headshot ?? undefined, imageKind: 'photo', text: p.name, sub: `${team(p.teamId).name} · che numero ha?` },
        input: {
          kind: 'text',
          placeholder: '#',
          answer: `#${p.jersey}`,
          check: (s) => (s.trim().replace(/^#/, '') === p.jersey ? 'exact' : 'wrong'),
        },
        reveal: { playerId: id },
      };
    },
  },
  {
    id: 'player-position',
    group: 'player',
    icon: '📍',
    title: 'Ruolo',
    description: 'Guardia, ala o centro?',
    singleTeamOk: true,
    items: (scope) => playersInScope(scope).filter((p) => p.position).map((p) => p.id),
    build(id) {
      const p = player(id);
      return {
        mode: 'player-position',
        itemId: id,
        accentTeamId: p.teamId,
        prompt: { image: p.headshot ?? undefined, imageKind: 'photo', text: p.name, sub: 'Che ruolo ha?' },
        input: {
          kind: 'choice',
          answer: p.position!,
          choices: Object.entries(POSITION_LABEL).map(([key, label]) => ({ key, label })),
        },
        reveal: { playerId: id },
      };
    },
  },
];

export const modeById = new Map(MODES.map((m) => [m.id, m]));

export function modeAvailable(mode: ModeDef, scope: Scope): boolean {
  return mode.singleTeamOk || !scope.startsWith('team:');
}
