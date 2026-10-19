# Piano di lavoro: party game con telefono come telecomando ("gioco-ros")

## Contesto

Vogliamo un party game in presenza (fino a circa 30 giocatori) in stile Jackbox/Kahoot:
- uno **schermo condiviso** (TV o proiettore) mostra domande, animazioni e classifiche;
- ogni giocatore usa il **telefono come telecomando** (buzzer, risposte, reazioni);
- un **admin** crea team, serate, partite e minigiochi.

Vincoli:
- deve funzionare su Android e iOS;
- i giocatori devono poter usare **la propria rete cellulare** oltre al Wi-Fi;
- **nessuna iscrizione** a store, hosting o servizi;
- lo stile grafico cambia in base al minigioco (game show, pixel art, manga, retro anni 80);
- una serata è composta da più partite, con punteggio sia individuale sia a squadre.

Il progetto parte da zero.

---

## Decisioni cruciali (con motivazione)

### D1. Web app nel browser invece di un'app nativa ✅
- Un'app nativa richiede account sviluppatore: Apple costa 99 $/anno e senza App Store su iOS la distribuzione è quasi impossibile; Google costa 25 $. Questo viola il vincolo "nessuna iscrizione".
- Con una web app il giocatore **inquadra un QR code** sullo schermo e gioca subito nel browser (Safari o Chrome). Non serve installare niente e funziona su qualsiasi telefono.
- Limiti accettati: niente notifiche push, e la vibrazione funziona solo su Android (iOS la ignora).

### D2. Server sul PC dell'host, raggiungibile da internet con un tunnel senza account ✅ (rivista)
**Requisito aggiornato:** i giocatori sono nella stessa stanza, ma ognuno deve poter usare **la propria rete dati cellulare**, perché il Wi-Fi del locale potrebbe non reggere tutti.

**Soluzione:**
- Il server gira sul PC dell'host, come prima.
- All'avvio lancia automaticamente un **Cloudflare Quick Tunnel** (`cloudflared tunnel --url http://localhost:PORT`). È gratuito e **non richiede account né iscrizione**: si scarica solo il programma `cloudflared`, che verrà incluso nel pacchetto.
- Il tunnel fornisce un indirizzo pubblico **HTTPS** casuale (`https://xxxx.trycloudflare.com`). Il server lo legge e lo mostra sullo schermo come **QR code**.
- Così ogni telefono può collegarsi con qualsiasi connessione: 4G/5G, il Wi-Fi del locale o qualunque altra rete.

**Doppio accesso:** lo schermo mostra due QR:
- quello principale, via internet;
- uno secondario, via LAN, che funziona anche senza internet se il Wi-Fi c'è e regge.

Il server è lo stesso e la partita è la stessa: si possono mescolare giocatori in LAN e in rete cellulare.

**Vantaggi in più:** con HTTPS funzionano Wake Lock (schermo sempre acceso), "Aggiungi a Home" (PWA) e cache offline degli asset (service worker).

**Cosa serve all'host:** una connessione internet sul PC, anche modesta. Il traffico di gioco è minimo, pochi KB/s per giocatore. Se il locale non ha internet, il PC si collega all'**hotspot di un telefono**.

**Limiti dei Quick Tunnel:**
- sono pensati per test;
- non hanno garanzie di servizio;
- gestiscono al massimo circa 200 richieste HTTP contemporanee: per 30 giocatori su WebSocket bastano;
- l'URL cambia a ogni avvio, ma il QR lo gestisce in automatico.

**Piani B (configurabili):**
- un altro tunnel senza account (es. Pinggy, solo SSH, ma con sessioni gratuite a tempo);
- solo LAN o hotspot;
- in futuro, se lo vorrai, un hosting cloud: richiederebbe un account solo per l'host, mai per i giocatori.

**Conseguenza sul gioco:** la latenza cellulare è più alta e variabile (tipicamente 50-200 ms) e diversa tra un giocatore e l'altro. Per questo la **compensazione della latenza nel buzzer diventa obbligatoria** (vedi sotto).

**Asset leggeri:** il primo caricamento passa dal tunnel e dalla rete dati di ogni giocatore. Obiettivo: client per il telefono sotto ~1,5 MB; gli asset pesanti di sfondi e musica si caricano solo su `/screen`, che sta sul PC.

### D3. Stack tecnologico (TypeScript end-to-end)

| Ambito | Scelta | Perché |
|---|---|---|
| Monorepo | **pnpm workspaces** | Tipi condivisi tra server e client |
| Server | **Node.js + Fastify + Socket.IO** | Realtime affidabile, riconnessione automatica, room |
| Validazione | **zod** | Messaggi socket validati; gli schemi generano anche i form dell'editor admin |
| DB | **SQLite** (`better-sqlite3`) + **Drizzle ORM** | Un solo file, zero configurazione, backup copiando il file |
| Client | **React + Vite** (un'app, tre aree: `/screen`, `/play`, `/admin`) | Veloce da sviluppare, un solo build |
| Animazioni UI | **Framer Motion** + CSS | Effetti game show, transizioni |
| Minigiochi grafici | **PixiJS** (solo dove serve: pixel art e arcade) | Rendering 2D performante e nitido per il pixel art |
| Audio | **Howler.js** | Effetti sonori e jingle; gestisce lo sblocco audio di iOS |
| Test | **Vitest** + script di bot `socket.io-client` + **Playwright** | Logica di gioco testabile, simulazione di 30 giocatori, flussi end-to-end nel browser (Edge/Chromium, senza screenshot) |
| Distribuzione | `pnpm start`, poi un **eseguibile unico** per Windows (Node SEA o `bun build --compile`) | L'host avvia un solo file |

### D4. Identità senza registrazione
- **Giocatore:** sceglie nickname, avatar e colore. Il server genera un **token salvato sul telefono** (localStorage), così chi chiude o blocca il telefono rientra automaticamente.
- Per cambiare telefono o recuperare il profilo c'è un **PIN di 4 cifre** mostrato alla creazione.
- **Admin:** password locale impostata al primo avvio del server, salvata come hash in SQLite.
- Il profilo resta sul server dell'host, quindi le statistiche si accumulano tra una serata e l'altra.

### D5. Server autorevole + minigiochi come plugin (la scelta architetturale chiave)
Le regole di gioco vivono **solo sul server**: i telefoni inviano intenzioni (es. "premo il buzzer") e il server decide. Questo garantisce equità e impedisce trucchi.

Si distingue tra:
- **Tipo di minigioco** = codice (un plugin). Esempi: "Quiz a scelta multipla", "Buzzer".
- **Istanza di minigioco** = contenuto creato dall'admin dall'editor, senza scrivere codice. Esempio: "Quiz anni 80, 10 domande, 20 secondi l'una, tema retro80".

Ogni plugin implementa un'interfaccia comune:
```ts
interface MinigameType<Config, State, Input> {
  id: string;                    // "quiz-multipla"
  configSchema: ZodSchema<Config>; // genera automaticamente il form nell'editor admin
  defaultTheme: ThemeId;          // "gameshow" | "pixel" | "manga" | "retro80" | "boom"
  init(config, players, teams): State;
  onInput(state, playerId, input): State;       // pura, testabile
  onTick?(state, now): State;                   // timer
  onHostCommand(state, cmd): State;             // es. "risposta corretta" nel buzzer
  result(state): RoundResult;                   // classifica/esito del round (riusato dalle modalità partita)
  scores(state): ScoreDelta[];
  // INFORMAZIONI PRIVATE: il server non invia mai lo State completo ai client
  screenView(state): ScreenState;               // solo info pubbliche (lo schermo è visto da tutti)
  viewFor(state, playerId, teamId): PlayerView; // solo ciò che quel giocatore/team può vedere
  ScreenView: React.FC<{ view: ScreenState }>;  // cosa si vede sulla TV
  ControllerView: React.FC<{ view: PlayerView, send }>; // cosa si vede sul telefono
}
```
**Nota di implementazione (F3):** il plugin è diviso in due parti. La logica (`MinigameType`, funzioni pure, senza React) sta in `packages/minigames` e gira sul server; le viste React (`Screen` e `Controller`) stanno in `packages/client/src/minigames/<id>/` e sono registrate per `id` in `registry.ts`. Così il server non dipende da React. Il plugin espone anche `inputSchema`/`commandSchema` (zod), `hostView` (vista della regia, con i segreti, e azioni generiche) e `isFinished`. Il client invia solo l'intenzione e un timestamp; l'ora equa (`fairTime`) la calcola il plugin.
In questo modo le "nuove interazioni definite via via" si aggiungono come nuovo plugin e nuovi controlli del telecomando, senza toccare il resto.

**Regola d'oro (introdotta per il Duello dei Cavalieri, vale per tutti):** i client ricevono solo **viste filtrate** (`screenView` / `viewFor`), mai lo stato grezzo. Così le carte segrete di un team non arrivano tecnicamente agli avversari, nemmeno ispezionando il traffico.

### D6. Meta-gioco: un minigioco che ne orchestra altri
Una partita è sempre una sequenza di round, e ogni round è un minigioco. Un **meta-gioco** (es. *Duello dei Cavalieri*) è un minigioco come gli altri, ma un plugin "contenitore" orchestra altri minigiochi della libreria: usa il loro `result()` per assegnare **premi** invece di punti e aggiunge fasi proprie (draft, battaglia). La sua istanza in libreria riferisce le altre istanze per id e la serata decide chi gioca.

Alla fine il meta-gioco converte comunque l'esito in punti serata, così la classifica cumulativa resta coerente. (Una versione precedente trattava il duello come «modalità di partita» con configurazione a parte; è stata abolita perché era un secondo modo, poco chiaro, di preparare una partita.)

**Modulo riusabile `team-vote`:** voto di team con timer. Mostra a ogni membro le preferenze dei compagni in tempo reale. Lo usano il draft, la battaglia e, in futuro, qualunque decisione collettiva.

### D7. Temi grafici per minigioco
Ogni **theme pack** comprende: palette (variabili CSS), font (Google Fonts incorporati in locale, così funziona offline), effetti sonori, transizioni di ingresso e uscita, sfondo animato.
- `gameshow`: luci, colori saturi, riflettori, jingle;
- `pixel`: font bitmap, `image-rendering: pixelated`, PixiJS;
- `manga`: linee cinetiche, balloon, onomatopee ("DON!");
- `retro80`: neon, griglia synthwave, CRT scanlines;
- `boom`: grafica piatta rosso/blu/grigio con strisce e fasce di colore, Montserrat Black (OFL), pensato per Stanze col botto.

L'admin può cambiare il tema di ogni istanza di minigioco. Il telefono adotta lo stesso tema, ma in versione leggera.

---

## Gioco speciale: ⚔️ Duello dei Cavalieri (meta-gioco, tema `pixel`)

**Concetto:** due team, oppure due giocatori singoli, sono rappresentati ciascuno da un cavaliere in pixel art. Vincono i minigiochi per guadagnare abilità segrete, che poi usano per abbattere il cavaliere avversario.

### Ciclo di gioco
```
[Minigioco] → [Draft premio] → … ripeti X volte … → [Battaglia] → ripeti ciclo
                                                         ↓
                                     un cavaliere a 0 PV → fine duello
```
1. **Minigioco:** uno qualsiasi della libreria (quiz, buzzer, stima…), scelto dall'admin o estratto a caso.
2. **Draft a priorità:**
   - si rivelano N carte abilità (es. 3), visibili **solo sui telefoni**: lo schermo mostra solo "il Team Rosso sta scegliendo…" e il dorso delle carte;
   - il vincitore del minigioco sceglie per primo, poi lo sconfitto sceglie tra le carte rimaste;
   - la carta scelta entra nella **mano segreta** del team.
3. **Battaglia** (ogni X minigiochi, X configurabile, default 2):
   - entrambi i team scelgono **in segreto e in contemporanea** le carte da giocare, fino a un massimo per battaglia (es. 2);
   - poi c'è una **rivelazione simultanea** e lo schermo anima lo scontro in PixiJS: attacco, parata, colpo critico, numeri di danno;
   - l'ordine di risoluzione è deterministico (es. difese → cure → attacchi → effetti) e ogni carta ha un'iniziativa.
4. **Fine:** vince il primo che porta l'altro a 0 PV. Se dopo un numero massimo di cicli nessuno è a 0, vince chi ha più PV.

### Decisioni del team = voto
- Ogni membro vota una carta dal proprio telefono e vede in tempo reale i voti dei compagni.
- Timer di voto (es. 20 s). Vince la maggioranza.
- **Parità:** prevale la carta votata per prima. Se nessuno vota, il sistema sceglie a caso, e si può configurare una scelta prudente (es. una carta difensiva) come predefinita.
- Con un giocatore singolo il voto coincide con la sua scelta.

### Abilità (mazzo configurabile dall'admin)
Un mazzo iniziale di circa 15 carte, costruito su pochi **tipi di effetto componibili**, così il bilanciamento resta gestibile:
- **Attacco:** danno N;
- **Colpo pesante:** danno alto, ma si risolve per ultimo;
- **Scudo:** blocca N danni in questa battaglia;
- **Contrattacco:** se vieni attaccato, rispedisci X danni;
- **Cura:** +N PV;
- **Veleno:** N danni a ogni battaglia successiva;
- **Furto:** ruba una carta casuale dalla mano avversaria;
- **Spia:** svela al tuo team una carta avversaria;
- **Sabotaggio:** al prossimo minigioco l'avversario ha un malus (es. meno tempo).

Ogni carta ha: nome, sprite pixel, rarità, iniziativa, effetti. L'admin modifica i valori dall'editor (stesso sistema `configSchema`).

### Cosa vede chi
| | Schermo (pubblico) | Telefono del team | Telefono avversario |
|---|---|---|---|
| PV, cavalieri, turno | ✅ | ✅ | ✅ |
| Numero di carte in mano | ✅ (dorsi) | ✅ | ✅ |
| Contenuto della mano | ❌ | ✅ | ❌ (solo con "Spia") |
| Voti in corso | ❌ ("sta scegliendo…") | ✅ | ❌ |
| Carte giocate in battaglia | ✅ dopo la rivelazione | ✅ | ✅ dopo la rivelazione |

**Attenzione alla stanza condivisa:** chi è vicino può sbirciare. Per questo nella vista del telefono le carte si mostrano grandi solo tenendo premuto ("tieni premuto per vedere").

### Più di due team
Il duello è sempre 1 contro 1. Se la serata ha più team, l'admin crea più partite-duello in sequenza, scegliendo gli accoppiamenti. Un tabellone a eliminazione automatico è un'evoluzione futura.

### Grafica
- **Cavalieri:** sprite 32×32 scalati, con animazioni idle, attacco, colpito, parata, KO.
- **Arena:** sfondo pixel, barre PV, effetti particellari.
- **Partenza:** asset CC0 (es. Kenney "Tiny Dungeon") e palette limitata.
- **Personalizzazione:** colore del team sul cavaliere tramite palette swap.

### Decisioni di implementazione (confermate con l'utente)
- **Architettura:** il duello è un **plugin contenitore** (`knight-duel`): per l'engine è un solo round. Il suo stato contiene la fase del duello (`minigioco → draft → battaglia → fine`) e lo **stato del minigioco figlio**, a cui delega input, tick, comandi e viste durante la fase "minigioco". L'istanza del duello sta in libreria come le altre (`minigame_instances`) e si aggiunge a una partita come round; all'avvio `buildConfig` la risolve in una copia fissata delle istanze riferite (minigiochi, mazzo) e sceglie gli sfidanti dalla serata (le prime due squadre per nome con giocatori, oppure due giocatori estratti a sorte).
- **Contendenti:** due team o due singoli giocatori (un "lato" è un insieme di giocatori); gli altri sono spettatori.
- **Vincitore del minigioco:** il lato con più punti nel minigioco figlio; in parità decide il miglior piazzamento individuale, poi un lancio di moneta con il seme.
- **Segretezza del draft:** la squadra che sceglie vede le carte offerte; chi sceglie per secondo vede solo quelle rimaste, non quale è stata presa. Le carte non scelte tornano nel mazzo.
- **Fine del duello:** KO a 0 PV; dopo i cicli massimi vince chi ha più PV; **in parità si gioca una battaglia a oltranza** (senza minigioco) finché c'è un vincitore.
- **Punti serata:** contano **solo l'esito del duello** (ogni vincitore X punti, ogni perdente Y, configurabili, default 500 e 100). I punti dei minigiochi diventano premi (carte) e non entrano in classifica.
- **Sabotaggio:** riduce del X% (configurabile sulla carta) i punti del lato avversario nel prossimo minigioco; funziona con qualsiasi plugin.
- **Mazzo:** è un'istanza della libreria (tipo "mazzo"), modificabile con lo stesso editor a form generato dallo schema, invece delle tabelle `decks` e `ability_cards`.
- **Sprite:** asset **Kenney "Tiny Dungeon" (CC0)** per cavalieri e icone delle carte, più colore del team aggiunto in codice (base, barra PV, mantello/pennacchio). Le animazioni sono movimenti ed effetti in PixiJS, caricato in modo lazy solo sullo schermo condiviso.
- **Passi:** 7.1 carte e motore di battaglia · 7.2 `team-vote` e draft · 7.3 contenitore, configurazione ed editor del mazzo · 7.4 interfacce giocabili (telefono e arena HTML) · 7.5 arena PixiJS · 7.6 bilanciamento e documenti.

---

## Modello dati (SQLite)

- `players` (id, nickname, avatar, color, token, pin_hash, created_at)
- `teams` (id, name, color, emblem)
- `events`: la serata (id, name, date, status)
- `event_teams` / `event_players` (player → team per quella serata)
- `matches`: partite della serata (id, event_id, order, name, status)
- `minigame_instances` (id, type_id, title, theme, config_json): libreria riutilizzabile
- `match_rounds` (match_id, order, minigame_instance_id)
- `score_entries` (event_id, match_id, round_id, player_id, team_id, points, reason, ts): un registro da cui si calcolano entrambe le classifiche e che permette correzioni manuali tracciabili
- le colonne `matches.mode` e `matches.mode_config_json` restano nel database per compatibilità ma valgono sempre `classic` e `{}`; la configurazione del duello (PV, X minigiochi per battaglia, carte per draft, mazzo usato) sta in `minigame_instances.config_json`
- `ability_cards` (id, deck_id, name, sprite, rarity, initiative, effects_json) e `decks` (id, name)
- `match_state_snapshots` (match_id, state_json, ts): salvataggio periodico dello stato in corso, così una serata non si perde se il PC si riavvia
- `round_messages` (event_id, match_id, round_id, message_id, kind, from/to, recipients_json, text, ts, read_at, cancelled): messaggi ed eventi dei round con Game Master, chiave unica (round, message_id) per un salvataggio idempotente; `round_event_receipts` (round_id, message_id, player_id, accepted_at): una riga per destinatario di un evento
- `settings` custodisce anche l'hash del token del Game Master (`master_session`, con scadenza e partita di appartenenza)

---

## Le tre interfacce

1. **Schermo (`/screen`)**
   - QR code con l'IP LAN rilevato automaticamente, più un codice stanza;
   - lobby con gli avatar che entrano;
   - minigioco in corso;
   - classifiche animate (individuale e squadre);
   - reazioni emoji dei giocatori che "volano" sullo schermo.
2. **Telecomando (`/play`)**
   - crea o recupera il profilo, unisciti alla serata, scegli o ricevi il team;
   - controller con pulsanti grandi, che cambia in base al minigioco;
   - barra reazioni sempre disponibile (interazione blanda);
   - Wake Lock per non far spegnere lo schermo, dove il browser lo supporta;
   - indicatore di connessione e riconnessione automatica.
3. **Regia/Admin (`/admin`, apribile dal PC o da un telefono)**
   - CRUD di team, serate, partite e libreria minigiochi (form generati da `configSchema`, import/export JSON delle domande);
   - **conduzione live**: avvia, avanti, pausa, rivela, convalida la risposta al buzzer, assegna o toglie punti a mano, sposta giocatori tra team.

### Primitive del telecomando (riusate dai plugin)
`buttons[]` (scelta multipla), `buzzer`, `text` (risposta aperta), `number/slider` (stime), `vote` (votare un altro giocatore o team), `reactions`, `waiting` (schermata di attesa con il tema).

### Minigiochi iniziali (MVP)
1. **Quiz a scelta multipla**: più punti a chi risponde prima, con timer.
2. **Buzzer**: ci si prenota e il primo risponde a voce; la regia convalida, e se la risposta è sbagliata il turno passa al successivo.
3. **Vero/Falso a raffica**.
4. **Stima numerica**: vince chi si avvicina di più.
5. **Sondaggio/voto**: per giochi sociali, senza risposta giusta.

**Equità del buzzer (obbligatoria con la rete cellulare)**

1. **Sincronizzazione dell'orologio.** Ogni telefono misura continuamente RTT e offset rispetto al server (ping/pong in stile NTP).
2. **Pressione.** Quando il giocatore preme, il telefono invia il proprio timestamp convertito in "ora server".
3. **Raccolta.** Il server apre una breve **finestra di raccolta** (~250 ms dopo la prima pressione ricevuta) e ordina le pressioni per timestamp corretto.
4. **Anti-trucco.** Si scartano i timestamp incoerenti: nel futuro, precedenti all'apertura del buzzer, o con offset fuori dal RTT misurato.

Lo stesso meccanismo vale per i punti-velocità del quiz. Lo schermo mostra il ping di ogni giocatore, così si vede chi ha una connessione problematica.

### 🔐 Stanze Segrete (`stanze-segrete`, tema `retro80`): GDR con Game Master

Sessione ispirata a *Room 25*, condotta da una persona (il **Game Master**, che non gioca): giocatori da 1 a 10 in un complesso di stanze a griglia, ognuna con una lettera nascosta (la mappa di esempio intreccia MORTA e USCITA). Il GM piazza i giocatori, accende e spegne le **capacità** (muoversi con una croce direzionale, sbirciare, guardare la lettera a tempo, scrivere, proporre la soluzione, azioni libere), approva ogni spostamento, chiude le porte, manda messaggi segreti ed **eventi** da accettare. Dettagli e decisioni in [docs/PIANO-STANZE-SEGRETE.md](docs/PIANO-STANZE-SEGRETE.md), guida d'uso in [docs/STANZE-SEGRETE.md](docs/STANZE-SEGRETE.md).
- **Ruolo Game Master** (generico, riusabile da altri plugin): ruolo `master` del server con **link limitato** (token con scadenza, solo l'hash nel database, revocabile, valido per la partita in corso e solo per i comandi del plugin). Nuovi campi facoltativi di `MinigameType`: `master`, `maxPlayers`, `messages()`; componente client facoltativo `Host` (caricato a richiesta, non finisce nel bundle del telefono). Area `/master` e riquadro «Link del Game Master» nel pannello Live.
- **Messaggi ed eventi nel database**: il plugin li tiene nello stato (ultimi 300) e l'engine li copia dopo ogni cambio di stato in modo idempotente; la regia li consulta, filtra, esporta ed elimina dalla scheda «Messaggi».
- **Privacy**: le lettere arrivano a un telefono solo durante un'occhiata concessa (e spariscono alla scadenza); schermo e telefoni non ricevono mai note, porte, permessi, richieste o messaggi altrui; i testi dei giocatori non vanno mai sullo schermo. Coperto da test anti-leak, e2e sui frame WebSocket e stress (`pnpm stress --players 10 --scenario stanze`).

### 🐺 Parole Mannare (`parole-mannare`, tema `manga`): deduzione sociale a voce
Ispirato a *Werewords* ma **senza scatola né companion app**: l'app sostituisce i componenti fisici (ruoli in privato, timer, gettoni, voti, punti) e le domande restano a voce. Da 4 a 12 giocatori (`maxPlayers: 12`). Il **Sindaco** (giocatore con un ruolo segreto) sceglie la parola e risponde assegnando **gettoni** dal telefono, trascinando un nome su un gettone o il contrario (o toccando uno e poi l'altro); **Lupi** e **Veggente** conoscono la parola. Parola indovinata → i Lupi cercano il Veggente; non indovinata → voto sul Lupo; i pareggi vanno al **ballottaggio**. Decisioni in [docs/PIANO-PAROLE-MANNARE.md](docs/PIANO-PAROLE-MANNARE.md), guida in [docs/PAROLE-MANNARE.md](docs/PAROLE-MANNARE.md).
- **Registro dei gettoni**: conteggi per giocatore e riserve (Sì/No comuni, Forse, «Ci sei quasi», «Lontanissimo») sono funzioni pure del registro (voci con `undone`), così l'**annulla** a più passi non ha contatori da riallineare; l'annulla non restituisce tempo. «Esatto» ha una breve finestra di annullamento.
- **Avvisi**: ogni gettone arriva a tutti i telefoni («Sì → Carla», «Sì **a te**!», «Annullato…») dal registro nella vista; dopo una riconnessione gli avvisi vecchi non si rimostrano.
- **Privacy**: parola, proposte, ruoli e voti sono segreti per schermo e telefoni fino al momento giusto; coperto da test anti-leak e da e2e sui frame WebSocket.
- **Numero di Lupi** adattato alla dimensione (1 / 2 / 3 con 4–6 / 7–11 / 12 giocatori). Regole mostrate nell'app in `rulesText.ts`: **se si cambiano le regole va aggiornato**.
- **Test**: unit e anti-leak del plugin, anteprima Playwright (`pm-*`, layout e gesti), e2e di partite complete e stress (`pnpm stress --players 12 --scenario parole`).

### 💣 Stanze col botto (`stanze-col-botto`, tema `boom`): deduzione sociale in due stanze
Ispirato a *Two Rooms and a Boom* ma **senza carte**: il telefono è la carta personaggio, l'app abbina i giocatori a due stanze fisiche, distribuisce i ruoli, tiene il tempo, gestisce leader (voto, nomina, passaggio), ostaggi, condivisioni delle carte e rivelazione. Da 6 a 30 giocatori (`minPlayers: 6`, `maxPlayers: 30`). La trattativa resta a voce. Regole, decisioni e piano in [docs/PIANO-STANZE-COL-BOTTO.md](docs/PIANO-STANZE-COL-BOTTO.md); guida in [docs/STANZE-COL-BOTTO.md](docs/STANZE-COL-BOTTO.md).
- **Nuovo campo di `MinigameType`**: `minPlayers`, controllato dall'engine accanto a `maxPlayers` (vale anche per Parole Mannare, da 4).
- **Chi conosce la carta di chi** è una funzione pura del registro `shares` (`knownBy`): «Mostra» è a senso unico, «Scambia» è reciproco e consensuale (alcuni personaggi avanzati conteranno solo le condivisioni).
- **Leader non segreti ma ritardati**: la propria stanza lo vede subito, l'altra e lo schermo dopo il blocco di entrambe le stanze.
- **Regia cieca**: con «Gioco anch'io» `hostView` non contiene carte, voti, condivisioni né scelte degli ostaggi (il segreto non arriva al browser).
- **Abbinamento alle stanze** a caso, con QR di stanza (`/play?stanza=CODICE`, scanner di Caccia ai Fantasmi riusato) o dalla regia.
- **Test**: unit e anti-leak del plugin, anteprima Playwright (`scb-*` nei 5 temi), e2e di partite complete e stress (`pnpm stress --players 30 --scenario botto`).

### 📡 Lunghezza d'Onda (`lunghezza-onda`, tema `gameshow`): indizi su uno spettro
Ispirato a *Wavelength*: a turno un **Sensitivo** vede sul telefono dove cade un bersaglio nascosto su uno spettro tra due estremi e scrive un indizio; gli altri trascinano un **quadrante** a semicerchio sul telefono e la TV apre il coperchio (fasce da 4, 3 e 2 punti). Due modalità: **tutti contro tutti** (ognuno per sé, il Sensitivo prende la media) e **a squadre** (mediana della squadra dal vivo sulla TV, scommessa sinistra/destra delle altre squadre, recupero). Da 3 a 30 giocatori. Regole, decisioni e piano in [docs/PIANO-LUNGHEZZA-ONDA.md](docs/PIANO-LUNGHEZZA-ONDA.md); guida in [docs/LUNGHEZZA-ONDA.md](docs/LUNGHEZZA-ONDA.md).
- **Calcoli puri** in `scoring.ts` (fasce, mediana, maggioranza, scommesse): lo stress rifà i conti di ogni turno e li confronta con la cronologia.
- **Invii del quadrante**: in «tutti» uno solo al rilascio, a squadre al massimo ogni 250 ms durante il trascinamento (i compagni vedono la posizione dal vivo).
- **Privacy**: bersaglio solo al Sensitivo (da quando ha scelto lo spettro) e alla regia; in «tutti» niente posizioni altrui prima della rivelazione.
- **Test**: unit e anti-leak del plugin, anteprima Playwright (`lo-*` nei 5 temi, trascinamento del quadrante), e2e di partite complete nelle due modalità (frame inviati e ricevuti) e stress (`pnpm stress --players 30 --scenario onda`).

### 🕶 Agenti Segreti (`agenti-segreti`, tema `retro80`): parole e indizi a squadre
Ispirato a *Codenames*: la TV mostra la griglia di 25 parole (16 con 4×4), i due **Capi-spia** vedono sul telefono la mappa segreta (agenti delle due squadre, civili, assassino) e scrivono l'indizio (una parola e un numero, 0 e ∞ compresi); la squadra **vota dal telefono** una carta alla volta, con i voti pubblici come pallini sulla TV. Da 4 a 30 giocatori. Regole, decisioni e piano in [docs/PIANO-AGENTI-SEGRETI.md](docs/PIANO-AGENTI-SEGRETI.md); guida in [docs/AGENTI-SEGRETI.md](docs/AGENTI-SEGRETI.md).
- **Voto di squadra** con il modulo comune `team-vote` (spostato fuori dal duello) e la nuova opzione `onTie: "none"`: con un pareggio non si scopre nulla e il turno passa.
- **Controllo automatico dell'indizio**: rifiutate le parole della griglia ancora coperte e quelle con una parte in comune di almeno 4 lettere; i casi sottili restano alla regia («Indizio non valido»).
- **Privacy**: le carte coperte di TV e agenti non hanno la chiave `kind`; la mappa solo ai Capi-spia e solo da «Distribuisci»; regia cieca come in Stanze col botto.
- **Telefono in una schermata**: il testo delle carte si adatta alla larghezza con le container query (nel tema pixel le parole lunghe vanno su due righe); il test di anteprima prova tutte le 300 parole d'esempio nei 5 temi.
- **Parole nel database**: non nel codice del gioco ma in una «Lista di parole» della libreria (comune con Reazione a catena), creata dal server al primo avvio e modificabile, esportabile e importabile dall'editor (area di testo con una parola per riga, widget `lines`).
- **Test**: unit e anti-leak del plugin, anteprima Playwright (`as-*` nei 5 temi), e2e di partite complete (con i frame WebSocket) e stress (`pnpm stress --players 30 --scenario agenti`, con un controllo di privacy su ogni vista ricevuta dai bot).

### 👻 Caccia ai Fantasmi (`caccia-fantasmi`, tema `retro80`): gioco fisico con QR
Re della collina con ruoli nascosti, da giocare muovendosi nella location.

- **Zone**: 2–8 punti con un QR ciascuno (il link è `/play?zona=CODICE`). Si scansiona in tre modi: **scanner dentro l'app** (fotocamera + jsQR, caricata a richiesta in un pezzo separato da ~130 KB; in ogni caso la zona prima si **controlla** (la scheda mostra il suo stato) e poi si conquista con un bottone, «Infesta» per i fantasmi e «Purifica» per i cacciatori), **fotocamera di sistema** (il link si apre sulla scheda di controllo) o **codice a mano**. La fotocamera nel browser richiede HTTPS: col tunnel funziona, sulla LAN `http://` il browser la blocca e restano gli altri due modi. Chi scansiona conquista la zona per la sua fazione e, finché la tiene, guadagna punti al secondo. Il QR si stampa dal pannello Live **a serata avviata** (l'indirizzo del Quick Tunnel cambia a ogni avvio).
- **Ruoli**: pochi fantasmi segreti (si conoscono tra loro) contro gli acchiappafantasmi. **Lo stato di una zona (libera, infestata, purificata) è un segreto**: né lo schermo né i telefoni lo mostrano, lo conosce solo chi la scansiona di persona (e la sua informazione invecchia: sul telefono compare con «visto N s fa»). Per questo anche secondi per fazione, punti personali e conquiste non sono pubblici durante la caccia (sarebbero indizi), e chi vuole informazioni si affolla vicino ai QR, dove un fantasma può confondersi. I cacciatori devono dedurre dai movimenti reali chi è un fantasma. Tutto si scopre alla rivelazione; la regia vede sempre lo stato di tutte le zone.
- **Accuse**: un'accusa giusta imprigiona il fantasma (non scansiona e perde le zone) e dà punti; una sbagliata blocca l'accusatore e costa punti. I fantasmi hanno un vantaggio iniziale per nascondersi.
- **Bilanciamento** (misurato con `pnpm balance:caccia`, che fa giocare il vero plugin a giocatori simulati): senza correttivi i cacciatori vincevano il 100% delle volte, perché sono 4 volte più numerosi e riprendersi una zona costa uno scan. Due correttivi: **blocco della zona** dopo ogni conquista (default 30 s: nessuno può riprenderla, quindi ogni incursione vale qualcosa e conta il tempismo) e **peso dei secondi dei fantasmi** (automatico `1,1 + 0,4 × zone / fantasmi`, da 1 a 3; il peso «ovvio» cacciatori/fantasmi sarebbe 4 e farebbe vincere sempre i fantasmi). Con questi, a pari abilità si sta tra il 45 e il 60% per i fantasmi, e vince chi gioca meglio (cacciatori organizzati contro fantasmi ingenui vincono i cacciatori, fantasmi che controllano e aspettano la fine del blocco battono cacciatori vagabondi). Limiti: la simulazione modella movimenti e accuse in modo grossolano; con soli 8 giocatori i fantasmi sono un po' favoriti, con troppi pochi fantasmi (es. 3 su 30) sfavoriti. Rilanciarla a ogni modifica a blocco, peso, pause, vantaggio o punteggio.
- **Regole in app**: il bottone «ℹ️ Regole» del telefono apre la spiegazione a schermo intero, con i numeri veri della partita (durata, pause, prigione, punti: arrivano nella vista del giocatore) e la sezione del proprio ruolo. Il testo sta in `rulesText.ts`: **se si cambiano le regole va aggiornato** (i test controllano che i numeri vengano dalla configurazione).
- **Fasi**: `setup` (la regia appende i QR, i telefoni mostrano il ruolo) → `play` (a tempo) → `reveal` (ruoli e vincitore sullo schermo) → `done`. La rivelazione è una fase a parte perché il motore chiude il round appena `isFinished` è vero. Vince la fazione che ha tenuto le zone per più secondi.
- **Perché non Bluetooth o NFC per la distanza** (valutati con l'utente): una pagina web non può né trasmettere né misurare il segnale Bluetooth (Web Bluetooth manca su Safari iOS e non espone l'RSSI di dispositivi qualsiasi), e l'NFC dal browser funziona solo su Chrome Android e solo contro tag, a pochi centimetri. Servirebbe un'app nativa, contro il vincolo D1. I QR sono l'unica soluzione che funziona su ogni telefono; un adesivo NFC con lo stesso link sarebbe equivalente a un QR.
- **Limite noto**: chi fotografa un QR può inviare il codice da lontano. È accettato (party game tra amici); si mitiga con codici non banali e con la pausa tra scansioni.

### 💣 Artificieri (`artificieri`, tema `boom`): disinnesco a squadre con informazioni divise
Ispirato a *Keep Talking and Nobody Explodes*: una squadra alla volta, l'**artificiere** davanti alla TV con la bomba e il telefono come telecomando, gli **esperti di spalle alla TV** con il manuale diviso a pagine sui telefoni; le altre squadre scommettono. Da 2 a 30 giocatori (`minPlayers: 2`). Sei tipi di modulo (fili, pulsante, simboli, colori, labirinto, parola). Regole, decisioni e piano in [docs/PIANO-ARTIFICIERI.md](docs/PIANO-ARTIFICIERI.md); guida in [docs/ARTIFICIERI.md](docs/ARTIFICIERI.md).
- **Regole come dati**: ogni modulo ha un generatore (dal seme) e un giudice; le regole del manuale sono strutture, da cui vengono sia il giudizio sia il testo, quindi non si contraddicono. Il manuale è **generato dal seme di ogni bomba** (opzione `sameManual`) e **diviso tra gli esperti**.
- **Generatore di labirinti comune** (`packages/minigames/src/maze.ts`: perfetto o con cicli, percorso più breve), riusato da Pilota alla cieca.
- **Timer della bomba** con ancora e velocità (accelera del 25% a ogni errore), azioni giudicate all'**ora equa** (`fairTime`): il pulsante si rilascia sulla cifra delle unità dei secondi, con ±150 ms di tolleranza.
- **Privacy**: i telefoni non ricevono mai bordo, dati dei moduli, regole, soluzioni o scommesse altrui; la TV mostra la bomba solo in disinnesco e la striscia del pulsante solo mentre è tenuto. Le viste filtrate hanno chiavi scelte perché nessun nome segreto compaia in una vista pubblica (`settings`, non `rules`).
- **Parole del modulo «Parola»** da una «Lista di parole» della libreria (`libraryConfigSchema` + `buildConfig`, come Agenti Segreti); il modulo è spento di default.
- **Regole in app**: bottone «ℹ️ Regole» del telefono, testo in `rulesText.ts`: **se si cambiano le regole va aggiornato**.
- **Test**: unit (generatori su migliaia di semi, plugin, anti-leak, `maze.test.ts`), anteprima Playwright (`art-*` nei 5 temi), e2e di partite complete e stress (`pnpm stress --players 30 --scenario artificieri`, con artificieri simulati che leggono le soluzioni dalla vista della regia).

### 🧭 Pilota alla cieca (`pilota-cieco`, tema `pixel`): labirinto a squadre con informazioni divise
Una gara in cui **chi guida non vede i pericoli** e **chi vede i pericoli non guida**: il **pilota** guarda la TV e muove la pedina con la croce, ogni **navigatore** vede sul telefono un solo strato (mine, porte, chiavi, pattuglie). Fino a 4 squadre in contemporanea (TV divisa in corsie) o a turno; da 2 a 30 giocatori (`minPlayers: 2`). Regole, decisioni e piano in [docs/PIANO-PILOTA-CIECO.md](docs/PIANO-PILOTA-CIECO.md); guida in [docs/PILOTA-CIECO.md](docs/PILOTA-CIECO.md).
- **Labirinti diversi ma equivalenti** per squadra (stesse quantità di pericoli, percorso più breve entro il 10% della media), generati dal seme sopra il generatore comune `maze.ts`; mine mai sul percorso più breve, quindi ogni livello si può vincere.
- **Porte e pattuglie sono funzioni pure del tempo** (`packages/shared/src/timeline.ts`): il server le usa per giudicare i passi, i telefoni dei navigatori per mostrarle, senza traffico. I passi si giudicano all'**ora equa** (`fairTime`).
- **Privacy**: la TV e il pilota non ricevono mai gli strati nella gara, un navigatore solo i propri (e della propria corsia); a fine gara (`level-end`) si scopre tutto di proposito. Coperto da `pilota-leak.test.ts`, e2e sui frame WebSocket e stress.
- **Regole in app**: bottone «ℹ️ Regole» del telefono, testo in `rulesText.ts`: **se si cambiano le regole va aggiornato**.
- **Misure dello stress** (30 telefoni, 4 piloti a raffica): ~31 invii per passo, stato dopo un passo in mediana 3 ms e p95 4 ms; annotate in [docs/PILOTA-CIECO.md](docs/PILOTA-CIECO.md) per dimensionare il primo passo di Plancia di Comando.
- **Test**: unit (generatore su migliaia di semi, equità, movimento, plugin, anti-leak), anteprima Playwright (`pc-*` nei 5 temi), e2e di partite con mina, porta e arrivo, e stress (`pnpm stress --players 30 --scenario pilota`).

### 📡 Invii raggruppati (`realtime.ts`)
Ogni cambio di stato rimandava **tutte** le viste a **tutti** i telefoni (30 invii per input con 30 giocatori). Ora `flush` accorpa gli input a raffica (il primo dopo una pausa parte subito, gli altri al più tardi dopo `flushMs` = 80 ms) e **non rimanda una vista identica** all'ultima inviata a quel telefono: negli stress con 30 giocatori gli aggiornamenti calano dell'83% (classico) e del 78% (Lunghezza d'Onda); in Pilota alla cieca del 12% (la posizione dei piloti è pubblica). Il tetto di ritardo è l'intervallo di accorpamento (~80 ms); l'ora equa degli input viene da `meta`, non dall'istante di invio. Per questo **la vista di un telefono va tenuta essenziale**: dati che cambiano per tutti a ogni azione annullano la deduplicazione. Misure e dettagli in [docs/PIANO-PLANCIA-COMANDO.md](docs/PIANO-PLANCIA-COMANDO.md); test in `realtime-flush.test.ts`.

### 🚀 Plancia di Comando (`plancia-comando`, tema `retro80`): ordini gridati tra telefoni
Gioco caotico in stile *Spaceteam*: ogni telefono è un **pannello** di 4–6 comandi dai nomi assurdi (pulsanti, interruttori, cursori, selettori) e gli **ordini** a tempo arrivano ai compagni, che devono **gridarli**. Ordine eseguito → l'astronave avanza; scaduto → lo scafo si danneggia. A squadre (ogni team è un equipaggio da 2 a 8 membri) o in equipaggio unico; da 2 a 30 giocatori (`minPlayers: 2`). Piano in [docs/PIANO-PLANCIA-COMANDO.md](docs/PIANO-PLANCIA-COMANDO.md); guida in [docs/PLANCIA-COMANDO.md](docs/PLANCIA-COMANDO.md).
- **Settori** con salto (pannelli nuovi, ordini −10% di tempo, un comando in più dal terzo), **eventi** (allarme generale: tutti premono il pulsante rosso; blackout: nomi ridotti alle iniziali) e **punti** per ordine, scafo e piazzamento; la classifica va per passi **per membro**.
- **Ordini all'ora equa** (`fairTime` + `GRACE_MS`): la rete lenta non penalizza. Nessun punto per la rapidità.
- **Privacy**: ogni telefono riceve solo i propri comandi e il proprio ordine; la TV né pannelli né ordini in corso (solo l'ultimo eseguito, in ritardo). Coperto da `plancia-leak.test.ts`, e2e sui frame WebSocket e stress. La vista del telefono resta essenziale per non annullare la deduplicazione di `realtime.ts`.
- **Regia**: vede l'ordine di ogni membro; ripara gli scafi, rimescola i pannelli, salta il settore e segna un telefono **fuori uso** (📵).
- **Regole in app**: bottone «ℹ️» del telefono, testo in `rulesText.ts`: **se si cambiano le regole va aggiornato**.
- **Misure dello stress** (30 telefoni, 4 equipaggi, ~9 comandi al secondo): ~2 aggiornamenti per comando (senza deduplicazione sarebbero ~30), stato di ritorno in mediana ~30 ms e p95 ~450 ms.
- **Test**: unit (pannelli e nomi, plugin, anti-leak, bot), anteprima Playwright (`pdc-*` nei 5 temi), e2e con equipaggi veri e stress (`pnpm stress --players 30 --scenario plancia`).

---

## Struttura del repository
```
gioco-ros/
  PIANO.md
  package.json, pnpm-workspace.yaml, tsconfig.base.json
  packages/
    shared/      # tipi, schemi zod, protocollo socket, interfaccia MinigameType
    server/      # Fastify + Socket.IO, engine (state machine serata/partita/round), DB Drizzle
    client/      # React: screen/, play/, admin/, themes/, controller-primitives/
    minigames/   # un plugin per cartella: quiz-multipla/, buzzer/, vero-falso/, stima/, sondaggio/
  tools/bots/    # simulatore di N giocatori
  data/          # gioco.sqlite (ignorato da git)
```

---

## Fasi di lavoro

| Fase | Contenuto | Risultato verificabile |
|---|---|---|
| **F0 Setup** | Monorepo, lint/format, Vitest, server che serve il client buildato, avvio automatico di `cloudflared` quick tunnel + lettura URL, QR internet + QR LAN | `pnpm dev` apre lo schermo con i 2 QR; un telefono **in 4G con il Wi-Fi spento** raggiunge la pagina |
| **F1 Realtime core** | Protocollo socket tipizzato, room per serata, profili con token e PIN, riconnessione con risincronizzazione dello stato, sincronizzazione orologio + misura del ping | 2 telefoni (uno in 4G, uno in Wi-Fi) entrano in lobby, bloccano o sbloccano lo schermo e rientrano; il ping è visibile |
| **F2 Admin base** | Password admin, CRUD di team, serate e partite, assegnazione giocatori ai team | Serata creata e giocatori divisi in team |
| **F3 Engine + primi giochi** | State machine serata→partita→round, registro punteggi, classifiche, plugin Quiz e Buzzer, conduzione live | Una partita completa di quiz e buzzer giocata end-to-end |
| **F4 Editor minigiochi** | Form da `configSchema`, libreria istanze, import/export JSON, composizione round nelle partite | L'admin crea un quiz senza toccare codice |
| **F5 Grafica e temi** | Theme pack gameshow, pixel, manga e retro80; audio; animazioni delle classifiche; reazioni emoji | Ogni minigioco ha il suo look sullo schermo e sul telefono |
| **F6 Altri minigiochi** | Vero/Falso, Stima, Sondaggio; documentazione "come creare un nuovo plugin" | 5 tipi disponibili |
| **F7 Duello dei Cavalieri** | Modalità partita meta-gioco, modulo `team-vote`, draft a priorità, mazzo abilità ed editor, motore di risoluzione battaglia (funzioni pure), arena PixiJS con sprite e animazioni, vista "tieni premuto per vedere" | Duello completo 2 team: minigiochi → draft segreti → battaglia simultanea animata → KO |
| **F8 Packaging e prova sul campo** | Eseguibile Windows, guida per l'host (Wi-Fi, hotspot, proiettore), stress test con 30 bot, prova reale | Una serata di test con persone vere |

Ogni fase termina con una demo prima di passare alla successiva, così puoi correggere la rotta.

### Stato di avanzamento

| Fase | Stato | Note |
|---|---|---|
| F0 Setup | ✅ | Tunnel Cloudflare, QR internet e LAN |
| F1 Realtime core | ✅ | Profili con token e PIN, riconnessione, orologio e ping |
| F2 Admin base | ✅ | Password, squadre, serate, partite, assegnazioni |
| F3 Engine + primi giochi | ✅ | Quiz e Buzzer con ora equa; punteggi e classifiche |
| F4 Editor minigiochi | ✅ | Form generato dallo schema, import/export JSON |
| F5 Grafica e temi | ✅ | 5 theme pack (`boom` aggiunto con Stanze col botto), audio sintetizzato, classifiche animate, reazioni |
| F6 Altri minigiochi | ✅ | Vero/Falso, Stima, Sondaggio; guida `docs/NUOVO-MINIGIOCO.md` |
| F7 Duello dei Cavalieri | ✅ (da provare con persone) | Guida `docs/DUELLO-DEI-CAVALIERI.md`; arena in HTML/CSS con sprite Kenney |
| F8 Packaging e prova sul campo | ✅ (prova sul campo da fare) | Pacchetto portabile per Windows, guida per l'host, stress test con 30 bot, salvataggio e ripresa della partita |
| Extra: Parole Mannare | ✅ (da provare con persone) | Deduzione sociale a voce con gettoni trascinabili; guida `docs/PAROLE-MANNARE.md` |
| Extra: Stanze col botto | ✅ (da provare con persone) | Deduzione sociale in due stanze (6–30 giocatori) con leader, ostaggi, mostra/scambia carte e regia cieca; tema `boom`; guida `docs/STANZE-COL-BOTTO.md`; personaggi avanzati (T8) da fare |
| Extra: Lunghezza d'Onda | ✅ (da provare con persone) | Indizi su uno spettro (3–30 giocatori) con quadrante da trascinare, modalità tutti contro tutti e a squadre (mediana, scommessa, recupero); guida `docs/LUNGHEZZA-ONDA.md` |
| Extra: Agenti Segreti | ✅ (da provare con persone) | Parole e indizi a squadre (4–30 giocatori) con mappa segreta ai Capi-spia, indizio controllato dal server, voto di squadra dal telefono e regia cieca; guida `docs/AGENTI-SEGRETI.md` |
| Extra: Stanze Segrete | ✅ (da provare con persone) | GDR con ruolo Game Master (link limitato, `/master`), messaggi ed eventi salvati nel database; guida `docs/STANZE-SEGRETE.md` |
| Extra: Artificieri | ✅ (da provare con persone) | Disinnesco a squadre con informazioni divise (2–30 giocatori), 6 moduli, manuale diviso tra gli esperti, scommesse; tema `boom`; guida `docs/ARTIFICIERI.md` |
| Extra: Pilota alla cieca | ✅ (da provare con persone) | Gara a squadre in labirinto con strati di informazioni divisi tra i navigatori (2–30 giocatori), corsie in contemporanea o a turno; tema `pixel`; guida `docs/PILOTA-CIECO.md` |
| Extra: Plancia di Comando | ✅ (da provare con persone) | Ordini gridati tra telefoni in stile Spaceteam (2–30 giocatori), pannelli di comandi, settori, scafo ed eventi; tema `retro80`; guida `docs/PLANCIA-COMANDO.md` |

**Scostamenti dal piano originale (concordati)**
- **Test end-to-end con Playwright** (Edge, senza screenshot) oltre a Vitest.
- **Plugin in due parti**: logica pura in `packages/minigames`, viste React nel client.
- **Mazzo del duello** come contenuto della libreria, non come tabelle `decks`/`ability_cards`.
- **Arena del duello in HTML/CSS** (animazioni CSS sugli sprite) invece di PixiJS: PixiJS resta una possibile miglioria futura per particelle ed effetti più ricchi.
- **Eseguibile = pacchetto portabile** (cartella/zip con `node.exe`, server in un solo file via esbuild, client compilato, modulo nativo SQLite, `cloudflared.exe` e lanciatori `.bat`) invece di Node SEA o `bun build --compile`: più semplice e robusto con il modulo nativo di SQLite. Il lanciatore apre schermo e regia nel browser.
- **Snapshot dello stato** (`match_state_snapshots`): la partita in corso si salva a ogni cambiamento e riprende dopo un riavvio del PC; i timer scaduti nel frattempo si risolvono al primo tick.
- **Tunnel**: riavvio automatico con attese crescenti se `cloudflared` cade, e spegnimento di un `cloudflared` orfano al riavvio (PID annotato in `data/cloudflared.pid`).

---

## Verifica

- **Unit test (Vitest)** sulle funzioni pure dei plugin (`init`, `onInput`, `onTick`, `scores`) e sulla state machine: ordine del buzzer, timeout, punteggi, riconnessione a metà round.
- **Test end-to-end (Playwright, `pnpm test:e2e`):** schermo, regia e telefoni emulati giocano partite complete (quiz, buzzer, rettifiche, ritorno alla lobby), con controllo dei frame WebSocket per escludere fughe di informazioni segrete, editor a form, temi, reazioni e peso della pagina del telefono.
- **Bot di carico:** `tools/bots` lancia 30 client simulati che rispondono in modo casuale. Si controllano latenza, consistenza delle classifiche e assenza di errori.
- **Test sulle informazioni private:** per ogni plugin si verifica che `screenView` e `viewFor` del team avversario non contengano mai le carte, i voti o le soluzioni segrete. Il test è automatico e scorre lo stato a ogni step.
- **Test del motore di battaglia:** tabelle di casi (scudo contro attacco, contrattacco, veleno, furto con mano vuota, parità di iniziativa) e simulazione di 1000 duelli tra bot casuali, per scovare combinazioni sbilanciate o loop infiniti.
- **Test del buzzer con latenza simulata:** i bot introducono ritardi casuali di 50-300 ms; il vincitore deve essere chi ha premuto davvero per primo.
- **Test manuali su dispositivi reali:** almeno un iPhone (Safari) e un Android (Chrome), **uno in 4G/5G e uno in Wi-Fi**, collegati tramite tunnel. Checklist:
  - ingresso via QR;
  - riconnessione dopo il blocco dello schermo;
  - audio sbloccato su iOS;
  - buzzer reattivo;
  - layout in verticale.
- **Prova generale:** una serata breve (2 partite, 3 minigiochi) con lo schermo collegato al proiettore o alla TV.

## Rischi noti
- **Quick Tunnel non disponibile o lento.** Mitigazioni: tunnel alternativo configurabile; fallback solo LAN o hotspot; lo schermo segnala lo stato del tunnel.
- **Copertura cellulare scarsa nella stanza** (es. seminterrato). Mitigazioni: i giocatori interessati usano il QR LAN; riconnessione robusta; buzzer con compensazione della latenza.
- **PC senza internet**: si usa l'hotspot di un telefono collegato al PC.
- **Safari iOS**: l'audio parte solo dopo un tocco (si chiede un "Tocca per entrare"); niente vibrazione; il Wake Lock va verificato.
- **Telefoni in standby**: la riconnessione robusta è un requisito di F1, non un'aggiunta finale.
- **Asset grafici** (pixel art, manga): servono sprite e illustrazioni. All'inizio si usano asset gratuiti con licenza libera (es. CC0 di Kenney.nl) e font Google; eventuali asset personalizzati si aggiungono dopo.
