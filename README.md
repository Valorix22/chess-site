# Gambit / Aura Chess

Il frontend vanilla Gambit usa il backend FastAPI già presente su **homeserver**, con account e partite persistenti, Stockfish 19, cookie di sessione e aggiornamenti SSE. Nessun bundler, CDN o motore simulato nelle partite online. La home pubblica è marketing; le altre funzioni richiedono l’accesso.

Suoni MP3 e pezzi SVG dell’app precedente sono conservati byte per byte. I font sono locali. `/classic/` mantiene l’interfaccia precedente. Email e Watch sono **disattivati e nascosti**: non occorre configurare servizi esterni per giocare.

## Avvio locale

Su Linux x86_64, Python3.12:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
python backend/scripts/prepare_vendor.py
export DATA_DIR="$PWD/.local-data"
export GAMBIT_FRONTEND_DIR="$PWD"
export COOKIE_SECURE=0
export STOCKFISH_PATH="$PWD/backend/vendor/stockfish"
cd backend
uvicorn server:app --host 127.0.0.1 --port 8000 --workers 1 --no-proxy-headers
```

In un altro terminale, con lo stesso `DATA_DIR`, eseguire `python backend/scripts/create_owner.py`: chiede nome e password senza stamparli. Aprire `http://127.0.0.1:8000`. Non aprire direttamente gli HTML e non usare un server statico: le API e i controlli di accesso sono necessari.

`prepare_vendor.py` verifica l’archivio ufficiale Stockfish 19, lo stesso binario SSE4.1/POPCNT del server e tutti i 70 file Syzygy del manifest. I binari e le tablebase sono esclusi da Git. Il download completo del motore è circa 81 MB, le tablebase circa 4,3 MB. Non sostituisce le librerie Python o i parametri di analisi.

## Docker e sito pubblico

```bash
python3 backend/scripts/prepare_vendor.py
docker compose -p scacchi build
docker compose -p scacchi up -d
docker compose -p scacchi exec scacchi python scripts/create_owner.py
```

L’ultimo comando serve solo alla prima installazione. **Su homeserver usare il progetto Compose esistente `scacchi` e il volume esistente `scacchi_chess-data`**: un nome diverso crea un database vuoto. Prima di aggiornare effettuare un backup SQLite coerente e conservare l’immagine precedente. Non usare `down -v`.

Compose conserva: origine `127.0.0.1:8095`,2 CPU,1536MiB,128PID, utente10001, filesystem readonly, tmpfs limitato, capability eliminate e `no-new-privileges`. Cloudflare Tunnel continua a terminare su quella stessa origine; il dominio e le regole SSH/VPN non vengono modificati. In produzione `COOKIE_SECURE=1`, `PUBLIC_URL=https://chess.aura-server.org`; usare HTTPS per l’accesso. Non impostare Uvicorn con più worker: lock, SSE, code bot/analisi sono intenzionalmente in un processo.

## Account e permessi

Username/password, registrazione aperta salvo impostazione del proprietario. I vecchi account e le password restano validi; password nuove di almeno12 caratteri. Cookie `HttpOnly`, `Secure`, `SameSite=Strict`; nessun token in localStorage. Il proprietario e gli amministratori hanno una pagina `/admin.html` protetta anche dal server.

Gli utenti si trovano tramite codice amico, non tramite un elenco pubblico. Ricerca di persone e classifiche restano limitate a sé e agli amici. Iscriversi a un evento consente gli abbinamenti con gli altri partecipanti. I club hanno ruoli propri, distinti dal ruolo amministrativo del sito. Vedi [permessi](docs/admin-permissions.md).

## Funzioni collegate

- Partite bot 200–3190, sfide con popup, matchmaking ranked/unranked, clock server, Elo atomico, ripresa, storico mosse, frecce, materiale, animazioni e premosse multiple annullabili con clic destro. Sotto1320la difficoltà è approssimata con il metodo già presente nel backend.
- Review su richiesta: classificazione mosse, accuratezza, apertura, variante e spiegazione della migliore. Motori bot e review separati, cache persistente, Syzygy locale, budget e quote precedenti invariati. Aiuti e annullamenti sono riservati al computer; nessuna valutazione delle partite umane in corso.
- Puzzle con soluzioni sul server, rating assegnato una sola volta per puzzle, streak UTC, hint, preferiti API, set personali, rush e battle fra amici. Le sessioni competitive usano scadenze e risultati del server e non modificano il rating di allenamento.
- Corsi e lezioni pubblicati dagli amministratori, progressi, note personali, libreria delle aperture locale. I contenuti iniziali sono esercizi e lezioni reali, senza utenti o risultati dimostrativi.
- Chat persistenti private/partita/club/community; blocchi, segnalazioni, notifiche; club pubblici o con approvazione; forum con ownership e voti unici.
- Tornei Swiss semplificato, arena, squadre basate sui club e puzzle; iscrizioni, abbinamenti, risultati da partite effettive, classifiche e calendario `.ics`. Nessuna certificazione FIDE o premio simulato.
- Admin: account, disabilitazione, password temporanee con cambio obbligatorio, revoca sessioni, ruoli, sanzioni, pubblicazione contenuti, segnalazioni, registro, notifiche e feature flag. Il ricalcolo Elo dopo annullamento di un risultato richiede proprietario, password e conferma ID.

Non sono attivati OAuth,2FA o cancellazioni distruttive di account: non erano previsti dal backend originale. SMTP e streaming rimangono nel codice dietro capability e flag; configurarli richiede prima completare/verificare i flussi del provider. Il frontend non mostra successi fittizi o numeri di spettatori. Avatar basati sulle iniziali; nessun upload di file arbitrari sul server.

## Migrazioni e dati

`backend/migrations/001_gambit.up.sql` aggiunge tabelle e indici senza cambiare utenti, partite o ledger precedenti. Viene eseguita idempotentemente all’avvio. La migrazione down elimina soltanto lo schema aggiuntivo: contiene dati reali nuovi, quindi per un rollback dell’interfaccia è preferibile usare l’immagine precedente lasciando le tabelle additive, oppure `/classic/`. Non eseguire la down sul sito attivo.

Il seed editoriale `backend/seeds/training.json` pubblica sei esercizi e tre lezioni con un corso quando è presente un proprietario; `GAMBIT_SEED_STARTER=0` lo disabilita. È idempotente e non sovrascrive i contenuti modificati. I seed di utenti/partite appartengono esclusivamente ai test temporanei.

Solo preferenze UI validate possono migrare una volta da localStorage. Identità, Elo, messaggi e iscrizioni della demo vengono scartati; dati competitivi e soluzioni non vengono migrati dal browser.

## Test

```bash
cd backend
python -m unittest discover -s tests -v
```

Ogni suite usa un database temporaneo. Non eseguire i test con un `DATA_DIR` di produzione. Gli E2E Chromium sono in `tests/browser/`; richiedono Node, Playwright e un’istanza QA isolata. Vedi [verifica](docs/verification.md), [mapping API](docs/api-mapping.md) e [piano](docs/backend-integration-plan.md).

## Risoluzione problemi

- 401: sessione scaduta; accedere di nuovo.403con cambio password richiesto: completare il cambio prima delle altre azioni.403admin: nessun accesso amministrativo per quell’account.
- 429: rispettare il limite e `Retry-After`. Le quote restano operative anche nell’ambiente di test.
- Board ferma o banner di riconnessione: verificare `/api/health`, SSE `/api/events` e il tunnel. La riconnessione recupera lo stato server.
- 404Watch/email: previsto finché mancano provider e flag. Nessuna chiave va inserita negli asset frontend.
- Analisi: il registro e lo stato della coda distinguono attesa, esecuzione, errore e completamento. Non aumentare Threads, Hash o MultiPV senza misurare la concorrenza entro il budget del container.

## Licenze

Backend e integrazione GPLv3 o successiva; Stockfish GPLv3, sorgenti corrispondenti [sf_19](https://github.com/official-stockfish/Stockfish/releases/tag/sf_19). Pezzi Cburnett GPLv2 o successiva; chess.js BSD-2-Clause; aperture Lichess CC0; font Inter/Sora/Instrument Serif SIL OFL. Fonti e licenze sono accanto agli asset. I campioni audio di terzi conservano le attribuzioni originali e restano separati dalla licenza del codice.

Per gli E2E usare un container QA separato (database tmpfs, nome `scacchi-gambit-qa`, porta locale8096). Non puntare i test al sito reale. Con Chromium in `/usr/bin/chromium`:

```bash
npm --prefix tests/browser install
GAMBIT_E2E=1 npm --prefix tests/browser test
```

L’account `GambitOwner` dei test viene creato soltanto su un database QA privo di proprietario, leggendo il token dal container senza stamparlo. Non è un account installato sul sito reale.
