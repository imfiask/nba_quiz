import {
  CONFERENCE_LABEL,
  DIVISIONS,
  isSingleTeam,
  POSITION_LABEL,
  STARTER_SLOTS,
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
import { dueItems } from '../progress';
import { normalize } from './match';
import { cities, cityOf, type City } from '../geo';
import { fetchLastNight, fetchLeagueAverages, type LeagueLine, type Night } from '../espn';

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

/** Un indizio di "Chi è?": una frase oppure un'immagine (logo o foto). */
export interface Clue {
  text?: string;
  image?: string;
  imageKind?: 'logo' | 'photo';
}

export interface Question {
  mode: ModeId;
  itemId: string;
  /** Dove salvare il risultato; lo imposta chi crea la domanda (per il "Ripasso del giorno", misto). */
  statsKey?: string;
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
    | {
        kind: 'choice';
        choices: Choice[];
        answer: string;
        /** "divisions": due colonne, Ovest a sinistra ed Est a destra, una riga per nord/centro/sud. */
        layout?: 'divisions';
      }
    | { kind: 'search'; options: SearchOption[]; placeholder: string; answer: string }
    | { kind: 'text'; placeholder: string; answer: string; check: (s: string) => boolean }
    /** Un punto sulla mappa: le chiavi sono i nomi delle città. */
    | { kind: 'map'; cities: string[]; answer: string; numbered: boolean }
    /** Quintetto da completare: un giocatore per ruolo; la risposta sono gli id in ordine di ruolo, separati da virgole. */
    | { kind: 'lineup'; slots: { key: string; label: string }[]; candidates: Choice[]; answer: string }
    /** Indizi da scoprire uno alla volta; si risponde con le scelte (facile) o cercando il nome (difficile). */
    | { kind: 'clues'; clues: Clue[]; answer: string; choices?: Choice[]; options?: SearchOption[] };
  /** Cosa mostrare come "scheda" dopo la risposta; `map` aggiunge la mappa con le squadre, `note` una riga di spiegazione. */
  reveal: { playerId?: string; teamId?: string; teamIds?: string[]; map?: boolean; note?: string };
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
  | 'player-position'
  | 'last-night'
  | 'team-lineup'
  | 'player-clues'
  | 'player-intruder'
  | 'player-compare';

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
  /** Dati da scaricare prima di poter creare le domande (es. le partite della notte). */
  load?: () => Promise<void>;
  /** Le domande non dipendono dall'ambito scelto (es. tutte le partite della notte). */
  ignoresScope?: boolean;
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

/**
 * Se true, i quiz sui giocatori usano solo chi è in rotazione (`Player.rotation`), anche per le
 * risposte sbagliate: niente "terzo portiere". Lo imposta chi costruisce le domande (Home, Quiz).
 */
let rotationOnly = true;
export function setRotationOnly(value: boolean) {
  rotationOnly = value;
}
const inPool = (list: Player[]) => (rotationOnly ? list.filter((p) => p.rotation) : list);
const poolInScope = (scope: Scope) => inPool(playersInScope(scope));

/** Distrattori per un giocatore: stessa squadra/ambito se possibile, meglio se stesso ruolo. */
function playerDistractors(p: Player, scope: Scope): Player[] {
  const pool = withPhoto(poolInScope(scope));
  const samePos = pool.filter((x) => x.position === p.position);
  return distractors(p, samePos.length >= 4 ? samePos : pool, withPhoto(inPool(players)));
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

/** Le division in ordine per la griglia a due colonne: Ovest | Est, da nord a sud. */
function divisionsGrid() {
  const west = DIVISIONS.filter((d) => d.conference === 'West');
  const east = DIVISIONS.filter((d) => d.conference === 'East');
  return west.flatMap((w, i) => [w, east[i]]);
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

// ---------- dati per le modalità "in diretta" ----------

/** Partite dell'ultima notte, caricate da "Partite di ieri". */
let night: Night | null = null;
/** Medie di tutta la lega, caricate da "Chi è più forte?". */
let league: Map<string, LeagueLine> | null = null;

/** Per ogni partita e squadra, i 3 migliori marcatori (che conosciamo e hanno una foto). */
function nightPerformers() {
  return (night?.games ?? []).flatMap((game) =>
    game.teamIds.flatMap((teamId) =>
      game.lines
        .filter((l) => l.teamId === teamId && playerById.get(l.playerId)?.headshot)
        .sort((a, b) => b.points - a.points)
        .slice(0, 3)
        .map((line) => ({ game, line })),
    ),
  );
}

/** I titolari di una squadra in ordine di ruolo (PG, SG, SF, PF, C), solo se hanno una foto. */
function lineupOf(teamId: string): Player[] {
  const slots = Object.keys(STARTER_SLOTS);
  return withPhoto(rosterOf(teamId))
    .filter((p) => p.starter)
    .sort((a, b) => slots.indexOf(a.starter!) - slots.indexOf(b.starter!));
}

const COMPARE_STATS: { key: keyof LeagueLine; question: string; unit: string }[] = [
  { key: 'points', question: 'Chi segna più punti?', unit: 'punti' },
  { key: 'rebounds', question: 'Chi prende più rimbalzi?', unit: 'rimbalzi' },
  { key: 'assists', question: 'Chi fa più assist?', unit: 'assist' },
  { key: 'minutes', question: 'Chi gioca più minuti?', unit: 'minuti' },
];

/** Giocatori con abbastanza partite quest'anno per essere confrontati. */
function comparable(scope: Scope): Player[] {
  return withPhoto(poolInScope(scope)).filter((p) => (league?.get(p.id)?.games ?? 0) >= 3);
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
          layout: 'divisions',
          choices: divisionsGrid().map((d) => ({ key: d.name, label: `${d.name} (${CONFERENCE_LABEL[d.conference]})` })),
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
      // in difficile: le division su due colonne (Ovest | Est), poi Ovest generico · Finals · Est generico
      const choices: Choice[] =
        difficulty === 'hard'
          ? [
              ...divisionsGrid().map((d) => ({ key: `div:${d.name}`, label: d.name })),
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
        input: { kind: 'choice', answer, choices, layout: difficulty === 'hard' ? 'divisions' : undefined },
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
    items: (scope) => withPhoto(poolInScope(scope)).map((p) => p.id),
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
    items: (scope) => withPhoto(poolInScope(scope)).map((p) => p.id),
    build(id, scope, difficulty) {
      const p = player(id);
      let options: Player[];
      if (difficulty === 'hard') {
        // singola squadra: tutto il roster; altrimenti tante facce quante un roster
        const size = withPhoto(inPool(rosterOf(p.teamId))).length;
        options = isSingleTeam(scope)
          ? withPhoto(inPool(rosterOf(p.teamId)))
          : [p, ...distractors(p, withPhoto(poolInScope(scope)), withPhoto(inPool(players)), size - 1)];
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
    items: (scope) => poolInScope(scope).map((p) => p.id),
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
    items: (scope) => poolInScope(scope).filter((p) => p.jersey).map((p) => p.id),
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
    items: (scope) => poolInScope(scope).filter((p) => p.position).map((p) => p.id),
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
  {
    id: 'last-night',
    group: 'player',
    icon: '🌙',
    title: 'Partite di ieri',
    description: 'I protagonisti della notte: chi ha fatto quei numeri, in che partita ha giocato.',
    hard: 'Come il facile, ma tra le foto senza nomi.',
    singleTeamOk: true,
    ignoresScope: true,
    async load() {
      night = await fetchLastNight();
    },
    // tutte le partite della notte, qualunque sia l'ambito scelto: si studia chi ha appena giocato
    items: () => nightPerformers().map(({ game, line }) => `${game.id}:${line.playerId}`),
    build(id, _scope, difficulty) {
      const [gameId, playerId] = id.split(':');
      const game = night!.games.find((g) => g.id === gameId)!;
      const line = game.lines.find((l) => l.playerId === playerId)!;
      const p = player(playerId);
      const numbers = `${line.points} punti, ${line.rebounds} rimbalzi e ${line.assists} assist`;
      const base = { mode: 'last-night' as const, itemId: id, accentTeamId: p.teamId };
      const reveal = { playerId, note: `${game.label} · ${p.name}: ${numbers} in ${line.minutes} minuti` };
      const otherGames = night!.games.filter((g) => g.id !== gameId);
      // due tipi di domanda: "chi ha fatto questi numeri?" e "in che partita ha giocato?"
      if (otherGames.length > 0 && Math.random() < 0.4) {
        return {
          ...base,
          prompt: {
            image: p.headshot ?? undefined,
            imageKind: 'photo',
            text: p.name,
            playerId,
            sub: `Ieri notte: ${numbers}. In che partita?`,
          },
          input: {
            kind: 'choice',
            answer: gameId,
            choices: shuffle([game, ...shuffle(otherGames).slice(0, 3)]).map((g) => ({ key: g.id, label: g.label })),
          },
          reveal,
        };
      }
      const sameGame = game.lines
        .filter((l) => l.playerId !== playerId && playerById.get(l.playerId)?.headshot)
        .sort((a, b) => b.points - a.points)
        .slice(0, 8)
        .map((l) => player(l.playerId));
      const options = [p, ...shuffle(sameGame).slice(0, 3)];
      return {
        ...base,
        prompt: { matchup: game.teamIds, text: `Chi ha fatto ${numbers}?`, sub: game.label },
        input: {
          kind: 'choice',
          answer: playerId,
          choices: shuffle(options).map((x) => ({
            key: x.id,
            image: x.headshot ?? undefined,
            imageKind: 'photo',
            label: difficulty === 'hard' ? undefined : x.name,
            playerId: x.id,
          })),
        },
        reveal,
      };
    },
  },
  {
    id: 'team-lineup',
    group: 'player',
    icon: '🧩',
    title: 'Completa il quintetto',
    description: 'Una squadra, 5 ruoli: metti al posto giusto i titolari (foto e nomi).',
    hard: 'Come il facile, ma solo con le foto.',
    singleTeamOk: true,
    items: (scope) => teamsInScope(scope).filter((t) => lineupOf(t.id).length === 5).map((t) => t.id),
    build(id, _scope, difficulty) {
      const t = team(id);
      const starters = lineupOf(id);
      // tra i candidati anche la panchina che gioca, così non basta riconoscere i 5 titolari
      const bench = withPhoto(inPool(rosterOf(id))).filter((p) => !p.starter);
      const candidates = shuffle([...starters, ...shuffle(bench).slice(0, 4)]);
      return {
        mode: 'team-lineup',
        itemId: id,
        accentTeamId: id,
        prompt: {
          image: t.logo ?? undefined,
          imageKind: 'logo',
          text: t.name,
          sub: 'Chi sono i titolari? Scegli un giocatore per ogni ruolo.',
        },
        input: {
          kind: 'lineup',
          slots: Object.entries(STARTER_SLOTS).map(([key, label]) => ({ key, label })),
          candidates: candidates.map((p) => ({
            key: p.id,
            image: p.headshot ?? undefined,
            imageKind: 'photo',
            label: difficulty === 'hard' ? undefined : p.name,
            playerId: p.id,
          })),
          answer: starters.map((p) => p.id).join(','),
        },
        reveal: { teamId: id, note: `Quintetto: ${starters.map((p) => `${p.starter} ${p.name}`).join(' · ')}` },
      };
    },
  },
  {
    id: 'player-clues',
    group: 'player',
    icon: '🕵️',
    title: 'Chi è? (indizi)',
    description: 'Gli indizi si scoprono uno alla volta: indovina con meno indizi possibile, tra 4 nomi.',
    hard: 'Come il facile, ma scrivendo il nome.',
    singleTeamOk: true,
    items: (scope) => withPhoto(poolInScope(scope)).map((p) => p.id),
    build(id, scope, difficulty) {
      const p = player(id);
      const t = team(p.teamId);
      const origin = [p.country && `Nato in: ${p.country}`, p.college && `college: ${p.college}`].filter(Boolean).join(' · ');
      const clues: Clue[] = [
        { text: `${p.position ? (POSITION_LABEL[p.position] ?? p.position) : 'Ruolo sconosciuto'}${p.heightCm ? `, ${p.heightCm} cm` : ''}` },
        { text: origin || 'Nessun college' },
        { text: `${p.age ? `${p.age} anni` : 'Età sconosciuta'} · ${p.experience === 0 ? 'rookie' : `${p.experience ?? '?'} anni in NBA`}` },
        { text: `Conference ${CONFERENCE_LABEL[t.conference]}, division ${t.division}` },
        { text: `${p.starter ? 'Titolare' : 'Parte dalla panchina'} · circa ${Math.round(p.minutes)} minuti a partita` },
        ...(p.jersey ? [{ text: `Maglia numero ${p.jersey}` }] : []),
        { text: t.name, image: t.logo ?? undefined, imageKind: 'logo' },
        { image: p.headshot ?? undefined, imageKind: 'photo' },
      ];
      return {
        mode: 'player-clues',
        itemId: id,
        prompt: { text: 'Chi è?', sub: 'Scopri gli indizi uno alla volta' },
        input:
          difficulty === 'hard'
            ? { kind: 'clues', clues, answer: id, options: playerOptions }
            : {
                kind: 'clues',
                clues,
                answer: id,
                choices: shuffle([p, ...playerDistractors(p, scope)]).map((x) => ({ key: x.id, label: x.name, playerId: x.id })),
              },
        reveal: { playerId: id },
      };
    },
  },
  {
    id: 'player-intruder',
    group: 'player',
    icon: '🕳️',
    title: "L'intruso",
    description: "4 giocatori, 3 della stessa squadra: trova chi non c'entra (è di un'altra conference).",
    hard: "L'intruso è della stessa division, e ci sono solo le foto.",
    singleTeamOk: true,
    items: (scope) => teamsInScope(scope).filter((t) => withPhoto(inPool(rosterOf(t.id))).length >= 3).map((t) => t.id),
    build(id, _scope, difficulty) {
      const t = team(id);
      const three = shuffle(withPhoto(inPool(rosterOf(id)))).slice(0, 3);
      const others = teams.filter((x) =>
        difficulty === 'hard' ? x.division === t.division && x.id !== id : x.conference !== t.conference,
      );
      const intruder = shuffle(withPhoto(inPool(players)).filter((p) => others.some((x) => x.id === p.teamId)))[0];
      return {
        mode: 'player-intruder',
        itemId: id,
        prompt: { text: "Chi è l'intruso?", sub: 'Tre giocano nella stessa squadra, uno no' },
        input: {
          kind: 'choice',
          answer: intruder.id,
          choices: shuffle([...three, intruder]).map((x) => ({
            key: x.id,
            image: x.headshot ?? undefined,
            imageKind: 'photo',
            label: difficulty === 'hard' ? undefined : x.name,
            playerId: x.id,
          })),
        },
        reveal: {
          playerId: intruder.id,
          teamIds: [id],
          note: `${three.map((x) => x.name).join(', ')} giocano insieme: ${t.name}`,
        },
      };
    },
  },
  {
    id: 'player-compare',
    group: 'player',
    icon: '⚖️',
    title: 'Chi è più forte?',
    description: 'Due giocatori: chi segna, rimbalza, smista o gioca di più? Differenze nette.',
    hard: 'Come il facile, ma con numeri vicini.',
    singleTeamOk: true,
    async load() {
      league = await fetchLeagueAverages();
    },
    items: (scope) => comparable(scope).map((p) => p.id),
    build(id, scope, difficulty) {
      const p = player(id);
      const stat = shuffle(COMPARE_STATS)[0];
      const value = (x: Player) => league!.get(x.id)![stat.key];
      const mine = value(p);
      const ratio = (x: Player) => Math.max(mine, value(x)) / Math.max(0.1, Math.min(mine, value(x)));
      const pool = comparable(scope).filter((x) => x.id !== id && value(x) !== mine);
      const fits = pool.filter((x) => (difficulty === 'hard' ? ratio(x) >= 1.05 && ratio(x) <= 1.35 : ratio(x) >= 1.5));
      const other = shuffle(fits.length ? fits : pool)[0] ?? shuffle(comparable('all').filter((x) => x.id !== id))[0];
      const winner = value(other) > mine ? other : p;
      return {
        mode: 'player-compare',
        itemId: id,
        prompt: { text: stat.question, sub: 'Medie a partita di questa stagione' },
        input: {
          kind: 'choice',
          answer: winner.id,
          choices: shuffle([p, other]).map((x) => ({
            key: x.id,
            image: x.headshot ?? undefined,
            imageKind: 'photo',
            label: x.name,
            playerId: x.id,
          })),
        },
        reveal: {
          note: `${[p, other].map((x) => `${x.name}: ${value(x).toFixed(1)}`).join(' · ')} ${stat.unit} a partita`,
        },
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

/**
 * Le domande del "Ripasso del giorno": elementi già visti, di tutte le modalità, che oggi vanno
 * ripassati (ripetizione spaziata, vedi `dueAt`). `count` 0 = tutti.
 */
export function dailyQuestions(count: number): Question[] {
  const out: Question[] = [];
  for (const [key, itemId] of dueItems()) {
    const [modeId, level] = key.split(':');
    const def = modeById.get(modeId as ModeId);
    // le modalità "in diretta" cambiano ogni giorno: non si ripassano
    if (!def || def.load) continue;
    try {
      out.push({ ...def.build(itemId, 'all', level === 'hard' ? 'hard' : 'easy'), statsKey: key });
    } catch {
      // giocatore non più nei roster (ceduto o tagliato): si salta
    }
    if (count && out.length >= count) break;
  }
  return shuffle(out);
}
