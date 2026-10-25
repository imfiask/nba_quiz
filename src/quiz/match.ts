import type { Player } from '../data';

/** exact = scritto giusto, close = giusto con un piccolo refuso, wrong = sbagliato */
export type MatchResult = 'exact' | 'close' | 'wrong';

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accenti: Dončić -> Doncic
    .toLowerCase()
    .replace(/[.'’\-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Accetta il nome completo o il solo cognome, tollerando 1-2 errori di battitura. */
export function matchName(input: string, p: Player): MatchResult {
  const guess = normalize(input);
  if (!guess) return 'wrong';
  const targets = [p.name, p.lastName, `${p.firstName} ${p.lastName}`].map(normalize);
  if (targets.includes(guess)) return 'exact';
  const tolerance = (t: string) => (t.length <= 4 ? 0 : t.length <= 7 ? 1 : 2);
  return targets.some((t) => levenshtein(guess, t) <= tolerance(t)) ? 'close' : 'wrong';
}
