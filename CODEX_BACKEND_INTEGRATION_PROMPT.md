# PROMPT PER CODEX — Integrazione Gambit frontend + backend esistente

## 1. Ruolo e obiettivo

Sei Codex e devi completare l'integrazione del frontend del progetto **Gambit** con il backend già esistente. Il frontend è una demo statica completa e funzionante; il tuo compito è trasformarla in un'applicazione reale, mantenendo il design, le interazioni e la qualità attuale.

Obiettivo finale: ogni dato che oggi è demo/localStorage deve passare dal backend reale, ogni azione deve essere autorizzata lato server, e deve esistere un pannello amministrativo completo e protetto.

Non riscrivere il frontend da zero. Non eliminare funzionalità esistenti. Integra incrementalmente, con feature flag e test, senza rompere le pagine già finite.

---

## 2. Contesto del progetto

- Frontend locale: `/home/valorix22/Documents/chess site`
- Repository GitHub: `https://github.com/Valorix22/chess-site`
- Stack frontend: HTML, CSS e JavaScript vanilla, senza bundler e senza framework.
- Pagine esistenti:
  - `index.html` — dashboard/home
  - `play.html` — partita e board
  - `puzzles.html` — puzzle trainer
  - `learn.html` — corsi e lezioni
  - `watch.html` — stream, broadcast e VOD
  - `community.html` — amici, club, forum, classifiche
  - `profile.html` — profilo, rating, storico, achievement
  - `tournaments.html` — tornei e calendario
- File JS principali:
  - `assets/js/app.js` — shell globale, header/footer, modali, amici, chat, notifiche, impostazioni, auth demo
  - `assets/js/engine.js` — motore scacchistico completo
  - `assets/js/board.js` — board interattiva riutilizzabile
  - `assets/js/data.js` — dati demo
  - `assets/js/home.js`, `play.js`, `puzzles.js`, `learn.js`, `watch.js`, `community.js`, `profile.js`, `tournaments.js`
- Il frontend usa attualmente `localStorage` per profilo, impostazioni, chat, amici, progressi puzzle, tornei e iscrizioni.
- Il backend esiste già. Prima di scrivere codice Devi individuarne:
  - percorso/repository
  - stack e versione
  - URL API e WebSocket/SSE
  - OpenAPI/Swagger o documentazione
  - schema database e migrazioni
  - sistema di autenticazione e ruoli
  - convenzioni di errori, paginazione, validazione e logging
  - comandi di avvio e test

Se il backend non è presente nella workspace o non riesci a determinarlo con certezza, **fermati e chiedi il percorso, l'URL e le credenziali di test**. Non inventare un backend parallelo e non creare mock spacciandoli per integrazione reale.

---

## 3. Regole non negoziabili

1. **Non riscrivere il frontend in React/Vue/Angular** e non introdurre un bundler senza autorizzazione esplicita. Mantieni HTML/CSS/JS vanilla e compatibilità con gli script non-module esistenti.
2. **Mantieni il design attuale**: palette, spaziature, responsive, board, modali, drawer, toast e stati vuoti devono restare coerenti.
3. **Il server è l'unica fonte di verità** per utenti, rating, partite, mosse, clock, puzzle, tornei, permessi e moderazione.
4. **Non fidarti mai del client** per autorizzazioni, risultati, mosse legali, soluzioni puzzle, punteggi o ruoli. Ogni controllo deve essere ripetuto lato server.
5. **Nessun dato demo in produzione**: rimuovi o disattiva dietro flag `DEMO_MODE` i dati finti di `data.js`, l'utente Alex Morgan, le chat simulate e le iscrizioni locali.
6. **Non salvare token di lunga durata in localStorage** se il backend usa cookie httpOnly/sessioni. Segui il meccanismo di auth già esistente.
7. **Non inserire segreti, service role key o credenziali nel frontend** o in file committati.
8. **Non eliminare feature** perché manca un endpoint: aggiungi l'endpoint al backend esistente seguendo i suoi pattern, con migrazione, validazione, autorizzazione e test.
9. **Ogni modifica al database** deve avere migrazione reversibile e seed di test separati.
10. **Ogni schermata** deve gestire: loading, empty state, errore, retry, permesso negato, sessione scaduta, richiesta in corso e successo.
11. **Accessibilità**: focus visibile, navigazione da tastiera, `aria-label`, contrasto, modali con focus trap, Escape per chiudere.
12. **Responsive**: verificare almeno 390px, 768px, 1024px e 1440px.
13. **Nessun errore in console** e nessuna richiesta API duplicata non necessaria.
14. **Non fare commit di `.env`, dump, database locali, token o file temporanei**.

---

## 4. Fase 0 obbligatoria: discovery e piano

Prima di modificare il codice:

1. Esplora backend e frontend.
2. Produci un documento `docs/backend-integration-plan.md` con:
   - architettura attuale
   - elenco endpoint disponibili
   - mapping endpoint → pagina → azione UI
   - gap tra frontend e backend
   - decisioni su auth, sessioni, CORS, upload e realtime
   - rischi e ordine di implementazione
3. Produci una tabella `Feature | Backend esistente | Gap | Azione | Test`.
4. Definisci un piano di migrazione dei dati locali:
   - cosa migrare una tantum (tema, preferenze, progressi puzzle)
   - cosa scartare perché non autorevole (amici, rating, iscrizioni, chat)
   - come evitare duplicati al primo login
5. Solo dopo il piano inizia a implementare.

Se trovi un conflitto tra schema frontend e backend, adatta il frontend al backend, salvo gap funzionali reali. Documenta ogni scelta.

---

## 5. Architettura di integrazione frontend

Crea questi moduli, mantenendo lo stile vanilla:

- `assets/js/config.js`
  - configurazione runtime: `API_BASE_URL`, `WS_URL`, `APP_ENV`, `DEMO_MODE`, `FEATURE_FLAGS`.
  - nessun segreto.
- `assets/js/api.js`
  - wrapper unico per `fetch`.
  - base URL, `credentials` coerenti con il backend, header JSON, CSRF se necessario.
  - timeout/abort, retry solo per errori idempotenti, gestione 401 con refresh una sola volta.
  - normalizzazione errori: `{ status, code, message, fields, requestId }`.
  - helper `get/post/patch/put/delete` e upload.
- `assets/js/session.js`
  - utente corrente, ruoli, permessi, login/logout, refresh, eventi `auth:changed`.
  - nessun dato sensibile in localStorage se il backend usa cookie.
- `assets/js/realtime.js`
  - connessione WebSocket/SSE esistente, riconnessione con backoff, subscribe/unsubscribe, heartbeat.
  - eventi: presence, chat, notification, game, tournament, stream.
- `assets/js/permissions.js`
  - `can('admin.users.suspend')`, `isAdmin`, `isModerator`.
  - usato solo per la UI; il server resta autoritativo.
- `assets/js/format.js` opzionale per date, rating, numeri e tempo.

Regole:
- Sostituisci gradualmente `window.GAMBIT` demo con API reali.
- Mantieni un adapter temporaneo dietro `DEMO_MODE` per sviluppo offline, ma non attivarlo in produzione.
- Evita `innerHTML` con dati server non sanitizzati; usa `textContent` o l'helper `esc`.
- Preferisci paginazione e filtri server-side.
- Usa optimistic update solo dove sicuro, con rollback su errore.
- Disabilita i bottoni durante le richieste e mostra spinner/stato “In corso…”.
- Centralizza i toast di errore, senza duplicarli.

---

## 6. Autenticazione, sessioni e ruoli

### 6.1 Autenticazione utente

Implementare o collegare:

- Registrazione con email, username/handle univoco e password.
- Login con email/username.
- Logout locale e revoca sessione server.
- Refresh sessione o rotazione token.
- Recupero password via email.
- Cambio password.
- Verifica email, se prevista dal backend.
- Sessioni attive/dispositivi con revoca.
- OAuth Google/Apple solo se già supportato dal backend.
- 2FA solo se il backend lo prevede.
- Cancellazione account con conferma e grace period, se previsto.
- Gestione account sospeso/bannato: messaggio chiaro, nessun accesso alle API protette.
- Gestione sessione scaduta: redirect al login o modale, senza perdere lo stato della partita se possibile.

Rimuovi il login demo “Alex Morgan” dalla produzione. Se serve per test, mettilo dietro `DEMO_MODE` e con etichetta esplicita.

### 6.2 Ruoli

Supporta almeno:

- `user` — utente normale.
- `moderator` — moderazione contenuti e segnalazioni, senza accesso a configurazioni critiche.
- `admin` — gestione completa di utenti, contenuti, tornei, stream e impostazioni.
- `super_admin` — gestione ruoli, audit, operazioni distruttive.

Se il backend ha solo `user/admin`, mappa `admin` alle funzioni complete e documenta il gap. Non inventare ruoli se il backend non li supporta: proponi una migrazione.

### 6.3 Sicurezza auth

- Cookie: `httpOnly`, `Secure`, `SameSite` coerente con frontend/backend.
- Se frontend e backend sono su domini diversi, configura CORS con credenziali e documenta la scelta.
- CSRF token per operazioni state-changing se si usano cookie.
- Rate limiting su login, registrazione, reset password, invio richieste, chat e search.
- Non rivelare se un'email esiste.
- Blocca account sospesi lato server, non solo nascondendo la UI.
- Logout invalida la sessione server, non solo il token locale.

---

## 7. Funzioni utente normali — specifica dettagliata

### 7.1 Home / dashboard

- Saluto e dati reali dell'utente.
- Rating Rapid, Blitz, Bullet e Puzzles.
- Partite in corso con “Riprendi”.
- Daily puzzle reale con stato “già risolto”.
- Lezioni in corso e progresso.
- Stream live e prossimi eventi.
- Tornei imminenti e iscrizioni.
- Feed attività e notifiche non lette.
- Amici online con presenza reale.
- Leaderboard reale.
- Se non autenticato: home marketing con CTA login/registrazione, senza dati privati.

### 7.2 Profilo

- Profilo pubblico per handle.
- Avatar, nome, handle, paese, bandiera, bio, data iscrizione.
- Rating e statistiche reali per modalità.
- Grafico rating con periodi 30g/90g/1 anno.
- Storico partite con risultato, avversario, apertura, tempo, mosse, accuracy, variazione rating.
- Dettaglio partita con PGN, review, apertura, orologio e risultato.
- Achievement reali, con progresso e sblocco.
- Performance: accuratezza media, miglior vittima, mosse medie, repertorio.
- Amici, club, tornei e badge.
- Modifica del proprio profilo.
- Privacy: chi può vedere profilo, paese, bio, storico, amici e stato online.
- Blocca utente.
- Segnala profilo.
- Nessun utente può modificare rating, statistiche, badge o storico.

### 7.3 Amici e presenza

- Cerca utenti per nome, handle o paese.
- Invia richiesta di amicizia.
- Annulla richiesta inviata.
- Accetta/rifiuta richiesta ricevuta.
- Rimuovi amico.
- Blocca/sblocca utente.
- Silenzia notifiche di un amico.
- Lista amici con stato online/offline/in partita.
- Suggerimenti amici basati su club, partite e richieste comuni, se il backend lo permette.
- Presenza realtime.
- Chat 1:1:
  - cronologia persistente
  - messaggi in tempo reale
  - stato “letto”
  - indicatore “sta scrivendo” se supportato
  - limite caratteri
  - bloccare/segnalare
  - nessun accesso admin alle chat private, salvo contenuto esplicitamente segnalato e con audit
- Challenge diretto a un amico con tempo e colore.

### 7.4 Gioco

Modalità:

- Online rated.
- Online unrated.
- Vs computer.
- Pass-and-play locale.
- Challenge amico.
- Rematch e cambio colore.
- Spettatore di una partita pubblica.
- Ripresa partita dopo refresh/reconnect.

Funzioni partita:

- Matchmaking per time control e rating range, con cancellazione coda.
- Creazione partita e invito tramite link.
- Colori, tempo base, incremento.
- Clock autoritativo server.
- Validazione mosse lato server.
- Gestione promozione, arrocco, en passant, scacco, matto, stallo, patta per materiale/ripetizione/50 mosse.
- Resign.
- Offerta di patta, accettazione/rifiuto.
- Abort solo nei primi secondi e con regole backend.
- Timeout.
- Disconnessione e reconnect con tempo residuo corretto.
- Undo solo in locale/computer, non in rated.
- Hint solo vs computer o modalità non rated.
- Chat partita con moderazione e opzione disattivazione.
- PGN scaricabile/copiabile.
- FEN della posizione.
- Review post-partita.
- Segnalazione avversario.
- Aggiornamento rating solo a fine partita, lato server.
- Storico partite e ripresa.
- Anti-cheat/fair-play: il backend può flaggare partite; non mostrare all'utente i dettagli interni.

Realtime partita:

- evento `game:created`, `game:state`, `game:move`, `game:clock`, `game:draw-offer`, `game:ended`, `game:opponent-disconnected`, `game:rematch`.
- Riconnessione con snapshot completo e poi delta.
- Il client non deve fidarsi del proprio clock per dichiarare timeout.

### 7.5 Puzzle

- Lista puzzle con rating, tema, difficoltà e stato.
- Filtri per tema, rating, stato e tipo.
- Puzzle del giorno.
- Modalità training, rush e battle.
- Tentativi e punteggio.
- Hint progressivi con costo, se previsto.
- Soluzione mostrata solo dopo risoluzione o resa.
- Validazione della linea lato server.
- Rating puzzle e variazione.
- Streak giornaliera e calendario.
- Statistiche: risolti, accuracy, tempo medio.
- Preferiti e set personalizzati.
- Storico tentativi.
- Leaderboard puzzle.
- Nessun utente può creare/modificare puzzle pubblici senza permesso.

### 7.6 Learn

- Catalogo corsi con filtri.
- Dettaglio corso, capitoli e lezioni.
- Player lezione con board interattiva.
- Avanzamento lezione e corso.
- Riprendi dall'ultima posizione.
- Completamento lezione e corso.
- Note e bookmark personali, se previsti.
- Libreria aperture.
- Studi di finali.
- Piano di studio settimanale.
- Storico attività.
- Nessun utente può modificare corsi o lezioni.

### 7.7 Watch

- Stream live con categoria, streamer, viewer count.
- Broadcast ufficiali con board, clock, commento e stato.
- Schedule dei prossimi eventi.
- VOD con filtri.
- Ricerca stream/VOD.
- Follow streamer.
- Notifiche quando va live.
- Chat live con moderazione.
- Segnalazione messaggio/stream.
- “Go live”:
  - se l'utente non è creator approvato, mostra domanda di abilitazione o messaggio “richiedi accesso”.
  - se creator, crea stream con titolo, categoria e chiave/URL forniti dal backend.
  - l'admin può revocare l'accesso.
- Nessun utente può mettere in evidenza uno stream o creare un broadcast ufficiale.

### 7.8 Community

#### Club

- Cerca club.
- Crea club se consentito.
- Join pubblico, richiesta per club privati.
- Invita utenti.
- Lascia club.
- Ruoli club: owner, admin, member.
- Modifica descrizione, emblem, privacy e regole se owner/admin.
- Gestisci richieste e membri.
- Chat club con cronologia e moderazione.
- Eventi e tornei del club.
- Segnala club.
- Nessun utente può modificare club altrui.

#### Forum

- Categorie/tag.
- Lista thread con ricerca, filtro, ordinamento e paginazione.
- Crea thread.
- Rispondi.
- Modifica/elimina propri contenuti.
- Upvote/downvote una volta per utente.
- Sottoscrivi thread.
- Notifiche risposte.
- Segnala thread/risposta.
- Nessun utente può pinnare, bloccare o cancellare thread altrui.

#### Classifiche

- Blitz, Rapid, Bullet, Puzzle, settimanale/mensile/all-time.
- Filtri per paese, club, amici.
- Rank, rating, partite, win rate, streak.
- Link al profilo.
- Dati calcolati dal backend, mai dal client.

#### Chat community

- Canale globale/clubhouse se previsto.
- Messaggi realtime.
- Cronologia paginata.
- Moderazione e report.
- Admin può cancellare messaggi e silenziare utenti.

### 7.9 Tornei

- Lista con filtri per formato, data e stato.
- Dettaglio torneo con regole, formato, tempo, prize, partecipanti.
- Iscrizione e ritiro.
- Countdown reale.
- Pairings e round.
- Standings e tiebreak.
- Programma e export calendario `.ics`.
- Notifiche inizio turno e avversario.
- Creazione torneo se l'utente ha permesso.
- Modifica/cancellazione del proprio torneo prima dell'inizio.
- Tornei arena, Swiss, team e puzzle.
- Nessun utente può modificare risultati, pairings o standing.
- Nessun utente può iscrivere altri utenti.

### 7.10 Notifiche

- Lista notifiche con tipi: amicizia, challenge, torneo, turno, stream, forum, club, sistema.
- Conteggio non lette.
- Segna letta/segna tutte.
- Preferenze per canale e tipo.
- Notifiche realtime.
- Broadcast admin.
- Nessun utente può inviare notifiche a tutti.

### 7.11 Ricerca globale

- Ricerca giocatori, club, tornei, thread, corsi, stream e VOD.
- Debounce, min caratteri, paginazione.
- Risultati filtrabili per tipo.
- Nessuna esposizione di dati privati.

### 7.12 Impostazioni

- Tema chiaro/scuro.
- Tema board e pezzi.
- Coordinate, animazioni, suoni.
- Notifiche.
- Lingua, se supportata.
- Privacy profilo e presenza.
- Utenti bloccati.
- Sessioni/dispositivi.
- Cambio password.
- Download dati personali, se previsto.
- Cancellazione account.
- Preferenze salvate sul backend per utenti autenticati; localStorage solo per preferenze UI non sensibili.

### 7.13 Achievement e progressione

- Achievement reali con condizioni server-side.
- Notifica di sblocco.
- Badge su profilo.
- Progresso visibile.
- Nessuna modifica manuale da parte dell'utente.

---

## 8. Amministrazione — specifica dettagliata

Crea un pannello admin separato, protetto lato server, raggiungibile da route dedicata (es. `/admin.html`) o sezione role-gated. Non basta nascondere i link: ogni endpoint admin deve restituire 403 agli utenti non autorizzati.

### 8.1 Dashboard admin

- Utenti totali, nuovi oggi/settimana, attivi.
- Partite in corso, partite concluse, DAU/MAU.
- Puzzle risolti, corsi completati.
- Tornei attivi e iscrizioni.
- Stream live e viewer.
- Segnalazioni aperte per tipo.
- Errori API/WebSocket recenti, se disponibili.
- Grafici con range temporale.
- Activity feed e audit recente.

### 8.2 Gestione utenti

- Ricerca per nome, handle, email, ID, ruolo, stato.
- Filtri: attivo, sospeso, bannato, verificato, creator, admin.
- Dettaglio utente:
  - profilo pubblico
  - email e stato account
  - ruoli
  - rating e storico
  - partite recenti
  - segnalazioni
  - sessioni
  - data ultimo accesso
- Modifica dati non sensibili.
- Verifica email manuale, se previsto.
- Reset password inviando email.
- Sospensione temporanea con motivo e scadenza.
- Ban permanente con motivo.
- Unban.
- Revoca sessioni.
- Cambio ruolo, solo super_admin.
- Disattivazione creator.
- Cancellazione/anonymizzazione con conferma forte.
- Non mostrare mai password o token.
- Ogni azione su utente deve essere audit-logged.

### 8.3 Moderazione contenuti e segnalazioni

- Coda segnalazioni con priorità, stato e assegnazione.
- Tipi: profilo, chat, messaggio club, thread, risposta, stream, partita, club.
- Visualizza contesto ed evidenza.
- Azioni: ignora, avvisa, rimuovi contenuto, silenzia, sospendi, ban, escalazione.
- Note interne.
- Cronologia azioni.
-Possibilità di chiudere più segnalazioni insieme.
- Admin non può leggere chat private non segnalate; per chat segnalate mostra solo il contesto necessario e audit.

### 8.4 Partite e fair play

- Ricerca partite per ID, giocatore, data, risultato, modalità.
- Dettaglio PGN, clock, mosse, accuracy se disponibile.
- Filtro partite flaggate/sospette.
- Note interne fair play.
- Void partita e ricalcolo rating, con doppia conferma.
- Correzione risultato solo con audit e motivazione.
- Sospensione giocatore da un torneo.
- Non esporre all'utente i dettagli del sistema anti-cheat.

### 8.5 Gestione puzzle

- CRUD puzzle.
- Import da FEN/PGN.
- Validazione legalità e soluzione.
- Tag/temi.
- Rating iniziale e difficoltà.
- Pubblicazione, bozza, archiviazione.
- Scheduling daily puzzle.
- Statistiche tentativi e qualità.
- Duplica/import batch.
- Anteprima board.

### 8.6 Gestione corsi e lezioni

- CRUD corsi.
- CRUD lezioni e capitoli.
- Riordino drag & drop o campo ordine.
- Contenuti testuali, PGN/FEN, video/embed, immagini.
- Upload media con validazione tipo/dimensione.
- Pubblicazione/bozza/archiviazione.
- Anteprima lezione.
- Statistiche iscrizioni, completamento e drop-off.
- Nessuna modifica ai progressi degli utenti senza audit.

### 8.7 Gestione tornei

- CRUD tornei.
- Formati arena, Swiss, team, puzzle.
- Configurazione tempo, round, tiebreak, rating range, iscrizioni, password/inviti.
- Pubblicazione, annullamento, rinvio.
- Gestione iscritti: aggiungi/rimuovi/disqualifica.
- Avvio, pausa, ripresa, chiusura.
- Generazione pairings e correzione con audit.
- Inserimento/correzione risultati.
- Ricalcolo standings.
- Gestione premi/points.
- Export CSV.
- Broadcast notifiche ai partecipanti.

### 8.8 Gestione watch

- Approva/revoca creator.
- CRUD stream e VOD.
- Gestione broadcast ufficiali.
- Feature/unfeature in home e watch.
- Schedule e promemoria.
- Moderazione chat live.
- Termina stream.
- Gestione categorie.
- Viewer analytics.
- Gestione stream key lato server, mai nel frontend pubblico.

### 8.9 Gestione community

- CRUD club.
- Trasferisci proprietà club.
- Sciogli club con conferma.
- Gestisci membri e ruoli.
- CRUD categorie forum.
- Pin/lock/delete thread.
- Modera risposte.
- Gestisci chat globale.
- Gestisci parole vietate e impostazioni moderazione, se backend le supporta.

### 8.10 Notifiche e comunicazioni

- Invia notifica a singolo utente, segmento o tutti.
- Scegli tipo, titolo, messaggio, link e scadenza.
- Programma invio.
- Anteprima.
- Storico broadcast.
- Rate limit per evitare spam.
- Audit.

### 8.11 Impostazioni sito e feature flag

- Nome sito, descrizione, meta.
- Manutenzione on/off con messaggio.
- Registrazioni aperte/chiuse.
- Modalità demo.
- Feature flag per moduli (watch, tornei, forum, chat, OAuth).
- Limiti: club per utente, messaggi/minuto, richieste amicizia/giorno.
- Configurazione rating, time control e puzzle.
- Non inserire segreti in chiaro nel pannello; usa variabili d'ambiente server.
- Solo super_admin per impostazioni critiche.

### 8.12 Audit log

- Log immutabile per: login admin, cambio ruoli, ban, cancellazioni, modifiche contenuti, void partite, modifiche tornei, broadcast, feature flag.
- Campi: attore, azione, entità, prima/dopo, IP/user agent se consentito, timestamp, request ID.
- Ricerca e filtro.
- Export.
- Nessun admin può cancellare il log dal pannello.

### 8.13 Ruoli e permessi admin

Matrice minima:

| Azione | User | Moderator | Admin | Super Admin |
|---|---|---|---|---|
| Giocare, puzzle, lezioni | Sì | Sì | Sì | Sì |
| Modificare proprio profilo | Sì | Sì | Sì | Sì |
| Creare club/thread | Sì, secondo limiti | Sì | Sì | Sì |
| Segnalare contenuti | Sì | Sì | Sì | Sì |
| Coda segnalazioni | No | Sì | Sì | Sì |
| Rimuovere contenuti | Solo propri | Sì | Sì | Sì |
| Sospendere utenti | No | Limitato | Sì | Sì |
| Ban permanenti | No | No | Sì | Sì |
| CRUD puzzle/corsi | No | No | Sì | Sì |
| CRUD tornei ufficiali | No | No | Sì | Sì |
| Approvare creator/stream | No | No | Sì | Sì |
| Broadcast notifiche | No | No | Sì | Sì |
| Cambiare ruoli | No | No | No | Sì |
| Feature flag/impostazioni critiche | No | No | Limitato | Sì |
| Audit log | No | No | Sola lettura | Sì |
| Void partite | No | No | Sì | Sì |

Se il backend non ha moderator, non simulare il ruolo nel client: documenta il gap e proponi la migrazione.

---

## 9. Contratti API indicativi

Non imporre questi path se il backend usa convenzioni diverse. Usali come checklist e mappa quelli reali.

### Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`
- `GET /auth/sessions`
- `DELETE /auth/sessions/:id`

### Utenti e profili
- `GET /users/:handle`
- `PATCH /users/me`
- `GET /users/me/stats`
- `GET /users/:id/games`
- `GET /users/:id/rating-history`
- `GET /users/:id/achievements`
- `POST /users/:id/block`
- `DELETE /users/:id/block`
- `POST /users/:id/report`
- `GET /search?q=...`

### Amici e chat
- `GET /friends`
- `GET /friends/requests`
- `POST /friends/requests`
- `POST /friends/requests/:id/accept`
- `POST /friends/requests/:id/decline`
- `DELETE /friends/:id`
- `GET /conversations`
- `GET /conversations/:id/messages?cursor=...`
- `POST /conversations/:id/messages`
- `POST /conversations/:id/read`
- `GET /presence`

### Partite
- `POST /matchmaking`
- `DELETE /matchmaking`
- `POST /games`
- `GET /games/:id`
- `POST /games/:id/move`
- `POST /games/:id/resign`
- `POST /games/:id/draw`
- `POST /games/:id/rematch`
- `GET /games/:id/pgn`
- `GET /games/:id/review`
- `POST /games/:id/report`
- `POST /challenges`
- `GET /challenges/:token`
- `POST /challenges/:token/accept`

### Puzzle
- `GET /puzzles`
- `GET /puzzles/daily`
- `GET /puzzles/:id`
- `POST /puzzles/:id/attempts`
- `POST /puzzles/:id/hint`
- `POST /puzzles/:id/complete`
- `GET /puzzles/progress`
- `GET /puzzles/leaderboard`
- `POST /puzzles/rush`

### Learn
- `GET /courses`
- `GET /courses/:slug`
- `GET /courses/:id/lessons`
- `GET /lessons/:id`
- `POST /lessons/:id/start`
- `POST /lessons/:id/complete`
- `GET /me/learning`
- `GET /openings`
- `GET /endgames`

### Watch
- `GET /streams`
- `GET /streams/:id`
- `POST /streams/:id/follow`
- `DELETE /streams/:id/follow`
- `GET /broadcasts`
- `GET /vods`
- `POST /streams/:id/report`
- `POST /creator/apply`
- `POST /creator/streams`

### Community
- `GET /clubs`
- `POST /clubs`
- `GET /clubs/:id`
- `POST /clubs/:id/join`
- `POST /clubs/:id/leave`
- `GET /clubs/:id/members`
- `PATCH /clubs/:id`
- `GET /clubs/:id/messages`
- `POST /clubs/:id/messages`
- `GET /threads`
- `POST /threads`
- `GET /threads/:id`
- `POST /threads/:id/replies`
- `POST /threads/:id/vote`
- `POST /threads/:id/report`
- `GET /leaderboards`

### Tornei
- `GET /tournaments`
- `GET /tournaments/:id`
- `POST /tournaments/:id/register`
- `DELETE /tournaments/:id/register`
- `GET /tournaments/:id/standings`
- `GET /tournaments/:id/pairings`
- `POST /tournaments`
- `PATCH /tournaments/:id`
- `POST /tournaments/:id/start`
- `POST /tournaments/:id/cancel`
- `GET /tournaments/:id/calendar.ics`

### Notifiche e impostazioni
- `GET /notifications`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`
- `GET /settings`
- `PATCH /settings`
- `GET /me/preferences`
- `PATCH /me/preferences`

### Admin
- `GET /admin/metrics`
- `GET /admin/users`
- `GET /admin/users/:id`
- `PATCH /admin/users/:id`
- `POST /admin/users/:id/suspend`
- `POST /admin/users/:id/ban`
- `POST /admin/users/:id/unban`
- `POST /admin/users/:id/revoke-sessions`
- `PATCH /admin/users/:id/roles`
- `GET /admin/reports`
- `PATCH /admin/reports/:id`
- `POST /admin/reports/:id/action`
- `GET /admin/games`
- `POST /admin/games/:id/void`
- `GET /admin/puzzles`
- `POST /admin/puzzles`
- `PATCH /admin/puzzles/:id`
- `DELETE /admin/puzzles/:id`
- `GET /admin/courses`
- `POST /admin/courses`
- `PATCH /admin/courses/:id`
- `GET /admin/tournaments`
- `POST /admin/tournaments`
- `PATCH /admin/tournaments/:id`
- `POST /admin/tournaments/:id/start`
- `POST /admin/tournaments/:id/cancel`
- `GET /admin/streams`
- `PATCH /admin/streams/:id`
- `POST /admin/streams/:id/feature`
- `GET /admin/clubs`
- `PATCH /admin/clubs/:id`
- `GET /admin/threads`
- `PATCH /admin/threads/:id`
- `POST /admin/notifications/broadcast`
- `GET /admin/settings`
- `PATCH /admin/settings`
- `GET /admin/audit-log`

### WebSocket / SSE

Eventi minimi:

- `presence:update`
- `friend:request`
- `friend:accepted`
- `chat:message`
- `chat:read`
- `chat:typing`
- `notification:new`
- `game:created`
- `game:state`
- `game:move`
- `game:clock`
- `game:draw-offer`
- `game:ended`
- `game:opponent-disconnected`
- `game:rematch`
- `tournament:update`
- `tournament:pairing`
- `tournament:round-start`
- `stream:live`
- `stream:viewer-count`
- `admin:report`
- `admin:system`

Ogni evento deve avere `type`, `version`, `id`, `timestamp`, `payload`, e gestione idempotente. Il client deve poter recuperare lo stato completo dopo una riconnessione.

---

## 10. Modello dati minimo

Adatta ai nomi esistenti, ma verifica che esistano o proponi migrazione per:

- User, Profile, UserSettings, UserRole, Session, OAuthAccount
- Rating, RatingHistory, Achievement, UserAchievement
- FriendRequest, Friendship, Block, Presence
- Conversation, ConversationMember, Message, MessageRead
- Game, GamePlayer, Move, ClockSnapshot, Challenge, MatchmakingTicket
- Puzzle, PuzzleSolution, PuzzleAttempt, PuzzleSession, PuzzleProgress
- Course, Chapter, Lesson, Enrollment, LessonProgress, Bookmark
- Stream, Broadcast, Vod, StreamFollow, CreatorApplication
- Club, ClubMember, ClubInvite, ClubMessage, ClubEvent
- ForumCategory, Thread, Reply, Vote, Subscription
- Report, ModerationAction, Sanction
- Tournament, TournamentRegistration, TournamentRound, Pairing, Standing
- Notification, NotificationPreference, BroadcastNotification
- SiteSetting, FeatureFlag, AuditLog, MediaAsset

Requisiti:
- Chiavi esterne e indici per query frequenti.
- Timestamp `created_at`, `updated_at`.
- Soft delete dove serve moderazione/recupero.
- Unicità per handle, email, amicizia, voto, iscrizione, follow.
- Vincoli DB per evitare doppie iscrizioni/voti.
- Migrazioni e seed separati.
- Nessuna cancellazione fisica critica senza policy.

---

## 11. Errori, stati UI e comportamento

Mappa almeno:

- `400` — richiesta non valida, errori campo.
- `401` — sessione scaduta, refresh o login.
- `403` — permesso negato, messaggio non tecnico.
- `404` — risorsa non trovata.
- `409` — conflitto: handle esistente, già iscritto, già amico.
- `422` — validazione.
- `429` — rate limit, countdown/retry.
- `500/502/503` — errore server, retry e messaggio.
- Offline/WebSocket disconnesso — banner non invasivo e riconnessione.
- Loading skeleton per liste e card.
- Empty state con CTA contestuale.
- Optimistic UI con rollback su errore.
- Disabilitazione azioni duplicate.
- Toast non duplicati.
- Nessun `alert()` o errore tecnico mostrato all'utente.

---

## 12. Sicurezza e privacy

- RBAC e ownership check su ogni endpoint.
- Rate limit su auth, search, messaggi, richieste, report.
- Sanitizzazione input e output; no XSS.
- Upload: whitelist MIME, dimensione, nome generato, storage corretto.
- CSRF se cookie.
- CORS ristretto.
- CSP e header di sicurezza se il deployment lo consente.
- Log senza token/password/dati sensibili.
- Admin non può vedere password, token o chat private non segnalate.
- Dati personali minimizzati.
- Export/cancellazione account secondo GDPR se richiesto.
- Audit per azioni admin.
- 2FA per admin, se possibile.
- Nessuna fiducia nel `userId` inviato dal client: usa la sessione.

---

## 13. Test e criteri di accettazione

### Test automatici

Aggiungi o completa:

- Unit test backend per auth, permessi, rating, puzzle, tornei, validazione mosse.
- Integration test API e database.
- Test WebSocket per reconnect e ordine eventi.
- E2E frontend per i flussi principali.
- Test di regressione del motore scacchistico già presente.

### Scenari E2E obbligatori

1. Registrazione, verifica email, login, logout, refresh.
2. Sessione scaduta durante una pagina protetta.
3. Modifica profilo e persistenza dopo reload.
4. Ricerca utente, richiesta amicizia, accettazione, chat e presenza.
5. Challenge, partita online completa, resign, rating aggiornato.
6. Refresh durante una partita: reconnect e clock corretto.
7. Mossa illegale/alterata rifiutata dal server.
8. Puzzle risolto, hint, streak e rating.
9. Corso iniziato, lezione completata, ripresa.
10. Club creato, join, chat.
11. Thread, risposta, voto, report.
12. Torneo: iscrizione, pairings, risultato, standings.
13. Notifica realtime e preferenze.
14. Admin: utente sospeso, ban, revoca sessione.
15. Admin: moderazione contenuto e report.
16. Admin: creazione torneo e broadcast notifica.
17. Utente normale che tenta endpoint admin: 403.
18. Responsive e tastiera su tutte le pagine.

### Criteri di accettazione

- Nessuna funzionalità demo resta attiva in produzione.
- Nessun `localStorage` usato come fonte autorevole.
- Tutti gli endpoint protetti verificano sessione e ruolo.
- Nessun errore console sulle pagine.
- Le pagine esistenti mantengono layout e UX.
- Le azioni admin sono tutte loggate.
- I test E2E principali passano.
- Il README spiega setup, env, migrazioni, test e deploy.
- Esiste un documento di mapping frontend ↔ backend.

---

## 14. Ordine di implementazione consigliato

1. Discovery, piano e mapping API.
2. Config + API client + session + gestione errori.
3. Auth reale e rimozione demo login.
4. Profilo e impostazioni.
5. Amici, presenza e chat.
6. Partite online, matchmaking e WebSocket.
7. Puzzle e progressi.
8. Learn e progressi.
9. Community: club, forum, leaderboard.
10. Tornei.
11. Watch e creator.
12. Notifiche e ricerca.
13. Admin panel.
14. Hardening sicurezza, rate limit, audit.
15. Test E2E, responsive, performance, documentazione.
16. Deploy e smoke test.

Dopo ogni fase:
- esegui lint/test/build disponibili
- verifica regressioni frontend
- aggiorna il mapping
- riporta cosa è completo e cosa è bloccato

---

## 15. Deliverable finali

Produci:

- Codice frontend integrato.
- Eventuali endpoint/migrazioni backend necessari.
- `assets/js/api.js`, `config.js`, `session.js`, `realtime.js`, `permissions.js`.
- Pannello admin completo.
- `docs/backend-integration-plan.md`.
- `docs/api-mapping.md`.
- `docs/admin-permissions.md`.
- `.env.example` per il backend, se applicabile.
- Migrazioni e seed di test.
- Test automatici e checklist E2E.
- README aggiornato con setup locale, variabili, auth, ruoli, deploy e troubleshooting.
- Report finale con:
  - file modificati
  - endpoint aggiunti/usati
  - migrazioni
  - test eseguiti e risultati
  - rischi residui
  - cosa richiede ancora una decisione umana

---

## 16. Comportamento richiesto a Codex durante il lavoro

- Prima di scrivere codice, riporta il piano e attendi conferma se una scelta è ambigua.
- Non fare modifiche distruttive al database o al repository senza conferma.
- Se un endpoint manca, proponi la soluzione minima e implementala solo se coerente con il backend.
- Se un test fallisce, non nasconderlo: riporta il comando, l'errore e la causa.
- Non dichiarare “fatto” se una funzione è solo mockata o solo UI.
- Mantieni il sito utilizzabile anche durante la migrazione, dietro feature flag.
- Alla fine, fai un audit esplicito della differenza tra utente normale e amministratore e verifica che ogni endpoint admin restituisca 403 per un utente normale.

---

## 17. Risultato atteso in una frase

Trasforma Gambit da demo statica a piattaforma scacchistica reale: autenticazione e ruoli, partite online autoritative, puzzle e corsi persistenti, community e tornei reali, notifiche e chat realtime, e un pannello admin completo e sicuro, senza perdere il design e le funzionalità già presenti.
