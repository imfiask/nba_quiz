# NBA Quiz

Quiz per imparare squadre e giocatori NBA. React + Vite + TypeScript, niente backend.

```bash
npm install
npm run dev          # http://localhost:5173
npm run update-data  # riscarica roster aggiornati (dopo trade/firme)
```

- Dati: `src/data/nba.json`, generato da `scripts/update-data.mjs` (API pubblica ESPN).
- Progressi: salvati nel `localStorage` del browser (pagina "Progressi" per azzerarli).
- Nuove modalità: aggiungi una voce a `MODES` in `src/quiz/modes.ts`.
