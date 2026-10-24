# Piano: «Il Pianeta Nascosto» (deduzione a squadre, in stile The Search for Planet X)

> Stato: **implementato** (P0–P7 e import degli schemi dell'app, vedi [PIANETA-NASCOSTO.md](PIANETA-NASCOSTO.md)). Decisioni confermate dall'utente (§2).
> Scostamenti dal piano: `sampleConfig` con `maxDays: 60` (senza limite un round non finisce da solo e il contratto di `registry.test.ts` lo vuole finibile); le teorie
> identiche a una già in pista non si rifiutano (rivelerebbero l'oggetto di una teoria coperta); il limite di 10 segni al secondo del foglio non è implementato. Posizioni delle icone del tabellone
> fornite dall'utente (§3.2 bis); ricerche, conferenze e fatti iniziali verificati sull'app ufficiale (§3.8, §3.9, §3.9 bis). Nessuna regola resta da verificare.
> I punti che dipendono dal codice esistente sono verificati nel §10.
> Da leggere insieme a [PIANO.md](../PIANO.md) e [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

## 1. Obiettivo

Un gioco di **deduzione logica a squadre**, fedele alle regole di *The Search for Planet X*: ogni squadra è un
**osservatorio** che scruta un sistema solare diviso in settori disposti in cerchio. In ogni settore c'è un oggetto
(asteroide, cometa, nube di gas, pianeta nano) oppure il vuoto, e da qualche parte si nasconde il **Pianeta X**, che
agli strumenti **sembra un settore vuoto**. Si fanno punti localizzando il Pianeta X e pubblicando **teorie** giuste
sugli altri oggetti.

In sintesi:
- il sistema solare è **generato dal seme** rispettando le regole di posizione ufficiali ed è sempre **deducibile**;
- agisce l'osservatorio **più indietro sul tracciato del tempo**; ogni azione costa tempo (rilevamento, puntamento,
  ricerca, localizzazione);
- l'azione scelta è pubblica (la TV la annuncia), il **risultato** lo vede solo la squadra;
- quando la Terra passa sulle icone, si aprono le fasi **teoria** (gettoni coperti che avanzano sulle piste di
  revisione) e le **conferenze** sul Pianeta X;
- il telefono è il **foglio appunti** della squadra, condiviso: la ruota dei settori con le icone da escludere,
  supporre o confermare, il registro delle azioni e le ricerche;
- la TV riproduce il **tabellone**: tracciato del tempo esterno, piste di revisione, disco della Terra con il cielo
  visibile, sole al centro.

**Nome e materiali.** *The Search for Planet X* è un gioco di Foxtrot Games / Renegade Game Studios (Ben Rosset e
Matthew O'Malley, 2020). Nell'app il gioco si chiama **«Il Pianeta Nascosto»** (id `pianeta-nascosto`). Seguiamo le
**meccaniche** del regolamento, ma testi, modelli delle ricerche, icone e grafica sono **nostri**: la TV riprende la
*disposizione* del tabellone, non le sue illustrazioni.

## 2. Decisioni (confermate con l'utente)

| # | Tema | Decisione |
|---|---|---|
| 1 | Nome | **«Il Pianeta Nascosto»**, id `pianeta-nascosto`, tema predefinito `retro80` |
| 2 | Turni | **Configurabile** (`turnMode`): `"sequential"` (una squadra alla volta, come l'originale) o `"simultaneous"` (agiscono insieme le squadre nello stesso settore più arretrato). Default `"sequential"` |
| 3 | Chi decide | **Configurabile** (`decision`): `"vote"` (ognuno propone, la squadra vota con `team-vote`, in parità decide il capitano) o `"captain"`. Default `"vote"` |
| 4 | Foglio appunti | **Condiviso** nella squadra, salvato sul server. Per ogni settore e oggetto si può **escludere**, **supporre** o **confermare**; le informazioni iniziali e le teorie confermate si segnano da sole |
| 5 | Aiuto alla deduzione | **Configurabile** (`assist`): spento, i risultati vanno nel registro e le deduzioni le fa la squadra; acceso, il foglio segna da solo le certezze dirette (un puntamento, un rilevamento con risultato 0) |
| 6 | Modalità | **Base** (12 settori) ed **Esperto** (18 settori), entrambe dalla prima versione |
| 7 | Regia | **Cieca di default**: `hostView` senza il sistema solare né i risultati; «Mostra la soluzione» la sblocca con conferma |
| 8 | Durata | `maxDays` configurabile (tempo massimo sul tracciato, in giorni = settori percorsi); **0 = nessun limite** (default, come l'originale) |
| 9 | Teorie | **Regole ufficiali** (§3.5): nessun costo di tempo, gettoni coperti sulle piste di revisione, revisione quando arrivano allo spazio interno, teoria sbagliata = 1 di penalità |
| 10 | Fine partita | **Regole ufficiali** (§3.7): ultime opportunità in base alla distanza da chi ha localizzato il Pianeta X |
| 11 | Ricerche | Sulla TV si vede quale ricerca è stata letta, il testo solo dalla squadra |
| 12 | Durata del turno | `turnSeconds` e `theorySeconds` configurabili; **0 = senza limite** (la regia può forzare) |
| 13 | Solitario e bot | Una sola squadra gioca contro uno o più **bot** con le regole del bot dell'app ufficiale (teorie solo quando è certo); i bot si possono aggiungere anche alle partite a più squadre (§6) |
| 14 | Informazioni iniziali | **Per difficoltà**, come i livelli dell'app (§3.8): un livello per l'istanza e, dalla regia, un livello diverso per singola squadra (handicap) |

## 3. Regole (dal regolamento ufficiale)

### 3.1 Il sistema solare

Settori numerati in cerchio (l'ultimo è adiacente al primo). Ogni settore contiene un solo oggetto oppure è
**davvero vuoto**.

| Oggetto | Base (12) | Esperto (18) | Regola di posizione |
|---|---|---|---|
| Comete | 2 | 2 | Solo nei settori 2, 3, 5, 7, 11 (Esperto anche 13, 17) |
| Asteroidi | 4 | 4 | Ognuno adiacente ad almeno un altro asteroide (due coppie o un gruppo di quattro) |
| Nubi di gas | 2 | 2 | Ognuna adiacente ad almeno un settore davvero vuoto |
| Pianeti nani | 1 | 4 | Nessuno adiacente al Pianeta X. Esperto: tutti in una fascia di esattamente 6 settori, con un pianeta nano a ciascun estremo |
| Pianeta X | 1 | 1 | Non adiacente a un pianeta nano. Nei rilevamenti e nei puntamenti **appare vuoto** |
| Davvero vuoti | 2 | 5 | — |

Termini spaziali usati da regole, ricerche e conferenze (glossario mostrato nell'app): **adiacente**, **settori
consecutivi**, **direttamente opposto** (a metà cerchio), **entro N settori**, **in una fascia di N settori o meno**.

### 3.2 Tracciato del tempo, Terra e cielo visibile

- Il **tracciato del tempo** gira intorno al tabellone con gli stessi numeri dei settori. Tutti partono dal settore 1
  in ordine casuale. Il tempo si misura in **giorni** = settori percorsi (si possono fare più giri).
- **Agisce l'osservatorio più indietro.** Chi finisce in un settore già occupato si mette **davanti** agli altri
  (quindi gli altri giocano prima). In `turnMode: "simultaneous"` agiscono insieme tutte le squadre nel settore più
  arretrato; dopo la risoluzione i segnalini si spostano in ordine di pila (da dietro in avanti), applicando la
  stessa regola.
- Dopo ogni turno la **Terra ruota** in senso orario, un settore alla volta, finché la sua freccia indica il settore
  dell'osservatorio più arretrato. Se passa su un'icona di **conferenza** o di **teoria**, la rotazione si ferma e si
  svolge quella fase.
- Il **cielo visibile** è la metà dei settori (6 o 9) che parte dal settore indicato dalla freccia.

### 3.2 bis Icone sull'anello interno (`BOARD_LAYOUT`)

Le icone stanno sui **confini** tra due settori: si attivano quando la freccia della Terra passa da un settore al
successivo (posizioni fornite dall'utente dal tabellone originale).

| Modalità | Teoria ▤ (a ogni giro) | Conferenza ▲ (solo la prima volta) |
|---|---|---|
| Base (12) | 3–4, 6–7, 9–10, 12–1 | **X1**: 10–11 |
| Esperto (18) | 3–4, 6–7, 9–10, 12–13, 15–16, 18–1 (ogni 3) | **X1**: 7–8, **X2**: 16–17 |

```
Base     1 │ 2 │ 3 ▤ 4 │ 5 │ 6 ▤ 7 │ 8 │ 9 ▤ 10 ▲X1 11 │ 12 ▤ (1)
Esperto  1 │ 2 │ 3 ▤ 4 │ 5 │ 6 ▤ 7 ▲X1 8 │ 9 ▤ 10 │ 11 │ 12 ▤ 13 │ 14 │ 15 ▤ 16 ▲X2 17 │ 18 ▤ (1)
```

Conseguenze per il motore:
- la prima fase teoria arriva quando l'osservatorio più arretrato raggiunge il settore 4; poi ogni 3 settori, a
  ogni giro (4 fasi per giro in Base, 6 in Esperto, con fino a 2 teorie ciascuna);
- se in una sola rotazione la freccia attraversa più icone, le fasi si svolgono **nell'ordine in cui si incontrano**
  (in Base, da 9 a 11: prima la teoria su 9–10, poi la conferenza X1 su 10–11);
- una conferenza vale **solo la prima volta** che la freccia attraversa la sua icona: ai giri successivi l'icona
  non ha più effetto (la rotazione non si ferma, nessuna fase, nessun nuovo indizio) e sulla TV resta spenta con
  l'indizio già annunciato; le icone di teoria invece si attivano a ogni giro.

### 3.3 Azioni

| Azione | Costo | Effetto (privato per la squadra) |
|---|---|---|
| **Rilevamento** di un tipo di oggetto (non il Pianeta X) in settori consecutivi del cielo visibile | 4 per 1–3 settori, 3 per 4–6, 2 per 7–9 (solo Esperto) | Quanti oggetti di quel tipo ci sono. Rilevando «vuoto» si conta anche il Pianeta X. Per le comete l'arco deve iniziare e finire su un settore da cometa |
| **Puntamento** di un settore visibile | 4, con **2 gettoni** per squadra in tutta la partita | Che oggetto c'è (il Pianeta X appare vuoto) |
| **Ricerca** su un argomento | 1, **mai due volte di fila** | Il testo di una regola logica valida in questa partita |
| **Localizzazione** del Pianeta X | 5 | La squadra indica il settore e gli oggetti nei due settori adiacenti. Si annuncia a tutti **solo** se è riuscita o no, mai il settore |

La TV annuncia l'azione scelta (tipo e arco, settore, argomento) ma mai il risultato.

### 3.4 Conferenze

Quando la Terra raggiunge un'icona di conferenza (**X1**, in Esperto anche **X2**; posizioni nel §3.2 bis), tutti ricevono un indizio sul
Pianeta X, annunciato sulla TV. Avviene solo la prima volta che la Terra la raggiunge.

### 3.5 Fase teoria

**I gettoni teoria sono limitati** e non tornano mai alla squadra:

| Gettoni per squadra | Asteroide | Cometa | Nube di gas | Pianeta nano | Totale |
|---|---|---|---|---|---|
| Base | 4 | 2 | 2 | 1 | 9 |
| Esperto | 4 | 2 | 2 | 4 | 12 |

- Una teoria **giusta** resta sul tabellone (il gettone è speso, vale punti); una **sbagliata** viene tolta dal gioco
  (gettone perso, più la penalità di tempo).
- Finiti i gettoni di un tipo, la squadra **non può più** fare teorie su quell'oggetto, nemmeno nelle ultime
  opportunità. Ogni errore costa quindi anche un'occasione di punti: le teorie vanno fatte solo quando si è
  abbastanza sicuri.
- I gettoni rimasti sono **privati** della squadra (nell'originale stanno dietro lo schermo del giocatore): se
  fossero pubblici, il calo di un tipo rivelerebbe l'oggetto di una teoria appena piazzata coperta.

1. **Invio** (simultaneo, entro `theorySeconds`): ogni squadra sceglie fino a 1 teoria (Base) o 2 (Esperto). I
   gettoni scelti si piazzano coperti nello spazio esterno **[+]** della **pista di revisione** del settore, in
   ordine di turno (da dietro in avanti). Poi **tutte** le teorie coperte avanzano di uno spazio verso l'interno.
   - non si piazzano teorie in un settore già confermato; si può scegliere un settore anche fuori dal cielo visibile;
   - una teoria piazzata non si sposta; niente teorie identiche nello stesso settore, né due teorie diverse nello
     stesso settore nella stessa fase;
   - teorie nello stesso settore nella stessa fase contano come inviate insieme.
2. **Revisione**: per ogni settore che ha una teoria nello spazio interno **[↻]**, in ordine numerico, si rivelano
   le teorie interne e si verifica:
   - **giusta**: l'oggetto del settore è **confermato** (pubblico, si segna su tutti i fogli); si rivelano anche le
     teorie più esterne di quel settore; quelle sbagliate si tolgono e le loro squadre avanzano di **1** come
     penalità; quelle giuste restano e valgono punti;
   - **sbagliata**: l'oggetto non è confermato (tutti sanno che *non* è quello), la teoria si toglie e la squadra
     avanza di 1; le teorie più esterne restano coperte.
   - Più penalità insieme nello stesso settore si applicano in ordine di turno, così l'ordine relativo non cambia.

La pista ha 4 spazi (`[+] → □ → □ → [↻]`): una teoria viene revisionata alcune fasi dopo l'invio, mentre il
tempo scorre e gli altri possono arrivare alla stessa conclusione.

### 3.6 Punteggio

| Voce | Punti originali |
|---|---|
| Bonus di priorità: per ogni settore in cui si è stati i primi (o pari primi) con la teoria giusta | 1 |
| Teoria giusta: asteroide / cometa / nube di gas / pianeta nano | 2 / 3 / 4 / 4 (Esperto: pianeta nano 2) |
| Pianeta X localizzato per primi | 10 |
| Pianeta X localizzato dopo (ultima opportunità) | 2 per ogni settore di distanza (2–10) |

Spareggio: punti del Pianeta X, poi bonus di priorità, poi pari merito. Nel registro `score_entries` i punti si
moltiplicano per `pointScale` (default 10) per stare nella scala degli altri minigiochi.

### 3.7 Fine della partita

- La fine si innesca quando un osservatorio **localizza** il Pianeta X: avanza comunque di 5 ma la Terra **non
  ruota** e il settore **non si annuncia**. In `turnMode: "sequential"` vale il regolamento (agisce una squadra alla
  volta, quindi la prima è una sola); in `turnMode: "simultaneous"` più squadre possono riuscirci nello stesso turno:
  sono tutte «prime» (10 punti ciascuna) e le ultime opportunità si contano dalla loro posizione.
- **Ultime opportunità**, in ordine di turno: ogni squadra almeno 1 settore indietro può, *senza muoversi*:
  - inviare **1 teoria** se è indietro di 1–3 settori, **fino a 2** se è indietro di 4–5;
  - **oppure** tentare la localizzazione (se giusta, 2 punti per settore di distanza).
  Le teorie delle ultime opportunità contano come inviate insieme.
- **Rivelazione**: la TV svela tutti i settori; tutte le teorie ancora coperte si girano e si controllano.
- Con `maxDays` > 0, se l'osservatorio più arretrato supera il limite senza che nessuno abbia trovato il Pianeta X, si
  apre l'**ipotesi finale** (fase `finalGuess`, durata `theorySeconds`): ogni osservatorio, bot compresi, può indicare
  **insieme agli altri** e in segreto un settore per il Pianeta X con i due oggetti vicini, come una localizzazione
  (senza costo di tempo). Le ipotesi si rivelano tutte insieme all'inizio della rivelazione; ognuna giusta vale
  **5 punti** (metà della prima localizzazione: nessuno l'ha trovato in tempo). Poi si passa alla rivelazione.

### 3.8 Informazioni iniziali per difficoltà

All'inizio ogni squadra riceve **fatti**, tanti quanti ne prevede il suo livello. Un fatto ha **una sola forma**: un
corpo celeste che **non** è in un dato settore («il settore 7 non contiene un asteroide»). Mai fatti positivi, mai
relazioni tra oggetti, mai settori vuoti né Pianeta X. Sul foglio si segnano da soli con un **quadrato pieno**
sull'icona di quell'oggetto in quel settore, non modificabili.

| Livello | Fatti iniziali (Base ed Esperto) |
|---|---|
| **Ragazzi** | 12 |
| **Principiante** | 8 |
| **Esperto** | 4 |
| **Genio** | 0 |

Valori **confermati** dall'utente e coerenti con i dati dell'app (§3.9 bis): per ogni giocatore ci sono 3 blocchi da 4
fatti e il livello ne usa 3, 2, 1 o 0. Restano costanti del codice, non della configurazione.

Regole del generatore (seme dell'istanza + squadra), sullo stesso schema:
- per ogni osservatorio (squadre e bot) si generano **3 blocchi da 4 fatti**; il livello prende i primi 3, 2, 1 o 0
  blocchi, così un livello più facile contiene sempre i fatti di quello più difficile;
- fatti **veri** e **non banali**: niente «il settore 4 non contiene una cometa» (4 non è un settore da cometa);
  corpi celesti ammessi solo **asteroide, cometa, nube di gas, pianeta nano**; due fatti diversi possono riguardare
  lo stesso settore;
- osservatori diversi ricevono fatti diversi;
- nessun insieme di fatti iniziali basta da solo a escludere tutti i settori tranne quello del Pianeta X (controllato
  con il risolutore).

### 3.9 Ricerche e conferenze

Regole ricavate dai dati dell'app (§3.9 bis) e dalle schermate fornite dall'utente:

- **Sempre 6 ricerche A–F**, in Base e in Esperto; **1 conferenza** (X1) in Base, **2** (X1, X2) in Esperto.
- Ogni ricerca contiene **una regola**; la sua **etichetta** è l'elenco dei tipi di oggetto che la regola nomina: uno
  solo («Comete») o due («Comete & Nubi di gas»). Le conferenze nominano sempre il Pianeta X e un tipo («Pianeta X &
  Comete»).
- Etichette, regole e ordine delle lettere **cambiano a ogni partita**. Le etichette si mostrano a tutti all'inizio;
  i testi no (le ricerche solo a chi le legge, le conferenze a tutti quando la Terra arriva all'icona).
- Quante etichette singole ci sono non è fisso: nei dati dell'app vanno da 0 a 3 in Base (di solito 1) e da 0 a 4 in
  Esperto (di solito 1–2). Noi non lo scegliamo: viene da quali regole si estraggono.
- Le ricerche non parlano mai del Pianeta X. Il **riferimento** di una regola (B) può essere anche un **settore
  vuoto** («Ogni nube di gas è entro 2 settori da un settore vuoto») o lo stesso tipo del soggetto («… da un'altra
  cometa»); il settore vuoto non entra nell'etichetta.

**Famiglie di regole delle ricerche** (stessi tipi di regola dell'app, testi nostri; A e B sono tipi di oggetto,
N è un numero di settori):

| `kind` | Forma | N in Base | N in Esperto |
|---|---|---|---|
| `someAdjacent` | «Almeno un A è adiacente a un B» | — | — |
| `noneAdjacent` | «Nessun A è adiacente a un B» | — | — |
| `allAdjacent` | «Ogni A è adiacente a un B» | — | — |
| `allWithin` | «Ogni A è entro N settori da un B» | 2–4 | 2–4 |
| `noneWithin` | «Nessun A è entro N settori da un B» | 2–4 | 2–6 |
| `someOpposite` | «Almeno un A è direttamente opposto a un B» | — | — |
| `noneOpposite` | «Nessun A è direttamente opposto a un B» | — | — |
| `allOpposite` | «Ogni A è direttamente opposto a un B» | — | — |
| `band` | «Tutti gli A sono entro N settori l'uno dall'altro» (un tipo solo) | 2–6 | 2–8 |
| `allConsecutive` | «Tutti gli A sono in settori consecutivi» (un tipo solo) | — | — |
| `someConsecutive` | «N degli A sono in settori consecutivi» (un tipo solo) | — | 3 (solo Esperto) |

Frequenza nell'app, dalla più comune: `someAdjacent`, `allWithin`, `band`, `someOpposite`, `noneOpposite`,
`noneAdjacent`, `noneWithin`; rare `allAdjacent`, `allConsecutive`, `allOpposite`, `someConsecutive`. Il generatore
usa pesi simili.

**Famiglie di regole delle conferenze** (Pianeta X = X, B un tipo di oggetto):

| `kind` | Forma | N |
|---|---|---|
| `xNotOpposite` | «Il Pianeta X non è direttamente opposto a un B» | — |
| `xWithin` | «Il Pianeta X è entro N settori da un B» | 2–5 |
| `xNotWithin` | «Il Pianeta X non è entro N settori da un B» | 2–3 |
| `xNotAdjacent` | «Il Pianeta X non è adiacente a un B» (N = 1; nell'app anche N = 2) | 1–2 |

In Esperto X1 e X2 nominano tipi diversi.

Le regole sono **dati strutturati** (`clues.ts`), per esempio
`{ kind: "someAdjacent", a: "asteroid", b: "dwarf" }`: da qui derivano il controllo del risolutore, il testo
italiano e l'etichetta, quindi non si contraddicono.

**Scelta delle regole** (dal seme, per ogni lettera e conferenza):
- **vera** nel sistema generato e **non già implicata** dalle regole di posizione (niente «ogni asteroide è adiacente
  a un altro asteroide»);
- **etichette diverse** tra le 6 ricerche;
- **informativa**: esclude almeno una parte dei sistemi compatibili con le sole regole di posizione (misurato con il
  risolutore);
- insieme alle conferenze garantisce la **deducibilità** del §3.10.

### 3.9 bis Cosa abbiamo imparato dall'app ufficiale (solo come riferimento)

L'utente ha fornito il pacchetto dell'app (`The Search for Planet X` 2.5.51, Android). È un'app web (Cordova): l'ho
letta senza eseguirla, in una cartella isolata, solo per verificare le regole. **Nulla dell'app entra nel progetto**:
né testi, né immagini, né dati. Gli schemi si possono usare solo con l'import locale facoltativo (§3.10 bis).

- L'app **non genera** i sistemi: ha un archivio di **3199 sistemi Base e 4540 Esperto** pronti, uno per codice
  partita (es. «J9B3»), ognuno con oggetti, 6 ricerche, conferenze, fatti iniziali e dati del bot. Noi invece li
  **generiamo dal seme** (§3.10): niente archivio da copiare, e il generatore va verificato su migliaia di semi.
- Fatti iniziali: 5 serie per sistema (fino a 4 giocatori più il bot), ognuna di 3 blocchi da 4 fatti, solo sui
  quattro corpi celesti. Da qui i valori 12/8/4/0 del §3.8.
- Ricerche e conferenze: i tipi di regola e gli intervalli di N del §3.9 sono contati su tutto l'archivio.

### 3.10 Generatore e risolutore

- **Generatore**: dal seme assegna gli oggetti rispettando il §3.1.
- **Risolutore**: dato un insieme di conoscenze (regole di posizione, fatti iniziali, risultati, ricerche,
  conferenze, revisioni), enumera i sistemi compatibili con un backtracking settore per settore e potatura sui
  conteggi e sui vincoli locali. Serve ai test, al bot (§6) e all'aiuto `assist`.
- **Deducibilità garantita**: si accetta un sistema solo se regole di posizione + ricerche + conferenze, conoscendo
  tutto tranne la differenza tra vuoto e Pianeta X, lasciano **un solo** settore per il Pianeta X; e se nessuna
  conferenza da sola lo rivela. Controllato su migliaia di semi per entrambe le modalità.
- Le posizioni delle icone del §3.2 bis stanno nella costante `BOARD_LAYOUT` per modalità (`board.ts`), usata da
  server e client.

### 3.10 bis Import facoltativo degli schemi dell'app ufficiale

Chi ha l'app ufficiale può giocare con i suoi schemi invece che con quelli generati. Gli schemi **non stanno nel
progetto né nel pacchetto**: ognuno li importa dalla propria copia dell'app, e la responsabilità di usarli è sua.

- **Parser** ✅ (già scritto): `packages/minigames/src/pianeta-nascosto/official-map.ts`, con `sky.ts` (regole di
  posizione) e `clues.ts` (regole strutturate e loro controllo). `parseOfficialMap(codice, json)` converte uno
  schema (un file `<codice>.json` della cartella `assets/www/assets/maps` dell'app) in `ImportedSystem`: sistema,
  ricerche A–F, conferenze, fatti iniziali (serie × 3 blocchi × 4). Rifiuta lo schema se il formato è diverso, se
  il sistema viola le regole di posizione, se una regola non vale o se un fatto è falso; il blocco `solo` (mosse
  del bot dell'app) si ignora.
- **Corrispondenza** tra i tipi dell'app e le nostre regole: `confClue1PlusXAdjacentY` → `someAdjacent`,
  `confClueNoXWithin1Y` → `noneAdjacent`, `confClueAllXWithin1Y` → `allAdjacent`, `confClueAllXWithinNY` →
  `allWithin`, `confClueNoXWithinNY` → `noneWithin`, `confClue1PlusXOppositeY` / `NoXOppositeY` / `AllXOppositeY` →
  `someOpposite` / `noneOpposite` / `allOpposite`, `confClueAllXWithinN` → `band`, `confClueAllXConsecutive` →
  `allConsecutive`, `confClueNXConsecutive` → `someConsecutive` (la serie più lunga è esattamente N),
  `confClue9WithinNY` / `9NotWithinNY` → `xWithin` / `xNotWithin`, `confClue9NotWithin1Y` → `xNotAdjacent` (anche
  con N = 2: il testo dell'app è sempre «non è adiacente»), `confClue9NotOppositeY` → `xNotOpposite`. Codici
  oggetto: 0 vuoto, 1 asteroide, 2 pianeta nano, 3 cometa, 4 nube di gas, 9 Pianeta X.
- **Verifica** fatta in locale (fuori dal progetto) su tutto l'archivio: **7739 schemi letti su 7739**, ogni regola
  vera nel suo sistema con il significato scelto. 6 schemi Esperto hanno un'etichetta X1 sbagliata nell'app (la
  regola parla di un settore vuoto, l'etichetta di un corpo celeste): sono accettati con un avviso e l'etichetta si
  ricava dalla regola. I test (`official-map.test.ts`, `clues.test.ts`) usano solo schemi inventati.
- **Fatto** (vedi la guida): riquadro «Importa schemi» nell'editor dell'istanza (non un comando durante il round) che legge una cartella indicata
  dall'host e salva gli schemi validi in `data/pianeta-schemi/` (ignorata da git, mai nel pacchetto); campo
  `source: "generated" | "official"` nell'istanza (default `"generated"`) e campo facoltativo `code` per scegliere uno
  schema (vuoto = a caso tra quelli importati della modalità). Con `source: "official"` il plugin prende sistema,
  ricerche, conferenze e fatti dallo schema (le serie A–E vanno agli osservatori in ordine; con più di 5 osservatori
  si riusano a rotazione) e salta generatore e controllo di deducibilità. Senza schemi importati la regia mostra
  «Nessuno schema importato» e l'avvio è rifiutato. Lo scenario e2e usa schemi finti scritti dal test.

## 4. Configurazione dell'istanza (`configSchema`)

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `mode` | `"standard" \| "expert"` | `"standard"` | 12 o 18 settori |
| `turnMode` | `"sequential" \| "simultaneous"` | `"sequential"` | §2.2 |
| `decision` | `"vote" \| "captain"` | `"vote"` | §2.3 |
| `turnSeconds` | intero 0–600 | 90 | 0 = senza limite |
| `theorySeconds` | intero 0–600 | 60 | 0 = senza limite |
| `difficulty` | `"youth" \| "beginner" \| "experienced" \| "genius"` | `"beginner"` | Informazioni iniziali (§3.8); la regia può cambiarla per una squadra prima dell'inizio |
| `assist` | booleano | `false` | §2.5 |
| `maxDays` | intero 0–200 | 0 | 0 = nessun limite |
| `bots` | intero 0–3 | 0 | Osservatori robot (§6); con una sola squadra almeno 1 |
| `botLevel` | `"easy" \| "normal" \| "hard"` | `"normal"` | §6 |
| `blindHost` | booleano | `true` | §2.7 |
| `pointScale` | intero 1–50 | 10 | Moltiplica i punti originali |

Nessun contenuto da preparare (come Plancia di Comando): niente `libraryConfigSchema`.

## 5. Il plugin `pianeta-nascosto`

### 5.1 Stato

```ts
type Seen = "comet" | "asteroid" | "dwarf" | "gas" | "empty";        // ciò che mostrano gli strumenti
type ObjectKind = Seen | "planetX";
type Mark = "excluded" | "supposed" | "confirmed";

interface Clue { id: string; kind: string; params: Record<string, unknown> }   // regola strutturata

type Action =
  | { type: "survey"; object: Seen; from: number; to: number }
  | { type: "target"; sector: number }
  | { type: "research"; topic: string }
  | { type: "locate"; sector: number; left: Seen; right: Seen };

interface Observatory {
  id: string;                         // teamId oppure "bot-1"…
  bot: boolean;
  name: string;
  color: string;
  members: string[];                  // vuoto per i bot
  captainId: string | null;
  difficulty: Difficulty;
  time: number;                       // giorni percorsi; settore = time mod N + 1
  stack: number;                      // ordine nella pila dello stesso settore (più alto = più avanti)
  targetsLeft: number;
  lastWasResearch: boolean;
  tokens: Record<Exclude<Seen, "empty">, number>;      // gettoni teoria rimasti
  facts: { sector: number; absent: "comet" | "asteroid" | "dwarf" | "gas" }[];   // «il settore N non contiene…»: SOLO alla squadra
  log: { time: number; action: Action; result: unknown }[];   // SOLO alla squadra
  notes: Record<string, Mark>;        // "settore:oggetto" → segno, SOLO alla squadra
  proposals: { id: string; by: string; action: Action }[];
  vote: TeamVote | null;
  located: { time: number; first: boolean } | null;
}

interface Theory {
  id: string; ownerId: string; sector: number; object: Exclude<Seen, "empty">;
  space: 0 | 1 | 2 | 3;               // 0 = [+], 3 = [↻]
  phase: number;                      // fase d'invio (priorità)
  faceUp: boolean;
  correct: boolean | null;
}

interface State {
  phase: "briefing" | "turn" | "resolve" | "conference" | "theory" | "review" | "lastCall" | "finalGuess" | "reveal" | "final" | "done";
  seed: number;
  cfg: PianetaConfig;
  sky: ObjectKind[];                  // il sistema vero: SOLO stato e regia sbloccata
  topics: { id: string; label: string; clue: Clue }[];
  conferences: { id: "X1" | "X2"; clue: Clue; held: boolean }[];
  earth: number;                      // settore indicato dalla freccia (giri compresi)
  observatories: Observatory[];
  theories: Theory[];
  confirmed: Record<number, Seen>;    // settori confermati dalla revisione (pubblico)
  publicLog: { time: number; ownerId: string; action: PublicAction }[];
  actingIds: string[];
  finderIds: string[];
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  hostUnlocked: boolean;
}
```

File: `sky.ts` (regole e generatore), `clues.ts` (modelli, controllo, testi), `official-map.ts` (import degli schemi
dell'app, §3.10 bis), `facts.ts` (informazioni iniziali),
`solver.ts`, `board.ts` (`BOARD_LAYOUT`, tempo, Terra, cielo visibile), `actions.ts` (costi e risultati),
`theories.ts` (piste e revisione), `bot.ts`, `scoring.ts`, `index.ts` (fasi, input, viste); ciascuno con i suoi test.

### 5.2 Fasi

```
briefing → turn → resolve → (rotazione della Terra) ─┬─ icona conferenza → conference ─┐
                                                     ├─ icona teoria → theory → review ─┤→ (continua la rotazione)
                                                     └─ freccia arrivata → turn ─────────┘
turn (localizzazione riuscita) → lastCall → reveal → final → done
resolve (maxDays superato) → finalGuess → reveal
```

| Fase | Cosa succede | Come finisce |
|---|---|---|
| `briefing` | La TV spiega il tabellone; ogni squadra riceve le informazioni iniziali | La regia preme «Inizia» |
| `turn` | Le squadre che agiscono propongono e votano (o decide il capitano); i bot scelgono dopo una breve pausa | Tutte hanno confermato, oppure `turnSeconds` scaduti: si applica la proposta più votata, senza proposte la squadra **passa** e avanza di 1 |
| `resolve` | La TV annuncia le azioni, i segnalini avanzano, ogni squadra riceve il risultato | Pausa automatica di ~4 s |
| `conference` | Indizio sul Pianeta X a tutti | La regia preme «Avanti» |
| `theory` | Invio simultaneo delle teorie, poi avanzamento sulle piste | Tutte hanno confermato o `theorySeconds` scaduti |
| `review` | Revisione settore per settore, con animazioni e penalità | Automatico al termine delle animazioni (la regia può saltare) |
| `lastCall` | Ultime opportunità in ordine di turno | Tutte hanno scelto o tempo scaduto |
| `finalGuess` | Solo con `maxDays` superato: ipotesi finale segreta e simultanea sul Pianeta X | Tutti hanno scelto o `theorySeconds` scaduti |
| `reveal` | Svelamento dei settori e delle teorie coperte | La regia preme «Avanti» |
| `final` | Punteggio come sul foglio (§7.3) e classifica | La regia preme «Avanti» |

La velocità non dà punti: le scadenze sono in ora server con `GRACE_MS` solo per non perdere un voto arrivato al
limite.

### 5.3 Input dei giocatori (`inputSchema`)

| Input | Chi e quando |
|---|---|
| `{ type: "propose", action }` | Membro di una squadra che agisce (`turn`) o ha un'ultima opportunità (`lastCall`). Validato: cielo visibile, archi delle comete, gettoni puntamento, ricerca non consecutiva |
| `{ type: "vote", proposalId }` / `{ type: "ready" }` | Membri della squadra, con `team-vote` |
| `{ type: "decide", proposalId }` | Il capitano (con `decision: "captain"` o per la parità) |
| `{ type: "theory", sector, object }` / `{ type: "withdraw", sector }` | Membri, in `theory` e `lastCall`; rifiutato senza gettoni di quel tipo (contando anche le teorie già scelte nella stessa fase), su settori confermati e per duplicati. Il gettone si scala solo alla chiusura della fase; ritirare una scelta prima della chiusura non costa nulla |
| `{ type: "note", sector, object, mark }` | Qualunque membro, in ogni fase: escludere / supporre / confermare / cancellare (`mark: null`). I segni automatici (fatti iniziali, revisioni) non si cancellano |
| `{ type: "noteSector", sector, mark }` | Scorciatoia: «appare vuoto» (segna insieme vuoto e Pianeta X, come suggerisce il regolamento) o «escludi tutto il resto» |

I segni sul foglio cambiano solo le viste dei compagni di squadra: TV e altre squadre non li ricevono, quindi la
deduplicazione degli invii ne limita il costo alla squadra. Limite lato server di 10 segni al secondo per giocatore.

### 5.4 Comandi della regia (`commandSchema`)

`start`, `pause`, `resume`, `next`, `force-decide` (applica la proposta più votata), `skip` (la squadra di turno
passa e avanza di 1), `set-difficulty` (squadra + livello, solo in `briefing`), `unlock-solution` (con conferma),
`end` (passa alla rivelazione).

`buildConfig` accetta da 1 a 6 squadre umane (con una sola squadra servono `bots` ≥ 1) e al massimo 6 osservatori in
tutto; `minPlayers: 1`, `teamBased: true`.

### 5.5 Punti nel registro

Ogni membro di una squadra riceve i punti della sua squadra × `pointScale` (`scores` con un `playerId` per membro,
`teamId: null`, attribuiti dall'engine). I **bot non entrano mai nella classifica generale** (decisione dell'utente):
non scrivono nel registro `score_entries` e non compaiono in `result()`. Si vedono solo nelle viste del plugin: sul
tabellone, nel punteggio finale del round sulla TV (con l'etichetta «bot») e sui telefoni.

### 5.6 Chi vede cosa

| Informazione | TV | Squadra | Altre squadre | Regia |
|---|---|---|---|---|
| Sistema solare vero | solo in `reveal` | ❌ | ❌ | dopo «Mostra la soluzione» |
| Regole, tracciato, Terra, cielo visibile | ✅ | ✅ | ✅ | ✅ |
| Informazioni iniziali | ❌ | le proprie | ❌ | dopo lo sblocco |
| Azione scelta | dopo `resolve` | ✅ (anche proposte e voti) | dopo `resolve` | ✅ |
| Risultato di un'azione | ❌ | ✅ | ❌ | dopo lo sblocco |
| Testo di una ricerca | ❌ (solo l'argomento letto) | se l'ha letta | se l'ha letta | ✅ |
| Conferenze | quando si tengono | ✅ | ✅ | ✅ |
| Foglio appunti, proposte, voti | ❌ | ✅ | ❌ | ❌ |
| Teorie coperte | colore e settore | le proprie complete | colore e settore | ✅ |
| Gettoni teoria rimasti per tipo | ❌ | ✅ | ❌ | ✅ |
| Esito di una localizzazione | riuscita / fallita, mai il settore | ✅ | come la TV | ✅ |
| Settori confermati | ✅ | ✅ | ✅ | ✅ |

Test anti-leak (`pianeta-leak.test.ts`) a ogni passo di partite intere su molti semi e in entrambe le modalità:
nessuna chiave `sky`, `facts`, `log`, `notes`, `proposals`, `tokens` di un'altra squadra; il settore del Pianeta X, i risultati
e gli oggetti delle teorie coperte cercati nel JSON di ogni vista; `hostView` cieca finché non è sbloccata. Come in
Artificieri, un test sul test prova che il controllo segnala una fuga inventata in ogni vista.

## 6. Il bot

Riprende il comportamento del bot dell'app ufficiale:
- parte dall'**elenco di tutti i sistemi compatibili** con ciò che sa (risolutore del §3.10) e lo restringe a ogni
  risultato, ricerca, conferenza e revisione;
- a ogni turno valuta le azioni possibili e sceglie quella con la **miglior informazione per unità di tempo** (riduzione
  attesa dei sistemi possibili / costo); localizza il Pianeta X **solo quando è certo**;
- nella fase teoria invia teorie **solo su settori di cui è certo**, nei limiti dei gettoni: se è certo di più
  settori dello stesso tipo, sceglie quelli dove è più probabile arrivare primo (nessuna teoria altrui coperta nel
  settore);
- nelle ultime opportunità sceglie la mossa con più punti certi;
- ha le **sue informazioni iniziali** come le squadre (livello da `botLevel`: `easy` = Genio con scelte meno
  efficienti, `normal` = Principiante, `hard` = Genio con scelte ottimali).

Vincoli tecnici: il bot gira dentro `onTick`, quindi deve restare **puro** (casualità dal seme) e **veloce**. Lo stato
non può contenere l'elenco dei sistemi: il bot lo ricalcola dalle sue conoscenze, con una cache in memoria indicizzata
dalle conoscenze (risultato deterministico, quindi la cache non rompe la purezza). In Base l'elenco completo è
piccolo; in Esperto, se il conteggio è troppo grande, il bot valuta le azioni su un **campione** dal seme (misurato in
P1, §9). Il bot agisce dopo una pausa di 3–5 s per dare tempo alla TV di mostrare il turno.

## 7. Interfacce (fedeli al tabellone e al foglio appunti)

### 7.1 TV: il tabellone

```
              ●Blu                 ●Rosso ●Verde               ● segnalini sul TRACCIATO DEL TEMPO
   ▲X1     11          12     ▤     1           2                (anello esterno; nella pila chi è
       ┌───────────┬───────────┬───────────┬───────────┐         sopra gioca dopo)
       │   [+]     │   [+]     │   [■]     │   [+]     │
       │   [ ]     │   [■]     │   [ ]     │   [ ]     │         PISTA DI REVISIONE di ogni settore:
       │   [ ]     │   [ ]     │   [ ]     │   [▣]     │         [+] esterna → [↻] interna
       │   [↻]     │   [↻]     │   [↻]     │   [↻]     │         ■ teoria coperta (colore squadra)
   10  │  ┌─────────────────────┬──────────────────┐   │  3      ▣ teoria giusta (icona dell'oggetto)
       │  │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│  1    2    3     │   │
    ▤  │  │▒▒ disco della ▒▒▒▒▒▒│  CIELO VISIBILE  │   │  ▤      ▤ icona TEORIA, ▲ icona CONFERENZA
       │  │▒▒ Terra (7–12) ▒▒▒▒▒│   ☀   ➤ 1        │   │         sui confini dell'anello interno
    9  │  │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│  6    5    4     │   │  4      (Base: 3–4, 6–7, 9–10, 12–1; X1 10–11)
       │  └─────────────────────┴──────────────────┘   │
       │   [↻]     │   [↻]     │   [↻]     │   [↻]     │         Il disco copre metà anello interno;
       │   [ ]     │   [ ]     │   [ ]     │   [ ]     │         l'apertura mostra il CIELO VISIBILE e
       │   [ ]     │   [ ]     │   [ ]     │   [ ]     │         la freccia ➤ indica il settore
       │   [+]     │   [+]     │   [+]     │   [+]     │         dell'osservatorio più arretrato
       └───────────┴───────────┴───────────┴───────────┘
            8           7     ▤     6           5           (piste anche per i settori dei lati: 3, 4, 9, 10)
 ┌ CRONACA ──────────────────────────┐ ┌ ARGOMENTI ──────────────┐ ┌ REGOLE ───────────────────────┐
 │ Rosso   rileva ☄ comete 2–5   (3) │ │ A ☄+◌  letto da Blu     │ │ ☄ solo nei settori 2 3 5 7 11 │
 │ Blu     ricerca A             (1) │ │ B ◍+☁  —                │ │ ◍ adiacente a un altro ◍      │
 │ Verde   punta il settore 4    (4) │ │ C ◌+☁  letto da Rosso   │ │ ☁ adiacente a un vuoto [ ]    │
 │ Robot   localizza: FALLITO    (5) │ │ …       X1: «…»         │ │ ◌ mai adiacente al Pianeta X  │
 └───────────────────────────────────┘ └─────────────────────────┘ └───────────────────────────────┘
```

- **Disposizione del tabellone originale**, disegnata da noi in SVG con le variabili del tema: anello esterno con
  il **tracciato del tempo** (numeri dei settori, segnalini impilati con l'ordine di turno); per ogni settore uno
  spicchio con la **pista di revisione** di 4 caselle verso il centro (`[+]` fuori, `[↻]` dentro); **anello
  interno** con i numeri dei settori, le icone di teoria e di conferenza; **disco della Terra** che copre metà
  dell'anello interno, con l'apertura sul **cielo visibile** e la **freccia** sull'osservatorio più arretrato; il
  sole al centro.
- Animazioni (Framer Motion): segnalini che avanzano casella per casella; la Terra che **ruota** un settore alla volta
  e si ferma sulle icone; gettoni teoria che avanzano sulle piste e si girano nella revisione (✔ verde; ✖ rosso, con il
  segnalino della squadra che avanza di 1 per penalità); svelamento finale settore per settore.
- Durante la partita gli spicchi sono **tutti uguali**: nessuna informazione sugli oggetti nella grafica, nemmeno
  negli attributi del DOM (controllato negli e2e). Solo i settori confermati mostrano l'icona dell'oggetto.
- Pannelli laterali: **cronaca** delle azioni (come la colonna degli avversari del foglio), **argomenti** di ricerca
  con chi li ha letti e i testi delle conferenze, **regole** di posizione e glossario.

### 7.2 Telefono: il foglio appunti

Riprende il foglio originale (ruota a sinistra, registro a destra), diviso in schede per stare in 360×640:

```
 ┌ Osservatorio Rosso ─────── ⏱ 0:52 ┐      SCHEDA «RUOTA» (scheda iniziale)
 │              12   1                │
 │         11 ╱ ☄◍◌☁✕[] │ ◍◌☁✕[] ╲ 2  │      Ogni spicchio ha le icone degli oggetti
 │       10  │ ◍◌☁✕[]   │ ☄◍◌☁✕[] │ 3 │      possibili (☄ solo nei settori da cometa)
 │           │  ✗ ✗ ○   │  ■  ◉   │   │
 │        9  │ ◍◌☁✕[]  (☀) ☄◍◌☁✕[]│ 4 │      tocco su un'icona:  nulla → ✗ esclusa
 │        8  │ ◍◌☁✕[]   │ ◍◌☁✕[]  │ 5 │                          → ○ supposta → ◉ confermata
 │          ╲  ☄◍◌☁✕[] │ ◍◌☁✕[]  ╱ 6 │      ■ informazione iniziale (fissa)
 │              7    6               │      ◉ verde = confermata dalla revisione
 │  [ appare vuoto ]  [ escludi resto ]│      pressione lunga su uno spicchio:
 ├───────────────────────────────────┤        scorciatoie del settore
 │ [Ruota] [Azione] [Registro] [Teorie]│
 └───────────────────────────────────┘
```

- **Ruota**: lo spicchio toccato si **ingrandisce** sotto la ruota con icone grandi (bersagli da almeno 44 px); in
  Esperto (18 spicchi) è l'unico modo di segnare, e c'è anche una **vista a elenco** (un settore per riga, scorre in
  verticale, mai in orizzontale). Il cielo visibile è evidenziato sulla ruota.
- **Azione** (attiva quando la squadra agisce): scelta a passi come nell'app ufficiale (azione → oggetto → arco o
  settore sulla ruota, con il costo che cambia mentre si allarga l'arco), proposte dei compagni con i voti,
  «Conferma». Le azioni non possibili sono spente con il motivo («Ricerca appena fatta», «Gettoni puntamento finiti»).
- **Registro**: le righe come sul foglio («A 1–6 → 3», «Punta 8 → ◌», «Ricerca B → …»), le ricerche lette con il
  testo, le conferenze, le azioni degli avversari, le revisioni.
- **Teorie**: gettoni rimasti per tipo (es. «◍ 3/4 · ☄ 2/2 · ☁ 1/2 · ◌ 0/1»), con i tipi esauriti spenti; teorie
  piazzate con lo spazio della pista; invio nella fase teoria con un avviso se si sta per usare l'**ultimo** gettone
  di un tipo.
- In `final` il telefono mostra la riga del **punteggio finale** come sul foglio (priorità, ◍, ☄, ☁, ◌, Pianeta X,
  totale).

Chi non agisce in quel momento ha comunque la ruota e il registro: c'è sempre qualcosa da ragionare.

### 7.3 Regia

Vista `Host` con `lazy` (non nel pacchetto del telefono): osservatori, posizioni, chi agisce e da quanto, stato dei
voti, livelli di difficoltà (modificabili in `briefing`), pulsanti del §5.4. Sistema solare, fatti e risultati solo
dopo lo sblocco.

## 8. Rischi ed estensioni

- **Difficoltà**: è un gioco da tavolo di logica vera. Mitigazioni: livello «Ragazzi» o «Principiante», `assist`,
  regole e glossario sempre visibili, briefing con un esempio di deduzione. La guida per l'host lo presenta come gioco
  per serate «da tavolo».
- **Durata**: l'originale dura 60–75 minuti con 4 giocatori. Con le squadre la discussione allunga i turni:
  `turnMode: "simultaneous"`, `turnSeconds`, `maxDays` e la modalità Base servono ad accorciare; il bilanciamento
  del P6 misura la durata reale.
- **Attese** in `turnMode: "sequential"` con 5–6 squadre: il foglio condiviso e la cronaca danno da fare; se non
  basta si consiglia la modalità simultanea.
- **Squadre grandi**: con 6–8 membri il voto si disperde; parità al capitano o `decision: "captain"`.
- **Risolutore e bot in Esperto**: se l'enumerazione è troppo lenta, campionamento (§6) o cieli Esperto pregenerati
  in un file di semi verificati (resta codice, non contenuto dell'admin).
- **Fedeltà**: regole verificate su regolamento, tabellone e app (§3); se una nuova versione dell'app cambia qualcosa, si aggiorna il §3.
- **Estensioni**: indizi scritti dall'admin come contenuto dell'istanza; tema dedicato «spazio».

## 9. Fasi di lavoro

Ogni passo si chiude con test verdi e una piccola demo; commit semantici separati (nessun commit senza richiesta).

| Passo | Contenuto | Verifica |
|---|---|---|
| **P0 Verifica delle regole** ✅ | Icone del tabellone (§3.2 bis), fatti iniziali (§3.8), ricerche e conferenze (§3.9) verificati con l'utente e con l'app ufficiale | Fatto |
| **P1 Sistema e risolutore** | `sky.ts`, `board.ts` (tempo, pile, Terra, cielo visibile), `solver.ts`, risultati di rilevamento e puntamento | Per 5000 semi e modalità: regole rispettate, stesso seme → stesso sistema; il risolutore ritrova il sistema quando sa tutto; conteggio dei sistemi validi e tempi misurati e annotati (decide il campionamento del bot) |
| **P2 Indizi e fatti** | `clues.ts` (ricerche e conferenze strutturate, testi), `facts.ts` (informazioni iniziali per livello), garanzia di deducibilità | Indizi tutti veri; un solo settore per il Pianeta X; nessuna conferenza né insieme di fatti che lo riveli da solo; fatti non banali e in numero uguale per livello; snapshot dei testi |
| **P3 Logica del plugin** | Osservatori, turni sequenziali e simultanei, rotazione con soste sulle icone, azioni e vincoli, proposte e voti, teorie e revisione, penalità, conferenze, fine partita e ultime opportunità, `maxDays`, comandi, punti, `buildConfig` | Unit test sugli esempi del regolamento (pila nello stesso settore, rotazione con conferenza, icone del §3.2 bis
attivate al confine giusto in entrambe le modalità, rotazione che attraversa 9–10 e 10–11 in Base con teoria e poi
conferenza, X1/X2 una sola volta (al secondo giro la rotazione attraversa l'icona senza fermarsi e lo stato non cambia) e
teorie a ogni giro, revisione con teoria giusta e sbagliata, ultime opportunità a 1–3 e 4–5 settori; gettoni: esauriti per tipo,
teoria sbagliata che consuma il gettone, gettone non scalato se la scelta è ritirata prima della chiusura, 9 in Base
e 12 in Esperto); contratto di `registry.test.ts` e `test-session.test.ts` |
| **P4 Anti-leak** | `pianeta-leak.test.ts` (§5.6) | Nessun dato privato fuori posto; regia cieca; test sul test |
| **P5 Bot** | `bot.ts`: scelta delle azioni, teorie solo certe, localizzazione solo certa, livelli | Il bot non invia mai una teoria sbagliata (migliaia di partite); trova sempre il Pianeta X entro un tempo finito; `onTick` del bot sotto ~20 ms (Base) |
| **P6 Viste e bilanciamento** | TV (tabellone), telefono (foglio), regia; scene `/preview` (`px-*`: tabellone, revisione, ruota a 12 e 18 settori, azione, registro) nei 5 temi; `rulesText.ts`; `pnpm balance:pianeta` (bot contro bot: durata in giorni e minuti stimati, quota di vittorie per livello, vantaggio di chi parte primo) | Asserzioni Playwright: nessun overflow a 360×640 anche a 18 settori, bersagli ≥ 44 px, spicchi identici nel DOM durante la partita, rotazione della Terra |
| **P7 End-to-end, stress, documenti** | `e2e/pianeta-preview.spec.ts`, `e2e/pianeta-nascosto.spec.ts` (2 squadre + 1 bot: informazioni iniziali, azioni, conferenza, teoria e revisione, localizzazione, ultime opportunità, rivelazione); `pnpm stress --players 30 --scenario pianeta`; guida `docs/PIANETA-NASCOSTO.md`, `PIANO.md`, `CLAUDE.md` (test richiesti), `GUIDA-HOST.md` | **Frame WebSocket**: risultati, fatti e foglio solo ai membri della squadra, sistema mai prima di `reveal`; server pulito alla fine; `pnpm test`, `pnpm test:e2e`, `pnpm package:win` + `pnpm package:check` |

## 10. Verifiche sul codice (prima dell'implementazione)

| Punto del piano | Esito | Dove |
|---|---|---|
| `teamBased`, `minPlayers`, capitano nel contesto | ✅ | `shared/src/minigame.ts` (`teamBased`, `minPlayers`, `ParticipantInfo.captain`) |
| Voto di squadra con timer, conferme e parità | ✅ da riusare | `minigames/src/team-vote.ts` |
| Invii accorpati e viste identiche non rimandate (foglio solo alla squadra) | ✅ | `server/src/realtime.ts`, `flush` |
| Vista `Host` caricata con `lazy` | ✅ | `client/src/minigames/registry.ts`, guida §4 bis |
| `rulesText.ts` con test | ✅ modello in Artificieri e Agenti Segreti | `client/src/minigames/*/rulesText.ts` |
| Script di bilanciamento | ✅ da aggiungere `balance:pianeta` come `balance:shadow` | `package.json`, `tools/bots/src/balance-*.ts` |
| Stress con `--scenario` nuovo | da aggiungere `pianeta` | `tools/bots/src/run.ts`, `scenario.ts` |
| Prova rapida | ✅ ereditata (nessun contenuto da completare, niente `OWN_CONFIG`) | `server/src/test-session.ts`, `e2e/prova-rapida.spec.ts` |
| Tema `retro80` | ✅ | `client/src/themes/retro80.css` |
| Bot fuori dalla classifica generale | ✅ deciso: niente `score_entries` né voci in `RoundResult` per i bot, solo viste del plugin | `shared/src/minigame.ts`, `RoundResult` |
| Durata massima di `onTick` con il bot | ❓ da misurare in P1/P5 | `server/src/index.ts` (tick ogni 100 ms) |

Fonti delle regole: [regolamento ufficiale](https://foxtrotgames.com/planetx/tutorial/) (Foxtrot Games, 2020) e
[regole del solitario](https://static.foxtrotgames.com/content/solo-mode-rules-0.6.5.pdf) (app 1.5.0 o successiva).
