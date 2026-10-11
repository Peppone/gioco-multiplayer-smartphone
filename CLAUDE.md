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
- test con **Vitest**.

Non cambiare queste scelte senza discuterne prima con l'utente e aggiornare `PIANO.md`.

## Convenzioni di architettura

- **Ogni minigioco è un plugin** che implementa `MinigameType`. Le funzioni `init`, `onInput`, `onTick`, `onHostCommand`, `result`, `scores`, `screenView` e `viewFor` sono **pure e deterministiche** (casualità tramite seed nello stato), così si possono testare.
- **Tipo** (codice) vs **istanza** (contenuto creato dall'admin): i contenuti non si scrivono mai nel codice. Il `configSchema` zod genera il form dell'editor.
- **Modalità partita**: `classic` (punti) o meta-gioco (es. `knight-duel`, che usa `result()` dei minigiochi per assegnare premi).
- I **controlli del telefono** riusano le primitive condivise (`buttons`, `buzzer`, `text`, `number`, `vote`, `reactions`, `waiting`) e il modulo `team-vote`.
- **Temi** (`gameshow`, `pixel`, `manga`, `retro80`) come theme pack: variabili CSS, font locali, suoni, transizioni.
- Messaggi socket sempre **validati con zod** lato server.
- I punteggi passano dal registro `score_entries`; le classifiche si calcolano da lì.
- Interfaccia utente e testi di gioco in **italiano**. Nomi nel codice in inglese.

## Test

- Ogni plugin ha unit test sulle funzioni pure.
- Ogni plugin con informazioni segrete ha un **test anti-leak**: verifica che `screenView` e `viewFor` del team avversario non espongano dati privati.
- Le modifiche al buzzer e al motore di battaglia richiedono test con latenza simulata o simulazioni con bot.
- Prima di dichiarare conclusa una fase, eseguire i test e la demo indicata in `PIANO.md`.

## Git

- **Commit semantici** ([Conventional Commits](https://www.conventionalcommits.org/)): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `build:`, `ci:`, `perf:`, `style:`, con uno scope facoltativo (es. `feat(buzzer): ...`). Il messaggio va scritto in italiano, all'imperativo e in modo conciso.
- **Commit e pull request NON devono avere co-autori Claude**: niente righe `Co-Authored-By: Claude ...`, niente "Generated with Claude Code" o attribuzioni simili, né nei messaggi di commit né nelle descrizioni delle PR.
- Commit piccoli e mirati, uno per modifica logica.
- Fare commit o push solo quando l'utente lo chiede.

## Sicurezza e dati sensibili

- **Non leggere dati sensibili e non accedere a password**: file `.env`, credenziali, chiavi, token, il database `data/*.sqlite` con i dati dei giocatori, keychain e gestori di password. Se un'attività sembra richiederlo, fermati e chiedi all'utente.
- Non inserire nel codice o nei commit segreti, password, token o indirizzi personali.
- La password admin del gioco si salva solo come hash; non va mai registrata nei log né stampata.
- `data/`, `.env*` e i file con dati locali restano in `.gitignore`.
