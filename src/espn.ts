import { useEffect, useState } from 'react';
import { season as dataSeason, teamById } from './data';

// Dati "live" letti dal browser direttamente da ESPN (le API rispondono con CORS aperto):
// statistiche dei giocatori e classifica sono sempre aggiornate, senza ripubblicare il sito.

const STATS_URL = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes';
const STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';

/** Dopo quanto rileggere i dati (le partite finiscono di sera, non serve di più). */
const MAX_AGE_MS = 10 * 60 * 1000;

const cache = new Map<string, { at: number; data: Promise<unknown> }>();

function cachedJson<T>(url: string, parse: (json: any) => T): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < MAX_AGE_MS) return hit.data as Promise<T>;
  const data = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`ESPN ha risposto ${res.status}`);
      return res.json();
    })
    .then(parse);
  // se fallisce, al prossimo tentativo si riprova invece di tenere l'errore in cache
  data.catch(() => cache.delete(url));
  cache.set(url, { at: Date.now(), data });
  return data;
}

/** Stato di una richiesta per i componenti: in caricamento, errore o dati. */
export type Loadable<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: T };

function useLoadable<T>(key: string, load: () => Promise<T>): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    load().then(
      (data) => alive && setState({ status: 'ok', data }),
      (err: Error) => alive && setState({ status: 'error', message: err.message }),
    );
    return () => {
      alive = false;
    };
  }, [key]);
  return state;
}

// ---------- statistiche giocatore ----------

export interface SeasonStats {
  /** Anno di fine stagione, es. 2027 per il 2026-27. */
  year: number;
  label: string;
  teamId: string | null;
  games: number;
  starts: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgPct: number;
  threePct: number;
  ftPct: number;
}

/** Medie a partita della stagione regolare, una riga per stagione (e per squadra, se è stato scambiato). */
export function fetchPlayerStats(playerId: string): Promise<SeasonStats[]> {
  return cachedJson(`${STATS_URL}/${playerId}/stats`, (json) => {
    const averages = (json.categories ?? []).find((c: any) => c.name === 'averages');
    if (!averages) return [];
    const names: string[] = averages.names;
    const value = (stats: string[], name: string) => Number(stats[names.indexOf(name)]) || 0;
    return (averages.statistics ?? []).map(
      (row: any): SeasonStats => ({
        year: row.season.year,
        label: row.season.displayName,
        teamId: row.teamId ?? null,
        games: value(row.stats, 'gamesPlayed'),
        starts: value(row.stats, 'gamesStarted'),
        minutes: value(row.stats, 'avgMinutes'),
        points: value(row.stats, 'avgPoints'),
        rebounds: value(row.stats, 'avgRebounds'),
        assists: value(row.stats, 'avgAssists'),
        steals: value(row.stats, 'avgSteals'),
        blocks: value(row.stats, 'avgBlocks'),
        turnovers: value(row.stats, 'avgTurnovers'),
        fgPct: value(row.stats, 'fieldGoalPct'),
        threePct: value(row.stats, 'threePointFieldGoalPct'),
        ftPct: value(row.stats, 'freeThrowPct'),
      }),
    );
  });
}

export const usePlayerStats = (playerId: string) => useLoadable(`stats:${playerId}`, () => fetchPlayerStats(playerId));

/** Anno di fine della stagione in corso, dai dati del roster (es. "2026-27" → 2027). */
export const currentSeasonYear = Number(dataSeason.slice(0, 4)) + 1;

export interface Tier {
  label: string;
  icon: string;
  /** 0 = il livello più alto */
  rank: number;
}

/** Livelli, dal più alto: soglie su punti + 1.2 × rimbalzi + 1.5 × assist a partita. */
const TIERS: (Tier & { min: number })[] = [
  { min: 45, label: 'Superstar', icon: '👑', rank: 0 },
  { min: 32, label: 'Da All-Star', icon: '⭐', rank: 1 },
  { min: 22, label: 'Titolare di qualità', icon: '💪', rank: 2 },
  { min: 12, label: 'Uomo di rotazione', icon: '🔄', rank: 3 },
  { min: 0, label: 'Fondo panchina', icon: '🪑', rank: 4 },
];

/** Sotto queste partite la stagione in corso conta poco: si guarda anche la precedente. */
const MIN_GAMES = 8;

/**
 * Valutazione indicativa del livello del giocatore. Usa la stagione in corso se ha giocato
 * abbastanza, altrimenti la precedente. Restituisce anche la stagione usata.
 */
export function tierOf(seasons: SeasonStats[]): { tier: Tier; basedOn: SeasonStats; score: number } | null {
  const merged = (year: number) => mergeSeason(seasons.filter((s) => s.year === year));
  const current = merged(currentSeasonYear);
  const previous = merged(currentSeasonYear - 1);
  const basedOn = current && current.games >= MIN_GAMES ? current : (previous ?? current);
  if (!basedOn || basedOn.games === 0) return null;
  const score = basedOn.points + 1.2 * basedOn.rebounds + 1.5 * basedOn.assists;
  const tier = TIERS.find((t) => score >= t.min)!;
  return { tier, basedOn, score };
}

/** Se in una stagione ha giocato per più squadre, unisce le righe pesando le medie sulle partite. */
export function mergeSeason(rows: SeasonStats[]): SeasonStats | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  const games = rows.reduce((sum, r) => sum + r.games, 0) || 1;
  const avg = (key: keyof SeasonStats) => rows.reduce((sum, r) => sum + (r[key] as number) * r.games, 0) / games;
  return {
    ...rows[rows.length - 1],
    games,
    starts: rows.reduce((sum, r) => sum + r.starts, 0),
    minutes: avg('minutes'),
    points: avg('points'),
    rebounds: avg('rebounds'),
    assists: avg('assists'),
    steals: avg('steals'),
    blocks: avg('blocks'),
    turnovers: avg('turnovers'),
    fgPct: avg('fgPct'),
    threePct: avg('threePct'),
    ftPct: avg('ftPct'),
  };
}

// ---------- classifica ----------

export interface StandingRow {
  teamId: string;
  seed: number;
  wins: number;
  losses: number;
  winPct: number;
  gamesBehind: string;
  streak: string;
  lastTen: string;
  home: string;
  road: string;
  pointDiff: number;
}

export interface Standings {
  season: string;
  East: StandingRow[];
  West: StandingRow[];
}

export function fetchStandings(): Promise<Standings> {
  return cachedJson(STANDINGS_URL, (json) => {
    const out: Standings = { season: '', East: [], West: [] };
    for (const child of json.children ?? []) {
      const conference = child.abbreviation === 'East' ? 'East' : 'West';
      out.season = child.standings?.seasonDisplayName ?? out.season;
      out[conference] = (child.standings?.entries ?? [])
        .map((e: any): StandingRow => {
          // i record (casa, trasferta, ultime 10) hanno come nome l'etichetta stessa
          const stat = (name: string) => e.stats.find((s: any) => s.name === name || s.displayName === name);
          const num = (name: string) => Number(stat(name)?.value ?? 0);
          const text = (name: string) => stat(name)?.displayValue ?? '-';
          return {
            teamId: String(e.team.id),
            seed: num('playoffSeed'),
            wins: num('wins'),
            losses: num('losses'),
            winPct: num('winPercent'),
            gamesBehind: text('gamesBehind'),
            streak: text('streak'),
            lastTen: text('Last Ten Games'),
            home: text('Home'),
            road: text('Road'),
            pointDiff: num('differential'),
          };
        })
        // solo squadre che conosciamo, ordinate per posizione
        .filter((r: StandingRow) => teamById.has(r.teamId))
        .sort((a: StandingRow, b: StandingRow) => a.seed - b.seed);
    }
    return out;
  });
}

export const useStandings = () => useLoadable('standings', fetchStandings);

// ---------- medie di tutta la lega (per "Chi è più forte?") ----------

const LEAGUE_STATS_URL = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete';

export interface LeagueLine {
  games: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
}

/** Medie a partita di tutti i giocatori della stagione in corso, in una sola richiesta. */
export function fetchLeagueAverages(): Promise<Map<string, LeagueLine>> {
  return cachedJson(`${LEAGUE_STATS_URL}?isqualified=false&limit=1000&season=${currentSeasonYear}&seasontype=2`, (json) => {
    const names = (category: string): string[] => json.categories.find((c: any) => c.name === category)?.names ?? [];
    const general = names('general');
    const offensive = names('offensive');
    const out = new Map<string, LeagueLine>();
    for (const a of json.athletes ?? []) {
      const values = (category: string) => a.categories.find((c: any) => c.name === category)?.values ?? [];
      const g = values('general');
      const o = values('offensive');
      out.set(String(a.athlete.id), {
        games: g[general.indexOf('gamesPlayed')] ?? 0,
        minutes: g[general.indexOf('avgMinutes')] ?? 0,
        rebounds: g[general.indexOf('avgRebounds')] ?? 0,
        points: o[offensive.indexOf('avgPoints')] ?? 0,
        assists: o[offensive.indexOf('avgAssists')] ?? 0,
      });
    }
    return out;
  });
}

// ---------- le partite dell'ultima notte ----------

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';

export interface BoxLine {
  playerId: string;
  teamId: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  starter: boolean;
}

export interface NightGame {
  id: string;
  /** [ospite, casa] */
  teamIds: [string, string];
  /** Punteggio, es. "MIL 129 - 132 PHI" (ospite prima, come negli USA). */
  label: string;
  lines: BoxLine[];
}

export interface Night {
  /** Data della giornata (ora di New York), es. "21/11". */
  label: string;
  games: NightGame[];
}

/** Giorno di calendario a New York, `ago` giorni fa, come YYYYMMDD. */
function etDate(ago: number): string {
  const d = new Date(Date.now() - ago * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d).replaceAll('-', '');
}

/** Ultima giornata con partite finite (dall'Italia, la mattina, è quella della notte appena passata). */
export async function fetchLastNight(): Promise<Night | null> {
  for (let ago = 0; ago <= 5; ago++) {
    const date = etDate(ago);
    const events: any[] = await cachedJson(`${SCOREBOARD_URL}?dates=${date}`, (json) => json.events ?? []);
    const finished = events.filter((e) => e.status?.type?.completed);
    if (finished.length === 0) continue;
    const games = await Promise.all(finished.map((e) => fetchGame(e)));
    return { label: `${date.slice(6, 8)}/${date.slice(4, 6)}`, games: games.filter((g): g is NightGame => !!g) };
  }
  return null;
}

async function fetchGame(event: any): Promise<NightGame | null> {
  const competitors: any[] = event.competitions?.[0]?.competitors ?? [];
  const away = competitors.find((c) => c.homeAway === 'away');
  const home = competitors.find((c) => c.homeAway === 'home');
  if (!away || !home) return null;
  const lines = await cachedJson(`${SUMMARY_URL}?event=${event.id}`, (json) => {
    const out: BoxLine[] = [];
    for (const side of json.boxscore?.players ?? []) {
      const stats = side.statistics?.[0];
      if (!stats) continue;
      const names: string[] = stats.names;
      for (const a of stats.athletes ?? []) {
        if (a.didNotPlay || !a.stats?.length) continue;
        const value = (name: string) => Number(a.stats[names.indexOf(name)]) || 0;
        out.push({
          playerId: String(a.athlete.id),
          teamId: String(side.team.id),
          minutes: value('MIN'),
          points: value('PTS'),
          rebounds: value('REB'),
          assists: value('AST'),
          starter: !!a.starter,
        });
      }
    }
    return out;
  });
  return {
    id: String(event.id),
    teamIds: [String(away.team.id), String(home.team.id)],
    label: `${away.team.abbreviation} ${away.score} - ${home.score} ${home.team.abbreviation}`,
    lines,
  };
}
