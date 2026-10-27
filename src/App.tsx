import { season } from './data';
import { useRoute } from './router';
import type { Scope } from './data';
import type { ModeId } from './quiz/modes';
import { setPref, usePrefs, type Difficulty } from './prefs';
import Home from './pages/Home';
import Quiz from './pages/Quiz';
import Study from './pages/Study';
import Stats from './pages/Stats';
import Guide from './pages/Guide';

const NAV = [
  { page: 'home', label: 'Gioca' },
  { page: 'study', label: 'Studia' },
  { page: 'stats', label: 'Progressi' },
  { page: 'guide', label: 'Guida' },
];

export default function App() {
  const { page, params } = useRoute();
  const prefs = usePrefs();

  let content;
  if (page === 'quiz') {
    const key = params.toString(); // rimonta il quiz se cambiano i parametri
    content = (
      <Quiz
        key={key}
        mode={params.get('mode') as ModeId}
        scope={(params.get('scope') ?? 'all') as Scope}
        count={Number(params.get('n') ?? 10)}
        difficulty={(params.get('d') ?? 'easy') as Difficulty}
        reviewOnly={params.get('review') === '1'}
      />
    );
  } else if (page === 'study') {
    content = <Study teamId={params.get('team') ?? undefined} />;
  } else if (page === 'stats') {
    content = <Stats />;
  } else if (page === 'guide') {
    content = <Guide />;
  } else {
    content = <Home initialScope={(params.get('scope') ?? undefined) as Scope | undefined} />;
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/">
          🏀 NBA Quiz <span className="season">{season}</span>
        </a>
        <nav>
          {NAV.map((n) => (
            <a key={n.page} href={`#/${n.page}`} className={page === n.page || (page === 'quiz' && n.page === 'home') ? 'active' : ''}>
              {n.label}
            </a>
          ))}
          <button
            className={`toggle ${prefs.showJersey ? 'on' : ''}`}
            title="Mostra il numero di maglia accanto ai nomi dei giocatori"
            onClick={() => setPref('showJersey', !prefs.showJersey)}
          >
            # Numeri {prefs.showJersey ? 'ON' : 'OFF'}
          </button>
        </nav>
      </header>
      <main>{content}</main>
    </>
  );
}
