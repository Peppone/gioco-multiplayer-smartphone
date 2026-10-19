# Piano: «Artificieri» (disinnesco a squadre, in stile Keep Talking and Nobody Explodes)

> Stato: **implementato** (P1–P7 fatti, vedi §7; resta da provare con persone): è il **primo dei tre** giochi pianificati (poi [Pilota alla cieca](PIANO-PILOTA-CIECO.md)
> e [Plancia di Comando](PIANO-PLANCIA-COMANDO.md)). Le decisioni del §2 sono **confermate** dall'utente.
> I punti che dipendono dal codice esistente sono verificati nel §9.
> Da leggere insieme a [PIANO.md](../PIANO.md) e [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

## 1. Obiettivo

Un gioco a squadre con **informazioni divise**: una persona vede la bomba ma non sa come disinnescarla, i compagni
sanno come disinnescarla ma non vedono la bomba. L'unico canale tra loro è **la voce**.

In sintesi:
- gioca **una squadra alla volta**; l'**artificiere** sta davanti alla TV, dove c'è la bomba con il timer e 3–6
  **moduli** (fili, pulsante, simboli, colori, labirinto, parola);
- il telefono dell'artificiere è il **telecomando**: taglia un filo, preme un tasto, muove un cursore;
- gli **esperti** (gli altri membri della squadra) danno le **spalle alla TV** e hanno sul telefono il **manuale**,
  diviso in pagine: ognuno ne vede solo alcune, quindi devono parlare tutti;
- tre errori o il timer a zero: la bomba esplode. Le altre squadre guardano e **scommettono** sull'esito.

È il gioco che sfrutta meglio la TV come «palcoscenico»: chi non gioca si diverte a guardare e ascoltare.

**Nome.** *Keep Talking and Nobody Explodes* è un marchio di Steel Crate Games: nell'app il gioco si chiama
**«Artificieri»** (id `artificieri`). Moduli, regole e testi del manuale sono scritti da noi.

## 2. Decisioni (confermate con l'utente)

| Tema | Decisione |
|---|---|
| Nome | **«Artificieri»**, id `artificieri`, tema predefinito `boom` |
| Turni | **Una squadra alla volta** sulla TV (`bombsPerTeam` bombe per squadra, default 1). Il gioco simultaneo non regge: con la bomba sulla TV le squadre si leggerebbero le bombe a vicenda |
| Chi vede la bomba | **Solo la TV**, e gli esperti le danno le spalle (regola fisica, ricordata sullo schermo e sui telefoni nel `briefing`). La modalità «bomba sul telefono», per sale dove non ci si può girare, **non è nella prima versione**: resta un'estensione futura (§8) |
| Telefono dell'artificiere | Mostra **solo i comandi** del modulo attivo (fili numerati, tasti, frecce), **senza** le informazioni che servono per decidere: numero di serie, batterie, spie e colori stanno **solo sulla TV**. Così l'artificiere deve guardare lo schermo e descriverlo |
| Manuale | **Diviso tra gli esperti** a rotazione: ogni pagina ad almeno un esperto; con un solo esperto, tutto a lui |
| Regole del manuale | **Generate dal seme di ogni bomba**: chi ha guardato il turno di un'altra squadra non impara le soluzioni. Opzione `sameManual` per usare la stessa edizione per tutto il round (più facile, ma avvantaggia chi gioca dopo) |
| Squadre | I **team della serata** (almeno 2 membri ciascuno); senza team, l'app divide i giocatori a caso in squadre da 3–5. Consigliate squadre da 3 a 6: con 15 esperti il manuale si ripete troppo |
| Artificiere | A rotazione nella squadra, in un ordine fissato all'inizio (chi l'ha già fatto passa in fondo) |
| Spettatori | Le altre squadre **scommettono** «Disinnescata / Esplode» prima dell'inizio, dal telefono; poi vedono sul telefono il timer e le reazioni |
| Tempi e latenza | Il timer è in ora server; gli input che dipendono dal tempo (il pulsante da rilasciare su una cifra) usano `fairTime` e la sincronizzazione dell'orologio, mai l'ordine di arrivo |

## 3. Regole in breve

### 3.1 Turno di una squadra

1. **Scommesse** (`betSeconds`, default 15): le altre squadre scelgono «Disinnescata» o «Esplode».
2. **Briefing**: la TV mostra «Esperti di spalle!»; gli esperti aprono il manuale; l'artificiere preme «Inizia».
3. **Disinnesco**: parte il timer (`seconds`, default 300). L'artificiere sceglie un modulo alla volta sul telefono
   (sulla TV il modulo attivo si ingrandisce) e agisce. Un'azione giusta disinnesca il modulo (spia verde); una
   sbagliata è un **errore** (spia rossa, scossa sulla TV, il timer accelera del 25% se `speedUpOnStrike`).
4. **Fine**: tutti i moduli disinnescati → bomba disinnescata. Timer a zero o `maxStrikes` errori (default 3) →
   esplosione. La TV mostra l'esito e chi aveva scommesso giusto.

### 3.2 Il bordo della bomba (solo sulla TV)

Come nell'originale, alcune regole dipendono da dettagli sul bordo: **numero di serie** (6 caratteri), **batterie**
(0–4), **spie** con sigla (accese o spente), **porte**. Il manuale ha una pagina «Bordo» che spiega come leggerli.

### 3.3 Moduli della prima versione

| Modulo | Sulla TV | Sul telefono dell'artificiere | Nel manuale |
|---|---|---|---|
| **Fili** | 3–6 fili colorati | Un pulsante «Taglia» per filo, numerati dall'alto | Regole in ordine per numero di fili («Se non ci sono fili rossi, taglia il secondo…»; l'ultima è sempre «altrimenti…») |
| **Pulsante** | Pulsante colorato con una scritta, poi una striscia colorata | «Premi e rilascia» / «Tieni premuto» (rilascio al sollevamento del dito) | Quando premere e basta, quando tenere premuto e su quale cifra del timer rilasciare in base al colore della striscia |
| **Simboli** | 4 simboli strani | 4 tasti con lo **stesso simbolo** (il telefono deve mostrarli per poterli premere) | 6 colonne di 7 simboli: si premono nell'ordine della colonna che li contiene tutti |
| **Colori** | Sequenza di luci che si allunga | 4 tasti colorati | Tabella colore visto → colore da premere, che cambia con gli errori e con le vocali nel numero di serie |
| **Labirinto** | Griglia 6×6 senza muri, con 2 segni, la posizione e l'arrivo | 4 frecce | 9 labirinti con i muri: i 2 segni dicono quale è. Sbattere contro un muro è un errore |
| **Parola** | 5 rotelle di lettere | `‹ ›` per ogni rotella e «Invia» | Elenco di parole da 5 lettere: una sola si può comporre con le lettere delle rotelle |

Le parole del modulo «Parola» sono contenuto: vengono da una **«Lista di parole» della libreria** (filtrate a 5
lettere, come in Agenti Segreti), non dal codice.

Il modulo «Labirinto» usa un generatore di labirinti **comune** (`packages/minigames/src/maze.ts`, accanto a
`util.ts` e `word-list.ts`): griglia con i muri come bit per lato, labirinto «perfetto» dal seme, percorso più
breve. Lo riusa [Pilota alla cieca](PIANO-PILOTA-CIECO.md), che aggiunge i cicli e i pericoli: va scritto e
testato pensando a entrambi.

### 3.4 Generatore e giudice

- Ogni modulo ha un **generatore** (dal seme: istanza del modulo + regole del manuale) e un **giudice** (data
  l'azione e lo stato del modulo, «giusto», «sbagliato» o «non ancora»).
- Le regole del manuale sono **dati strutturati** (es. `{ when: { color: "red", count: 0 }, cut: 2 }`), non testo:
  il giudice e il testo del manuale (generato dal plugin in italiano) vengono dalla stessa struttura, quindi non
  possono contraddirsi.
- Il generatore garantisce **una sola soluzione** per modulo e la verifica con il giudice; i test lo controllano
  su migliaia di semi.

## 4. Configurazione dell'istanza (`configSchema`)

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `difficulty` | `"facile" \| "media" \| "difficile"` | `"media"` | Numero e complessità delle regole del manuale |
| `modules` | intero 3–6 | 4 | Moduli per bomba |
| `enabledModules` | oggetto di booleani (uno per modulo) | tutti `true` | Almeno uno attivo (`.refine`) |
| `seconds` | intero 60–900 | 300 | Durata del timer |
| `maxStrikes` | intero 1–5 | 3 | |
| `speedUpOnStrike` | booleano | `true` | |
| `bombsPerTeam` | intero 1–3 | 1 | |
| `sameManual` | booleano | `false` | §2 |
| `betSeconds` | intero 0–60 | 15 | 0 = senza scommesse |
| `words` | istanza `word-list` | lista predefinita | Widget `instance`, come Agenti Segreti |
| `modulePoints` | intero 0–1000 | 50 | Per modulo disinnescato, anche se la bomba poi esplode |
| `defusePoints` | intero 0–1000 | 200 | Bomba disinnescata |
| `timeBonus` | intero 0–10 | 1 | Punti per secondo rimasto |
| `betPoints` | intero 0–500 | 50 | Scommessa giusta (per giocatore) |

## 5. Il plugin `artificieri`

### 5.1 Stato

```ts
type ModuleKind = "wires" | "button" | "symbols" | "colors" | "maze" | "word";

interface Edgework { serial: string; batteries: number; indicators: { label: string; lit: boolean }[]; ports: string[] }

interface ModuleState {
  id: number;
  kind: ModuleKind;
  data: unknown;            // istanza del modulo (fili, simboli…): pubblica sulla TV
  rules: unknown;           // regole del manuale per questo modulo: SOLO agli esperti, come testo
  progress: unknown;        // stato interno (passi della sequenza, posizione nel labirinto, tasto tenuto)
  solved: boolean;
}

interface Bomb {
  teamId: string;
  defuserId: string;
  edgework: Edgework;
  modules: ModuleState[];
  pages: Record<string, number[]>;   // esperto → pagine del manuale assegnate
  strikes: number;
  startedAt: number | null;
  deadline: number | null;           // ora server, ricalcolata a ogni accelerazione
  speed: number;                     // 1, 1.25, 1.5…
  outcome: "defused" | "exploded" | null;
}

interface State {
  phase: "bet" | "briefing" | "defuse" | "outcome" | "final" | "done";
  seed: number;
  cfg: ArtificieriConfig;
  teams: { id: string; name: string; color: string; members: string[] }[];
  queue: { teamId: string; defuserId: string }[];   // ordine dei turni
  bomb: Bomb;
  bets: Record<string, "defused" | "exploded">;     // giocatore → scommessa
  history: { teamId: string; outcome: string; solved: number; secondsLeft: number }[];
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
}
```

Generatori e giudici stanno in `modules/<tipo>.ts`, ciascuno con i suoi test; il testo del manuale in
`manual.ts`. Il seme di una bomba si ricava da `seed`, squadra e numero della bomba (`sameManual` riusa le regole
della prima).

### 5.2 Fasi

```
bet → briefing → defuse → outcome ─┬─ (altre bombe) → bet
                                   └─ (fine) → final → done
```

| Fase | Cosa succede | Come finisce |
|---|---|---|
| `bet` | Le altre squadre scommettono; la TV presenta la squadra e l'artificiere | Tutti hanno scommesso o tempo scaduto (salta se `betSeconds` = 0) |
| `briefing` | «Esperti di spalle!», gli esperti ricevono il manuale | L'artificiere (o la regia) preme «Inizia» |
| `defuse` | Timer, moduli, errori | Tutti i moduli risolti, `maxStrikes` errori o timer a zero (+ `GRACE_MS`) |
| `outcome` | Animazione di esito, scommesse, punti del turno | La regia preme «Avanti» |
| `final` | Classifica del round | La regia preme «Avanti» |
| `done` | `isFinished` vero | — |

Il timer accelerato si gestisce ricalcolando `deadline` al momento dell'errore (tempo rimasto / nuova velocità):
la TV mostra sempre il tempo «finto» della bomba, calcolato da `deadline` e `speed`.

### 5.3 Input dei giocatori (`inputSchema`)

Tutti gli input sulla bomba sono accettati **solo dall'artificiere** e solo in `defuse`.

| Input | Note |
|---|---|
| `{ type: "start" }` | Artificiere, in `briefing` |
| `{ type: "select", module }` | Modulo attivo (serve solo alla TV per ingrandirlo) |
| `{ type: "cut", module, wire }` | Fili |
| `{ type: "tap", module }` / `{ type: "hold", module }` / `{ type: "release", module }` | Pulsante. Il rilascio si giudica sulla cifra del timer **all'ora equa** del rilascio (`fairTime` su `meta.claimedTime`), con 150 ms di tolleranza ai cambi di cifra |
| `{ type: "press", module, key }` | Simboli e colori |
| `{ type: "move", module, dir }` | Labirinto |
| `{ type: "spin", module, wheel, delta }` / `{ type: "submit", module }` | Parola. `spin` cambia lo stato (la TV mostra le rotelle) ma non è mai un errore |
| `{ type: "bet", outcome }` | Membri delle altre squadre, in `bet`; vale l'ultimo |

Il traffico è basso (un'azione ogni pochi secondi): nessun problema con l'invio di tutte le viste a ogni cambio
(§9).

### 5.4 Comandi della regia (`commandSchema`)

`pause`, `resume` (il timer si ferma e riparte), `start` (al posto dell'artificiere), `swap-defuser` (sceglie il
prossimo della squadra, per chi è assente), `strike-undo` (annulla l'ultimo errore, per un tocco sbagliato
evidente), `explode` / `defuse` (chiude il turno a mano), `skip-team`, `next`, `end`.

All'avvio `buildConfig` controlla che ci siano almeno 2 squadre con almeno 2 giocatori (oppure una sola squadra,
in modalità senza sfidanti: le scommesse spariscono), e risolve la lista di parole come Agenti Segreti.
`minPlayers: 2`.

### 5.5 Punti

- Squadra di turno: `modulePoints` per modulo disinnescato, più `defusePoints` + `timeBonus × secondi rimasti` se
  la bomba è disinnescata. Ogni membro riceve i punti della squadra (voci con `teamId: null`, attribuite
  dall'engine).
- Spettatori: `betPoints` a ogni giocatore che ha scommesso giusto.
- `result()`: classifica per giocatore (membri della stessa squadra a pari rango).

### 5.6 Chi vede cosa

| Informazione | TV | Artificiere | Esperti della squadra | Altre squadre | Regia |
|---|---|---|---|---|---|
| Bomba (moduli, bordo, timer, errori) | ✅ | solo i **comandi** e il timer | ❌ solo timer ed errori | timer, errori, moduli risolti | ✅ |
| Pagine del manuale | ❌ | ❌ | **solo le proprie** | ❌ | ✅ |
| **Soluzioni** | ❌ | ❌ | ❌ | ❌ | ✅ (per aiutare) |
| Scommesse | in `outcome` (prima solo quante) | — | — | la propria | ✅ |

- Le viste degli esperti **non hanno** le chiavi `data` ed `edgework`; quella dell'artificiere non ha `rules`; la
  soluzione non compare in nessuna vista tranne la regia. Il test anti-leak controlla le chiavi a ogni passo.
- Il telefono dell'artificiere non ha il bordo né i colori dei moduli che servono a decidere (i tasti «Colori» sono
  colorati, ma la sequenza si vede solo sulla TV).

## 6. Interfacce

### 6.1 TV

```
  SQUADRA ROSSA · artificiere: Marco          ⏱ 03:41   ✖ ✖ ·
 ┌──────────────────────────────────────────────────────────┐
 │  [Fili ✔]   [Pulsante]   [Simboli]   [Labirinto]        │   bomba con i moduli in griglia
 │                ▲ modulo attivo ingrandito                │
 │  SERIALE  AL5QF2   🔋🔋   ● FRK   ○ CAR   [RJ-45]        │   bordo
 └──────────────────────────────────────────────────────────┘
  ESPERTI: DI SPALLE ALLA TV!            Scommesse: 9 / 12
```

- Moduli in SVG, disegnati con le variabili del tema; esplosione e disinnesco con Framer Motion e i suoni del tema.
  Niente PixiJS.
- Il timer lampeggia sotto i 30 secondi e accelera dopo gli errori.

### 6.2 Telefono dell'artificiere

Una fila di schede per i moduli (✔ quelli risolti) e i comandi del modulo scelto a tutta larghezza. In alto timer
ed errori. Il pulsante «tieni premuto» usa Pointer Events con `touch-action: none` (come `.ss-hold` di Stanze
Segrete).

### 6.3 Telefono degli esperti

Il manuale come **schede sfogliabili** (solo le proprie pagine), con indice e ricerca nella pagina. Testo grande,
tabelle e disegni in SVG (simboli, labirinti). In alto timer ed errori, perché sentano la pressione. Promemoria
fisso: «Non guardare la TV».

### 6.4 Altre squadre

In `bet` due grandi pulsanti; poi timer, errori, moduli risolti e le reazioni (primitiva `reactions`).

### 6.5 Regia

Squadra, artificiere, esperti con le pagine assegnate, soluzione di ogni modulo, scommesse; pausa, «Inizia»,
«Cambia artificiere», «Annulla l'ultimo errore», «Esplodi» / «Disinnesca», «Salta la squadra», «Avanti».

## 7. Fasi di lavoro

Ogni passo si chiude con test verdi e una piccola demo; commit semantici separati (nessun commit senza richiesta).
Il gioco si consegna **a pezzi**: da P1 a P5 una partita completa con i 3 moduli di base, poi P6 aggiunge gli altri
uno alla volta, ciascuno già giocabile.

| Passo | Contenuto | Verifica |
|---|---|---|
| **P1 Moduli di base** ✅ | Bordo; generatore, giudice e testo del manuale di **fili**, **pulsante** e **simboli** (con i ~30 simboli SVG) | Per 5000 semi e ogni difficoltà: una sola soluzione, il giudice accetta la soluzione e rifiuta le altre azioni; stesso seme → stessa bomba; testo del manuale coerente con la struttura (snapshot) |
| **P2 Logica del plugin** ✅ | Squadre, ordine dei turni, fasi, timer con accelerazione, errori, scommesse, comandi, punti, `buildConfig` | Unit test: input sulla bomba rifiutati da chi non è artificiere e fuori fase; rilascio del pulsante con latenza simulata (stessa pressione, RTT diversi → stesso giudizio); timer a zero entro `GRACE_MS`; pausa; contratto di `registry.test.ts` |
| **P3 Anti-leak** ✅ | Scorrimento dello stato a ogni passo | Nessuna `data`/`edgework` agli esperti, nessuna `rules` all'artificiere, alla TV e alle altre squadre; nessuna soluzione fuori dalla regia; scommesse altrui nascoste prima di `outcome` |
| **P4 Viste** ✅ | Moduli in SVG per TV e telefono, manuale, scene `/preview` (`art-*`: TV con la bomba, ogni modulo sul telefono, manuale, esplosione) nei 5 temi | Asserzioni Playwright: nessun overflow a 360×640 e sulla TV; `touch-action: none` sul pulsante; tutte le pagine del manuale leggibili senza scorrimento orizzontale |
| **P5 End-to-end** ✅ | Partita con 2 squadre: scommessa, briefing, disinnesco giusto e sbagliato, esplosione per errori, accelerazione | **Frame WebSocket**: manuale solo agli esperti della squadra di turno; bomba mai agli esperti; server pulito alla fine |
| **P6 Moduli aggiuntivi** ✅ | Uno alla volta: **colori**, **labirinto** (con il generatore comune `maze.ts`, §3.3), **parola** (con la lista di parole della libreria e `buildConfig`) | Per ogni modulo gli stessi test del P1, la sua scena `/preview` e un passo nello scenario e2e; per `maze.ts` test propri (labirinto perfetto, tutte le caselle raggiungibili, percorso più breve corretto) |
| **P7 Bot, documenti, pacchetto** ✅ | Bot artificiere che «legge» il manuale dalla vista della regia simulata (risolve con il giudice) e bot che sbagliano; guida `docs/ARTIFICIERI.md`, `rulesText.ts`, `PIANO.md`, `CLAUDE.md` (test richiesti), `GUIDA-HOST.md` | `pnpm stress --players 30 --scenario artificieri`; `pnpm test`, `pnpm test:e2e`, `pnpm package:win` + `pnpm package:check` |

### Scostamenti decisi in P1

- **Le regole stanno nella bomba, non nel modulo** (il §5.1 diceva `ModuleState.rules`): ogni tipo di modulo ha un
  solo elenco di regole per bomba (`BombRules`), valido per tutti i moduli di quel tipo. Con due moduli «Fili» sulla
  stessa bomba, un manuale per modulo si contraddirebbe. Ogni tipo ha il suo flusso casuale (`deriveSeed` sull'indice
  stabile del tipo), quindi aggiungere un tipo (P6) non cambia le regole degli altri.
- **Pulsante: si rilascia sulla cifra delle unità dei secondi**, non su «una cifra qualunque» del timer (con lo 0
  dei minuti sempre presente sarebbe banale). Il timer arrotonda per eccesso; tolleranza ±150 ms intorno al cambio
  di cifra.
- **Numero di serie** senza I, O, Q, Y e cifre senza 0 e 1 (non si confondono a distanza): le vocali sono A, E, U.
- **Il giudice riceve il tempo rimasto all'ora equa** (`remainingMs`): il plugin (P2) lo ricava con `fairTime`.
- **Fili**: 3–4 (facile), 3–5 (media), 3–6 (difficile); un filo già tagliato non si taglia di nuovo.

### Scostamenti decisi in P2

- **Timer: orologio con ancora e velocità** invece di una `deadline` ricalcolata: `bomb.clock = { at, remainingMs }`
  (a `at`, ora server, restavano `remainingMs` di tempo «finto») e `bomb.speed`. Il tempo finto rimasto a `t` è
  `remainingMs − (t − at) × speed`; a ogni errore con accelerazione si riancora all'ora equa dell'errore e la velocità
  diventa `1 + 0,25 × errori`. La scadenza reale è derivata (`realDeadline`). La pausa usa `pausedRemainingMs` dello
  stato, come negli altri giochi (vale per le scommesse e per il disinnesco).
- **Tolleranza sulla scadenza**: un'azione con ora equa prima della scadenza e arrivata entro `GRACE_MS` dopo vale
  (anche l'ultimo modulo); il timer esplode al tick solo da `scadenza + GRACE_MS`.
- **Squadre**: i team della serata con giocatori, per nome; chi non ha team non gioca la bomba ma scommette. Senza
  team: gruppi casuali da 3–5 (`ceil(n / 5)` squadre). `buildConfig` rifiuta un team con **un solo** giocatore (nessuno
  a cui dare il manuale); `init` invece non rifiuta nulla, per il contratto generico dei plugin.
- **Niente `libraryConfigSchema`**: l'istanza è la configurazione, perché per ora non riferisce altri contenuti. Il campo
  `words` arriva con il modulo «Parola» (P6).
- **Punti**: chi scommette giusto prende `betPoints` in aggiunta, quindi in una squadra i punti individuali possono
  differire (e i ranghi con essi); i membri della squadra di turno ricevono tutti gli stessi punti della bomba.
- **Il plugin è registrato**, quindi l'editor lo offre già, ma **non ha ancora viste nel client** (P4): non va
  aggiunto a una partita vera finché non ci sono.
- **Viste già scritte** (`screenView`, `viewFor`, `hostView`): il manuale arriva agli esperti solo da `briefing`, e
  ogni esperto riceve il titolo di tutte le pagine con chi le ha, per sapere a chi chiedere.

### Scostamenti decisi in P3

- **Nomi delle chiavi delle viste** scelti perché i nomi segreti non compaiano mai in una vista pubblica, così il
  controllo «nessuna chiave `rules`/`bets`/`index`…» è senza eccezioni: i numeri della partita sono in `settings` (non
  `rules`, che è il manuale), il turno ha `position` (non `index`) e `betsPlaced` (conteggio, non `bets`).
- **Cosa controlla `artificieri-leak.test.ts`** (a ogni passo di partite intere con 2 bombe per squadra, 4 scenari,
  12 semi ciascuno): chiavi vietate per ruolo; testi che identificano una pagina del manuale, il numero di serie e le
  soluzioni cercati nel JSON di ogni vista; elenco chiuso delle chiavi di `controls`, `history` e `status`; la bomba
  sulla TV solo in disinnesco ed esito, la striscia del pulsante solo mentre è tenuto; il manuale solo in briefing e
  disinnesco e solo le pagine proprie. Un test sul test prova che il controllo segnala una fuga inventata in ogni
  vista; una verifica a mano (fuga iniettata nel plugin) ha fatto fallire 6 test.
- **Helper condivisi** dei test di Artificieri in `test-helpers.ts` (partenza, input con ora e ritardo, soluzione e
  errore garantiti): li riuseranno i test e2e di P5 solo come modello, non come import.

### Scostamenti decisi in P4–P7

- **Viste**: i moduli sono componenti riusabili (`parts.tsx`) pronti per una futura modalità «bomba sul telefono». Sulla TV i moduli stanno
  in **una riga** (un modulo per colonna): con 6 moduli su due righe la bomba usciva dallo schermo. I 30 simboli SVG sono in
  `symbols.tsx` (un test li confronta con `SYMBOL_IDS` del server). Nella regia il pulsante di chiusura si chiama
  «Termina il round» (non «Termina la partita»): lo stesso nome del pulsante del motore rendeva ambiguo il cleanup dei test.
- **Il giudice riceve gli errori della bomba** (`JudgeInput.strikes`): il modulo Colori cambia tabella con gli errori.
- **Modulo «Parola»**: la parola giusta **non sta nei dati** del modulo (la TV è pubblica e l'artificiere la guarda): è l'unica
  parola dell'elenco del manuale componibile con le rotelle, e il giudice la ricava dalle regole. Il modulo è **spento di
  default** (richiede una lista di parole di 5 lettere, almeno 12); le parole si risolvono in `buildConfig` come in Agenti Segreti
  (`libraryConfigSchema`, widget `instance`).
- **Labirinto**: 9 labirinti nel manuale, distribuiti su 3 pagine da 3; i due cerchi sono unici tra i nove.
- **Regia**: `hostView` espone per ogni modulo anche il `plan` strutturato (azioni) oltre al testo; lo usano i bot.
- **Bot**: niente modulo «Pulsante» nello stress (non sanno rilasciare a tempo: lo copre l'e2e); l'artificiere simulato agisce
  **un'azione per volta** sul piano che la regia automatica vede (ricalcolato a ogni passo) e sbaglia il 5% delle volte.
  Lo stress ha trovato un difetto vero: `solution()` dei Simboli riproponeva anche i simboli già premuti.
- **Costo del realtime**: con 30 telefoni ogni azione rimanda le viste a tutti (342 input → ~10 600 aggiornamenti): è il motivo
  del primo passo di [Plancia di Comando](PIANO-PLANCIA-COMANDO.md).

## 8. Rischi residui

- **Esperti che sbirciano la TV:** è una regola fisica, come al tavolo. Mitigazioni: promemoria in `briefing`, la
  bomba compare sulla TV solo dopo «Inizia». Se nella sala non ci si può girare, la modalità «bomba sul telefono»
  (la TV mostra solo timer, errori e reazioni) è un'estensione futura, esclusa dalla prima versione per scelta
  dell'utente: cambia solo dove si disegna la bomba, quindi le viste vanno scritte con i moduli come componenti
  riusabili sia sulla TV sia sul telefono.
- **Durata:** 5 minuti per squadra più scommesse ed esito; con 6 squadre il round dura ~40 minuti. Consigliare
  `bombsPerTeam: 1` e squadre da 3–6.
- **Difficoltà del manuale:** troppo difficile blocca le squadre nuove. Partire da «facile» con 3 moduli e
  calibrare dopo le prime serate; il bot del P6 può misurare quante regole servono per modulo.
- **Rumore in sala:** gli esperti parlano tutti insieme. È parte del gioco; il manuale diviso per pagine aiuta a
  dare un ruolo a ciascuno.
- **Simboli:** servono ~30 simboli SVG leggeri e ben distinguibili (disegnati da noi): attenzione al peso del
  telefono (< 1,5 MB totali).

## 9. Verifiche sul codice (prima dell'implementazione)

| Punto del piano | Esito | Dove |
|---|---|---|
| `teams` e `players` con `teamId` nel contesto di `init` | ✅ | `shared/src/minigame.ts`, `MinigameContext` |
| `buildConfig` per controllare le squadre e risolvere un'istanza `word-list` | ✅ come Agenti Segreti (`widget: "instance"`, `instanceKind: "word-list"`) | `minigames/src/agenti-segreti/index.ts` |
| `fairTime` e `meta.claimedTime` per il rilascio del pulsante | ✅ | `shared/src/fairtime.ts`, `InputMeta` |
| Tick ogni 100 ms (scadenza del timer) | ✅ | `server/src/index.ts` (`setInterval(realtime.tick, 100)`) |
| Ogni cambio di stato rimanda tutte le viste a tutti; massimo 20 input al secondo per giocatore | ✅ irrilevante qui: un input ogni pochi secondi | `server/src/realtime.ts`, `flush` e `inputLimiter` |
| Tema `boom` esistente | ✅ | `client/src/themes/boom.css` |
| Generatore di labirinti comune | ❌ non esiste: da creare nel P6, riusato da Pilota alla cieca | `packages/minigames/src/maze.ts` |
| Stress con `--scenario` nuovo | da aggiungere `artificieri` | `tools/bots/src/run.ts` |
