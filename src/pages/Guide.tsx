import { CONFERENCE_LABEL, DIVISIONS, STARTER_SLOTS, teams } from '../data';
import { Img } from '../components/Cards';

/** Dove sta ogni division, per ricordarla come "nord / centro / sud" della propria conference. */
const DIVISION_INFO: Record<string, { zone: string; meaning: string; note: string }> = {
  Atlantic: { zone: 'Nord-Est', meaning: 'Atlantica', note: 'Le città della costa atlantica, più Toronto (Canada).' },
  Central: { zone: 'Centro-Est', meaning: 'Centrale', note: 'Il Midwest, attorno ai Grandi Laghi.' },
  Southeast: { zone: 'Sud-Est', meaning: 'Sud-Est', note: 'Il sud della costa est, più Washington.' },
  Northwest: { zone: 'Nord-Ovest', meaning: 'Nord-Ovest', note: 'Nord-ovest e Montagne Rocciose; Oklahoma City e Minnesota sono più al centro.' },
  Pacific: { zone: 'Centro-Ovest (costa)', meaning: 'Pacifico', note: 'La California e la costa del Pacifico, più Phoenix.' },
  Southwest: { zone: 'Sud-Ovest', meaning: 'Sud-Ovest', note: 'Texas e sud; Memphis e New Orleans sono più a est.' },
};

const ROLES: { slot: string; number: number; english: string; description: string }[] = [
  {
    slot: 'PG',
    number: 1,
    english: 'Point Guard',
    description: 'Porta palla, chiama gli schemi e smista assist. Di solito è il più basso.',
  },
  {
    slot: 'SG',
    number: 2,
    english: 'Shooting Guard',
    description: 'Soprattutto realizzatore, spesso il miglior tiratore da fuori.',
  },
  {
    slot: 'SF',
    number: 3,
    english: 'Small Forward',
    description: 'Il ruolo più completo: tira, penetra, difende su vari avversari.',
  },
  {
    slot: 'PF',
    number: 4,
    english: 'Power Forward',
    description: 'Più fisico, gioca vicino a canestro: rimbalzi e blocchi.',
  },
  {
    slot: 'C',
    number: 5,
    english: 'Center',
    description: 'Il più alto: protegge il canestro, prende rimbalzi, gioca sotto.',
  },
];

const GENERIC: { abbr: string; english: string; italian: string; covers: string }[] = [
  { abbr: 'G', english: 'Guard', italian: 'Guardia', covers: 'PG o SG' },
  { abbr: 'F', english: 'Forward', italian: 'Ala', covers: 'SF o PF' },
  { abbr: 'C', english: 'Center', italian: 'Centro', covers: 'C' },
];

export default function Guide() {
  return (
    <div className="guide">
      <section className="panel" id="division">
        <h2>Conference e division</h2>
        <p className="muted">
          Le 30 squadre sono divise in due conference, Est e Ovest, e ognuna in 3 division da 5 squadre. Per
          ricordarle, pensa a ogni conference divisa in nord, centro e sud.
        </p>
        <table>
          <thead>
            <tr>
              <th>Division</th>
              <th>Zona</th>
              <th>Squadre</th>
            </tr>
          </thead>
          <tbody>
            {DIVISIONS.map((d) => {
              const info = DIVISION_INFO[d.name];
              return (
                <tr key={d.name}>
                  <td>
                    <b>{d.name}</b>
                    <div className="muted small">"{info.meaning}"</div>
                  </td>
                  <td>
                    <span className={`zone-pill ${d.conference === 'East' ? 'east' : 'west'}`}>{info.zone}</span>
                    <div className="muted small">Conference {CONFERENCE_LABEL[d.conference]}</div>
                  </td>
                  <td>
                    <div className="division-teams">
                      {teams
                        .filter((t) => t.division === d.name)
                        .map((t) => (
                          <span key={t.id} className="division-team" title={t.name}>
                            <Img src={t.logo} kind="logo" /> {t.name}
                          </span>
                        ))}
                    </div>
                    <div className="muted small">{info.note}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small">
          Nel quiz "Scontro": due squadre della stessa division → quella division; stessa conference ma division
          diverse → Est o Ovest; conference diverse → possibili NBA Finals.
        </p>
      </section>

      <section className="panel" id="ruoli">
        <h2>I 5 ruoli del basket</h2>
        <p className="muted">
          Si indicano con sigle inglesi o con un numero da 1 a 5. Sono i ruoli del quintetto base che vedi in Studia.
        </p>
        <table>
          <thead>
            <tr>
              <th>Sigla</th>
              <th>Inglese</th>
              <th>Italiano</th>
              <th>In breve</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r.slot}>
                <td>
                  <span className="slot-pill">{r.slot}</span> <span className="muted">({r.number})</span>
                </td>
                <td>{r.english}</td>
                <td>{STARTER_SLOTS[r.slot]}</td>
                <td>{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Ruoli generici: G, F, C</h2>
        <p className="muted">
          Nel quiz "Ruolo" ogni giocatore ha solo un ruolo generico, quello assegnato da ESPN.
        </p>
        <table>
          <thead>
            <tr>
              <th>Sigla</th>
              <th>Inglese</th>
              <th>Italiano</th>
              <th>Comprende</th>
            </tr>
          </thead>
          <tbody>
            {GENERIC.map((g) => (
              <tr key={g.abbr}>
                <td>
                  <span className="slot-pill">{g.abbr}</span>
                </td>
                <td>{g.english}</td>
                <td>{g.italian}</td>
                <td>{g.covers}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          Nel basket di oggi i ruoli sono molto fluidi: ali che giocano da guardia, centri che tirano da tre. Prendi le
          sigle come un'indicazione di massima.
        </p>
      </section>
    </div>
  );
}
