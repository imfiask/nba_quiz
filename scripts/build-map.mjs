// Genera src/data/map.json: la mappa di USA e Canada già proiettata in SVG, con la posizione di ogni città NBA.
// Va rilanciato solo se una squadra cambia città (o cambia sigla su ESPN): npm run build-map
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoAlbers, geoArea, geoBounds, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { presimplify, simplify } from 'topojson-simplify';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-50m.json');
const us = require('us-atlas/states-10m.json');
// Laghi (Grandi Laghi compresi) da Natural Earth: world-atlas non li ha
const LAKES_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_lakes.geojson';
const nba = JSON.parse(readFileSync(new URL('../src/data/nba.json', import.meta.url), 'utf8'));

/** Città di ogni squadra (sigla ESPN) con la posizione del palazzetto. Stessa città = stesso punto sulla mappa. */
const CITIES = {
  ATL: ['Atlanta', 33.757, -84.396],
  BOS: ['Boston', 42.366, -71.062],
  BKN: ['New York', 40.683, -73.976],
  NY: ['New York', 40.751, -73.993],
  CHA: ['Charlotte', 35.225, -80.839],
  CHI: ['Chicago', 41.881, -87.674],
  CLE: ['Cleveland', 41.496, -81.688],
  DAL: ['Dallas', 32.79, -96.81],
  DEN: ['Denver', 39.749, -105.008],
  DET: ['Detroit', 42.341, -83.055],
  GS: ['San Francisco', 37.768, -122.388],
  HOU: ['Houston', 29.751, -95.362],
  IND: ['Indianapolis', 39.764, -86.156],
  LAC: ['Los Angeles', 33.945, -118.341],
  LAL: ['Los Angeles', 34.043, -118.267],
  MEM: ['Memphis', 35.138, -90.051],
  MIA: ['Miami', 25.781, -80.188],
  MIL: ['Milwaukee', 43.045, -87.917],
  MIN: ['Minneapolis', 44.98, -93.276],
  NO: ['New Orleans', 29.949, -90.082],
  OKC: ['Oklahoma City', 35.463, -97.515],
  ORL: ['Orlando', 28.539, -81.384],
  PHI: ['Philadelphia', 39.901, -75.172],
  PHX: ['Phoenix', 33.446, -112.071],
  POR: ['Portland', 45.532, -122.667],
  SAC: ['Sacramento', 38.58, -121.5],
  SA: ['San Antonio', 29.427, -98.438],
  TOR: ['Toronto', 43.643, -79.379],
  UTAH: ['Salt Lake City', 40.768, -111.901],
  WSH: ['Washington', 38.898, -77.021],
};

const WIDTH = 1000;
const PAD = 12;

// Solo i 48 stati contigui (niente Alaska, Hawaii, territori)
const OUTSIDE = new Set(['02', '15', '60', '66', '69', '72', '78']);
const lower48 = {
  type: 'FeatureCollection',
  features: feature(us, us.objects.states).features.filter((f) => !OUTSIDE.has(f.id)),
};

const projection = geoAlbers().fitWidth(WIDTH - 2 * PAD, lower48);
const [[, y0], [, y1]] = geoPath(projection).bounds(lower48);
const HEIGHT = Math.ceil(y1 - y0 + 2 * PAD);
projection.translate([projection.translate()[0] + PAD, projection.translate()[1] - y0 + PAD]);
projection.clipExtent([
  [0, 0],
  [WIDTH, HEIGHT],
]);
const path = geoPath(projection).digits(0);

// Semplifica i contorni: a questa scala il dettaglio del 50m e del 10m è invisibile e pesa
const simple = (topo, minWeight) => simplify(presimplify(topo), minWeight);
const w = simple(world, 5e-6);
const s = simple(us, 5e-6);

const countries = feature(w, w.objects.countries).features;
const country = (name) => countries.find((f) => f.properties.name === name);
const neighbours = { type: 'FeatureCollection', features: [country('Canada'), country('Mexico')] };

// Solo i laghi grandi nella zona della mappa; d3 vuole gli anelli in senso orario, altrimenti il poligono è "tutto il resto del mondo"
const lakesGeo = await (await fetch(LAKES_URL)).json();
const lakes = {
  type: 'FeatureCollection',
  features: lakesGeo.features
    .filter((f) => {
      const [[x0, y0], [x1, y1]] = geoBounds(f);
      return x1 > -126 && x0 < -66 && y1 > 24 && y0 < 50;
    })
    .map((f) => {
      if (geoArea(f) <= 2 * Math.PI) return f;
      const reverse = (rings) => rings.map((r) => r.slice().reverse());
      const g = f.geometry;
      const coordinates = g.type === 'Polygon' ? reverse(g.coordinates) : g.coordinates.map(reverse);
      return { ...f, geometry: { ...g, coordinates } };
    })
    // almeno ~2000 km²: Grandi Laghi, Gran Lago Salato, Okeechobee
    .filter((f) => geoArea(f) > 5e-5),
};

const teamsByAbbr = new Map(nba.teams.map((t) => [t.abbr, t]));
const cities = new Map();
for (const [abbr, [name, lat, lon]] of Object.entries(CITIES)) {
  const t = teamsByAbbr.get(abbr);
  if (!t) throw new Error(`Sigla ${abbr} non trovata in nba.json: aggiorna CITIES`);
  const [x, y] = projection([lon, lat]);
  const c = cities.get(name) ?? { city: name, x: 0, y: 0, teams: [] };
  c.teams.push(t.id);
  // più squadre nella stessa città: un solo punto, nel mezzo
  c.x += (x - c.x) / c.teams.length;
  c.y += (y - c.y) / c.teams.length;
  cities.set(name, c);
}
for (const t of nba.teams) if (!CITIES[t.abbr]) throw new Error(`Manca la città di ${t.abbr} (${t.name}) in CITIES`);

const round = (n) => Math.round(n * 10) / 10;
const out = {
  width: WIDTH,
  height: HEIGHT,
  neighbours: path(neighbours),
  usa: path(country('United States of America')),
  lakes: path(lakes),
  states: path(mesh(s, s.objects.states, (a, b) => a !== b && !OUTSIDE.has(a.id) && !OUTSIDE.has(b.id))),
  cities: [...cities.values()].map((c) => ({ ...c, x: round(c.x), y: round(c.y) })),
};
writeFileSync(new URL('../src/data/map.json', import.meta.url), JSON.stringify(out));
console.log(`map.json: ${WIDTH}x${HEIGHT}, ${out.cities.length} città, ${(JSON.stringify(out).length / 1024).toFixed(1)} KB`);
