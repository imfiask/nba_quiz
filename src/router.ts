import { useEffect, useState } from 'react';

// Router minimale basato sull'hash: #/pagina?chiave=valore

export interface Route {
  page: string;
  params: URLSearchParams;
}

function parse(): Route {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { page: path || 'home', params: new URLSearchParams(query) };
}

export function navigate(page: string, params: Record<string, string | number | undefined> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const qs = q.toString();
  location.hash = `/${page}${qs ? `?${qs}` : ''}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
