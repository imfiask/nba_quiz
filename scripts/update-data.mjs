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

  const players = [];
  for (const team of teams) {
    const roster = await getJson(`${BASE}/teams/${team.id}/roster`);
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
      });
    }
    console.log(`${team.abbr.padEnd(5)} ${roster.athletes.length} giocatori`);
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
