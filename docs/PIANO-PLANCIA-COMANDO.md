# Piano: «Plancia di Comando» (ordini gridati tra telefoni, in stile Spaceteam)

> Stato: **da implementare**: è il **terzo dei tre** giochi pianificati, dopo [Artificieri](PIANO-ARTIFICIERI.md) e
> [Pilota alla cieca](PIANO-PILOTA-CIECO.md), di cui usa le misure dello stress per dimensionare il P0. Le decisioni
> del §2 e il P0 come primo passo sono **confermati** dall'utente. I punti che dipendono dal codice esistente sono
> verificati nel §9.
> Da leggere insieme a [PIANO.md](../PIANO.md) e [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

## 1. Obiettivo

Un gioco caotico e velocissimo in cui **tutti sono coinvolti allo stesso modo**: ognuno ha i comandi, ma gli ordini
arrivano agli altri.

In sintesi:
- ogni squadra è l'**equipaggio** di un'astronave; ogni telefono è un **pannello** con 4–6 comandi dai nomi assurdi
  («Defibrillatore Quantico», «Leva del Brodo Cosmico»): pulsanti, interruttori, cursori, selettori;
- sul telefono di ognuno compare un **ordine** a tempo («Porta la Valvola Gelatinosa a 3!»), che quasi sempre
  riguarda un comando sul pannello di **un compagno**: bisogna gridarlo;
- ordine eseguito → l'astronave avanza; ordine scaduto → lo scafo si danneggia;
- la TV mostra le astronavi delle squadre in gara nello spazio, i danni e i settori superati.

Non serve preparare contenuti per una partita (i nomi si compongono da due elenchi di parole) e il telefono resta
leggerissimo: solo pulsanti.

**Nome.** *Spaceteam* è un marchio di Sleeping Beast Games: nell'app il gioco si chiama **«Plancia di Comando»**
(id `plancia-comando`). Comandi, nomi ed eventi sono nostri.

## 2. Decisioni (confermate con l'utente)

| Tema | Decisione |
|---|---|
| Nome | **«Plancia di Comando»**, id `plancia-comando`, tema predefinito `retro80` |
| Modalità | **«A squadre»** (default): ogni team della serata è un equipaggio, gara tra astronavi. **«Equipaggio unico»**: tutti insieme contro il tempo (ordini verso chiunque nella sala) |
| Squadre | Da 2 a 8 membri per equipaggio (sotto i 2 non c'è nessuno da chiamare; sopra gli 8 gli ordini girano troppo poco). Senza team, l'app divide i giocatori in equipaggi da 4–6 |
| Destinatario degli ordini | ~80% su un comando di un compagno, ~20% sul proprio (`ownShare`), così ogni tanto basta guardare il proprio pannello |
| Chi esegue | Qualunque membro che ha quel comando sul pannello (ogni comando è su un solo telefono) |
| Nomi dei comandi | Composti da **due elenchi** («sostantivi» e «aggettivi») nell'istanza, con un centinaio di esempi in italiano; nomi diversi all'interno dell'equipaggio e con poche lettere iniziali in comune, per non confonderli quando si grida |
| Settori | Ogni `sectorSeconds` (default 60) l'astronave salta al settore successivo: **pannelli nuovi** e ordini più rapidi |
| Velocità | Gli ordini **non danno punti per la rapidità**: conta solo se sono eseguiti prima della scadenza (con `fairTime` e `GRACE_MS`) |
| Invii del server | **Primo passo obbligatorio (P0)**, prima del plugin: raggruppare gli invii delle viste e non rimandare a un telefono una vista identica (§7, §8) |
| Eventi | Prima versione: «**Allarme generale**» (tutti premono il pulsante rosso entro 5 s) e «**Blackout**» (per 8 s alcuni pannelli mostrano solo le iniziali dei nomi). Scuotere il telefono (DeviceMotion, permesso su iOS) resta fuori dalla prima versione |

## 3. Regole in breve

1. **Pannelli**: all'inizio di ogni settore ogni giocatore riceve 4–6 comandi (`controlsPerPanel`), di tipo:
   - **pulsante** («Premi il …»);
   - **interruttore** acceso/spento («Accendi / Spegni il …»);
   - **cursore** 0–5 («Porta il … a 3»);
   - **selettore** con 3–4 valori a parole («Imposta il … su TURBO»).
2. **Ordini**: ogni giocatore ha sempre un ordine attivo, con una barra che si svuota (`orderSeconds`, che scende
   del 10% a ogni settore fino a un minimo). L'ordine chiede sempre un valore **diverso** da quello attuale.
3. **Esecuzione**: appena il comando giusto raggiunge il valore richiesto (da chiunque), l'ordine è eseguito:
   l'astronave avanza di un passo e chi aveva l'ordine ne riceve subito un altro.
4. **Scadenza**: lo scafo perde `damagePerMiss` (default 5%) e arriva un nuovo ordine. Cambiare un comando senza
   che nessun ordine lo chieda non fa nulla (non è un errore: il caos è già punizione sufficiente).
5. **Fine**: dopo `sectors` settori (default 5) o quando lo scafo arriva a zero (l'astronave si ferma lì). Vince chi
   è arrivato più lontano.

## 4. Configurazione dell'istanza (`configSchema`)

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `mode` | `"squadre" \| "unico"` | `"squadre"` | §2 |
| `sectors` | intero 1–10 | 5 | |
| `sectorSeconds` | intero 30–180 | 60 | |
| `controlsPerPanel` | intero 3–6 | 4 | Aumenta di uno dal terzo settore, fino a 6 |
| `orderSeconds` | intero 5–30 | 12 | Primo settore |
| `minOrderSeconds` | intero 3–15 | 6 | |
| `ownShare` | intero 0–50 | 20 | Percentuale di ordini sul proprio pannello |
| `damagePerMiss` | intero 1–25 | 5 | |
| `events` | booleano | `true` | |
| `nouns` / `adjectives` | elenchi di testi (widget `lines`) | ~60 + ~60 esempi | 3–20 caratteri; si possono riusare come «Lista di parole» della libreria se l'utente preferisce |
| `stepPoints` | intero 0–100 | 10 | Per ordine eseguito, alla squadra |
| `hullBonus` | intero 0–500 | 100 | A fine round, in proporzione allo scafo rimasto |
| `podiumPoints` | lista di interi | `[150, 100, 50]` | Per piazzamento tra le squadre |

## 5. Il plugin `plancia-comando`

### 5.1 Stato

```ts
type ControlKind = "button" | "toggle" | "slider" | "selector";

interface Control {
  id: string;
  name: string;                      // «Defibrillatore Quantico»
  kind: ControlKind;
  owner: string;                     // giocatore che lo ha sul pannello
  options: string[];                 // solo selettore
  value: number;                     // pulsante: contatore di pressioni
}

interface Order {
  id: number;
  holder: string;                    // chi lo legge sul telefono
  controlId: string;
  target: number;                    // pulsante: contatore attuale + 1
  issuedAt: number;
  deadline: number;
}

interface Crew {
  id: string;                        // team o "all"
  name: string; color: string;
  members: string[];
  controls: Control[];
  orders: Record<string, Order>;     // giocatore → ordine attivo
  progress: number;                  // passi percorsi
  hull: number;                      // 0–100
  done: number; missed: number;
  event: { kind: "alarm" | "blackout"; until: number; pressed: string[]; victims: string[] } | null;
}

interface State {
  phase: "ready" | "sector" | "jump" | "final" | "done";
  seed: number;
  cfg: PlanciaConfig;
  sector: number;
  crews: Crew[];
  nextOrderId: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
}
```

Generazione di pannelli e nomi (`panels.ts`), scelta del prossimo ordine (`orders.ts`) e calcolo dei punti
(`scoring.ts`) sono funzioni pure con i loro test.

### 5.2 Fasi

```
ready → sector → jump ─┬─ (altri settori) → sector
                       └─ (fine) → final → done
```

| Fase | Cosa succede | Come finisce |
|---|---|---|
| `ready` | La TV presenta gli equipaggi; i telefoni mostrano il primo pannello senza ordini | La regia preme «Decollo» |
| `sector` | Ordini, esecuzioni, scadenze, eventi | `sectorSeconds` scaduti, o tutti gli scafi a zero |
| `jump` | Animazione del salto (5 s), nuovi pannelli | Da sola |
| `final` | Arrivo e classifica | La regia preme «Avanti» |

Gli ordini scaduti si gestiscono in `onTick` (ogni 100 ms): un ordine scade a `deadline + GRACE_MS`; se nel
frattempo arriva un input con ora equa precedente alla scadenza, l'ordine vale come eseguito.

### 5.3 Input dei giocatori (`inputSchema`)

| Input | Note |
|---|---|
| `{ type: "set", control, value }` | Interruttore, cursore (0–5), selettore. Accettato solo dal proprietario del comando |
| `{ type: "press", control }` | Pulsante |
| `{ type: "alarm" }` | Durante «Allarme generale» |

Il cursore manda il valore **solo al rilascio** (come il quadrante di Lunghezza d'Onda in «tutti»): un trascinamento
è un solo invio.

### 5.4 Comandi della regia

`pause`, `resume`, `launch`, `skip-sector`, `repair` (riporta uno scafo al 50%, per un equipaggio in difficoltà
per motivi esterni, es. un telefono scarico), `next`, `end`. `minPlayers: 2`; `buildConfig` controlla 2–8 membri
per equipaggio in «squadre».

**Giocatore disconnesso:** i suoi comandi restano sul pannello ma nessuno li può usare. In `onTick` non si conosce
la presenza, quindi la prima versione si affida alla regia («Ridistribuisci i pannelli», comando
`reshuffle`). Da valutare dopo: un'informazione di presenza passata dall'engine al plugin.

### 5.5 Punti

`stepPoints × ordini eseguiti` + `hullBonus × scafo / 100` + `podiumPoints[piazzamento]` alla squadra; ogni membro
riceve i punti della squadra (voci con `teamId: null`). In «unico» niente podio.

### 5.6 Chi vede cosa

Qui i segreti sono pochi: il gioco funziona perché **ognuno vede solo il proprio pannello e il proprio ordine**.

| Informazione | TV | Proprietario | Compagni | Altri equipaggi | Regia |
|---|---|---|---|---|---|
| Comandi di un pannello (nomi e valori) | ❌ | ✅ | ❌ | ❌ | ✅ |
| Ordine attivo di un giocatore | ❌ (solo il conteggio) | ✅ | ❌ | ❌ | ✅ |
| Avanzamento, scafo, settore, eventi | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ultimo ordine eseguito («Valvola Gelatinosa → 3») | ✅ (con un ritardo di 2 s, dopo l'esecuzione) | ✅ | ✅ | ✅ | ✅ |

Il test anti-leak verifica che `viewFor` di un giocatore contenga solo i comandi di cui è `owner` e solo il proprio
ordine.

## 6. Interfacce

### 6.1 TV

Spazio con le astronavi degli equipaggi su corsie orizzontali (avanzano a ogni ordine eseguito), barra dello scafo
con scintille ai danni, settore e tempo, ultimo ordine eseguito di ogni equipaggio. Eventi in grande («ALLARME
GENERALE!»). SVG e Framer Motion; niente PixiJS.

### 6.2 Telefono

```
 ┌───────────────────────────────┐
 │ ▶ PORTA LA VALVOLA            │   ordine con la barra del tempo
 │   GELATINOSA A 3   ▓▓▓▓▓░░░   │
 ├───────────────────────────────┤
 │ [ DEFIBRILLATORE QUANTICO ]   │   pulsante
 │ Leva del Brodo Cosmico  ◯━●   │   interruttore
 │ Turbina Pigra   0 1 2 [3] 4 5 │   cursore
 │ Ugello Morbido  ‹ TURBO ›     │   selettore
 └───────────────────────────────┘
```

Comandi grandi con `onPointerDown`, niente scorrimento a 360×640 con 6 comandi, vibrazione (`navigator.vibrate`,
dove c'è) all'arrivo di un nuovo ordine e ai danni.

### 6.3 Regia

Equipaggi con scafo, ordini eseguiti/scaduti, giocatori con ordini scaduti di fila (telefono scarico?); «Decollo»,
pausa, «Ridistribuisci i pannelli», «Ripara», «Salta il settore», «Avanti».

## 7. Fasi di lavoro

Ogni passo si chiude con test verdi e una piccola demo; commit semantici separati (nessun commit senza richiesta).
Il P0 è un lavoro a sé sul server (beneficia tutti i giochi) e si chiude con il suo commit prima di iniziare il plugin.

| Passo | Contenuto | Verifica |
|---|---|---|
| **P0 Invii raggruppati** ✅ (obbligatorio, prima del plugin) | In `realtime.ts`: `flush()` al massimo ogni ~100 ms (intervallo da tarare con le misure dello stress di Pilota alla cieca) e, per ogni socket, nessun invio se la vista è identica all'ultima inviata. Le azioni sensibili alla latenza non peggiorano: l'ora equa viene da `meta`, non dall'istante di invio | Prima e dopo: `pnpm stress` classico, `--scenario onda` e `--scenario pilota` con i tempi di aggiornamento a confronto. Test richiesti da `CLAUDE.md` per `realtime.ts`: `master.test.ts`, `e2e/stanze-segrete.spec.ts`, `pnpm stress --players 10 --scenario stanze`; più `pnpm test` e `pnpm test:e2e` completi (tutti i giochi passano da `flush`) |
| **P1 Logica del plugin** | Pannelli, nomi, ordini, scadenze all'ora equa, settori, eventi, punti, `buildConfig` | Unit test: nomi unici nell'equipaggio; ordine sempre su un valore diverso dall'attuale; `ownShare` rispettato su molti semi; input rifiutato da chi non è proprietario; esecuzione entro `GRACE_MS`; scafo a zero ferma l'astronave; contratto di `registry.test.ts` |
| **P2 Anti-leak** | Scorrimento dello stato | Pannelli e ordini altrui mai nelle viste; TV senza pannelli né ordini |
| **P3 Viste** | Pannello, TV, scene `/preview` (`pdc-*`: 4 e 6 comandi, nomi lunghi, blackout, allarme) nei 5 temi | Asserzioni Playwright: nessun overflow a 360×640 con 6 comandi e i nomi più lunghi; cursore che invia solo al rilascio |
| **P4 End-to-end** | 2 equipaggi da 2: un ordine eseguito dal compagno, uno scaduto, un salto di settore | **Frame WebSocket**: ogni telefono riceve solo il proprio pannello; server pulito alla fine |
| **P5 Bot e stress** | Bot che «sentono» gli ordini (leggono gli ordini dei compagni bot dal simulatore, non dal server) con ritardi ed errori | `pnpm stress --players 30 --scenario plancia`: tempi di aggiornamento con 30 giocatori che premono ~1 volta al secondo; nessun errore; punti coerenti con `scoring.ts` |
| **P6 Documenti e pacchetto** | Guida `docs/PLANCIA-COMANDO.md`, `rulesText.ts`, `PIANO.md`, `CLAUDE.md`, `GUIDA-HOST.md` | `pnpm test`, `pnpm test:e2e`, `pnpm package:win` + `pnpm package:check` |

### P0 fatto: invii raggruppati (misure)

`flush` in `realtime.ts` ora **accorpa** (il primo cambio dopo una pausa parte subito, quelli a raffica al più tardi dopo `flushMs` = 80 ms) e **non rimanda
una vista identica** all'ultima inviata allo stesso telefono (e a schermo, regia e Game Master). I nuovi socket e le riconnessioni ricevono comunque la
loro vista subito. Lo stress con 30 giocatori, prima e dopo (stesse partite, tutti i controlli verdi):

| Scenario | Input | Aggiornamenti ai telefoni prima | dopo | Variazione |
|---|---|---|---|---|
| Classico + duello | 755 → 744 | 20 041 (26,5 per input) | 3 478 (4,7 per input) | **−83%** |
| Lunghezza d'Onda | 1522 → 1517 | 44 761 (29,4 per input) | 9 762 (6,4 per input) | **−78%** |
| Pilota alla cieca | 441 → 408 | 13 531 (30,7 per passo) | 11 910 (29,2 per passo) | −12% |

- Dove la vista di un telefono dipende solo da ciò che fa lui (quiz, buzzer, sondaggi…) il guadagno è enorme. In **Pilota alla cieca** quasi nulla: la
  posizione di ogni pilota è pubblica e cambia la vista di **tutti** a ogni passo, e i passi di 4 piloti sono troppo distanti perché si accorpino.
- **Costo**: il tempo dopo un passo sale dal massimo di 734 ms (misurato prima, con picchi) a un tetto di ~90 ms con p95 79 ms: è l'intervallo di
  accorpamento. Nessun peso sull'equità: l'ora equa degli input viene da `meta`, non dall'istante di invio.
- **Conseguenza per Plancia di Comando**: la vista di un telefono deve restare **essenziale**: solo il proprio pannello, il proprio ordine e lo stato
  indispensabile dell'equipaggio; l'avanzamento delle astronavi si mostra solo sulla TV. Con una vista così, la deduplicazione la rende quasi gratuita.

## 8. Rischi residui

- **Traffico (il rischio principale):** oggi ogni cambio di stato rimanda **tutte** le viste a **tutti** (§9). Con 30
  giocatori che premono circa una volta al secondo sono ~30 invii completi al secondo verso ~32 client, cioè quasi
  1000 messaggi al secondo attraverso il tunnel. Da qui il passo P0 (confermato come primo passo): raggruppare gli
  invii e non rimandare a un telefono una vista identica. Con il P0 un telefono riceve un messaggio solo quando cambiano il suo pannello, il
  suo ordine o lo stato dell'equipaggio (che va quindi tenuto essenziale nella vista del telefono: l'avanzamento
  si mostra solo sulla TV).
- **Rumore:** con più equipaggi nella stessa sala gli ordini si sovrappongono. È parte del divertimento; i nomi
  assurdi e diversi tra equipaggi aiutano a capire se un ordine è «nostro».
- **Equipaggi di dimensioni diverse:** più membri significa più ordini in parallelo e quindi più passi. Per
  l'avanzamento si usa la **media per membro** (passi / membri) invece del totale; da verificare con i bot.
- **Telefoni che si spengono o bloccano lo schermo:** i comandi di quel giocatore diventano inutilizzabili.
  Mitigazioni: «Ridistribuisci i pannelli» della regia; richiesta di Wake Lock dove supportata (Chrome Android,
  Safari recente).
- **Nomi di esempio:** vanno scritti da noi e rivisti dopo le prime serate (devono far ridere ma essere facili da
  gridare).

## 9. Verifiche sul codice (prima dell'implementazione)

| Punto del piano | Esito | Dove |
|---|---|---|
| Ogni input che cambia lo stato chiama `flush()`, che rimanda TV, regia e **ogni** telefono; nessun accorpamento né confronto con l'ultimo invio | ✅ da qui il P0 | `server/src/realtime.ts`, `flush` e `sendPlayerState` |
| 20 input al secondo per giocatore | ✅ ampiamente sufficiente | `realtime.ts`, `inputLimiter` |
| Tick ogni 100 ms (scadenze degli ordini) | ✅ | `server/src/index.ts` |
| `fairTime` e `GRACE_MS` | ✅ | `shared/src/fairtime.ts`, `minigames/src/util.ts` |
| Widget `lines` per gli elenchi di parole nell'editor | ✅ | `NUOVO-MINIGIOCO.md` §1 |
| Presenza dei giocatori disponibile al plugin | ❌ non c'è: per ora la ridistribuzione è un comando della regia | `shared/src/minigame.ts` |
| Stress con `--scenario` nuovo | da aggiungere `plancia` | `tools/bots/src/run.ts` |
