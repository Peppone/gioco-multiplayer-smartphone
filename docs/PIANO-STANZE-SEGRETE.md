# Piano: «Stanze Segrete» (GDR in stile Room 25) e ruolo Game Master

> Stato: **implementato** (passi S1–S9). Guida per il GM: [STANZE-SEGRETE.md](STANZE-SEGRETE.md). Branch: `feat/stanze-segrete-master`.
> Da leggere insieme a [PIANO.md](../PIANO.md) e [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

## 1. Obiettivo

Una sessione di gioco di ruolo ispirata a *Room 25*. I giocatori sono rinchiusi in un complesso di stanze
disposte a griglia 3×3 e devono trovare l'uscita. Ogni stanza nasconde una **lettera**. Un **Game Master**
(GM, una persona e non il software) conduce la sessione dal telefono o dal PC:

- vede la mappa completa, con tutte le lettere;
- **decide la stanza di partenza** di ogni giocatore e lo può spostare in qualunque momento;
- **abilita e disabilita in qualsiasi momento** le capacità di ogni giocatore (muoversi, guardare la lettera, scrivergli, proporre la soluzione…);
- decide **chi può vedere le lettere e quando**: nessuno le vede di diritto e nessuno le vede sempre;
- quando un giocatore deve muoversi, sul suo telefono compare una **croce direzionale**; il GM può **bloccare
  alcune direzioni** e **approva ogni spostamento**;
- manda **messaggi segreti** ai singoli giocatori, che li **leggono e rispondono dal cellulare**;
- comunica **eventi** («Evento: crolla il soffitto della Stanza 5») a tutti o a un gruppo scelto: ogni destinatario
  li deve **accettare** e li ritrova nella propria **cronologia eventi**.

Il software fa da tavolo e da messaggero: la narrazione, la descrizione delle stanze e le decisioni restano al GM.

**Nome.** «Room 25» è un marchio commerciale (Matagot): nell'app il gioco si chiama **«Stanze Segrete»**
(id del plugin `stanze-segrete`), tema `retro80` (atmosfera da complesso sci-fi). Il nome è facilmente modificabile.

## 2. Decisioni confermate con l'utente

| Tema | Decisione |
|---|---|
| Accesso del GM | **Link limitato** generato dalla regia (token con scadenza, revocabile, solo comandi del plugin) |
| Il GM gioca? | **No**: il GM non è un giocatore, non è nel roster e non è in classifica |
| Numero di giocatori | **Da 1 a 10** (il GM escluso). Il resto dell'app continua a reggere fino a ~30 giocatori: il limite vale solo per questo gioco (§5.1) |
| Stanza di partenza | **La decide il GM**, giocatore per giocatore (anche stanze diverse). Il software non impone di partire dalla A |
| Capacità | Il GM le **abilita e disabilita in qualsiasi momento** (anche in preparazione), con effetto immediato sul telefono; durata e numero di usi sono facoltativi |
| Spostamenti | Con la capacità «muoversi» compare una **croce direzionale**; il GM può **bloccare singole direzioni** (per quel giocatore o come porta chiusa tra due stanze). Ogni spostamento è **sempre approvato dal GM**: il giocatore *chiede*, il GM conferma |
| Stanze speciali | **Nessuna**: tutte le stanze sono uguali per il software (uscita, pericoli, atmosfera li descrive il GM a voce o con i messaggi) |
| Messaggi | Il GM scrive quando vuole; il giocatore **legge sempre** e **risponde dal cellulare** (§5.6). **Salvati nel database** (tabella dedicata), consultabili dalla regia anche dopo la partita |
| Lettere | Le vede solo chi il GM **abilita**, e **solo per un tempo o un numero di occhiate limitati**; scaduto il permesso, la lettera sparisce dal telefono |
| Eventi | Il GM li invia in **broadcast** (tutti) o in **multicast** (i giocatori che sceglie). Sul telefono arrivano come «**Evento:** …» a tutto schermo e il giocatore deve premere **«Accetta»**; il GM vede chi ha accettato. Ogni giocatore consulta in qualsiasi momento la **cronologia** dei propri eventi. Salvati nel database come i messaggi (§5.7) |

## 3. La mappa: «MORTA» e «USCITA» intrecciate

Vincoli richiesti:
- griglia 3×3, cioè 9 stanze, ognuna con una lettera;
- la stanza della **A** è in un **angolo** (non al centro): è la partenza «naturale» della mappa, da cui si
  leggono le due parole. Dove mettere davvero i giocatori all'inizio lo decide comunque il GM (§5.9);
- due percorsi intrecciati formano le parole **MORTA** e **USCITA**, che condividono il finale **TA**.

Le lettere distinte sono M, O, R, U, S, C, I, T, A: esattamente 9, una per stanza. Le due parole finiscono
entrambe con la A, quindi partendo dalla A i giocatori percorrono le parole **al contrario**: A → T, poi il
percorso si biforca. Da una parte R → O → M, dall'altra I → C → S → U. Le stanze sono adiacenti in
orizzontale o in verticale, mai in diagonale, come in Room 25.

**Mappa proposta** (partenza in alto a sinistra):

```
        col 1   col 2   col 3
riga 1 [  A  ] [  C  ] [  S  ]
riga 2 [  T  ] [  I  ] [  U  ]
riga 3 [  R  ] [  O  ] [  M  ]
```

- **MORTA**: M (3,3) → O (3,2) → R (3,1) → T (2,1) → A (1,1) ✔
- **USCITA**: U (2,3) → S (1,3) → C (1,2) → I (2,2) → T (2,1) → A (1,1) ✔
- La T (2,1) è il bivio: confina con A, R e I.
- Spunto per il GM (non è una regola del software): la U (2,3) confina con la M (3,3).

Esistono altre disposizioni valide (almeno 4 con la A in alto a sinistra), per esempio la trasposta
`A T R / C I O / S U M`, oppure `A O M / T R U / I C S` e la sua trasposta `A T I / O R C / M U S`. Ruotandole
si può spostare la partenza in qualunque angolo. **Nessuna di queste mappe sta nel codice di gioco**: la mappa è
contenuto dell'istanza (vedi §5.1). La mappa sopra sarà solo il `sampleConfig`, cioè l'esempio di partenza dell'editor.

## 4. Il ruolo Game Master

### 4.1 Chi è e come entra

Il GM è un **nuovo ruolo del server**, distinto da regia (`admin`), schermo (`screen`) e giocatori (`play`).
Ha una sua area **`/master`**, pensata per il telefono ma usabile anche dal PC. Non crea un profilo giocatore.

| | Regia (`/admin`) | Game Master (`/master`) |
|---|---|---|
| Crea serate, squadre, libreria | ✅ | ❌ |
| Avvia e termina partite e round | ✅ | ❌ |
| Vede la vista segreta del round (`hostView`) | ✅ | ✅ |
| Invia comandi al plugin del round | ✅ | ✅ |
| Rettifica punti, comandi dell'engine | ✅ | ❌ |
| Archivio dei messaggi | ✅ (tutte le partite) | solo il round in corso |
| È in classifica | ❌ | ❌ |

**Accesso con link limitato.** Nel pannello Live, quando il round in corso lo supporta, la regia preme «Link del
Game Master» e ottiene un QR o link `/master#t=<token>`:
- il token è casuale e il database ne salva **solo l'hash** (come le sessioni admin di `admin-auth.ts`), con
  scadenza (fine della partita, al massimo 12 h);
- vale solo per i **comandi del plugin** del round corrente: con quel token non si arriva al CRUD né all'engine;
- la regia può revocarlo e rigenerarlo (es. se il telefono del GM si perde): il socket del GM revocato viene disconnesso;
- il token sta nel frammento `#` dell'URL (non finisce nei log HTTP) e il telefono lo salva in `localStorage`,
  così dopo il blocco dello schermo rientra da solo.

Se regia e GM sono la stessa persona, la stessa interfaccia del GM compare anche nel pannello Live di `/admin`
(vedi §6.2), senza bisogno del link.

### 4.2 Cosa serve nell'infrastruttura (generico, non solo per questo gioco)

Il ruolo GM è generico: qualsiasi plugin futuro (un altro GDR, un gioco a indizi) potrà usarlo.

- **`packages/shared`**
  - `Role` aggiunge `"master"`; `ServerEvent.GameMaster` (vista del GM); `ClientEvent.MasterCommand`.
  - Tipo `GameMasterState`: fase, nome della partita, titolo e `typeId` del round, `host` (la `hostView` del
    plugin) e l'elenco dei giocatori della partita (nickname, avatar, colore, connesso).
  - `MinigameType` aggiunge due campi facoltativi:
    - `master?: true`: il plugin ha un'interfaccia per il GM; senza, il link del GM non si genera;
    - `messages?(state): RoundMessage[]`: i messaggi e gli eventi del round, con id crescente, e le accettazioni
      degli eventi, che il server salva nel database (§4.3);
    - `maxPlayers?: number`: numero massimo di giocatori del round (per questo gioco 10, vedi §5.1).
- **`packages/server`**
  - `master-auth.ts`: emissione, verifica, revoca del token del GM (hash nella tabella `settings`, come `admin-auth.ts`);
    rotte admin `POST/DELETE /api/admin/master-link`.
  - `realtime.ts`: alla connessione con `role: "master"` e token valido il socket entra nella stanza `master`;
    `flush()` invia anche `engine.masterState()`; `MasterCommand` accetta **solo** `{ type: "plugin", command }`,
    validato con zod e poi con il `commandSchema` del plugin (riuso di `engine.hostCommand`). Limite di frequenza dedicato.
  - `engine.ts`: `masterState()`; rifiuto dei comandi del GM se il round non è `master: true`; dopo ogni cambio di
    stato salva i messaggi nuovi (§4.3); prima di avviare un round con `maxPlayers` controlla il roster e, se è troppo
    grande, rifiuta l'avvio con un messaggio chiaro alla regia («Stanze Segrete: massimo 10 giocatori, in serata ce ne sono 12»).
- **`packages/client`**
  - Il registro delle viste (`minigames/registry.ts`) aggiunge il componente facoltativo **`Host`**
    (`{ info, run(command), clock, theme }`): l'interfaccia ricca della regia per i plugin che non si accontentano
    dei pulsanti generici di `hostView.actions` (che inviano solo `{ type: id }`).
  - Nuova area `/master` caricata in modo lazy (un pezzo separato, come `/admin`): login col token, indicatore
    di connessione, rendering del componente `Host` del round in corso, oppure «In attesa del round…».
  - `LivePanel.tsx`: se il plugin ha `Host`, lo mostra al posto di `InfoView` più i pulsanti; aggiunge il riquadro
    «Link del Game Master» (QR + revoca).
  - Regia: pannello **«Messaggi ed eventi»** con l'archivio per serata e partita (sola lettura, filtro messaggi/eventi,
    per gli eventi chi ha accettato e quando, esportabile in JSON).

### 4.3 Salvataggio di messaggi ed eventi nel database

Le funzioni del plugin sono pure e non possono scrivere nel database, quindi:

1. il plugin tiene i messaggi nel proprio stato (servono alle viste) con un id crescente;
2. dopo ogni cambio di stato l'engine chiede `plugin.messages(state)` e inserisce nel database **solo quelli con id
   maggiore dell'ultimo salvato** per quel round (inserimento idempotente: chiave unica `round_id + message_id`, così
   un riavvio o la ripresa da snapshot non duplica nulla);
3. lo stato del plugin tiene solo gli ultimi ~300 messaggi (viste e snapshot leggeri); il database li tiene **tutti**.

Nuove tabelle Drizzle:
- `round_messages`:
  `(id, event_id, match_id, round_id, message_id, kind ["message"|"event"], from_kind ["master"|"player"], from_player_id, to_kind ["master"|"player"|"room"|"all"|"players"], to_player_id, to_cell, recipients_json, text, ts, read_at)`.
  Gli eventi sono righe con `kind = "event"`; per un multicast `recipients_json` elenca i destinatari.
  (`event_id` qui è la serata, come nel resto del database: l'evento di gioco si riconosce da `kind`.)
- `round_event_receipts`: `(round_id, message_id, player_id, accepted_at)`, chiave unica sulle prime tre colonne:
  una riga per destinatario, `accepted_at` vuoto finché non accetta. Si aggiorna con lo stesso meccanismo idempotente.

- Messaggi ed eventi restano finché la regia non li cancella (pulsante «Elimina messaggi ed eventi di questa serata»);
  sono inclusi nel backup esistente (`backup.ts`).
- Il testo non si scrive mai nei log del server.
- Il database è in `data/`, già fuori da git; i messaggi sono dati dei giocatori e vanno trattati come tali.

## 5. Il plugin `stanze-segrete`

Plugin come gli altri: logica pura in `packages/minigames/src/stanze-segrete/`, viste in
`packages/client/src/minigames/stanze-segrete/`. Funzioni pure e deterministiche, stato in JSON (finisce negli
snapshot e sopravvive a un riavvio del PC).

### 5.1 Configurazione dell'istanza (`configSchema`, genera il form dell'editor)

| Campo | Contenuto | Default |
|---|---|---|
| `rows`, `cols` | Dimensione della griglia | 3 × 3 (lo schema ammette fino a 5 × 5 per varianti future) |
| `rooms[]` | Per ogni stanza: lettera e una **nota privata per il GM** (es. la descrizione da leggere ai giocatori). Nessun ruolo, nessun effetto | La mappa del §3 |
| `anchor` | Stanza della lettera iniziale delle parole lette al contrario (deve essere un angolo). Serve solo alla validazione e come **suggerimento** al GM: non obbliga a partire da lì | riga 1, col 1 (la A) |
| `words[]` | Parole da verificare sulla mappa (solo controllo dell'editor) | `MORTA`, `USCITA` |
| `solution` | Parola che vale come soluzione (per l'azione «Proponi la soluzione») | `USCITA` |
| `positionsPublic` | Lo schermo mostra in quale stanza sta ognuno | sì |
| `customActions[]` | Azioni libere del GDR (es. «Usa la chiave», «Cerca nella stanza»): arrivano al GM come richiesta | vuoto |
| `defaultSightSec` | Per quanto resta visibile una lettera a ogni occhiata | 8 s |
| `messageMaxLength`, `messageCooldownSec` | Limiti dei messaggi dei giocatori | 280 caratteri, 3 s |
| `presetEvents[]`, `eventMaxLength` | Eventi pronti da inviare con un tocco (§5.7) · lunghezza massima di un evento | vuoto · 280 caratteri |
| `escapePoints`, `solvePoints` | Punti assegnati quando il GM dichiara l'esito | 300, 200 |

Le stanze sullo schermo e sui telefoni si chiamano solo con un numero (Stanza 1…9): i nomi e le descrizioni li dà il GM.

**Giocatori: da 1 a 10.** Il limite è fisso nel plugin (`maxPlayers: 10`) e non configurabile: l'interfaccia del
GM (avatar sulla mappa, scheda per giocatore, posta) è pensata per un gruppo piccolo. Se la partita ha più di 10
giocatori in serata, l'engine rifiuta l'avvio del round (§4.2); la regia crea una serata o una squadra apposta.
Con al massimo 10 giocatori e 9 stanze ognuno può avere una stanza tutta sua (al più una stanza con due).

**Validazione dell'editor** (`superRefine`, messaggi in italiano):
- una lettera per stanza, `rows × cols` stanze;
- la stanza `anchor` (la A) deve stare **in un angolo**;
- ogni parola di `words` deve essere un percorso di stanze adiacenti (ortogonali) sulla mappa, senza ripassare
  dalla stessa stanza; l'editor indica quale parola non si trova.

**Aiuto facoltativo per l'editor:** una funzione pura `findLayouts(words, rows, cols, startCorner)` che elenca le
disposizioni che intrecciano le parole, e un pulsante «Proponi una disposizione». Utile per creare altre mappe;
non indispensabile per la prima versione.

### 5.2 Stato

```ts
interface State {
  phase: "setup" | "play" | "reveal" | "done";
  config: Config;
  roster: ParticipantInfo[];
  positions: Record<PlayerId, CellId | null>;        // null = non ancora piazzato (la partenza la decide il GM)
  outcome: Record<PlayerId, "in-gioco" | "fuggito" | "eliminato">; // lo decide il GM
  /** Capacità concesse dal GM (comprese le occhiate alle lettere): si aggiungono e tolgono in ogni momento. */
  grants: Grant[];
  /** Porte chiuse dal GM tra due stanze adiacenti: valgono per tutti, finché il GM non le riapre. */
  closedDoors: { a: CellId; b: CellId }[];
  /** Lettere che un giocatore sta vedendo ora: spariscono alla scadenza. */
  sightings: { playerId: PlayerId; cellId: CellId; until: number }[];
  /** Richieste in attesa del GM (spostamenti, sbirciate, azioni libere, soluzioni). */
  requests: Request[];
  /** Risposte consentite: un messaggio del GM con «consenti risposta» apre una risposta al giocatore. */
  messages: Message[];      // { id, from: "master" | PlayerId, to: "master" | PlayerId | CellId | "all", text, at, readAt, replyTo?, allowReply? }
  /** Eventi comunicati dal GM (§5.7): tenuti tutti, sono pochi e formano la cronologia dei giocatori. */
  events: GameEvent[];      // { id, text, at, to: "all" | PlayerId[], accepted: Record<PlayerId, number | null>, cancelled? }
  nextMessageId: number;    // contatore unico per messaggi ed eventi
  log: LogEntry[];          // diario della partita, solo per il GM
  publicReveal: boolean;    // il GM ha rivelato la mappa sullo schermo
}

interface Grant {
  id: string;
  playerId: PlayerId;
  action: "move" | "peek" | "sight" | "message" | "guess" | `custom:${string}`;
  /** Solo per "sight": quale lettera può guardare. */
  sightScope?: "own-room" | CellId;
  /** Solo per "move" e "peek": le direzioni della croce che il GM lascia aperte (default: tutte). */
  directions?: ("up" | "down" | "left" | "right")[];
  usesLeft: number | null;  // null = illimitati entro la scadenza
  expiresAt: number | null; // null = finché il GM non lo revoca
}
```

### 5.3 Le lettere: chi le vede e quando

Nessuno vede le lettere di diritto. Il GM concede il permesso **«Guarda la lettera»** (`sight`):
- a uno o più giocatori scelti (non serve concederlo a tutti), a chi è in una stanza o a tutti;
- per la **lettera della stanza in cui si trova** il giocatore (`own-room`, quindi se si sposta guarda la nuova stanza)
  oppure per **una stanza precisa**;
- con un **limite**: numero di occhiate (es. 1) e/o una finestra di tempo (es. 30 s). Il GM può anche lasciarlo
  aperto «finché non lo revoco», ma il default è limitato, e può revocarlo in qualunque momento.

Sul telefono compare il pulsante «👁 Guarda la lettera». Ogni pressione consuma un'occhiata e mostra la lettera per
`defaultSightSec` secondi (tenendo premuto, così il vicino non sbircia); poi il server la toglie dalla vista. Il
telefono **non memorizza** le lettere viste: chi vuole ricordarle deve farlo a mente o parlarne con gli altri.

Anche il GM può mostrare direttamente una lettera («Mostra per N s» a un giocatore o agli occupanti di una stanza)
oppure in risposta a una richiesta di sbirciata. È sempre un `sightings` a tempo, mai permanente.

Limite accettato: chi vede la lettera può fotografarla o scriverla. Si mitiga con il «tieni premuto» e con
occhiate brevi; è un gioco tra amici.

### 5.4 Capacità dei giocatori: abilitare e disabilitare in qualsiasi momento

Un giocatore **non può fare nulla** se il GM non l'ha abilitato. Le **capacità** sono interruttori che il GM
accende e spegne **quando vuole**, in preparazione e durante il gioco, con effetto immediato: il pulsante compare
o sparisce dal telefono al prossimo aggiornamento (frazioni di secondo). Il GM le concede a un giocatore, a tutti
gli occupanti di una stanza o a tutti; durata (es. 30 s) e numero di usi sono **facoltativi**: senza, la capacità
resta finché il GM non la spegne.

| Capacità | Azione del telefono (`inputSchema`) | Effetto |
|---|---|---|
| Muoversi (`move`) | `move { direction }` dalla **croce** | **Richiesta** di spostamento nella stanza adiacente; il giocatore non si sposta finché il GM non approva (§5.5) |
| Sbirciare (`peek`) | `peek { direction }` dalla croce | Richiesta di guardare nella stanza adiacente: il GM decide se mostrare la lettera (a tempo) o rispondere a parole |
| Guardare la lettera (`sight`) | `sight` | Mostra la lettera consentita per pochi secondi (§5.3) |
| Scrivere al Master (`message`) | `message { text }` | Messaggio segreto al GM di propria iniziativa (§5.6) |
| Proporre la soluzione (`guess`) | `guess { word }` | Il GM la vede e la convalida |
| Azione libera (`custom:<id>`) | `custom { actionId }` | Un'azione dell'istanza (es. «Usa la chiave»): richiesta al GM |
| — (sempre) | `reply { messageId, text }` | Risposta a un messaggio del GM che la consente (§5.6) |
| — (sempre) | `cancel { requestId }` · `ack { messageId }` | Ritira una propria richiesta in attesa · segna come letto un messaggio |
| — (sempre) | `accept-event { eventId }` | Accetta un evento ricevuto (§5.7) |

- **Disabilitare** una capacità la toglie subito dal telefono e **annulla le richieste in attesa** di quel tipo
  (es. spegnere «muoversi» cancella lo spostamento non ancora approvato); il giocatore vede «Il Master ha annullato la richiesta».
- Ogni uso consuma la capacità al momento della richiesta (non dell'approvazione), così non si accumulano richieste.
- Un giocatore ha **al massimo uno spostamento in attesa** alla volta.
- Le capacità e le occhiate scadute spariscono a ogni `onTick` (il tempo arriva da `now`, nessun `Date.now()`).
  Le scadenze sono in ora server, quindi il telefono mostra il conto alla rovescia con `Countdown`.
- Il server ricontrolla sempre la capacità quando arriva l'input: un telefono che mostra ancora un pulsante appena
  spento (messaggio in volo) riceve un rifiuto silenzioso, non un'azione.

### 5.5 Muoversi: la croce direzionale e le direzioni bloccate

Quando il GM abilita «muoversi», sul telefono compare una **croce** (↑ ↓ ← →) attorno alla stanza del giocatore.
Ogni freccia ha uno di tre stati, calcolati dal server in `viewFor`:

| Stato | Quando | Aspetto |
|---|---|---|
| **Aperta** | C'è una stanza adiacente e il GM non l'ha bloccata | Freccia attiva |
| **Bloccata** | Il GM l'ha bloccata (per quel giocatore o con una porta chiusa) | Freccia spenta con 🔒, non premibile |
| **Muro** | Bordo della mappa | Freccia nascosta |

Il GM può bloccare le scelte in due modi, combinabili e modificabili in qualsiasi momento:
1. **Per il singolo permesso:** abilitando «muoversi» sceglie quali direzioni lasciare aperte (es. a Mario solo
   ↓ e →). Può cambiarle anche dopo, con il permesso già attivo (`set-directions`).
2. **Porte chiuse sulla mappa:** tocca il lato tra due stanze per chiudere quella porta per **tutti** (in entrambi i
   versi) finché non la riapre. Utile per la narrazione («la porta tra la 2 e la 5 è sigillata»).

Il giocatore non sa *perché* una direzione è bloccata (il telefono non distingue porta chiusa da limite del permesso)
e non vede dove portano le frecce: vede solo la croce. Premuta una freccia aperta, il telefono mostra «Hai chiesto di
andare a destra: in attesa del Master…» con «Ritira». Il GM vede la richiesta sulla mappa come freccia e la
**approva** (il giocatore si sposta) o la **rifiuta** (con una risposta facoltativa). Se nel frattempo il GM ha
bloccato quella direzione, l'approvazione è comunque possibile: il GM ha l'ultima parola.

La stessa croce, in modalità «Sbircia», serve alla capacità `peek`, con le stesse direzioni bloccate.

### 5.6 Messaggi: il GM scrive, il giocatore legge e risponde dal cellulare

- **Il GM scrive quando vuole**, a un giocatore, agli occupanti di una stanza o a tutti.
- **Il giocatore legge sempre** i messaggi ricevuti: non serve nessuna capacità per leggere.
- **Rispondere:** ogni messaggio del GM ha l'opzione **«consenti risposta»** (attiva di default). Il giocatore
  risponde dal telefono direttamente sotto quel messaggio, una volta (o più, se il GM lo imposta); il GM può
  chiudere la risposta in qualsiasi momento. Così il giocatore risponde al Master senza bisogno di un permesso a parte.
- **Scrivere di propria iniziativa** (senza un messaggio a cui rispondere) richiede invece la capacità «Scrivere al
  Master», che il GM accende e spegne come le altre.
- Lunghezza massima e pausa minima tra due messaggi (`messageMaxLength`, `messageCooldownSec`) valgono per entrambi.
- Il GM vede le spunte di lettura; tutti i messaggi finiscono nel database (§4.3).

### 5.7 Eventi: broadcast o multicast, da accettare, con cronologia

Un **evento** è una comunicazione ufficiale del GM che cambia la situazione di gioco («crolla il soffitto», «si
spengono le luci», «la Stanza 5 si allaga»). È diverso da un messaggio: non si risponde, va **accettato** e resta
nella **cronologia**.

**Invio (GM).** Il GM scrive il testo e sceglie i destinatari:
- **broadcast**: «Tutti i giocatori»;
- **multicast**: spunta i giocatori uno per uno, con scorciatoie «gli occupanti della Stanza N» e «tutti tranne…».
  I destinatari si fissano al momento dell'invio (chi viene spostato dopo non lo riceve).

Il GM può preparare in anticipo degli **eventi pronti** nell'istanza (`presetEvents[]`, es. «Si spengono le luci»)
e inviarli con un tocco, modificandone il testo se serve.

**Ricezione (giocatore).** Sul telefono compare, sopra a tutto, una scheda con scritto **«Evento:»** seguito dal
testo, con vibrazione (Android) e suono, e un unico pulsante **«Accetta»**. Finché non accetta:
- la scheda non si chiude e le altre azioni del telefono restano coperte (le capacità non si perdono: i loro
  timer continuano e lo sa il GM, che decide quando inviare un evento);
- se arrivano più eventi, si mostrano uno dopo l'altro, in ordine di invio («1 di 3»);
- se il telefono si blocca o si riconnette, la scheda ricompare (lo stato viene dal server).

L'accettazione (`accept-event`) vale per un solo giocatore, è idempotente e non si può annullare. Non serve
nessuna capacità per accettare.

**Il GM vede chi ha accettato:** ogni evento inviato mostra «Accettato da 3 di 5» con l'elenco di chi manca, e
può **annullare** un evento non ancora accettato da tutti (sparisce dai telefoni di chi non l'ha accettato e resta
nella cronologia come «annullato»).

**Cronologia eventi (giocatore).** Una scheda «📜 Eventi» sempre accessibile dal telefono, in ogni fase (anche in
preparazione e alla rivelazione), con tutti gli eventi **ricevuti da quel giocatore**, dal più recente: testo,
ora, «accettato alle 21:42». Non contiene gli eventi mandati ad altri, né l'elenco degli altri destinatari: un
multicast resta riservato a chi lo riceve. Il GM ha la cronologia completa con i destinatari.

Lunghezza massima del testo: `eventMaxLength` (default 280 caratteri). Gli eventi non compaiono sullo schermo
condiviso (gli eventi pubblici il GM li legge ad alta voce, o in futuro un'opzione «mostra anche sullo schermo»).

### 5.8 Comandi del Game Master (`commandSchema`)

Tutti i comandi sono accettati **in qualsiasi fase** prima della rivelazione (`setup` e `play`), salvo dove indicato.

| Comando | Effetto |
|---|---|
| `place { playerId, cellId \| null }` | Mette (o toglie) un giocatore in una stanza: è così che il GM **sceglie la stanza di partenza** di ognuno, e lo stesso comando lo sposta durante il gioco |
| `place-all { cellId }` · `place-spread` | Tutti nella stanza scelta dal GM · distribuzione automatica, un giocatore per stanza finché ce ne sono (casualità dal seme nello stato); poi il GM corregge a mano |
| `grant { target, action, sightScope?, directions?, durationSec?, uses? }` | Abilita una capacità. `target`: uno o più giocatori, una stanza o tutti |
| `revoke { grantId \| target, action? }` | Disabilita capacità (e annulla le richieste in attesa di quel tipo e le occhiate in corso) |
| `set-directions { grantId, directions }` | Cambia le direzioni aperte di un permesso «muoversi»/«sbirciare» già attivo |
| `door { a, b, open }` | Chiude o riapre la porta tra due stanze adiacenti, per tutti |
| `show-letter { target, cellId, seconds }` | Mostra una lettera per qualche secondo |
| `resolve { requestId, approve, showLetterSec?, reply? }` | Risponde a una richiesta. Per uno spostamento, l'approvazione **sposta** il giocatore; si può allegare una risposta (messaggio) |
| `resolve-all-moves { approve }` | Approva o rifiuta in blocco gli spostamenti in attesa |
| `message { to: playerId \| cellId \| "all", text, allowReply?, maxReplies? }` | Messaggio segreto (o a tutti) dal GM, con o senza risposta consentita |
| `close-reply { messageId }` | Chiude la possibilità di rispondere a un messaggio |
| `event { to: "all" \| PlayerId[], text }` | Comunica un evento in broadcast o multicast (§5.7) |
| `cancel-event { eventId }` | Annulla un evento non ancora accettato da tutti |
| `set-outcome { playerId, outcome }` | Fuggito / eliminato / in gioco: lo decide il GM secondo la sua narrazione |
| `start` · `public-reveal` · `end` | Inizio del gioco (richiede che tutti siano piazzati) · mappa con lettere sullo schermo · fine con esito e punti |

### 5.9 Fasi

1. **`setup`**: il GM **sceglie la stanza di partenza** di ogni giocatore (tutti insieme o separati, dove vuole) e
   può già accendere capacità e chiudere porte. Schermo: «Il complesso si sta preparando…» con le porte chiuse.
   Telefoni: il numero della propria stanza (appena piazzati), i messaggi del GM e le regole. «Inizia» è
   possibile solo quando tutti i giocatori sono in una stanza.
2. **`play`**: si gioca al ritmo del GM: accende e spegne capacità, approva spostamenti, scrive, narra. Nessun timer obbligatorio.
3. **`reveal`**: il GM rivela la mappa sullo schermo (animazione: le lettere si accendono, poi i due percorsi
   MORTA e USCITA si illuminano), con l'esito di ognuno.
4. **`done`**: `isFinished` è vero, il server registra i punti in `score_entries`. Come in `caccia-fantasmi`,
   la rivelazione è una fase a parte perché l'engine chiude il round appena `isFinished` diventa vero.

**Punti** (`scores`): chi è `fuggito` riceve `escapePoints`, chi ha proposto la soluzione giusta `solvePoints`.
Il GM non ha accesso alle rettifiche: se servono, le fa la regia.

### 5.10 Chi vede cosa (regola d'oro: solo viste filtrate)

| Informazione | Schermo (`screenView`) | Telefono del giocatore (`viewFor`) | GM (`hostView`) |
|---|---|---|---|
| Griglia e numeri delle stanze | ✅ | ✅ (mini-mappa) | ✅ |
| Lettere | ❌ (solo dopo `public-reveal`) | **solo durante un'occhiata concessa**, poi sparisce | ✅ tutte |
| Note del GM sulle stanze | ❌ | ❌ | ✅ |
| Posizioni | se `positionsPublic` | la propria (e le altre se `positionsPublic`) | ✅ |
| Capacità | ❌ | solo le proprie, con il conto alla rovescia | ✅ |
| Croce direzionale | ❌ | solo lo stato delle proprie frecce (aperta / bloccata / muro), senza il motivo del blocco | ✅ con porte chiuse e direzioni di ognuno |
| Porte chiuse | ❌ | ❌ (si vedono solo come frecce bloccate) | ✅ |
| Chi può guardare le lettere | ❌ | solo se stesso | ✅ |
| Richieste di spostamento | ❌ | solo le proprie («In attesa del Master…») | ✅ |
| Messaggi | ❌ (nemmeno «Mario ha scritto»: sarebbe un indizio) | solo la propria conversazione, quelli alla propria stanza e quelli «a tutti» | ✅ tutti |
| Eventi | ❌ | solo quelli ricevuti (scheda da accettare + cronologia), senza gli altri destinatari | ✅ tutti, con destinatari e accettazioni |
| Diario della partita | ❌ | ❌ | ✅ |

## 6. Interfacce

### 6.1 Telefono del giocatore (`Controller`)

- **In alto:** «Sei nella Stanza N».
- **Mini-mappa 3×3:** la propria posizione ed eventualmente gli altri giocatori. Nessuna lettera memorizzata.
- **Capacità:** compaiono **solo** i pulsanti delle capacità accese, ciascuno con il conto alla rovescia o gli usi
  rimasti («👁 Guarda la lettera», «Proponi la soluzione», azioni libere); quando il GM ne accende o spegne una il
  telefono vibra brevemente (Android) e il pulsante appare o sparisce con un'animazione. Senza capacità:
  «Aspetta il Game Master».
- **Croce direzionale:** con «muoversi» (o «sbirciare») compare la croce, grande e centrata, con le frecce aperte,
  bloccate (🔒) o nascoste ai bordi (§5.5). Una richiesta inviata mostra «In attesa del Master…» con «Ritira»;
  quando il GM decide compare «Il Master ti ha fatto entrare nella Stanza N» oppure «Il Master ha rifiutato».
- **Lettera:** durante un'occhiata compare un riquadro «tieni premuto per vedere» con la barra del tempo rimasto.
- **Messaggi:** scheda «✉️ Master» con il contatore dei non letti. Ogni messaggio del GM che consente la risposta
  ha sotto il campo «Rispondi»; il campo «Scrivi al Master» in fondo è attivo solo con la capacità `message`
  (altrimenti «Puoi scrivere al Master quando ti abilita»). Un nuovo messaggio fa vibrare (Android) e mostra un
  avviso a tutto schermo finché non viene letto. Lo storico della conversazione arriva dallo stato del round,
  quindi si recupera dopo il blocco dello schermo.
- **Eventi:** scheda «Evento: …» a tutto schermo con «Accetta» (§5.7); scheda **«📜 Eventi»** con la cronologia,
  sempre raggiungibile dalla barra in basso insieme a «✉️ Master» e «ℹ️ Regole».
- **ℹ️ Regole** consultabili, con i dati veri della partita (testo in `rulesText.ts`, come `caccia-fantasmi`).
- Leggero: niente librerie nuove, solo CSS e le primitive esistenti (`buttons`, `text`, `waiting`).

### 6.2 Game Master (`Host`, in `/master` e nel pannello Live)

- **Mappa grande 3×3** con le lettere, la nota privata di ogni stanza, gli avatar degli occupanti e le porte tra
  le stanze (toccando un lato si chiude o riapre la porta, 🔒 per le chiuse).
- **Stanza di partenza e piazzamento:** in preparazione una barra mostra i giocatori «non ancora piazzati»;
  tocca un avatar, poi tocca una stanza («tocca-tocca», più affidabile del trascinamento su telefono). Pulsanti
  «Tutti in questa stanza» e «Distribuisci». Lo stesso gesto sposta un giocatore durante il gioco.
- **Coda delle richieste** in evidenza (con suono e contatore): spostamenti con freccia sulla mappa e
  «Approva / Rifiuta» (più «Approva tutti»), sbirciate con «Mostra la lettera per N s», azioni libere e soluzioni proposte.
- **Scheda del giocatore** (tocco sull'avatar): stanza, esito, **interruttori delle capacità** (accesi/spenti con un
  tocco, con durata e usi facoltativi), per «muoversi» una **mini-croce** in cui il GM tocca le frecce da bloccare,
  «Mostra una lettera», conversazione privata.
- **Abilitazione rapida:** selezione multipla (giocatori, stanza intera o tutti) + capacità + durata/usi, es.
  «Mario e Lucia possono guardare la lettera della loro stanza, 1 volta» con due tocchi; «Spegni tutto» per
  disabilitare in un colpo ogni capacità di tutti.
- **Posta in arrivo** con i messaggi non letti in evidenza; invio a un giocatore, a una stanza o a tutti, con
  l'interruttore «consenti risposta».
- **Eventi:** pulsante «⚡ Evento» → testo (o un evento pronto) → destinatari (Tutti / scelta multipla / Stanza N /
  tutti tranne…) → «Invia». Elenco degli eventi inviati con «Accettato da N di M», chi manca e «Annulla».
- **Diario della partita** (spostamenti approvati, occhiate, soluzioni proposte, eventi inviati e accettati).
- **Comandi di fase:** «Inizia», «Rivela la mappa sullo schermo», «Concludi».

### 6.3 Schermo condiviso (`Screen`)

Il complesso visto dall'alto in stile `retro80`: 9 stanze numerate, porte, avatar dei giocatori (se le posizioni
sono pubbliche), animazione quando il GM approva uno spostamento. Nessuna lettera e nessun messaggio fino alla
rivelazione. Alla rivelazione: lettere accese e i due percorsi tracciati, poi gli esiti.

## 7. Fasi di lavoro

Ogni passo si chiude con test verdi e una piccola demo; commit semantici separati (nessun commit senza richiesta).

| Passo | Contenuto | Verifica |
|---|---|---|
| **S1 Mappa** | Modello griglia, adiacenza, validazione di percorsi e parole, `findLayouts` (facoltativo) in `stanze-segrete/map.ts` | Unit test: la mappa del §3 è valida; A al centro rifiutata; parola non trovabile segnalata; le alternative elencate |
| **S2 Logica del plugin** | Config, stato, input, comandi, capacità accese e spente in ogni fase, croce con direzioni bloccate e porte chiuse, occhiate a tempo, richieste di spostamento approvate, messaggi con risposta, eventi broadcast/multicast con accettazione, annullamento e cronologia, fasi, punti, viste | Unit test di ogni comando e input; un evento multicast arriva solo ai destinatari scelti e l'accettazione è idempotente; un evento annullato sparisce da chi non l'aveva accettato e resta in cronologia; la cronologia di un giocatore non contiene eventi altrui né gli altri destinatari; spostamento senza approvazione impossibile; frecce bloccate o verso un muro rifiutate dal server; spegnere una capacità annulla le richieste in attesa; risposta rifiutata a un messaggio chiuso o senza risposta consentita; «Inizia» rifiutato con giocatori non piazzati; **test anti-leak**: lettere mai in `screenView`, mai nel `viewFor` di chi non ha un'occhiata attiva e **assenti dopo la scadenza**; messaggi e permessi altrui mai visibili; il contratto generico di `registry.test.ts` passa |
| **S3 Ruolo GM nel server** | `master-auth.ts`, rotte del link, stanza socket `master`, `masterState`, `MasterCommand` limitato ai comandi del plugin, campi `master` e `messages` in `MinigameType` | Test: token sbagliato, scaduto o revocato rifiutato (e socket disconnesso); il GM non può usare `engine`/`adjust`/`start`; il GM non riceve nulla con un round senza `master`; riconnessione |
| **S4 Messaggi ed eventi nel database** | Tabelle `round_messages` e `round_event_receipts` (migrazione Drizzle), salvataggio idempotente dopo ogni cambio di stato, pannello «Messaggi ed eventi» della regia, cancellazione per serata, inclusione nel backup | Test: nessun duplicato dopo riavvio e ripresa da snapshot; oltre i 300 messaggi in stato il database li ha tutti; un'accettazione aggiorna la ricevuta giusta; il testo non compare nei log |
| **S5 Area `/master` e `Host` nel Live** | Componente `Host` nel registro, area `/master` lazy, riquadro «Link del Game Master» nel pannello Live | Il pezzo `/master` non finisce nel bundle del telefono (controllo del peso già presente negli e2e) |
| **S6 Viste del gioco** | `Controller`, `Screen`, `Host`; regole in app; scene in `/preview` (setup con giocatori da piazzare, croce con frecce bloccate, richiesta in attesa, occhiata alla lettera, messaggio in arrivo, evento da accettare, cronologia eventi, rivelazione) nei 4 temi | Asserzioni Playwright su `/preview`: niente overflow su telefono, lettera nascosta finché non si tiene premuto, la scheda evento copre il resto e inizia con «Evento:» |
| **S7 End-to-end** | Scenario: regia avvia, genera il link, il GM entra da un telefono emulato, sceglie stanze di partenza diverse per 3 giocatori, abilita a uno solo un'occhiata, abilita «muoversi» bloccando una direzione (la freccia risulta disabilitata nel DOM), approva lo spostamento, spegne una capacità e verifica che il pulsante sparisca, manda un messaggio a cui il giocatore risponde dal telefono, invia un evento a tutti (ogni telefono mostra «Evento: …», si accetta, il GM vede «Accettato da 3 di 3») e uno in multicast a 2 giocatori (il terzo non lo riceve), controlla le cronologie dei telefoni, rivela, conclude; la regia ritrova messaggi ed eventi nell'archivio | Controllo dei **frame WebSocket**: nessuna lettera arriva a schermo e telefoni non autorizzati, né dopo la scadenza dell'occhiata; nessun messaggio altrui; il testo di un evento multicast non arriva mai al telefono escluso né allo schermo; server pulito alla fine |
| **S8 Bot e stress** | Strategia di `tools/bots` per questo gioco (chiede di muoversi, guarda e scrive quando abilitato) e un GM simulato che approva | Simulazione con 10 giocatori che scrivono e chiedono di muoversi a raffica: nessun errore, tempi di aggiornamento ok, scritture nel database corrette; test che con 11 giocatori l'avvio del round viene rifiutato |
| **S9 Documenti e pacchetto** | `docs/STANZE-SEGRETE.md` (guida per il GM), aggiornamento di `PIANO.md` (modello dati e sezione del gioco), `GUIDA-HOST.md`, `NUOVO-MINIGIOCO.md` (componente `Host`, campi `master` e `messages`) | `pnpm test`, `pnpm test:e2e`, `pnpm package:win` + `pnpm package:check` |

## 8. Rischi residui

- **Più giocatori nella stessa stanza:** consentito (il GM può radunarli o spostarli dove vuole). Chi è nella
  stessa stanza **non** condivide la lettera: la vede solo chi ha un'occhiata concessa.
- **Collo di bottiglia del GM:** con tutti gli spostamenti da approvare, anche 10 giocatori possono creare una
  coda nei momenti concitati. Mitigazioni: approvazione multipla («Approva tutte le richieste di spostamento»),
  permessi concessi a gruppi, coda ordinata per arrivo.
- **Carico:** ogni messaggio o richiesta cambia lo stato e fa rinviare le viste a tutti, più una scrittura nel
  database. Con 10 giocatori è trascurabile; la simulazione (S8) lo conferma.
- **Testo dei giocatori sullo schermo:** mai mostrato, così nessuno proietta testi inopportuni.
- **Lettere fotografate:** limite accettato (§5.3).
