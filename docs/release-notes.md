# Rilascio Gambit — 22 ottobre 2026

Pubblicato su https://chess.aura-server.org/ usando il backend e il volume precedenti. La nuova interfaccia conserva i pezzi SVG e i campioni audio originali; `/classic/` offre l’interfaccia precedente. Account, password, ruoli, codici amico e storico non sono stati ricreati.

## Verifiche concluse

- 51 test Python passati, inclusi39 di regressione e12 per l’integrazione; controlli su tutte le API amministrative native e nuove con account normale.
- Percorso Chromium fra due giocatori: amicizia, chat, inviti ranked, mosse, premosse, frecce, storico, Elo, review e variante, bot 200, suggerimento privato, puzzle/set, lezioni/note/aperture, forum e pannelli admin.
- 32 viste QA:8 pagine alle larghezze390/768/1024/1440, nessun overflow orizzontale o errore JavaScript. Verifica pubblica aggiuntiva della home su 390/1440e della pagina di accesso.
- Migrazione sulla copia del database:10 tabelle native identiche prima/dopo. Sul volume reale dopo il rilascio:4 account e61 partite, credenziali/ruoli/codici conservati, stessi ID e storico mosse preservato. Integrità SQLite `ok`.
- 35 file protetti invariati;30 asset pubblici verificati anche via HTTPS. Nessun cambiamento a `security.py`, `review.py`, `bot_levels.py`, dipendenze o Compose.
- Container healthy, volume identico e confronto runtime positivo di CPU/RAM/PID, filesystem readonly, tmpfs, capability, `no-new-privileges`, log e binding loopback.
- Email, Watch, OAuth e 2FA non attivi e non mostrati. Le route inattive rispondono404. Nessun utente dimostrativo è stato creato in produzione.

## Stockfish

L’analisi rimane su richiesta, dopo le partite umane. Su2 CPU preanalizzare tutte le partite sposta il costo prima della richiesta e aumenta il lavoro totale quando una partita non verrà rivista. Non è stata aggiunta una terza istanza o `Ponder`. Restano:1 thread/128 MiBper motore, MultiPV 1, forza piena/NNUE/WDL in review,60.000nodi/0,30s rapida e300.000/1,20s approfondita, raffinamenti precedenti, cache persistente e Syzygy 3–4 pezzi. Gli aiuti contro i bot usano la stessa coda review e quote dedicate, senza mostrare valutazioni nelle partite umane.

Riferimenti: [Stockfish, impostazioni ottimali](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html#optimal-settings), [protocollo UCI e Ponder](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html), [python-chess engine](https://python-chess.readthedocs.io/en/latest/engine.html).

## Servizi e limiti dichiarati

Nessun provider SMTP o streaming è configurato. I moduli sono conservati nel codice e richiedono completamento/configurazione e collaudo del provider prima dell’attivazione. Ruoli del sito nativi user/admin/owner; nessun moderatore separato. Ricerca persone e classifiche limitate agli amici per mantenere la privacy richiesta. Tornei Swiss semplificati, non certificati FIDE. Nessun premio, spettatore, XP o progresso inventato. Upload arbitrari e cancellazione distruttiva account non sono esposti.

## Ripristino

Backup coerente pre-rilascio nel volume: `/data/pre-gambit-20261022-release.sqlite`. Immagine precedente: `scacchi-scacchi:before-gambit-20261022`; nuova immagine: `scacchi-scacchi:gambit-20261022` (anche tag `latest`).

Per ripristinare l’interfaccia e il codice precedenti mantenendo i dati successivi:

```bash
docker tag scacchi-scacchi:before-gambit-20261022 scacchi-scacchi:latest
docker compose -p scacchi up -d --no-build --pull never
```

Eseguire dalla directory del Compose corrente. Le tabelle aggiuntive possono restare: il backend precedente le ignora. Non ripristinare automaticamente un vecchio database, non applicare la migrazione down e non cancellare il volume: si perderebbero i nuovi dati. L’interfaccia classica è disponibile anche senza rollback dell’immagine.
