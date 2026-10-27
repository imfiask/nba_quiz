// Statistiche di apprendimento salvate nel browser (localStorage).
// Per ogni coppia (modalità, elemento) teniamo giuste, sbagliate e la serie
// di risposte giuste consecutive: serve a riproporre più spesso ciò che sbagli.

const KEY = 'nba-quiz-progress-v1';

export interface ItemStats {
  right: number;
  wrong: number;
  streak: number;
  last: number;
}

type Store = Record<string, ItemStats>;

let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
    // "Foto → Scrivi il nome" è diventata la versione difficile di "Foto → Nome"
    for (const key of Object.keys(cache)) {
      if (key.startsWith('player-photo-type|')) {
        cache[key.replace('player-photo-type|', 'player-photo-name:hard|')] = cache[key];
        delete cache[key];
      }
    }
  } catch {
    cache = {};
  }
  return cache;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    // storage pieno o bloccato: pazienza, si perde solo lo storico
  }
}

const k = (mode: string, itemId: string) => `${mode}|${itemId}`;

export function getStats(mode: string, itemId: string): ItemStats | undefined {
  return load()[k(mode, itemId)];
}

export function record(mode: string, itemId: string, correct: boolean) {
  const store = load();
  const s = store[k(mode, itemId)] ?? { right: 0, wrong: 0, streak: 0, last: 0 };
  if (correct) {
    s.right++;
    s.streak++;
  } else {
    s.wrong++;
    s.streak = 0;
  }
  s.last = Date.now();
  store[k(mode, itemId)] = s;
  save();
}

export function allStats(): [mode: string, itemId: string, stats: ItemStats][] {
  return Object.entries(load()).map(([key, s]) => {
    const [mode, itemId] = key.split('|');
    return [mode, itemId, s];
  });
}

export function resetProgress() {
  cache = {};
  save();
}

/** Un elemento è "imparato" dopo 3 risposte giuste di fila. */
export const isLearned = (s?: ItemStats) => !!s && s.streak >= 3;

/** Un elemento è "da ripassare" se l'ultima risposta è stata sbagliata. */
export const needsReview = (s?: ItemStats) => !!s && s.wrong > 0 && s.streak === 0;

/** Peso di estrazione: più alto = più probabile che esca. */
function weight(s?: ItemStats): number {
  if (!s) return 2; // mai visto
  const accuracy = s.right / (s.right + s.wrong);
  let w = 0.4 + (1 - accuracy) * 3;
  if (s.streak === 0 && s.wrong > 0) w += 2;
  return w / (1 + Math.min(s.streak, 6) * 0.5);
}

/** Estrae `count` elementi distinti, privilegiando quelli che sbagli più spesso. */
export function weightedPick(mode: string, itemIds: string[], count: number): string[] {
  const pool = itemIds.map((id) => ({ id, w: weight(getStats(mode, id)) }));
  const out: string[] = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((sum, p) => sum + p.w, 0);
    let r = Math.random() * total;
    let i = 0;
    while (i < pool.length - 1 && (r -= pool[i].w) > 0) i++;
    out.push(pool[i].id);
    pool.splice(i, 1);
  }
  return out;
}
