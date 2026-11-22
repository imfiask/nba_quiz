// Scarica squadre e roster NBA attuali dall'API pubblica di ESPN
// e li salva in src/data/nba.json. Uso: npm run update-data
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// ESPN non espone conference/division nell'elenco squadre: le fissiamo qui.
const DIVISIONS = {
  Atlantic: ['BOS', 'BKN', 'NY', 'PHI', 'TOR'],
  Central: ['CHI', 'CLE', 'DET', 'IND', 'MIL'],
  Southeast: ['ATL', 'CHA', 'MIA', 'ORL', 'WSH'],
  Northwest: ['DEN', 'MIN', 'OKC', 'POR', 'UTAH'],
  Pacific: ['GS', 'LAC', 'LAL', 'PHX', 'SAC'],
  Southwest: ['DAL', 'HOU', 'MEM', 'NO', 'SA'],
};
const EAST = new Set(['Atlantic', 'Central', 'Southeast']);

const divisionOf = (abbr) =>
  Object.keys(DIVISIONS).find((d) => DIVISIONS[d].includes(abbr));

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// Quintetto base dal depth chart ESPN: il primo di ogni ruolo (senza ripetere giocatori).
const STARTER_SLOTS = ['pg', 'sg', 'sf', 'pf', 'c'];

async function getStarters(teamId) {
  try {
    const depth = await getJson(`${BASE}/teams/${teamId}/depthcharts`);
    const positions = depth.depthchart?.[0]?.positions ?? {};
    const starters = new Map();
    for (const slot of STARTER_SLOTS) {
      const first = positions[slot]?.athletes?.find((a) => !starters.has(a.id));
      if (first) starters.set(first.id, slot.toUpperCase());
    }
    return starters;
  } catch (err) {
    console.warn(`  depth chart non disponibile per la squadra ${teamId}: ${err.message}`);
    return new Map();
  }
}

// ---------- chi gioca davvero ----------
// Per non far studiare il "terzo portiere": ogni giocatore riceve un punteggio di importanza
// (minuti a partita pesati sulle partite giocate) e i primi della sua squadra sono "da sapere".

const STATS_URL = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete';
/** Quanti giocatori per squadra contano come rotazione (in NBA di solito si gioca in 8-10). */
const ROTATION_SIZE = 9;
/** Sotto questi minuti "pesati" non si è in rotazione, anche se si è tra i primi 9. */
const MIN_ROTATION_MINUTES = 10;

/** Minuti a partita e partite giocate di tutta la lega in una stagione (anno di fine, es. 2027). */
async function getSeasonMinutes(year) {
  try {
    const json = await getJson(`${STATS_URL}?isqualified=false&limit=1000&season=${year}&seasontype=2`);
    const general = json.categories.find((c) => c.name === 'general').names;
    const out = new Map();
    for (const a of json.athletes) {
      const values = a.categories.find((c) => c.name === 'general').values;
      out.set(a.athlete.id, {
        games: values[general.indexOf('gamesPlayed')] ?? 0,
        minutes: values[general.indexOf('avgMinutes')] ?? 0,
        teamId: a.athlete.teamId ?? null,
      });
    }
    return out;
  } catch (err) {
    console.warn(`  statistiche ${year} non disponibili: ${err.message}`);
    return new Map();
  }
}

/**
 * Importanza = minuti a partita × quota di partite giocate. Conta la stagione in corso, ma
 * a inizio anno (poche partite) o per chi è infortunato pesa anche la stagione scorsa:
 * così una stella ferma ai box resta "da sapere".
 */
function importanceOf(id, current, previous, teamGames) {
  const cur = current.get(id);
  const prev = previous.get(id);
  const curScore = cur && teamGames ? cur.minutes * Math.min(1, cur.games / teamGames) : 0;
  const prevScore = prev ? prev.minutes * Math.min(1, prev.games / 82) : 0;
  // con poche partite giocate dalla squadra la stagione in corso conta meno
  const weight = Math.min(1, teamGames / 20);
  return Math.max(curScore * weight + prevScore * (1 - weight), prevScore * 0.8, curScore);
}

const inchesToCm = (inches) => (inches ? Math.round(inches * 2.54) : null);
const lbsToKg = (lbs) => (lbs ? Math.round(lbs * 0.4536) : null);

async function main() {
  const list = await getJson(`${BASE}/teams`);
  const league = list.sports[0].leagues[0];

  const teams = league.teams.map(({ team: t }) => {
    const division = divisionOf(t.abbreviation);
    if (!division) throw new Error(`Divisione sconosciuta per ${t.abbreviation}`);
    return {
      id: t.id,
      abbr: t.abbreviation,
      name: t.displayName,
      location: t.location,
      nickname: t.name,
      color: `#${t.color}`,
      altColor: `#${t.alternateColor}`,
      logo: t.logos?.[0]?.href ?? null,
      conference: EAST.has(division) ? 'East' : 'West',
      division,
    };
  });

  const seasonYear = Number(league.season?.year) || new Date().getFullYear();
  const [current, previous] = await Promise.all([getSeasonMinutes(seasonYear), getSeasonMinutes(seasonYear - 1)]);

  const players = [];
  for (const team of teams) {
    const roster = await getJson(`${BASE}/teams/${team.id}/roster`);
    const starters = await getStarters(team.id);
    for (const a of roster.athletes) {
      players.push({
        id: a.id,
        name: a.displayName,
        firstName: a.firstName,
        lastName: a.lastName,
        teamId: team.id,
        jersey: a.jersey ?? null,
        position: a.position?.abbreviation ?? null,
        positionName: a.position?.displayName ?? null,
        heightCm: inchesToCm(a.height),
        weightKg: lbsToKg(a.weight),
        age: a.age ?? null,
        experience: a.experience?.years ?? null,
        college: a.college?.name ?? null,
        country: a.birthPlace?.country ?? null,
        headshot: a.headshot?.href ?? null,
        starter: starters.get(a.id) ?? null,
      });
    }

    // rotazione: titolari + i primi per importanza, fino a ROTATION_SIZE
    const teamPlayers = players.filter((p) => p.teamId === team.id);
    const teamGames = Math.max(0, ...teamPlayers.map((p) => current.get(p.id)?.games ?? 0));
    for (const p of teamPlayers) p.minutes = Math.round(importanceOf(p.id, current, previous, teamGames) * 10) / 10;
    const ranked = teamPlayers.slice().sort((x, y) => y.minutes - x.minutes);
    ranked.forEach((p, i) => {
      p.rotation = !!p.starter || (i < ROTATION_SIZE && p.minutes >= MIN_ROTATION_MINUTES);
    });
    const rotation = teamPlayers.filter((p) => p.rotation).length;
    console.log(`${team.abbr.padEnd(5)} ${roster.athletes.length} giocatori, ${starters.size} titolari, ${rotation} in rotazione`);
  }

  const data = {
    season: league.season?.displayName ?? null,
    updatedAt: new Date().toISOString(),
    teams,
    players,
  };
  await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../src/data/nba.json', import.meta.url),
    JSON.stringify(data, null, 2),
  );
  console.log(`\nSalvati ${teams.length} squadre e ${players.length} giocatori (stagione ${data.season}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
