# CLAUDE.md

Linee guida per Claude Code (e per chiunque contribuisca) su questo repository.
Il piano completo e le motivazioni delle scelte sono in [PIANO.md](PIANO.md): leggilo prima di iniziare una fase di lavoro.

## Il progetto in breve

Party game multiplayer in presenza (fino a ~30 giocatori) in stile Jackbox/Kahoot:
- **`/screen`**: schermo condiviso (TV/proiettore) con domande, animazioni e classifiche.
- **`/play`**: il telefono di ogni giocatore fa da telecomando (buzzer, risposte, voti, reazioni).
- **`/admin`**: regia per creare team, serate, partite e minigiochi e per condurre la partita live.

## Vincoli non negoziabili

- **Web app nel browser**, niente app nativa: deve funzionare su Safari iOS e Chrome Android senza installazione.
- **Nessuna iscrizione** a store, hosting o servizi, né per l'host né per i giocatori. Non introdurre dipendenze da servizi che richiedono un account.
- **Server sul PC dell'host** + **Cloudflare Quick Tunnel** (`cloudflared`, senza account), così i giocatori possono usare la propria rete cellulare. Deve restare disponibile l'accesso via LAN come fallback.
- **Server autorevole**: tutta la logica di gioco sta sul server; i client inviano solo intenzioni.
- **Informazioni private**: i client ricevono solo viste filtrate (`screenView` / `viewFor`), mai lo stato grezzo. Lo schermo condiviso mostra solo informazioni pubbliche.
- **Equità con latenza variabile**: buzzer e punti-velocità usano la sincronizzazione dell'orologio e una finestra di raccolta, mai il semplice ordine di arrivo.
- **Client telefono leggero** (obiettivo < ~1,5 MB): gli asset pesanti vanno solo su `/screen`.

## Stack

TypeScript ovunque, monorepo **pnpm workspaces**:
- `packages/shared`: tipi, schemi **zod**, protocollo socket, interfaccia `MinigameType`;
- `packages/server`: **Node.js + Fastify + Socket.IO**, engine (state machine serata → partita → round), **SQLite** con `better-sqlite3` + **Drizzle ORM**;
- `packages/client`: **React + Vite**, **Framer Motion**, **PixiJS** (solo per i giochi pixel/arcade), **Howler.js**;
- `packages/minigames`: un plugin per cartella;
- `tools/bots`: simulatore di N giocatori con `socket.io-client`;
- test con **Vitest** (unit e integrazione) e **Playwright** (end-to-end nel browser).

Non cambiare queste scelte senza discuterne prima con l'utente e aggiornare `PIANO.md`.

## Convenzioni di architettura

- **Ogni minigioco è un plugin** che implementa `MinigameType` (guida passo-passo in [docs/NUOVO-MINIGIOCO.md](docs/NUOVO-MINIGIOCO.md)). Le funzioni `init`, `onInput`, `onTick`, `onHostCommand`, `result`, `scores`, `screenView` e `viewFor` sono **pure e deterministiche** (casualità tramite seed nello stato), così si possono testare.
- **Tipo** (codice) vs **istanza** (contenuto creato dall'admin): i contenuti non si scrivono mai nel codice. Il `configSchema` zod genera il form dell'editor.
- **Meta-gioco**: un minigioco può orchestrare altri minigiochi della libreria (es. `knight-duel`, che usa `result()` dei figli per assegnare premi). È un round come gli altri: la sua istanza riferisce altre istanze per id (`libraryConfigSchema`) e `buildConfig` le risolve all'avvio della partita.
- I **controlli del telefono** riusano le primitive condivise (`buttons`, `buzzer`, `text`, `number`, `vote`, `reactions`, `waiting`) e il modulo `team-vote`.
- **Temi** (`gameshow`, `pixel`, `manga`, `retro80`, `boom`) come theme pack: variabili CSS, font locali, suoni, transizioni.
- Messaggi socket sempre **validati con zod** lato server.
- I punteggi passano dal registro `score_entries`; le classifiche si calcolano da lì.
- Interfaccia utente e testi di gioco in **italiano**. Nomi nel codice in inglese.

## Test

- Ogni plugin ha unit test sulle funzioni pure.
- Ogni plugin con informazioni segrete ha un **test anti-leak**: verifica che `screenView` e `viewFor` del team avversario non espongano dati privati.
- Le modifiche al buzzer e al motore di battaglia richiedono test con latenza simulata o simulazioni con bot.
- **Test end-to-end con Playwright** (`pnpm test:e2e`, cartella `e2e/`): pilotano Edge (già presente, nessun download) con più browser insieme (schermo, regia, telefoni emulati) e verificano DOM, testi, stili calcolati e frame WebSocket, **senza screenshot**. Girano in parallelo (6 worker, ~4 minuti): ogni worker ha il suo server di prova (porte 3100–3105) con un database vuoto in `data/e2e/server-N/`, mai quello vero, quindi le partite di worker diversi non si toccano. Edge gira senza GPU (`--disable-gpu`): con decine di pagine insieme la GPU integrata si satura e i test legati a video e tempi falliscono a caso. I file `*-preview.spec.ts` e `themes.spec.ts` (solo pagine statiche) parallelizzano anche i singoli test. Un test instabile non si nasconde con attese più lunghe a caso: se ne trova la causa (corse tra pagine, rivelazioni troppo brevi, clic su elementi sbagliati). Ogni nuova funzione visibile all'utente (schermate, flussi di gioco, editor) aggiunge o aggiorna uno scenario e2e; ogni test lascia il server pulito (`Termina la partita` + `Torna alla lobby`).
- **Stress test** (`pnpm stress`, `pnpm test:stress`): 30 giocatori simulati (`tools/bots`) con latenza e orologi sfasati giocano una partita classica e un duello su un server di prova isolato; segnalano errori, incoerenze di punteggio e tempi di aggiornamento. Si eseguono prima di una serata vera o dopo modifiche al realtime o all'engine.
- **Bilanciamento di «Caccia ai Fantasmi»** (`pnpm balance:caccia`, ~10 s): fa giocare il vero plugin a giocatori simulati e stampa la percentuale di vittorie dei fantasmi per dimensione della partita e stile di gioco; a pari abilità deve stare vicino al 50%. Si rilancia dopo ogni modifica a blocco delle zone, peso, pause, vantaggio o punteggio, e si aggiorna `rulesText.ts` (le regole spiegate nell'app).
- **Bilanciamento di «Shadow Tournament»** (`pnpm balance:shadow`, ~25 s): fa giocare il vero plugin a giocatori simulati e stampa durata del torneo, uso delle azioni e quota di tornei vinti da ogni stile contro il gioco «bilanciato» (vicino al 50%, nessuno stile oltre il 60%). Si rilancia dopo ogni modifica a costi, mazzi o regole, e si aggiorna `rulesText.ts`. Guida in [docs/SHADOW-TOURNAMENT.md](docs/SHADOW-TOURNAMENT.md).
- **Game Master** (`stanze-segrete`): il ruolo `master` accetta solo comandi del plugin (mai `engine`, `adjust` o `start`); le modifiche che toccano `master-auth.ts`, `realtime.ts` o `message-store.ts` richiedono i test di `master.test.ts`, lo scenario e2e `e2e/stanze-segrete.spec.ts` e `pnpm stress --players 10 --scenario stanze` (con 11 giocatori l'avvio del round deve essere rifiutato).
- **Parole Mannare**: ogni modifica a gettoni, annulla, fasi o voti richiede i test di `parole-mannare.test.ts` (compresi gli anti-leak), gli scenari `e2e/parole-preview.spec.ts` e `e2e/parole-mannare.spec.ts` e `pnpm stress --players 12 --scenario parole` (con 13 giocatori l'avvio del round deve essere rifiutato). Se cambiano le regole si aggiorna `rulesText.ts`. Guida in [docs/PAROLE-MANNARE.md](docs/PAROLE-MANNARE.md).
- **Stanze col botto**: ogni modifica a stanze, leader, ostaggi, condivisioni o regia cieca richiede i test di `stanze-col-botto.test.ts` (compresi gli anti-leak e quelli su `hostView` cieca), gli scenari `e2e/stanze-col-botto-preview.spec.ts` e `e2e/stanze-col-botto.spec.ts` e `pnpm stress --players 30 --scenario botto` (con 5 giocatori l'avvio del round deve essere rifiutato). Se cambiano le regole si aggiorna `rulesText.ts`. Guida in [docs/STANZE-COL-BOTTO.md](docs/STANZE-COL-BOTTO.md).
- **Lunghezza d'Onda**: ogni modifica a fasi, punti, squadre, recupero o quadrante richiede i test di `scoring.test.ts` e `lunghezza-onda.test.ts` (compresi gli anti-leak), gli scenari `e2e/onda-preview.spec.ts` e `e2e/lunghezza-onda.spec.ts` (in «tutti» un trascinamento manda un solo `dial`, a squadre non più di uno ogni 250 ms) e `pnpm stress --players 30 --scenario onda` (con 2 giocatori l'avvio del round deve essere rifiutato). Se cambiano le regole si aggiorna `rulesText.ts`. Guida in [docs/LUNGHEZZA-ONDA.md](docs/LUNGHEZZA-ONDA.md).
- **Agenti Segreti**: ogni modifica a fasi, voto, indizio, squadre o viste richiede i test di `agenti-segreti.test.ts` (compresi gli anti-leak e quelli su `hostView` cieca), quelli di `team-vote.test.ts` se si tocca il voto, gli scenari `e2e/agenti-preview.spec.ts` (le 300 parole d'esempio devono stare nelle carte in tutti i temi), `e2e/agenti-segreti.spec.ts` e, se si toccano le liste di parole, `library-seed.test.ts` ed `e2e/word-lists.spec.ts`, e `pnpm stress --players 30 --scenario agenti` (con 3 giocatori l'avvio del round deve essere rifiutato). Se cambiano le regole si aggiorna `rulesText.ts`. Guida in [docs/AGENTI-SEGRETI.md](docs/AGENTI-SEGRETI.md).
- **Pacchetto Windows** (`pnpm package:win`, poi `pnpm package:check [--tunnel]`): ogni modifica che tocca server, client o dipendenze native va verificata anche nel pacchetto impacchettato.
- Prima di dichiarare conclusa una fase, eseguire i test (`pnpm test` e `pnpm test:e2e`) e la demo indicata in `PIANO.md`.

## Git

- **Commit semantici** ([Conventional Commits](https://www.conventionalcommits.org/)): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `build:`, `ci:`, `perf:`, `style:`, con uno scope facoltativo (es. `feat(buzzer): ...`). Il messaggio va scritto in italiano, all'imperativo e in modo conciso.
- **Commit e pull request NON devono avere co-autori Claude**: niente righe `Co-Authored-By: Claude ...`, niente "Generated with Claude Code" o attribuzioni simili, né nei messaggi di commit né nelle descrizioni delle PR.
- Commit piccoli e mirati, uno per modifica logica.
- Fare commit o push solo quando l'utente lo chiede.

## Ambiente Windows: trucchi e problemi noti

- **Scrivere file**: usare sempre lo strumento `Write`/`Edit`, non heredoc (`cat > file <<'EOF'`) nella shell Bash. Con testo italiano (apostrofi come `l'ora`, `c'è`) e backtick il parsing fallisce con `unexpected EOF while looking for matching`, e **nessun file viene scritto** (il comando fallisce per intero). Gli heredoc vanno bene solo per testo senza apostrofi.
- **Python non è installato** (c'è solo l'alias del Microsoft Store): non usare `python` per modificare file; usare `Edit`.
- **Slash nei flag Windows**: in Git Bash i flag di `taskkill` vanno con doppia barra (`taskkill //F //IM node.exe`); con una sola `/F` viene interpretata come percorso. Nei percorsi usare `/` o percorsi assoluti `C:\...` tra virgolette; non mischiare `\` dentro stringhe Bash.
- **PowerShell 5.1**: niente `&&`/`||` (usare `;` o `if ($?)`), niente `2>&1` sugli eseguibili nativi.
- **Processi rimasti attivi**: dopo una prova del server controllare che la porta 3000 sia libera (`netstat -ano | grep ":3000 "`) prima di riavviare, altrimenti `EADDRINUSE` e si finisce per testare un server vecchio. Il processo sulla porta potrebbe essere il server di prova dell'utente: **non spegnere `node.exe` in blocco**. Spegnere solo i processi avviati da noi, per PID (`taskkill //F //PID <pid>`), e se la porta è già occupata da altri riusare quel server o chiedere.
- **Verifica dell'interfaccia: sempre con Playwright, mai con screenshot.** Per controllare layout, testi, stili e animazioni si scrivono asserzioni su DOM, stili calcolati, dimensioni (overflow), caricamento degli asset e frame WebSocket. La pagina `/preview?theme=...&scene=...&still=1` (`still` salta le animazioni) mostra schermo e telefono di ogni scena senza giocare una partita ed è la base di questi test. Gli screenshot si usano solo se l'utente li chiede.
- **Fine riga**: Git avvisa `LF will be replaced by CRLF`; è solo un warning, ignorabile.
- **cloudflared**: il file in `bin/` deve chiamarsi esattamente `cloudflared.exe` (non il nome originale del download).

## Sicurezza e dati sensibili

- **Non leggere dati sensibili e non accedere a password**: file `.env`, credenziali, chiavi, token, il database `data/*.sqlite` con i dati dei giocatori, keychain e gestori di password. Se un'attività sembra richiederlo, fermati e chiedi all'utente.
- Non inserire nel codice o nei commit segreti, password, token o indirizzi personali.
- La password admin del gioco si salva solo come hash; non va mai registrata nei log né stampata.
- `data/`, `.env*` e i file con dati locali restano in `.gitignore`.
