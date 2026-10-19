# Piano: «Pilota alla cieca» (labirinto a squadre con informazioni divise)

> Stato: **implementato** (P1–P6 fatti, vedi §7; resta da provare con persone): è il **secondo dei tre** giochi pianificati, dopo [Artificieri](PIANO-ARTIFICIERI.md)
> (di cui riusa il generatore di labirinti e il giudizio all'ora equa) e prima di
> [Plancia di Comando](PIANO-PLANCIA-COMANDO.md) (a cui passa le misure dello stress, §7). Le decisioni del §2 sono
> **confermate** dall'utente. I punti che dipendono dal codice esistente sono verificati nel §9.
> Da leggere insieme a [PIANO.md](../PIANO.md) e [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

## 1. Obiettivo

Una gara a squadre in cui **chi guida non vede i pericoli** e **chi vede i pericoli non guida**.

In sintesi:
- ogni squadra ha un **labirinto** sulla TV: si vedono i muri, il **pilota** (una pedina), l'uscita e le porte, ma
  **non** i pericoli;
- il **pilota** guarda la TV e muove la pedina con le frecce del telefono;
- i **navigatori** (gli altri membri) vedono sul telefono la mappa con **un solo strato** di informazioni
  ciascuno: chi le mine, chi quando le porte sono aperte, chi dov'è la chiave, chi le pattuglie;
- nessun navigatore sa tutto: il pilota deve mettere insieme a voce le indicazioni di tutti («Non a destra, mina!»,
  «Porta aperta tra due secondi», «La chiave è in alto»).

Le squadre corrono **in contemporanea** (fino a 4 corsie sulla TV): è la gara a farlo diventare spettacolo.

A differenza di Artificieri, qui **nessuno deve girarsi**: i pericoli non sono sulla TV, quindi tutti possono
guardarla. L'unica regola fisica è che il pilota non guarda i telefoni dei compagni.

## 2. Decisioni (confermate con l'utente)

| Tema | Decisione |
|---|---|
| Nome | **«Pilota alla cieca»**, id `pilota-cieco`, tema predefinito `pixel` (la griglia si presta) |
| Modalità | **«Insieme»** (default): fino a 4 squadre in contemporanea, TV divisa in corsie. **«A turno»**: una squadra alla volta, labirinto a tutto schermo (per più di 4 squadre o per la regia che vuole più spettacolo) |
| Labirinti | **Uno diverso per squadra**, generato con le **stesse caratteristiche** (lunghezza del percorso, numero di mine, porte e chiavi entro una tolleranza): con lo stesso labirinto, chi guarda le corsie altrui imparerebbe dove sono le mine |
| Movimento | **A caselle in tempo reale**, con una pausa minima tra due passi (`stepMs`, default 350 ms): niente turni, ma niente corse alla cieca |
| Strati | Mine, porte, chiave, pattuglie. Ogni navigatore ne ha uno; con più navigatori che strati si ripetono, con meno uno ne ha più di uno |
| Mappa dei navigatori | Mostra **muri + il proprio strato + la posizione del pilota dal vivo**, così possono guidare anche senza guardare la TV |
| Porte e pattuglie | **Funzioni pure del tempo** (porta aperta se `floor((t - start) / period)` è pari, pattuglia lungo un giro fisso): nessun cambio di stato per animarle, il telefono le calcola con l'orologio sincronizzato |
| Latenza | Un passo verso una porta o una pattuglia si giudica all'**ora equa** della pressione (`fairTime`), non a quella di arrivo |
| Squadre | I **team della serata** (almeno 2 membri); senza team, l'app divide i giocatori in 2–4 squadre |
| Pilota | A rotazione: cambia a ogni livello |

## 3. Regole in breve

### 3.1 Livello

1. **Partenza**: ogni pilota parte dal suo ingresso; parte il tempo del livello (`levelSeconds`, default 150).
2. **Movimento**: un passo per pressione, al massimo uno ogni `stepMs`. I muri si vedono: andarci contro non fa
   nulla.
3. **Pericoli**:
   - **mina**: il pilota «salta», la mina diventa visibile a tutti sulla TV (ormai è nota) e lui torna all'ultimo
     **punto di controllo**, fermo per `penaltyMs` (default 3 s);
   - **porta chiusa**: urto, fermo per 1 s (la porta si vede sulla TV, ma non se è aperta o chiusa);
   - **pattuglia**: come una mina, ma la pattuglia resta invisibile;
   - **chiave**: serve per aprire l'uscita (o più chiavi ai livelli alti). Quando il pilota ci passa sopra, la TV la
     mostra raccolta.
4. **Arrivo**: con la chiave sull'uscita. L'ordine di arrivo vale punti; allo scadere del tempo chi non è arrivato
   prende punti in base alla distanza dall'uscita (passi del percorso più breve).

### 3.2 Round

`levels` livelli (default 3), sempre più difficili (labirinto più grande, più mine, porte più veloci, pattuglie dal
livello 2). Il pilota cambia a ogni livello.

## 4. Configurazione dell'istanza (`configSchema`)

I labirinti si generano dal seme: non c'è contenuto da scrivere.

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `mode` | `"insieme" \| "a-turno"` | `"insieme"` | §2 |
| `levels` | intero 1–5 | 3 | |
| `size` | `"piccolo" \| "medio" \| "grande"` | `"medio"` | 9×9 / 11×11 / 13×13 al primo livello, +2 ai livelli successivi fino al massimo |
| `mineDensity` | intero 0–20 | 8 | Percentuale delle caselle libere fuori dal percorso garantito |
| `doors` | intero 0–8 | 3 | |
| `keys` | intero 0–3 | 1 | 0 = uscita sempre aperta |
| `patrols` | booleano | `true` | Dal livello 2 |
| `stepMs` | intero 150–1000 | 350 | |
| `penaltyMs` | intero 0–10000 | 3000 | |
| `levelSeconds` | intero 30–600 | 150 | |
| `finishPoints` | lista di interi | `[150, 100, 75, 50]` | Per ordine di arrivo |
| `distancePoints` | intero 0–100 | 50 | Massimo per chi non arriva, in proporzione alla strada fatta |
| `strikePenalty` | intero 0–100 | 10 | Per mina o pattuglia |

## 5. Il plugin `pilota-cieco`

### 5.1 Stato

```ts
type Cell = number;                  // indice nella griglia (y * w + x)
type Layer = "mines" | "doors" | "keys" | "patrols";

interface Maze {
  w: number; h: number;
  walls: number[];                   // bit per lato di ogni casella: PUBBLICO
  start: Cell; exit: Cell; checkpoints: Cell[];   // PUBBLICI
  mines: Cell[];                     // SEGRETO (strato «mines»)
  doors: { cell: Cell; period: number; offset: number }[];   // posizione pubblica, orario SEGRETO (strato «doors»)
  keys: Cell[];                      // SEGRETO (strato «keys»)
  patrols: { path: Cell[]; stepMs: number; offset: number }[];   // SEGRETO (strato «patrols»)
}

interface Lane {
  teamId: string;
  pilotId: string;
  layers: Record<string, Layer[]>;   // navigatore → strati
  maze: Maze;
  pos: Cell;
  lastCheckpoint: Cell;
  frozenUntil: number;
  lastStepAt: number;
  keysTaken: Cell[];
  minesHit: Cell[];                  // diventano pubbliche
  strikes: number;
  finishedAt: number | null;
}

interface State {
  phase: "ready" | "run" | "level-end" | "final" | "done";
  seed: number;
  cfg: PilotaConfig;
  level: number;
  teams: { id: string; name: string; color: string; members: string[] }[];
  lanes: Lane[];                     // in «a-turno» una sola alla volta
  queue: string[];                   // squadre in attesa («a-turno»)
  levelStartedAt: number | null;
  board: Record<string, number>;     // punti per squadra
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
}
```

Generatore (`maze.ts` della cartella del gioco, costruito sul generatore comune `packages/minigames/src/maze.ts`
creato per Artificieri), regole del movimento (`move.ts`) e calcolo di porte e pattuglie nel tempo (`timeline.ts`)
sono funzioni pure con i loro test; `timeline.ts` è condiviso con il client (sta in `shared` o viene esportato dal
plugin), così TV e telefoni calcolano porte e pattuglie come il server.

### 5.2 Generatore

1. Labirinto «perfetto» dal seme (backtracking, dal generatore comune), poi si tolgono alcuni muri per creare cicli (servono strade
   alternative quando una porta è chiusa).
2. Percorso più breve ingresso → chiave → uscita: le mine **non** ci vanno mai sopra (il livello è sempre
   risolvibile); le porte invece sì, almeno una.
3. Mine sulle caselle vicine al percorso (le più insidiose), pattuglie su anelli del labirinto.
4. **Equità tra squadre**: per ogni livello si generano i labirinti di tutte le squadre e si scartano (con semi
   successivi) quelli il cui percorso più breve differisce di oltre il 10% dalla media. I test lo verificano.

### 5.3 Fasi

```
ready → run → level-end ─┬─ (altri livelli) → ready
                         └─ (fine) → final → done
```

| Fase | Cosa succede | Come finisce |
|---|---|---|
| `ready` | La TV presenta il livello e i piloti; i navigatori vedono il proprio strato | La regia preme «Via» (o 10 s) |
| `run` | Gara | Tutti arrivati o tempo scaduto |
| `level-end` | La TV scopre tutti gli strati di ogni corsia e mostra la classifica del livello | La regia preme «Avanti» |
| `final` | Classifica del round | La regia preme «Avanti» |

### 5.4 Input dei giocatori (`inputSchema`)

| Input | Chi | Note |
|---|---|---|
| `{ type: "move", dir }` | Pilota, in `run` | `dir` = `"up" \| "down" \| "left" \| "right"`. Rifiutato se fermo (`frozenUntil`) o prima di `lastStepAt + stepMs` (all'ora equa). Porte e pattuglie si valutano all'ora equa della pressione |
| `{ type: "ping", cell }` | Navigatore, in `run` | Facoltativo (da valutare): fa lampeggiare una casella sulla mappa dei compagni navigatori, non sulla TV. Utile nel rumore |

**Traffico:** in «insieme» con 4 piloti a ~3 passi al secondo sono ~12 cambi di stato al secondo, ciascuno
rimandato a tutti i client (§9). Va misurato con lo stress; porte e pattuglie non generano traffico perché le
calcolano i client.

### 5.5 Comandi della regia

`pause`, `resume`, `go` (avvia il livello), `skip-pilot` (cambia pilota nella squadra), `finish-level`, `next`,
`end`. `minPlayers: 2`; `buildConfig` controlla che ogni squadra abbia almeno 2 membri e, in «insieme», che le
squadre siano al massimo 4 (altrimenti suggerisce «a turno»).

### 5.6 Punti

Per livello: `finishPoints[ordine di arrivo]` a chi arriva, `distancePoints × strada fatta` a chi non arriva,
`- strikePenalty` per mina o pattuglia (mai sotto zero nel livello). Il tabellone è per squadra; alla fine ogni
membro riceve i punti della squadra (voci con `teamId: null`).

### 5.7 Chi vede cosa

| Informazione | TV | Pilota | Navigatori della squadra | Altre squadre | Regia |
|---|---|---|---|---|---|
| Muri, ingresso, uscita, posizione dei piloti, porte (solo dove sono) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mine non ancora calpestate | solo in `level-end` | ❌ | **solo con lo strato «mines»** | ❌ | ✅ |
| Orario delle porte | solo in `level-end` | ❌ | solo con «doors» | ❌ | ✅ |
| Chiavi non raccolte | solo in `level-end` | ❌ | solo con «keys» | ❌ | ✅ |
| Pattuglie | solo in `level-end` | ❌ | solo con «patrols» | ❌ | ✅ |

- Nelle viste senza uno strato la chiave relativa **non esiste**; il test anti-leak le controlla per ogni
  combinazione di strati e per le corsie delle altre squadre.
- Il telefono del pilota mostra solo le frecce, il tempo, gli errori e lo stato («Fermo 2 s»).

## 6. Interfacce

### 6.1 TV

```
  LIVELLO 2/3                                              ⏱ 1:47
 ┌──── ROSSI ────┐ ┌──── BLU ──────┐ ┌──── VERDI ────┐ ┌─── GIALLI ───┐
 │ █ █ █ █ █ █ █ │ │               │ │               │ │              │
 │ █ ☺ · · ▯ · █ │ │      ...      │ │      ...      │ │     ...      │
 │ █ █ █ · █ ✹ █ │ │               │ │               │ │              │
 │ █ · · · · · ⚑ │ │               │ │               │ │              │
 └ 🔑 0/1  ✖ 1 ──┘ └ 🔑 1/1  ✖ 0 ──┘ └ 🔑 0/1  ✖ 2 ──┘ └ 🔑 1/1 ✖ 0 ──┘
    ▯ porta   ✹ mina già scoperta   ⚑ uscita
```

- Labirinti in canvas 2D o SVG (fino a 4 × 15×15 caselle), sprite pixel del tema. PixiJS è previsto per i giochi
  pixel: da usare solo se l'SVG non regge le animazioni (§8).
- In `level-end` gli strati compaiono uno alla volta su tutte le corsie, con le «quasi vittime» evidenziate.

### 6.2 Telefono del pilota

Croce direzionale grande (`onPointerDown`, la rapidità conta), tempo, chiavi, errori, stato di blocco. Niente
mappa: deve guardare la TV.

### 6.3 Telefono dei navigatori

La mappa della propria squadra con muri, pilota e il proprio strato; legenda dello strato in alto («Tu vedi: MINE»).
Le porte cambiano colore e mostrano i secondi alla prossima apertura, le pattuglie si muovono: tutto calcolato in
locale da `timeline.ts` e dall'orologio sincronizzato. Pulsante «Nascondi» (per quando il pilota si avvicina).

### 6.4 Regia

Tutte le corsie con tutti gli strati, piloti, errori; «Via», pausa, «Cambia pilota», «Chiudi il livello»,
«Avanti».

## 7. Fasi di lavoro

Ogni passo si chiude con test verdi e una piccola demo; commit semantici separati (nessun commit senza richiesta).

| Passo | Contenuto | Verifica |
|---|---|---|
| **P1 Generatore e movimento** ✅ | `maze.ts` del gioco (cicli, pericoli, equità tra squadre) sopra il generatore comune di Artificieri, `move.ts`, `timeline.ts` | Per 5000 semi: livello sempre risolvibile, mine mai sul percorso più breve, percorsi tra squadre entro il 10%; stesso seme → stesso labirinto; porte e pattuglie: stessa risposta per lo stesso istante |
| **P2 Logica del plugin** ✅ | Squadre, corsie, strati, fasi, passi con `stepMs` e blocchi, punti, `buildConfig` | Unit test: passo rifiutato durante il blocco e prima di `stepMs`; porta giudicata all'ora equa (stessa pressione con RTT diversi → stesso esito); mina → checkpoint e mina pubblica; chiave e uscita; ordine di arrivo; contratto di `registry.test.ts` |
| **P3 Anti-leak** ✅ | Scorrimento dello stato | Nessuno strato segreto nella TV e nel pilota prima di `level-end`; ogni navigatore solo i propri strati; mai gli strati di un'altra squadra |
| **P4 Viste** ✅ | TV a 1–4 corsie, croce del pilota, mappa del navigatore; scene `/preview` (`pc-*`) nei 5 temi | Asserzioni Playwright: nessun overflow a 360×640; 4 corsie 15×15 leggibili sulla TV; porte del navigatore che cambiano stato nel tempo (orologio di prova) |
| **P5 End-to-end** ✅ | Due squadre: un pilota calpesta una mina, uno urta una porta chiusa, uno arriva; `level-end` | **Frame WebSocket**: nessuno strato segreto al pilota e alla TV; server pulito alla fine |
| **P6 Bot, documenti, pacchetto** ✅ | Bot pilota che segue le indicazioni simulate (conosce gli strati dalla vista dei navigatori bot) con errori casuali; guida `docs/PILOTA-CIECO.md`, `rulesText.ts`, `PIANO.md`, `CLAUDE.md` | `pnpm stress --players 30 --scenario pilota` (4 squadre «insieme»): tempi di aggiornamento con 4 piloti a raffica, **annotati nella guida** perché servono a dimensionare il raggruppamento degli invii di Plancia di Comando (P0 di quel piano); `pnpm test`, `pnpm test:e2e`, pacchetto |

### Scostamenti decisi in P1–P6

- **Equità tra le squadre**: i percorsi si cercano entro il **4%** di una lunghezza di riferimento (la **mediana** di alcuni livelli di prova),
  non entro il 10% della prima squadra: così nessuna si discosta più del 10% dalla media (il test lo verifica su 2000 prove).
  Un livello lunghissimo o cortissimo non può farsi inseguire dagli altri.
- **Mine**: al massimo il 20% delle caselle (con la crescita per livello si superava e mancavano caselle libere).
- **Generatore**: dimensioni 9/11/13 (+2 a livello, tetto 13 in «insieme» e 15 «a turno»); l'uscita è tra le 3 caselle più lontane dall'ingresso;
  le chiavi sono a metà strada; i punti di controllo a un terzo e due terzi del percorso; la prima porta è sul percorso.
- **«A turno» e «insieme» con più di 4 squadre** condividono lo stesso meccanismo: una **gara** (unità) è un insieme di corsie che corrono
  insieme (tutte, fino a 4, oppure una); un livello è una sequenza di gare. I punti si assegnano quando tutte le gare del livello
  sono fatte (l'ordine di arrivo è per tempo, anche fra gare successive).
- **Pausa** anche in gara: alla ripresa si sposta di altrettanto `levelStartedAt` e i tempi delle corsie (blocchi, ultimo passo, arrivi),
  così porte e pattuglie non saltano.
- **Pattuglie** valutate a ogni tick sul pilota fermo (oltre che a ogni passo): una pattuglia che gli arriva addosso conta come una mina.
- **Croce del pilota**: tenendo premuta una freccia il passo si ripete a ogni `stepMs` (più comodo di toccare a raffica).
- **`ping` dei navigatori** (facoltativo nel piano): non implementato.
- **Il generatore comune `maze.ts`** è quello creato per Artificieri; qui si aggiungono i cicli (`loops`) e le funzioni di strada che resta.
- **Bot**: il pilota simulato legge mine e porte dalla vista della regia automatica, aspetta blocchi e porte con il tempo di riflessione (che
  deve comprendere `stepMs`: un passo troppo presto è rifiutato in silenzio e il bot resterebbe fermo), e sbaglia il 5% dei passi.

## 8. Rischi residui

- **Pilota che guarda i telefoni:** regola fisica; il pulsante «Nascondi» e la posizione davanti alla TV aiutano.
- **Navigatori che fanno tutto da soli:** con la mappa e la posizione del pilota sul telefono possono dettare ogni
  passo. Va bene: il gioco sta nel mettere insieme strati diversi a voce. Se risultasse troppo facile, si toglie la
  posizione del pilota dalla mappa dei navigatori (devono guardarla sulla TV).
- **Traffico in «insieme»:** 4 piloti che premono a raffica fanno ~12 invii completi al secondo a tutti i client
  (§9). Il raggruppamento degli invii in `flush()` è stato fissato come **primo passo di Plancia di Comando**, che
  viene dopo: se lo stress di questo gioco mostra già ritardi gravi, si anticipa quel passo (modifica a
  `realtime.ts`, a parte e con i suoi test) prima di chiudere Pilota alla cieca.
- **Orologi:** porte e pattuglie dipendono dall'orologio sincronizzato del telefono; uno sfasamento di qualche
  centinaio di ms si nota come porta «aperta» che invece è chiusa. Il giudizio all'ora equa sul server copre il
  pilota; per i navigatori si mostra il conto alla rovescia arrotondato.
- **TV con 4 corsie:** con labirinti 15×15 le caselle diventano piccole; il livello massimo in «insieme» resta
  13×13.

## 9. Verifiche sul codice (prima dell'implementazione)

| Punto del piano | Esito | Dove |
|---|---|---|
| `teams` e `players` con `teamId` nel contesto di `init`; `buildConfig` per i controlli sulle squadre | ✅ | `shared/src/minigame.ts` |
| `fairTime` e `meta.claimedTime` per giudicare un passo all'ora equa | ✅ | `shared/src/fairtime.ts` |
| Orologio sincronizzato disponibile alle viste (`clock`) per calcolare porte e pattuglie in locale | ✅ | `NUOVO-MINIGIOCO.md` §3, `<Countdown clock>` |
| Tick ogni 100 ms (scadenza del livello e fine dei blocchi) | ✅ | `server/src/index.ts` |
| Ogni cambio di stato rimanda **tutte** le viste a tutti, senza accorpamento | ✅ da misurare con lo stress (§8) | `server/src/realtime.ts`, `flush` |
| 20 input al secondo per giocatore | ✅ compatibile (un passo ogni 350 ms) | `realtime.ts`, `inputLimiter` |
| Stress con `--scenario` nuovo | da aggiungere `pilota` | `tools/bots/src/run.ts` |
