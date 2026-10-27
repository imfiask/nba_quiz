import { STARTER_SLOTS } from '../data';

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
