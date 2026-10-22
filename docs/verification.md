# Verifica dell’integrazione

Ambiente QA isolato: stessa immagine base, UID10001,2 CPU/1536MiB, filesystem readonly, nessun nuovo ingresso pubblico, database temporaneo e Chromium. Nessun account di test viene creato nel database reale.

- Suite Python:51 test, inclusa regressione dei39 precedenti; auth, permessi, origini, header, quote, puzzle server-side, club privati, tornei, ledger Elo, cancellazione review, cache e tablebase. Il test di ripresa simula intenzionalmente un errore del motore e verifica il recupero.
- E2E: richiesta amico tramite codice, accettazione, messaggio persistente, invito ranked con popup da entrambi i lati, mosse ottimistiche con risposta ritardata250ms, due premosse concatenate, cancellazione con destro, frecce, storico e ritorno live, risultato Elo, review e variante migliore, bot 200e aiuto privato, puzzle e set, lezione/note/ripresa, esploratore aperture, thread e pannelli admin.
- Responsive:390,768,1024,1440su tutte le pagine attive; controllo overflow, console, asset locali e assenza di collegamenti Watch disattivato. Modali con focus trap, Escape e ripristino focus; scacchiera con tastiera; preferenza movimento ridotto.
- Migrazione reversibile provata su database temporaneo; dati nativi conservati. Prima del rilascio backup SQLite coerente e confronto utenti/partite.
- `protected-baseline.json`: hash di35 file congelati, inclusi12SVG,15MP3e relativi manifest/fonti, modulo audio, sicurezza, review, difficoltà bot, dipendenze e Compose. Devono coincidere con la baseline precedente.

I risultati finali del rilascio sono in `release-notes.md`. I test QA non sono un benchmark per carichi Internet illimitati. Il budget CPU e le quote del server rimangono quelli già collaudati.
