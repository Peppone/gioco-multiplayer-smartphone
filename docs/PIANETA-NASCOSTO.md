# Il Pianeta Nascosto

Gioco di **deduzione logica a squadre**, fedele alle regole di *The Search for Planet X* (Foxtrot Games / Renegade Game Studios): ogni squadra è un **osservatorio** che scruta un sistema solare diviso in 12 (Base) o 18 (Esperto) settori in cerchio. In ogni settore c'è un asteroide, una cometa, una nube di gas, un pianeta nano oppure il vuoto; da qualche parte si nasconde il **Pianeta X**, che agli strumenti **sembra un settore vuoto**. Nome, testi e grafica sono nostri; le meccaniche sono quelle del regolamento. Il piano con tutte le decisioni è in [PIANO-PIANETA-NASCOSTO.md](PIANO-PIANETA-NASCOSTO.md).

Id del plugin: `pianeta-nascosto` · tema predefinito `retro80` · da 1 giocatore (con almeno un robot) a 30, fino a 6 osservatori (squadre e robot insieme).

## Come si gioca

- **Tracciato del tempo**: agisce l'osservatorio più indietro (a pari giorni chi è arrivato prima; chi si muove va davanti agli altri). Ogni azione costa **giorni** = settori percorsi.
- **Azioni** (la TV annuncia quale, mai il risultato): *rileva* un tipo di oggetto in un arco del cielo visibile (4 giorni per 1–3 settori, 3 per 4–6, 2 per 7–9), *punta* un settore (4 giorni, 2 gettoni a testa), *ricerca* (1 giorno, mai due volte di fila), *localizza* il Pianeta X (5 giorni).
- **Terra e cielo visibile**: dopo ogni turno la Terra ruota fino alla freccia sull'osservatorio più arretrato; si vede solo metà dei settori. Sulle icone ▤ si apre una **fase teoria** (a ogni giro); sulle icone ▲ una **conferenza** (X1, in Esperto anche X2) con un indizio sul Pianeta X, solo la prima volta.
- **Teorie**: gettoni limitati (9 in Base, 12 in Esperto) e segreti; le teorie coperte avanzano sulla pista del settore e si controllano dopo tre fasi. Giusta: settore confermato per tutti; sbagliata: gettone perso, oggetto escluso, la squadra avanza di 1 giorno.
- **Fine**: chi localizza il Pianeta X avanza di 5 ma la Terra non ruota; le squadre almeno un giorno indietro hanno un'ultima opportunità (una teoria, due se sono indietro di 4–5, oppure una localizzazione da 2 punti per giorno di ritardo). Con `maxDays` superato si apre l'**ipotesi finale** (5 punti).
- **Punti**: teorie giuste 2/3/4/4 (asteroide/cometa/nube/nano; in Esperto il nano vale 2), 1 di priorità per ogni settore in cui eravate i primi, 10 per il Pianeta X localizzato per primi. Si moltiplicano per `pointScale` (10).

Le regole spiegate ai giocatori sono in `packages/client/src/minigames/pianeta-nascosto/rulesText.ts` (bottone ℹ️ del telefono): **se si cambiano le regole va aggiornato** (`rulesText.test.ts`).

## Per l'host

- Nessun contenuto da preparare: scegli la modalità, i tempi e il livello delle **informazioni iniziali** (Ragazzi 12 fatti · Principiante 8 · Esperto 4 · Genio 0). In *briefing* puoi dare a una squadra un livello diverso (handicap).
- Per giocare in una sola squadra aggiungi almeno un **osservatorio robot**: gioca con le regole del bot dell'app ufficiale, non fa mai una teoria o una localizzazione sbagliata (parte dai sistemi compatibili con ciò che sa e agisce solo quando è certo) e **non entra mai nella classifica generale**.
- La regia è **cieca**: vede dove sono gli osservatori e chi ha deciso, ma non il sistema solare né i risultati finché non premi *Mostra la soluzione* (con conferma).
- Pulsanti: *Inizia*, *Avanti* / *Chiudi la fase*, *Passa il turno*, *Applica la proposta più votata*, *Pausa*, *Mostra la soluzione*, *Termina il round*. Le conferenze si chiudono da sole dopo un minuto se non premi *Avanti*.
- `turnMode: "simultaneous"` fa agire insieme le squadre nello stesso settore (utile con 5–6 squadre); `decision: "captain"` lascia decidere solo il capitano (la regia lo imposta con il 👑).

## Architettura

`packages/minigames/src/pianeta-nascosto/`:

| File | Cosa contiene |
|---|---|
| `sky.ts` | oggetti, regole di posizione, `generateSky` |
| `clues.ts` | ricerche e conferenze come dati strutturati: controllo, etichetta, testo italiano |
| `system.ts` | generatore del sistema con la garanzia di **deducibilità** e fatti iniziali per livello |
| `solver.ts` | risolutore: enumera i sistemi compatibili con le conoscenze (con limite di nodi e cache) |
| `board.ts` | `BOARD_LAYOUT` (icone), tempo, cielo visibile, costi e gettoni |
| `actions.ts`, `theories.ts`, `scoring.ts` | azioni e risultati, piste e revisione, foglio del punteggio |
| `flow.ts` | fasi, input, comandi della regia |
| `bot.ts` | il robot |
| `state.ts`, `types.ts`, `index.ts` | stato, schemi zod, viste (`screenView`, `viewFor`, `hostView`) |
| `official-map.ts`, `schemes.ts` | lettore degli schemi dell'app ufficiale e registro di quelli importati (vedi sotto) |

Client in `packages/client/src/minigames/pianeta-nascosto/`: `Board.tsx` (tabellone SVG sulla TV), `PianetaViews.tsx` (TV e foglio appunti sul telefono: ruota, azione, registro, teorie), `PianetaHost.tsx`, `previewData.ts` (scene `px-*` per `/preview`).

Scelte da ricordare:
- Lo stato tiene il sistema vero; le viste no. `pianeta-leak.test.ts` verifica per **non interferenza** (alterare i dati privati di una squadra, il sistema o gli oggetti delle teorie coperte non cambia le viste di chi non li può vedere), in partite intere, e prova che il controllo segnala una fuga inventata.
- La **deducibilità** è garantita dal generatore: con tutte le ricerche e le conferenze resta un solo settore per il Pianeta X, e nessuna conferenza da sola lo rivela. Prima si cerca un sistema in cui servono anche le conferenze; se non esce entro 2000 tentativi basta che il Pianeta X sia deducibile (succede di rado).
- La configurazione di esempio (`sampleConfig`) ha `maxDays: 60`, mentre il valore predefinito dello schema è 0 (nessun limite): senza limite un round senza input non finisce mai, e il contratto di `registry.test.ts` lo vuole finibile con i soli comandi della regia.
- Una teoria identica a una già in pista **non** si rifiuta (il piano lo chiedeva): il rifiuto rivelerebbe l'oggetto di una teoria coperta. Si rifiuta solo un oggetto diverso nello stesso settore nella stessa fase (vale il primo in ordine di turno).
- Il bot gira dentro `onTick`: enumera i sistemi compatibili con un limite di nodi (`bot.ts`); se non finisce (Esperto, all'inizio) campiona e **non** agisce da certo.

## Import degli schemi dell'app ufficiale

Chi ha l'app ufficiale può giocare con i suoi schemi invece che con quelli generati. Gli schemi **non stanno mai nel progetto né nel pacchetto**: ognuno li importa dalla propria copia dell'app.

- **Importare**: Libreria → apri (o crea) un'istanza de «Il Pianeta Nascosto» → riquadro «Schemi dell'app ufficiale» → scrivi la cartella degli schemi (nella copia dell'app è `assets/www/assets/maps`, con un file `<codice>.json` per partita) → *Importa schemi*. Il server (`pianeta-schemi.ts`) legge solo i file con nome di 4 caratteri, controlla ognuno con `parseOfficialMap` (formato, regole di posizione, ogni regola vera nel sistema, fatti veri) e salva i validi in `<cartella dei dati>/pianeta-schemi/` (accanto al database, fuori da git); riporta quanti importati, rifiutati (con il motivo dei primi) e ignorati. Ripetendo l'importazione si aggiunge; *Cancella gli schemi* li toglie. A ogni avvio il server li ricarica.
- **Usarli**: nell'istanza «Origine del sistema» = «Schema dell'app ufficiale». «Codice dello schema» vuoto sceglie uno schema a caso tra quelli importati della modalità (sempre lo stesso per lo stesso seme); con un codice si gioca proprio quello, e la modalità diventa la sua. Sistema, sei ricerche, conferenze e fatti iniziali vengono dallo schema (le serie A–E vanno agli osservatori in ordine, a rotazione se sono più di cinque); si salta generatore e controllo di deducibilità. Senza schemi importati, o con un codice sconosciuto, l'avvio del round è rifiutato con un messaggio chiaro.
- **Riservatezza**: il codice dello schema compare solo nella regia sbloccata («Mostra la soluzione»), mai a TV e telefoni (chi ha l'app potrebbe cercarlo).
- **Test**: `schemes.test.ts` (plugin; usa `official-map.fixtures.ts`, che scrive un sistema generato nel formato dell'app), `packages/server/src/pianeta-schemi.test.ts` (importazione, riavvio, rotte con login) ed `e2e/pianeta-schemi.spec.ts`. Nessun file dell'app nel progetto: i test usano solo schemi inventati.
- **Prova con gli schemi veri** (facoltativa, solo se hai l'app): `PIANETA_SCHEMI_APP=<cartella maps> pnpm vitest run packages/server/src/pianeta-schemi-reali.test.ts` ed `e2e/pianeta-schemi-reali.spec.ts` (stessa variabile). Ultimo esito con l'app 2.5.51: importati **7739 su 7739** (3199 Base, 4540 Esperto, 0 rifiutati, 6 avvisi sull'etichetta X1 già noti) in ~6 s; in **7728** gli indizi lasciano un solo settore per il Pianeta X, mentre **11 schemi Esperto** (0,14%: M9L8, M9M3, M9Y7, R2E6, R2K6, T5B8, W2Y8, X3X2, Z5U5, Z5Y5, Z9J5) ne lasciano due o tre. Un campione di 40 Base e 16 Esperto più quegli 11 si gioca fino in fondo con i robot: ~18 giorni in Base, ~20 in Esperto, nessuna teoria sbagliata. Negli schemi ambigui il robot, a conferenze tenute e dopo un giro di passi senza nulla di utile, localizza il candidato più probabile; una localizzazione fallita esclude quella combinazione (`failedLocations` del risolutore), quindi al massimo prova ogni candidato una volta.

## Test e misure

- `pnpm vitest run packages/minigames/src/pianeta-nascosto` (unit: tabellone, teorie, sistema e indizi, flusso, robot, anti-leak) e `packages/client/src/minigames/pianeta-nascosto/rulesText.test.ts`.
- `pnpm exec playwright test e2e/pianeta-preview.spec.ts` (5 temi: nessun overflow a 360×640, spicchi tutti uguali nel DOM, rotazione della Terra, bersagli da pollice) ed `e2e/pianeta-nascosto.spec.ts` (due squadre e un robot nel browser: foglio condiviso, azione votata, teorie, rivelazione, frame WebSocket).
- `pnpm stress --players 30 --scenario pianeta` (5 osservatori da 6 telefoni e un robot, turni insieme): partita conclusa in ~45 s, stato di ritorno in mediana ~50 ms, p95 ~220 ms, nessuna fuga.
- `pnpm balance:pianeta` (~25 s): robot contro robot sul vero plugin. Ultima misura: **Base ~20 giorni** (p90 26, ~19 min con turni da 40 s), **Esperto ~24 giorni** (p90 28, ~29 min), zero errori dei robot; `onTick` al massimo ~12 ms in Base e ~120 ms in Esperto (il robot pensa una volta per turno); chi parte per primo vince il **51%** delle partite (un terzo sarebbe nessun vantaggio: con persone conta molto meno); a parità di abilità i livelli aiutano come previsto (Ragazzi 46%, Esperto 30%, Genio 24%). Si rilancia dopo ogni modifica a costi, gettoni, punti o informazioni iniziali, e si aggiorna `rulesText.ts`.
