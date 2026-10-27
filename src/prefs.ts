import { useSyncExternalStore } from 'react';
import type { Scope } from './data';

// Preferenze dell'utente, salvate nel browser e condivise tra le pagine.

export type Difficulty = 'easy' | 'hard';

export interface Prefs {
  scope: Scope;
  /** 0 = tutti */
  count: number;
  difficulty: Difficulty;
  showJersey: boolean;
  /** Resta sulla soluzione anche quando rispondi giusto, finché non premi Avanti. */
  holdOnCorrect: boolean;
}

const KEY = 'nba-quiz-prefs-v1';
const DEFAULTS: Prefs = { scope: 'all', count: 10, difficulty: 'easy', showJersey: false, holdOnCorrect: false };

function load(): Prefs {
  try {
    // migra la vecchia chiave dell'ambito
    const legacyScope = localStorage.getItem('nba-quiz-scope') as Scope | null;
    return { ...DEFAULTS, ...(legacyScope ? { scope: legacyScope } : {}), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

let prefs = load();
const listeners = new Set<() => void>();

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs = { ...prefs, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // storage bloccato: la preferenza vale solo per questa sessione
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}
