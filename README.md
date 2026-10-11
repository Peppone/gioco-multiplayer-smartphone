# Gioco

Party game multiplayer **in presenza** (fino a ~30 giocatori) in stile Jackbox/Kahoot. Uno schermo condiviso (TV o proiettore) mostra domande, animazioni e classifiche; ogni giocatore usa il **telefono come telecomando**, senza installare nulla. Una regia conduce la serata.

- **`/screen`** – lo schermo condiviso
- **`/play`** – il telefono di ogni giocatore
- **`/admin`** – la regia: squadre, serate, minigiochi, conduzione live

Minigiochi: quiz a scelta multipla, buzzer (equo con la latenza), vero/falso a raffica, stima numerica, sondaggio e il **Duello dei Cavalieri** (meta-gioco a squadre con carte segrete). Quattro temi grafici: game show, pixel, manga, retro anni 80.

## Per chi organizza una serata

Scarica il pacchetto per Windows, decomprimilo e avvia `Avvia Gioco.bat`. Tutto è spiegato in **[docs/GUIDA-HOST.md](docs/GUIDA-HOST.md)**. Per il Duello: [docs/DUELLO-DEI-CAVALIERI.md](docs/DUELLO-DEI-CAVALIERI.md).

## Per chi sviluppa

Requisiti: **Node.js ≥ 22** e **pnpm**.

```
pnpm install
pnpm start     # compila il client e avvia il server su http://localhost:3000
```

Per i telefoni in 4G serve `cloudflared.exe` in `bin/` (Cloudflare Quick Tunnel, senza account); senza, l'accesso è dalla rete locale. Il database è `data/gioco.sqlite` (ignorato da git).

| Comando | Cosa fa |
|---|---|
| `pnpm test` | Test unitari e di integrazione (Vitest) |
| `pnpm test:e2e` | Test end-to-end nel browser (Playwright su Edge, server e database di prova) |
| `pnpm test:stress` / `pnpm stress` | 30 giocatori simulati su un server di prova, con report |
| `pnpm duel:balance [mazzo.json]` | Analisi del bilanciamento di un mazzo del duello |
| `pnpm package:win` · `pnpm package:check` | Crea e verifica il pacchetto portabile per Windows |
| `pnpm typecheck` | Controllo dei tipi |

### Struttura

```
packages/shared      tipi, schemi zod, protocollo socket, interfaccia dei plugin
packages/server      Fastify + Socket.IO, engine (serata → partita → round), SQLite + Drizzle
packages/client      React + Vite: schermo, telefono, regia, temi, audio
packages/minigames   un plugin per cartella (logica pura e testata)
tools/bots           simulatore di giocatori e stress test
tools/package        creazione e verifica del pacchetto Windows
tools/sounds         generatore degli effetti sonori
e2e                  test end-to-end
docs                 guide (host, duello, nuovo minigioco)
```

Il piano di lavoro e le decisioni sono in **[PIANO.md](PIANO.md)**; le regole per chi contribuisce in **[CLAUDE.md](CLAUDE.md)**. Per aggiungere un minigioco: [docs/NUOVO-MINIGIOCO.md](docs/NUOVO-MINIGIOCO.md).

## Principi

Web app nel browser, nessuna iscrizione a servizi, server sul PC dell'host, **server autorevole** (i client inviano solo intenzioni), viste filtrate (nessun segreto verso schermo o avversari), equità con latenza variabile.

## Licenze

Sprite *Tiny Dungeon* di Kenney (CC0); font Montserrat, Press Start 2P, Bangers e Orbitron (SIL OFL) tramite `@fontsource`; effetti sonori sintetizzati dal programma. Dettagli nel pacchetto (`LICENZE-TERZE-PARTI.txt`).
