/** Normalizza un nome per la ricerca: niente accenti, maiuscole, punteggiatura o suffissi (Jr., III…). */
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
