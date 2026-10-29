# NBA Quiz

Quiz per imparare squadre e giocatori NBA. React + Vite + TypeScript, niente backend.

```bash
npm install
npm run dev          # http://localhost:5173
npm run update-data  # riscarica roster aggiornati (dopo trade/firme)
npm run build-map    # rigenera la mappa (solo se una squadra cambia città o sigla)
```

- Dati: `src/data/nba.json`, generato da `scripts/update-data.mjs` (API pubblica ESPN).
- Mappa: `src/data/map.json`, generata da `scripts/build-map.mjs` (contorni da us-atlas/world-atlas, laghi da Natural Earth); le città delle squadre sono in `CITIES` dentro lo script.
- Progressi: salvati nel `localStorage` del browser (pagina "Progressi" per azzerarli).
- Nuove modalità: aggiungi una voce a `MODES` in `src/quiz/modes.ts`.
