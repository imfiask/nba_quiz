import map from './data/map.json';
import { teamById } from './data';

/** Mappa di USA e Canada già proiettata in SVG da scripts/build-map.mjs. */
export { map };

export interface City {
  city: string;
  x: number;
  y: number;
  /** Squadre della città (Los Angeles e New York ne hanno due). */
  teams: string[];
}

export const cities: City[] = map.cities;
export const cityByName = new Map(cities.map((c) => [c.city, c]));
const cityByTeam = new Map(cities.flatMap((c) => c.teams.map((id) => [id, c] as const)));
export const cityOf = (teamId: string) => cityByTeam.get(teamId)!;
/** Tutte le squadre di una città sono della stessa division. */
export const divisionOf = (c: City) => teamById.get(c.teams[0])!.division;
