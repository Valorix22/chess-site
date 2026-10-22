# Permessi effettivi

| Operazione | Utente | Admin | Proprietario |
|---|---|---|---|
| Profilo/preferenze/sessioni | Propri | Propri; lettura profili per moderazione | Come admin |
| Directory account | Solo sé/amici; codice per richieste | Elenco paginato | Come admin |
| Partite e mosse | Solo partecipante; server valida | Lettura amministrativa, nessuna mossa per altri | Come admin |
| Elo/standing | Nessuna scrittura diretta | Nessuna scrittura client | Annullamento auditato con ricalcolo |
| Chat private | Solo conversazioni fra amici | Solo proprie; singolo messaggio segnalato nella coda report | Come admin |
| Club/forum | Propri contenuti; ruoli del proprio club | Moderazione | Come admin |
| Puzzle/corsi/lezioni | Lettura/allenamento/progressi propri | Pubblicazione e aggiornamento | Come admin |
| Account normali | Nessuna gestione | Disabilita, sanziona, reimposta password e revoca sessioni | Come admin |
| Account admin | Nessuna gestione | Non gestisce altri admin | Ruolo/password/sessioni degli admin; proprietario protetto |
| Feature/registrazioni/manutenzione | Nessuno | Lettura | Modifica con password attuale |
| Registro | Nessuno | Filtri, paginazione ed export | Come admin |
| Broadcast notifiche | Nessuno | Sì, limitato e auditato | Come admin |

Ruoli nativi `user/admin/owner` mappati a capacità `user/admin/super_admin`; nessun moderatore separato fittizio. I ruoli club `owner/admin/member` valgono soltanto nel club. Un richiedente non può approvare la propria iscrizione privata o promuoversi.

Ogni route `/api/platform/admin/*` e la pagina `/admin.html` ripetono il controllo server. I test enumerano tutte le nuove route admin e pretendono403per un account normale. I controlli nativi su proprietario, reautenticazione e cambio obbligatorio password rimangono.

Il registro non contiene password, cookie, token o testo dei messaggi privati. Conservazione30 giorni, circa 100.000 eventi come prima. L’apertura delle segnalazioni viene auditata; l’evidenza conserva esclusivamente il messaggio segnalato. Note fair play e segnalazioni non vengono serializzate nelle partite dei giocatori.

Nuove tabelle hanno limiti di archiviazione:10.000contenuti,500per autore,250.000messaggi,2.000messaggi/giorno/autore oltre ai30/minuto,200iscrizioni/utente e200membri/club,500.000tentativi puzzle,16tornei attivi o in pausa. Restano le quote native: partite, coda analisi, tentativi auth, amicizie e sfide. Non sostituiscono monitoraggio e dimensionamento per un servizio ad alto traffico.
