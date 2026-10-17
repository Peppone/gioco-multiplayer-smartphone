# Piano: «Shadow Tournament» (torneo a eliminazione con carte segrete)

> Stato: **implementato T1-T9** sul branch `feat/shadow-tournament`: test, e2e, stress con 30 bot (`pnpm stress --players 30 --scenario shadow`)
> e pacchetto Windows verificati. Guida per la regia: [SHADOW-TOURNAMENT.md](SHADOW-TOURNAMENT.md).
> Fonte: il documento «🎲 Party Game.docx» (regole originali). Da leggere insieme a [PIANO.md](../PIANO.md)
> e [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

Il documento contiene tre parti:

1. **Analisi** delle regole originali: cosa funziona, cosa era ambiguo e come è stato chiarito (§1).
2. **Regole 2.0**: il regolamento completo, con le decisioni prese insieme all'autore (§2–§3).
3. **Piano di implementazione** come minigioco-plugin dell'app (§4–§7).

Tutte le decisioni sono state prese con l'autore (riepilogo in §8).

---

## 1. Analisi delle regole originali

### 1.1 In breve

Tutti contro tutti, a eliminazione. I giocatori si sfidano a coppie in **scontri**; ogni scontro è una serie di
**scambi** in cui si gioca una carta base in segreto e la si rivela insieme. Le 3 carte base formano un
triangolo (come sasso-carta-forbice): **Attacco > Raggiro > Difesa > Attacco**. Chi perde uno scambio perde
una **vita**; chi resta senza vite perde lo scontro. Lo stato **W/L** conta le sconfitte nel torneo: alla prima
si passa da W a L, alla seconda si è eliminati. Una valuta (i **token**) compra azioni speciali; chi vince uno
scontro pesca una carta ricompensa. Vince l'ultimo rimasto.

### 1.2 Cosa funziona già bene

- **Il cuore è sasso-carta-forbice**: tutti lo capiscono in 5 secondi, si gioca in simultanea, si adatta benissimo al telefono.
- **Due livelli di vita**: le vite fanno la tensione dentro lo scontro, W/L dà la struttura del torneo (doppia eliminazione).
- **Rivelazione simultanea** e **scelte segrete**: perfette per uno schermo condiviso che fa la suspense.
- **Risorsa tattica (token) con 1 azione per scambio**: dà profondità senza appesantire.
- **Rimischiare il mazzo dopo ogni pescata**: le quantità diventano semplici probabilità, facili da gestire nel software.
- **Bye/NPC per i numeri dispari**: il problema era già stato visto.

### 1.3 Problemi trovati e come sono stati risolti

| # | Problema nel documento | Soluzione (decisa con l'autore) |
|---|---|---|
| P1 | Vite e W/L sembravano due sistemi di eliminazione in conflitto. | **Chiarito**: le vite valgono per un singolo scontro (si riparte da 3 a ogni scontro); W/L conta le sconfitte nel torneo. |
| P2 | «Token» indicava sia la valuta sia lo stato W/L. | Nell'app: **token** = valuta, **stato W/L** = sconfitte nel torneo. |
| P3 | Pareggio (stessa carta) non definito. | **Non succede nulla, si rigioca lo scambio.** |
| P4 | Effetti delle carte base ridondanti col triangolo. | **Chiarito**: la colonna «Effetto» è solo sapore. Conta solo chi batte chi; chi perde lo scambio perde 1 vita. |
| P5 | Non era detto se le carte base si consumano. | Le 3 carte base sono **sempre disponibili** (salvo Trappola). |
| P6 | «Ogni giocatore sceglie chi affrontare»: conflitti non risolvibili. | **Accoppiamento automatico** (§3.2). |
| P7 | Non era detto quando si usa il mazzo Leggendario. | **Lo sceglie chi vince lo scontro**: Normale (sicuro) o Leggendario (rende di più, rischia di più). |
| P8 | Il Leggendario rendeva meno del Normale (≈ +0,67 token contro +0,73, e in più faceva perdere vite). | **Ribilanciato** (§3.6): ≈ +1,1 token di media, un terzo di carte negative. |
| P9 | «Cambia carta» (5 token): momento e contromossa non chiari. | **Resta com'è**: si usa dopo la rivelazione; l'avversario può pagare 5 token per far rigiocare lo scambio. Rara ma spettacolare. |
| P10 | «Intrappola ultima carta avversario» non definita. | Si annuncia **dopo la rivelazione**: l'avversario non può usare, **nello scambio successivo**, la carta che ha appena giocato. |
| P11 | Momento di Scommessa e Scudo non definito. | **Scommessa prima, in segreto** con la carta; **Scudo dopo la rivelazione**, da chi ha perso lo scambio. |
| P12 | «+2 token + 1 danno a un avversario»: bersaglio indefinito, rischio di *kingmaking*. | **Danno eliminato** dalla carta. |
| P13 | «Vantaggio rischioso» diceva «1 vita in più». | **Corretto**: «1 vita **in meno** nel prossimo scontro». |
| P14 | Massimi senza regola di eccedenza. | **L'eccedenza si perde** (token max 5, vite max 5). |
| P15 | Chi resta solo con un numero dispari non era definito. | **Prima chi è L** (a sorte, mai due turni di fila). |
| P16 | NPC non specificato. | L'NPC lo **interpreta un giocatore eliminato** (a sorte) dal suo telefono; se non ci sono eliminati gioca il computer a caso. Chi fa l'NPC non guadagna nulla. |
| P17 | Gli eliminati non hanno niente da fare. | Fanno l'NPC e i **pronostici** sullo scontro in evidenza (§3.9). |
| P18 | Durata non stimata. | Stima in §3.8, verifica con la simulazione (passo T7). |
| P19 | Refusi: «mischaito», «Pary game»; la sezione 4 ripete la 2C; «round» indica sia il turno sia lo scambio. | Nomi fissati in §2. |

---

## 2. Glossario

| Termine | Significato |
|---|---|
| **Turno** | Un giro del torneo: tutti i giocatori in gioco affrontano uno scontro (o hanno il bye). |
| **Scontro** | La sfida tra due giocatori: una serie di scambi finché uno resta senza vite. |
| **Scambio** | Una giocata: ognuno sceglie in segreto una carta base, poi si rivela. |
| **Carte base** | Attacco, Difesa, Raggiro. |
| **Vite** | Valgono per un solo scontro: 3 all'inizio, più i bonus, max 5. |
| **Stato W/L** | W = nessuna sconfitta; L = una sconfitta; alla seconda sconfitta si è eliminati. |
| **Token** | La valuta: 1 all'inizio, max 5. Si portano da uno scontro all'altro. |
| **Azione** | Ciò che si compra coi token (Scommessa, Scudo, Trappola, Cambia carta). |
| **Carta ricompensa** | Pescata da chi vince lo scontro, dal mazzo Normale o Leggendario. |

---

## 3. Regole 2.0

Questo è il regolamento che il software applica. In forma breve finirà sullo schermo e nel riassunto sul telefono (`rulesText.ts`).

### 3.1 Obiettivo e inizio

Restare l'ultimo giocatore in gioco. Ognuno parte con: **stato W**, **1 token**, le **3 carte base**.

**Triangolo**: Attacco batte Raggiro · Raggiro batte Difesa · Difesa batte Attacco.

### 3.2 Un turno

1. **Accoppiamento automatico**: il gioco forma le coppie, W con W e L con L quando possibile, evitando di
   rifare l'ultimo scontro.
2. **Numero dispari**: resta solo un giocatore **L** (a sorte, mai lo stesso due turni di fila; se non ci sono L,
   un W a sorte). Sceglie:
   - **Bye**: salta il turno, nessuna perdita né guadagno;
   - **NPC**: affronta l'NPC (§3.7) in uno scontro normale.
3. Tutti gli scontri del turno si giocano **in contemporanea**.

### 3.3 Uno scontro

1. **Vite extra** (prima dello scontro, in segreto, 10 s): ognuno decide se spendere **0 o 1 token** per partire con **1 vita in più**. Si rivela insieme.
2. Si parte con **3 vite** + vita extra + effetti delle carte ricompensa sul «prossimo scontro» (minimo 1, massimo 5).
3. Si giocano **scambi** (§3.4) finché uno arriva a **0 vite**: ha perso lo scontro.
4. **Chi perde**: W → L, oppure L → **eliminato**.
5. **Chi vince**: pesca una carta ricompensa (§3.6). Le vite rimaste non si conservano.

### 3.4 Uno scambio

1. **Scelta** (in segreto, 15 s): una carta base e, se vuoi, la **Scommessa**. Chi non sceglie gioca una carta a caso senza azioni.
2. **Rivelazione** simultanea.
   - Stessa carta → **pareggio**: non succede nulla, si rigioca (la Scommessa, se pagata, è persa).
   - Altrimenti chi ha la carta che vince è il vincitore dello scambio; chi perde perde **1 vita** (2 con la Scommessa avversaria).
3. **Reazioni** (8 s, si chiudono subito se nessuno può o vuole reagire):
   - chi ha **perso** lo scambio può usare **Scudo** oppure **Cambia carta**;
   - se usa Cambia carta, l'avversario può pagare 5 token per **annullare e rigiocare** lo scambio;
   - **chiunque** (vincitore, perdente o in pareggio) può usare la **Trappola**, se non ha già usato un'azione nello scambio.
4. Si applicano gli effetti e si passa allo scambio successivo.

### 3.5 Azioni coi token

**Al massimo 1 azione per giocatore in ogni scambio** (la Scommessa conta; anche la contromossa al Cambia carta conta).
I token spesi sono consumati, anche se l'azione poi non serve.

| Azione | Costo | Quando | Effetto |
|---|---|---|---|
| **Scommessa** | 1 | Prima, in segreto con la carta | Se la tua carta vince, l'avversario perde **1 vita in più**. |
| **Scudo** | 2 | Dopo la rivelazione, se hai perso | **Non perdi la vita** di questo scambio. |
| **Trappola** | 2 | Dopo la rivelazione (chiunque) | Nello **scambio successivo** l'avversario **non può usare** la carta che ha appena giocato. |
| **Cambia carta** | 5 | Dopo la rivelazione, se hai perso o pareggiato | Cambi la carta che hai giocato. L'avversario può pagare **5 token** per annullare il cambio e **rigiocare lo scambio**. |

Ordine di risoluzione delle reazioni: Cambia carta → contromossa → Scudo → Trappola.

### 3.6 Carte ricompensa

Chi vince lo scontro **sceglie da quale mazzo pescare**. Dopo la pescata la carta torna nel mazzo, che si
rimischia: le quantità sono probabilità. Gli effetti sui token valgono **subito**; quelli sulle vite valgono per
il **prossimo scontro** (si annotano sulla scheda del giocatore). L'eccedenza oltre i massimi si perde.

**Mazzo Normale** (15 carte, invariato): sicuro, rende poco.

| Carta | Effetto | Quantità |
|---|---|---|
| +1 token | +1 token | 5 |
| +2 token | +2 token | 3 |
| +1 token + 1 vita | +1 token; prossimo scontro con 1 vita in più | 2 |
| Neutra | Nessun effetto | 3 |
| Rischio lieve | −1 token | 2 |

Media ≈ **+0,73 token**; carte negative 13%.

**Mazzo Leggendario** (12 carte, ribilanciato): rende di più, rischia di più.

| Carta | Effetto | Quantità |
|---|---|---|
| +3 token | +3 token | 4 |
| +2 token + 1 vita | +2 token; prossimo scontro con 1 vita in più | 2 |
| Vantaggio rischioso | +2 token; prossimo scontro con 1 vita **in meno** | 1 |
| Rischio forte | A scelta: −2 token oppure prossimo scontro con 1 vita in meno (con meno di 2 token: la vita) | 3 |
| Neutra | Nessun effetto | 2 |

Media ≈ **+1,1 token**; carte negative 33%.

Quantità ed effetti sono **contenuto modificabile dalla regia** (come il mazzo del Duello); questi sono i valori predefiniti.

### 3.7 L'NPC

- Lo **interpreta un giocatore eliminato**, estratto a sorte, dal suo telefono: per uno scontro torna a giocare.
- Se non ci sono ancora eliminati (o chi è estratto non risponde), le carte le sceglie **il computer a caso**.
- L'NPC ha **3 vite** e **nessun token**: non usa azioni e non pesca ricompense.
- Chi fa l'NPC **non guadagna nulla**: gioca per divertimento.
- Per il giocatore è uno scontro normale: se vince pesca la ricompensa, se perde W → L o eliminazione (così il bye resta la scelta prudente).

### 3.8 Durata

Ogni scontro dura circa 5-7 scambi (1 su 3 è un pareggio): con 15 s di scelta e qualche secondo di
rivelazione e reazioni, **2-3 minuti**. Con la doppia eliminazione servono circa `2 × log₂(giocatori)` turni:

| Giocatori | Turni (stima) | Durata (stima) |
|---|---|---|
| 8 | 6-7 | 15-20 min |
| 16 | 8-9 | 20-25 min |
| 30 | 10-11 | 25-30 min |

Da verificare con la simulazione (T7). Leve per accorciare, configurabili dalla regia: vite iniziali (2 invece di 3),
tempi di scelta, «tutti partono da L» per un torneo a eliminazione diretta.

### 3.9 Punti in classifica serata

- Piazzamento nel torneo: 1° 1000, 2° 700, 3° 500, poi a scalare fino a 100 per il primo eliminato (configurabile).
- **+50 per ogni scontro vinto** (anche contro l'NPC).
- Eliminati: **+30 per ogni pronostico giusto** sullo scontro in evidenza (un pronostico per turno, prima della prima rivelazione).
- Chi fa l'NPC non prende punti.

---

## 4. Il minigioco nell'app: scelte di progetto

| Tema | Proposta |
|---|---|
| Id e nome | `shadow-tournament`, «Shadow Tournament» (il regolamento cartaceo usa lo stesso nome; nato come «Triangolo delle Vittorie») |
| Tema grafico | `manga` (duelli, linee cinetiche, «VS» a tutto schermo) |
| Giocatori | Da 2 a ~30, individuale (le squadre della serata contano solo per la classifica a squadre, come negli altri giochi) |
| Game Master | **No**: il gioco va avanti da solo; la regia ha i comandi generici (salta timer, pausa, termina) |
| Fasi del turno | `pairing` → `byeChoice` → per ogni scontro (`extraLife` → (`choose` → `reveal` → `react` → `resolve`)* → `reward`) → fine turno |
| Scontri in parallelo | Ogni scontro ha **la propria fase e i propri timer** nello stato: gli scontri brevi finiscono prima e i giocatori aspettano il turno successivo guardando lo schermo |
| Equità e latenza | Nessuna componente di velocità: **non serve** `fairTime`. Le scelte arrivate entro la scadenza + `GRACE_MS` sono valide, l'ordine di arrivo non conta |
| Segreti | Carta, Scommessa e vita extra restano nello stato e in `hostView` fino alla rivelazione. Prima, lo schermo e l'avversario vedono solo «ha scelto ✓». Token, stato W/L e vite sono **pubblici** |
| NPC | Il giocatore eliminato estratto riceve in `viewFor` la vista di uno scontro, ma senza token né azioni |
| Contenuti | Mazzi, costi delle azioni, vite, token, tempi e punti sono **configurazione dell'istanza** (`configSchema` zod → form dell'editor), mai nel codice |
| Casualità | Seme nello stato (`ctx.seed`): pescate, accoppiamenti, bye, NPC, carte automatiche. Si riusa il generatore di `knight-duel/rng.ts` (da spostare in `util.ts` se serve a due plugin) |
| Assenti | Chi non sceglie gioca una carta a caso senza azioni e non reagisce; la regia può ritirarlo (comando «Ritira giocatore»: perde lo scontro in corso) |
| Entrati in ritardo | Spettatori, non entrano nel torneo |

### 4.1 Schermo condiviso (`/screen`)

- **Tabellone del torneo**: griglia dei giocatori con stato W/L, token, eliminati in grigio. A 30 giocatori: icone compatte su 2-3 colonne, senza scroll.
- **Scontri del turno**: una card per scontro con le vite dei due e il risultato dell'ultimo scambio.
- **Scontro in evidenza**: uno scontro (il più «drammatico»: due L, vite basse, NPC) in grande con «VS», conto alla rovescia, rivelazione animata, effetti delle azioni.
- **Ricompense**: la scelta Normale/Leggendario e le carte Leggendarie pescate si mostrano in grande.
- **Podio** finale animato.

### 4.2 Telefono (`/play`)

Una schermata per fase, pulsanti grandi, niente scroll:

- **Vite extra**: «Spendi 1 token per partire con 4 vite?» Sì/No.
- **Scelta**: le 3 carte in grande (quella bloccata dalla Trappola disabilitata), interruttore «Scommessa (1 token)», «Conferma»; si può cambiare fino alla scadenza.
- **Reazioni**: solo i pulsanti possibili (Scudo, Cambia carta con le 2 carte alternative, Trappola, Annulla e rigioca) con il costo; timer.
- **Esito scontro**: vinto/perso, nuovo stato W/L; per chi vince «Normale o Leggendario?» e poi la carta pescata.
- **Bye**: «Bye o NPC?».
- **Eliminato**: pronostico sullo scontro in evidenza, reazioni; se estratto, «Tocca a te fare l'NPC!».
- **Regole**: pulsante «?» sempre presente con il riassunto (`rulesText.ts`).

Il controller usa solo React e le primitive esistenti (`buttons`, `vote`, `reactions`, `waiting`): nessuna libreria nuova, il telefono resta sotto il limite di peso.

### 4.3 Regia (`/admin` → Live)

`hostView` con: turno, tutti gli scontri con fase, vite e scelte già fatte (segrete per gli altri), azioni generiche:
«Salta timer», «Pausa», «Ritira giocatore», «Termina torneo (podio con la classifica attuale)».

---

## 5. Architettura del codice

```
packages/minigames/src/shadow-tournament/
  config.ts          schema zod dell'istanza, mazzi e listino predefiniti
  exchange.ts        risoluzione pura di uno scambio (carte, Scommessa, reazioni, Trappola)
  bout.ts            scontro: vite iniziali, sequenza di scambi, fine scontro, W/L
  pairing.ts         accoppiamento (W con W, L con L, no rivincita, bye a un L, NPC)
  rewards.ts         pescata con seme ed effetti delle carte ricompensa (tetti, «prossimo scontro»)
  index.ts           plugin MinigameType: turni, timer, input, viste, punti
  simulate.ts        bot (casuali, «abitudinari», «avari», «spendaccioni») per bilanciamento
  *.test.ts          unit test, anti-leak, simulazioni
packages/client/src/minigames/shadow-tournament/
  ShadowTournamentViews.tsx  Screen + Controller
  rulesText.ts       testo delle regole (schermo + telefono), con test di coerenza col config
tools/bots/src/balance-shadow-tournament.ts   → pnpm balance:shadow
e2e/shadow-tournament.spec.ts
docs/SHADOW-TOURNAMENT.md    guida per la regia (come DUELLO-DEI-CAVALIERI.md)
```

Tipi principali (indicativi):

```ts
type Card = "attack" | "defense" | "trick";
type Status = "W" | "L" | "out";

interface Fighter { id: string; status: Status; tokens: number;
  nextBoutLifeDelta: number; byeLastTurn: boolean; boutsWon: number; eliminatedAtTurn: number | null }

interface Bout { id: string; a: string; b: string | "npc"; npcPlayerId: string | null;
  lives: Record<string, number>; phase: "extraLife" | "choose" | "react" | "reward" | "done";
  blocked: Record<string, Card | null>; /* + scelte segrete dello scambio corrente */ }

type Input =
  | { type: "extraLife"; spend: boolean }
  | { type: "play"; card: Card; bet: boolean }
  | { type: "react"; action: "shield" | "trap" | "counter" | "pass" }
  | { type: "react"; action: "swap"; card: Card }
  | { type: "byeChoice"; choice: "bye" | "npc" }
  | { type: "deck"; deck: "normal" | "legendary" }
  | { type: "riskChoice"; pay: "tokens" | "life" }
  | { type: "predict"; winnerId: string };                  // solo eliminati
```

Le funzioni di `exchange.ts`, `bout.ts`, `pairing.ts` e `rewards.ts` sono pure e prendono il generatore casuale
come argomento: si testano con tabelle di casi senza passare dal plugin.

---

## 6. Passi di implementazione

Ogni passo si chiude con test verdi; commit piccoli e semantici in italiano.

| Passo | Contenuto | Verifica |
|---|---|---|
| **T0** | Approvazione di questo piano | - |
| **T1** | `config.ts` + `exchange.ts` + `bout.ts`: scambi e scontri con tutte le azioni, pareggi, vite extra, fine scontro e W/L | Test a tabella: 3×3 carte × Scommessa sì/no × reazioni; casi limite (Cambia carta con contromossa, Scudo contro Scommessa, Trappola sulla carta appena giocata, limite di 1 azione, token insufficienti, vite min 1 e max 5) |
| **T2** | `pairing.ts`: accoppiamento W/L, no rivincita, bye a un L, NPC interpretato da un eliminato o dal computer | Test: numeri pari/dispari da 2 a 30, nessun giocatore in due coppie, nessuno escluso, bye mai due volte di fila |
| **T3** | `rewards.ts`: pescate con seme, scelta del mazzo, effetti, tetti, «Rischio forte» con pochi token | Test: distribuzione su 10 000 pescate vicina alle quantità; effetti sul prossimo scontro applicati una sola volta |
| **T4** | `index.ts`: plugin completo (turni, scontri paralleli, timer, assenti, NPC, punti, `result`, `hostView`) e registrazione in `minigames/src/index.ts` | Unit test del flusso; `registry.test.ts` verde; **test anti-leak**: prima della rivelazione `screenView` e `viewFor` dell'avversario non contengono carta, Scommessa né vita extra |
| **T5** | Viste React (Screen + Controller), `rulesText.ts`, scena in `/preview` | `pnpm typecheck`; test Playwright sulla preview: niente overflow a 30 giocatori, testi italiani, variabili del tema |
| **T6** | Scenario e2e `e2e/shadow-tournament.spec.ts`: 5 telefoni (numero dispari: bye/NPC), torneo breve (2 vite) fino al podio; controllo dei frame WebSocket (nessuna carta avversaria prima della rivelazione); pulizia finale | `pnpm test:e2e` verde |
| **T7** | `simulate.ts` + `pnpm balance:shadow`: durata (turni e minuti) per 4/8/16/30 giocatori, valore di ogni azione, Normale contro Leggendario, peso delle vite extra | Obiettivi: torneo a 30 giocatori ≤ 30 minuti; nessuna azione che da sola faccia vincere più del 60% degli scontri a parità di token; chi sceglie sempre Leggendario non domina |
| **T8** | Scenario `--scenario shadow` in `tools/bots` e stress test con 30 giocatori | `pnpm stress --players 30 --scenario shadow` senza errori né incoerenze di punteggio |
| **T9** | Guida `docs/SHADOW-TOURNAMENT.md`, aggiornamento di `PIANO.md` (stato) e `CLAUDE.md` (comando di bilanciamento), verifica nel pacchetto Windows | `pnpm package:win` + `pnpm package:check`; `pnpm test` e `pnpm test:e2e` verdi |

Stima: T1-T4 sono il grosso della logica (~1-1,5 giornate di lavoro), T5-T6 le viste e l'e2e (~1 giornata),
T7-T9 bilanciamento e rifinitura (~mezza giornata), più il tempo di una prova con persone vere.

---

## 7. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Torneo troppo lungo con 30 persone (25-30 min stimati) | Simulazione T7; vite iniziali, tempi e «tutti partono da L» configurabili |
| Sasso-carta-forbice «troppo casuale» | Più scambi per scontro e doppia eliminazione assorbono la fortuna del singolo scambio; Trappola e Scommessa premiano chi osserva l'avversario |
| Cambia carta quasi mai usabile (5 token su un massimo di 5) | Scelta voluta dall'autore: rara ma spettacolare; la simulazione dirà quanto spesso compare |
| Fase reazioni che rallenta ogni scambio | Si salta in automatico se nessuno ha token sufficienti; si chiude appena tutti hanno risposto |
| Eliminati annoiati | Fanno l'NPC, i pronostici e le reazioni |
| Schermo affollato a 30 | Tabellone compatto + un solo scontro in evidenza; test di overflow in Playwright |
| Segreti trapelati | Test anti-leak su viste e frame WebSocket (T4, T6) |

---

## 8. Decisioni prese con l'autore

**Regole**: vite per scontro e W/L per il torneo; pareggio rigiocato; carte base senza effetti propri (la colonna
«Effetto» è sapore); 1 azione per scambio; Scommessa prima, in segreto; Scudo dopo la rivelazione, per chi ha perso;
Trappola dopo la rivelazione, per chiunque; Cambia carta invariata (5 token, contromossa 5); accoppiamento
automatico; bye prima a un L; NPC interpretato da un eliminato (o dal computer) senza premio, ma perdere contro
l'NPC è una sconfitta vera; mazzo scelto dal vincitore; Leggendario ribilanciato senza danno all'avversario;
una pescata per scontro; «Vantaggio rischioso» = 1 vita in meno.

**Dettagli decisi da Claude (modificabili)**: la Scommessa pagata è persa in caso di pareggio; ordine delle
reazioni Cambia carta → contromossa → Scudo → Trappola; con «Rischio forte» e meno di 2 token si perde la vita.

**App**: nome **«Shadow Tournament»** (id `shadow-tournament`, anche nel regolamento Word); tema **`manga`**;
punti serata: piazzamento + **50 per scontro vinto** + **30 per pronostico giusto** degli eliminati.

Nessuna decisione aperta: si può partire da T1 quando il piano è approvato.
