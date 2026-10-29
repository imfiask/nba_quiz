import {
  CONFERENCE_LABEL,
  DIVISIONS,
  isSingleTeam,
  POSITION_LABEL,
  playerById,
  players,
  playersInScope,
  rosterOf,
  teamById,
  teams,
  teamsInScope,
  type Player,
  type Scope,
  type Team,
} from '../data';
import type { Difficulty } from '../prefs';
import { normalize } from './match';
import { cities, cityOf, type City } from '../geo';

const DIVISION_GRID = ['Northwest', 'Atlantic', 'Pacific', 'Central', 'Southwest', 'Southeast'];

export interface Choice {
  key: string;
  label?: string;
  image?: string;
  imageKind?: 'logo' | 'photo';
  /** Se la scelta è un giocatore, per mostrarne il numero di maglia accanto al nome. */
  playerId?: string;
}

export interface SearchOption {
  key: string;
  label: string;
  playerId?: string;
  /** Testo normalizzato su cui cercare. */
  haystack: string;
}

export interface Question {
  mode: ModeId;
  itemId: string;
  prompt: {
    text?: string;
    sub?: string;
    image?: string;
    imageKind?: 'logo' | 'photo';
    /** Se il testo è il nome di un giocatore. */
    playerId?: string;
    /** Due squadre una contro l'altra (modalità "Scontro"). */
    matchup?: [string, string];
  };
  /** Squadra da usare come colore d'accento della domanda. */
  accentTeamId?: string;
  input:
    | { kind: 'choice'; choices: Choice[]; answer: string; columns?: 2 }
    | { kind: 'search'; options: SearchOption[]; placeholder: string; answer: string }
    | { kind: 'text'; placeholder: string; answer: string; check: (s: string) => boolean }
    /** Un punto sulla mappa: le chiavi sono i nomi delle città. */
    | { kind: 'map'; cities: string[]; answer: string; numbered: boolean };
  /** Cosa mostrare come "scheda" dopo la risposta; `map` aggiunge la mappa con le squadre. */
  reveal: { playerId?: string; teamId?: string; teamIds?: string[]; map?: boolean };
}

export type ModeId =
  | 'team-logo-name'
  | 'team-name-logo'
  | 'team-conference'
  | 'team-division'
  | 'team-map'
  | 'team-matchup'
  | 'player-photo-name'
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
  /** Descrizione della versione difficile; se manca la modalità ha un solo livello. */
  hard?: string;
  /** false = non ha senso su una singola squadra (es. "dove gioca?"). */
  singleTeamOk: boolean;
  /** Nasconde il numero di maglia accanto ai nomi (sarebbe la risposta). */
  hidesJersey?: boolean;
  items: (scope: Scope) => string[];
  /** Se presente, le domande si estraggono in parti uguali tra le categorie. */
  category?: (itemId: string) => string;
  build: (itemId: string, scope: Scope, difficulty: Difficulty) => Question;
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

/** Tutte le coppie di squadre dell'ambito, come "idA-idB". */
function matchupIds(list: Team[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) ids.push(`${list[i].id}-${list[j].id}`);
  return ids;
}

/** Distanza minima tra i punti proposti in "Dove gioca?" facile, perché non si confondano. */
const MIN_CITY_GAP = 110;

/** `n` città a caso, lontane tra loro e da quella giusta. */
function spreadCities(home: City, n: number): City[] {
  const picked = [home];
  for (const c of shuffle(cities)) {
    if (picked.length > n) break;
    if (picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= MIN_CITY_GAP)) picked.push(c);
  }
  return picked.slice(1);
}

const teamChoice = (t: Team): Choice => ({ key: t.id, label: t.name, image: t.logo ?? undefined, imageKind: 'logo' });

/** Le opzioni di ricerca sono sempre su tutta la lega: così l'autocompletamento non suggerisce troppo. */
const teamOptions: SearchOption[] = teams.map((t) => ({
  key: t.id,
  label: t.name,
  haystack: normalize(`${t.name} ${t.abbr}`),
}));
const playerOptions: SearchOption[] = players
  .map((p) => ({ key: p.id, label: p.name, playerId: p.id, haystack: normalize(p.name) }))
  .sort((a, b) => a.label.localeCompare(b.label));

/** Prompt con il giocatore: in facile con la foto, in difficile solo il nome. */
function playerPrompt(p: Player, difficulty: Difficulty, sub: string): Question['prompt'] {
  return {
    image: difficulty === 'easy' ? (p.headshot ?? undefined) : undefined,
    imageKind: 'photo',
    text: p.name,
    playerId: p.id,
    sub,
  };
}

// ---------- modalità ----------

export const MODES: ModeDef[] = [
  {
    id: 'team-logo-name',
    group: 'team',
    icon: '🛡️',
    title: 'Logo → Squadra',
    description: 'Vedi il logo, scegli il nome della squadra.',
    hard: 'Vedi il logo e scrivi il nome della squadra.',
    singleTeamOk: false,
    items: (scope) => teamsInScope(scope).map((t) => t.id),
    build(id, scope, difficulty) {
      const t = team(id);
      return {
        mode: 'team-logo-name',
        itemId: id,
        prompt: { image: t.logo ?? undefined, imageKind: 'logo', text: 'Che squadra è?' },
        input:
          difficulty === 'hard'
            ? { kind: 'search', options: teamOptions, placeholder: 'Scrivi la squadra…', answer: t.id }
            : {
                kind: 'choice',
                answer: t.id,
                choices: shuffle([t, ...distractors(t, teamsInScope(scope), teams)]).map((x) => ({
                  key: x.id,
                  label: x.name,
                })),
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
    description: 'Leggi il nome, trova il logo giusto tra 4.',
    hard: 'Leggi il nome, trova il logo tra tutti e 30.',
    singleTeamOk: false,
    items: (scope) => teamsInScope(scope).map((t) => t.id),
    build(id, scope, difficulty) {
      const t = team(id);
      const options = difficulty === 'hard' ? teams : [t, ...distractors(t, teamsInScope(scope), teams)];
      return {
        mode: 'team-name-logo',
        itemId: id,
        prompt: { text: t.name, sub: 'Qual è il suo logo?' },
        input: {
          kind: 'choice',
          answer: t.id,
          choices: shuffle(options).map((x) => ({ key: x.id, image: x.logo ?? undefined, imageKind: 'logo' })),
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
            // come sulla cartina: Ovest a sinistra, Est a destra
            { key: 'West', label: `⬅️ ${CONFERENCE_LABEL.West}` },
            { key: 'East', label: `${CONFERENCE_LABEL.East} ➡️` },
          ],
        },
        reveal: { teamId: id, map: true },
      };
    },
  },
  {
    id: 'team-division',
    group: 'team',
    icon: '🗺️',
    title: 'Division',
    description: 'In quale delle 6 division gioca?',
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
          // come sulla mappa: Ovest a sinistra, Est a destra; righe nord, centro, sud
          columns: 2,
          choices: DIVISION_GRID.map((name) => {
            const d = DIVISIONS.find((x) => x.name === name)!;
            return { key: d.name, label: `${d.name} (${CONFERENCE_LABEL[d.conference]})` };
          }),
        },
        reveal: { teamId: id, map: true },
      };
    },
  },
  {
    id: 'team-map',
    group: 'team',
    icon: '📍',
    title: 'Dove gioca?',
    description: 'Tocca la città della squadra sulla mappa, tra 6 possibili.',
    hard: 'Tocca la città della squadra tra tutte le città NBA.',
    singleTeamOk: false,
    items: (scope) => teamsInScope(scope).map((t) => t.id),
    build(id, _scope, difficulty) {
      const t = team(id);
      const home = cityOf(id);
      const shown = difficulty === 'hard' ? cities : [home, ...spreadCities(home, 5)];
      return {
        mode: 'team-map',
        itemId: id,
        accentTeamId: id,
        prompt: { image: t.logo ?? undefined, imageKind: 'logo', text: t.name, sub: 'Dove gioca? Tocca la sua città' },
        input: {
          kind: 'map',
          answer: home.city,
          // in facile i punti sono numerati, per sceglierli anche da tastiera
          numbered: difficulty !== 'hard',
          cities: shuffle(shown.map((c) => c.city)),
        },
        reveal: { teamId: id },
      };
    },
  },
  {
    id: 'team-matchup',
    group: 'team',
    icon: '⚔️',
    title: 'Scontro',
    description: 'Due squadre: sfida di conference Est, Ovest o possibili NBA Finals?',
    hard: 'Come il facile, ma se sono della stessa division devi indicare quale.',
    singleTeamOk: false,
    items: (scope) => matchupIds(teamsInScope(scope)),
    // a caso, metà delle coppie sarebbero Finals: estraiamo i tipi di sfida in parti uguali
    category(id) {
      const [a, b] = id.split('-').map(team);
      if (a.conference !== b.conference) return 'finals';
      return a.division === b.division ? 'division' : 'conference';
    },
    build(id, _scope, difficulty) {
      const [a, b] = id.split('-').map(team);
      const sameConference = a.conference === b.conference;
      const sameDivision = a.division === b.division;
      const conferenceKey = (c: Team['conference']) => `conf:${c}`;
      const answer = !sameConference
        ? 'finals'
        : difficulty === 'hard' && sameDivision
          ? `div:${a.division}`
          : conferenceKey(a.conference);
      const finals: Choice = { key: 'finals', label: '🏆 NBA Finals' };
      // in difficile: le division sopra, poi Ovest generico · Finals · Est generico
      const choices: Choice[] =
        difficulty === 'hard'
          ? [
              ...DIVISIONS.filter((d) => d.conference === 'West').map((d) => ({ key: `div:${d.name}`, label: d.name })),
              ...DIVISIONS.filter((d) => d.conference === 'East').map((d) => ({ key: `div:${d.name}`, label: d.name })),
              { key: conferenceKey('West'), label: '⬅️ Ovest (division diverse)' },
              finals,
              { key: conferenceKey('East'), label: 'Est (division diverse) ➡️' },
            ]
          : [
              { key: conferenceKey('West'), label: `⬅️ Conference ${CONFERENCE_LABEL.West}` },
              { key: conferenceKey('East'), label: `Conference ${CONFERENCE_LABEL.East} ➡️` },
              finals,
            ];
      const shown = shuffle([a.id, b.id]) as [string, string];
      return {
        mode: 'team-matchup',
        itemId: id,
        prompt: { matchup: shown, sub: 'Che tipo di sfida sarebbe?' },
        input: { kind: 'choice', answer, choices },
        reveal: { teamIds: shown, map: true },
      };
    },
  },
  {
    id: 'player-photo-name',
    group: 'player',
    icon: '📸',
    title: 'Foto → Nome',
    description: 'Vedi la foto, scegli tra 4 nomi.',
    hard: 'Vedi la foto e scrivi il nome.',
    singleTeamOk: true,
    items: (scope) => withPhoto(playersInScope(scope)).map((p) => p.id),
    build(id, scope, difficulty) {
      const p = player(id);
      return {
        mode: 'player-photo-name',
        itemId: id,
        accentTeamId: p.teamId,
        prompt: { image: p.headshot!, imageKind: 'photo', text: 'Chi è?' },
        input:
          difficulty === 'hard'
            ? { kind: 'search', options: playerOptions, placeholder: 'Scrivi il nome…', answer: p.id }
            : {
                kind: 'choice',
                answer: p.id,
                choices: shuffle([p, ...playerDistractors(p, scope)]).map((x) => ({
                  key: x.id,
                  label: x.name,
                  playerId: x.id,
                })),
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
    hard: 'Leggi il nome, trovalo tra le facce di un intero roster.',
    singleTeamOk: true,
    items: (scope) => withPhoto(playersInScope(scope)).map((p) => p.id),
    build(id, scope, difficulty) {
      const p = player(id);
      let options: Player[];
      if (difficulty === 'hard') {
        // singola squadra: tutto il roster; altrimenti tante facce quante un roster
        const size = withPhoto(rosterOf(p.teamId)).length;
        options = isSingleTeam(scope)
          ? withPhoto(rosterOf(p.teamId))
          : [p, ...distractors(p, withPhoto(playersInScope(scope)), withPhoto(players), size - 1)];
      } else {
        options = [p, ...playerDistractors(p, scope)];
      }
      return {
        mode: 'player-name-photo',
        itemId: id,
        accentTeamId: p.teamId,
        prompt: { text: p.name, playerId: p.id, sub: 'Chi è tra questi?' },
        input: {
          kind: 'choice',
          answer: p.id,
          choices: shuffle(options).map((x) => ({ key: x.id, image: x.headshot!, imageKind: 'photo' })),
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
    description: 'Dato un giocatore (con foto), scegli tra 4 squadre.',
    hard: 'Solo il nome, scegli tra tutte le 30 squadre.',
    singleTeamOk: false,
    items: (scope) => playersInScope(scope).map((p) => p.id),
    build(id, scope, difficulty) {
      const p = player(id);
      const t = team(p.teamId);
      const options = difficulty === 'hard' ? teams : shuffle([t, ...distractors(t, teamsInScope(scope), teams)]);
      return {
        mode: 'player-team',
        itemId: id,
        prompt: playerPrompt(p, difficulty, 'In che squadra gioca?'),
        input: { kind: 'choice', answer: t.id, choices: options.map(teamChoice) },
        reveal: { playerId: id },
      };
    },
  },
  {
    id: 'player-jersey',
    group: 'player',
    icon: '🔢',
    title: 'Numero di maglia',
    description: 'Vedi foto e nome, scrivi il numero.',
    hard: 'Solo il nome, scrivi il numero.',
    singleTeamOk: true,
    hidesJersey: true,
    items: (scope) => playersInScope(scope).filter((p) => p.jersey).map((p) => p.id),
    build(id, _scope, difficulty) {
      const p = player(id);
      return {
        mode: 'player-jersey',
        itemId: id,
        accentTeamId: p.teamId,
        prompt: playerPrompt(p, difficulty, `${team(p.teamId).name} · che numero ha?`),
        input: {
          kind: 'text',
          placeholder: '#',
          answer: `#${p.jersey}`,
          check: (s) => s.trim().replace(/^#/, '') === p.jersey,
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
    description: 'Vedi foto e nome: guardia, ala o centro?',
    hard: 'Solo il nome: guardia, ala o centro?',
    singleTeamOk: true,
    items: (scope) => playersInScope(scope).filter((p) => p.position).map((p) => p.id),
    build(id, _scope, difficulty) {
      const p = player(id);
      return {
        mode: 'player-position',
        itemId: id,
        accentTeamId: p.teamId,
        prompt: playerPrompt(p, difficulty, `${team(p.teamId).name} · che ruolo ha?`),
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
  return mode.singleTeamOk || !isSingleTeam(scope);
}

/** La difficoltà effettiva: le modalità a livello unico sono sempre "facile". */
export function effectiveDifficulty(mode: ModeDef, difficulty: Difficulty): Difficulty {
  return mode.hard ? difficulty : 'easy';
}

/** Chiave sotto cui salvare i progressi: facile e difficile si imparano separatamente. */
export function statsKey(mode: ModeDef, difficulty: Difficulty): string {
  return effectiveDifficulty(mode, difficulty) === 'hard' ? `${mode.id}:hard` : mode.id;
}

/** Filtra e ordina le opzioni di ricerca: prima chi inizia con il testo, poi chi ha una parola che inizia così. */
export function searchOptions(options: SearchOption[], query: string, limit = 8): SearchOption[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: [number, SearchOption][] = [];
  for (const o of options) {
    let score: number;
    if (o.haystack.startsWith(q)) score = 0;
    else if (o.haystack.split(' ').some((w) => w.startsWith(q)) || o.haystack.includes(` ${q}`)) score = 1;
    else if (o.haystack.includes(q)) score = 2;
    else continue;
    scored.push([score, o]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label))
    .slice(0, limit)
    .map(([, o]) => o);
}
