// Percorso "Impara una squadra": prima si presentano pochi giocatori, poi si fanno domande
// facili solo su quelli già visti, poi se ne aggiungono altri (come una lezione di Duolingo).

import { POSITION_LABEL, STARTER_SLOTS, rosterOf, type Player } from '../data';

/** Quanti giocatori al massimo nel percorso di una squadra: il quintetto e la rotazione. */
const MAX_PLAYERS = 10;

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Chi si impara: titolari in ordine di ruolo (PG → C), poi chi entra dalla panchina, per minuti. */
export function lessonPlayers(teamId: string): Player[] {
  const slots = Object.keys(STARTER_SLOTS);
  const withPhoto = rosterOf(teamId).filter((p) => p.headshot);
  const starters = withPhoto.filter((p) => p.starter).sort((a, b) => slots.indexOf(a.starter!) - slots.indexOf(b.starter!));
  const bench = withPhoto.filter((p) => !p.starter && p.rotation).sort((a, b) => b.minutes - a.minutes);
  return [...starters, ...bench].slice(0, MAX_PLAYERS);
}

/** Le lezioni: 3 titolari, poi gli altri 2, poi la panchina a gruppi di 3 (senza lasciarne uno da solo). */
export function lessonUnits(teamId: string): Player[][] {
  const all = lessonPlayers(teamId);
  const starters = all.filter((p) => p.starter);
  const bench = all.filter((p) => !p.starter);
  const units: Player[][] = [];
  if (starters.length) units.push(starters.slice(0, 3));
  if (starters.length > 3) units.push(starters.slice(3));
  for (let i = 0; i < bench.length; i += 3) units.push(bench.slice(i, i + 3));
  // un gruppo da 1 si unisce al precedente
  if (units.length > 1 && units[units.length - 1].length === 1) units[units.length - 2].push(...units.pop()!);
  return units;
}

/** Qualche "gancio" per ricordare il giocatore, confrontandolo con i compagni del percorso. */
export function hooksOf(p: Player, team: Player[]): string[] {
  const hooks: string[] = [];
  const tallest = team.reduce((a, b) => ((b.heightCm ?? 0) > (a.heightCm ?? 0) ? b : a));
  const shortest = team.reduce((a, b) => ((b.heightCm ?? 999) < (a.heightCm ?? 999) ? b : a));
  const oldest = team.reduce((a, b) => ((b.age ?? 0) > (a.age ?? 0) ? b : a));
  const youngest = team.reduce((a, b) => ((b.age ?? 99) < (a.age ?? 99) ? b : a));
  const mostMinutes = team.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  if (p.id === mostMinutes.id) hooks.push('È quello che gioca più minuti in squadra');
  if (p.id === tallest.id && p.heightCm) hooks.push(`Il più alto del gruppo: ${p.heightCm} cm`);
  if (p.id === shortest.id && p.heightCm) hooks.push(`Il più basso del gruppo: ${p.heightCm} cm`);
  if (p.id === oldest.id && p.age) hooks.push(`Il veterano: ${p.age} anni`);
  if (p.id === youngest.id && p.age) hooks.push(`Il più giovane: ${p.age} anni`);
  if (p.experience === 0) hooks.push('È un rookie, al primo anno in NBA');
  if (p.country && p.country !== 'USA') hooks.push(`Viene da fuori: ${p.country}`);
  if (p.college && hooks.length < 3) hooks.push(`College: ${p.college}`);
  return hooks.slice(0, 3);
}

/** Ruolo leggibile: "Playmaker (PG)" per i titolari, altrimenti guardia/ala/centro. */
export function roleOf(p: Player): string {
  if (p.starter) return `${STARTER_SLOTS[p.starter] ?? p.starter} (${p.starter})`;
  return p.position ? (POSITION_LABEL[p.position] ?? p.position) : 'Ruolo non indicato';
}

// ---------- domande ----------

export interface LessonChoice {
  key: string;
  label?: string;
  image?: string;
}

export interface LessonQuestion {
  /** Per riproporla se sbagliata (il testo resta uguale, le scelte si rimescolano). */
  id: string;
  subject: Player;
  image?: string;
  text: string;
  sub?: string;
  choices: LessonChoice[];
  answer: string;
}

type Kind = 'photo-name' | 'name-photo' | 'jersey' | 'slot';

/** Una domanda sul giocatore `p`, con `n` scelte prese solo tra chi è già stato presentato. */
function question(kind: Kind, p: Player, known: Player[], n: number): LessonQuestion | null {
  const others = shuffle(known.filter((x) => x.id !== p.id));
  const options = (pool: Player[]) => shuffle([p, ...pool.slice(0, n - 1)]);
  const face = (x: Player): LessonChoice => ({ key: x.id, image: x.headshot ?? undefined, label: x.name });
  const id = `${kind}:${p.id}`;
  switch (kind) {
    case 'photo-name':
      return {
        id,
        subject: p,
        image: p.headshot ?? undefined,
        text: 'Chi è?',
        choices: options(others).map((x) => ({ key: x.id, label: x.name })),
        answer: p.id,
      };
    case 'name-photo':
      return {
        id,
        subject: p,
        text: p.name,
        sub: 'Qual è la sua faccia?',
        choices: options(others).map((x) => ({ key: x.id, image: x.headshot ?? undefined })),
        answer: p.id,
      };
    case 'jersey': {
      if (!p.jersey) return null;
      const pool = others.filter((x) => x.jersey !== p.jersey);
      return { id, subject: p, text: `Chi porta il numero ${p.jersey}?`, choices: options(pool).map(face), answer: p.id };
    }
    case 'slot': {
      if (!p.starter) return null;
      const pool = others.filter((x) => x.starter);
      if (pool.length === 0) return null;
      return {
        id,
        subject: p,
        text: `Chi è il titolare nel ruolo di ${STARTER_SLOTS[p.starter]} (${p.starter})?`,
        choices: options(pool).map(face),
        answer: p.id,
      };
    }
  }
}

const present = (q: LessonQuestion | null): q is LessonQuestion => !!q;

/**
 * Esercizi della lezione `index`: 3 domande per ogni giocatore nuovo (riconoscere la faccia,
 * il nome, e numero o ruolo) e un ripasso dei giocatori delle lezioni precedenti.
 * Nella prima lezione si parte con 2 sole scelte.
 */
export function practiceQuestions(units: Player[][], index: number): LessonQuestion[] {
  const fresh = units[index];
  const before = units.slice(0, index).flat();
  const known = [...before, ...fresh];
  const n = index === 0 ? 2 : 3;
  const first = fresh.map((p) => question('photo-name', p, known, n));
  const second = fresh.map((p) => question('name-photo', p, known, n));
  const third = fresh.map((p) => question(p.starter && Math.random() < 0.5 ? 'slot' : 'jersey', p, known, n) ?? question('slot', p, known, n));
  const review = shuffle(before)
    .slice(0, 3)
    .map((p) => question(shuffle<Kind>(['photo-name', 'name-photo', 'jersey', 'slot'])[0], p, known, 3) ?? question('photo-name', p, known, 3));
  // prima un giro di riconoscimento su tutti i nuovi, poi il resto mescolato
  return [...shuffle(first.filter(present)), ...shuffle([...second, ...third, ...review].filter(present))];
}

/** Test finale: una domanda per ogni giocatore della squadra, con 4 scelte. */
export function finalQuestions(units: Player[][]): LessonQuestion[] {
  const all = units.flat();
  return shuffle(
    all.map(
      (p) => question(shuffle<Kind>(['photo-name', 'name-photo', 'jersey', 'slot'])[0], p, all, 4) ?? question('photo-name', p, all, 4)!,
    ),
  );
}

// ---------- progressi del percorso (nel browser, separati dagli altri quiz) ----------

const KEY = 'nba-learn-v1';

export interface TeamLessonProgress {
  /** Lezioni completate. */
  unitsDone: number;
  /** Test finale superato. */
  completed: boolean;
}

function loadAll(): Record<string, TeamLessonProgress> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function getLessonProgress(teamId: string): TeamLessonProgress {
  return loadAll()[teamId] ?? { unitsDone: 0, completed: false };
}

export function saveLessonProgress(teamId: string, progress: TeamLessonProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadAll(), [teamId]: progress }));
  } catch {
    // storage bloccato: il percorso riparte dall'inizio la prossima volta
  }
}
