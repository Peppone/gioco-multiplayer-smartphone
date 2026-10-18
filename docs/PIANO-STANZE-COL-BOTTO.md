# Piano: «Stanze col botto» (deduzione sociale in stile *Two Rooms and a Boom*)

> Stato: **decisioni chiuse, implementazione non iniziata**. Tutte le decisioni prese con l'utente sono nel §2;
> il lavoro parte dal passo T1 (§13).
> Da leggere insieme a [PIANO.md](../PIANO.md), [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md) e
> [PIANO-PAROLE-MANNARE.md](PIANO-PAROLE-MANNARE.md) (stesso genere di gioco, molte soluzioni si riusano).

## 1. Obiettivo

Portare nel gioco le meccaniche di *Two Rooms and a Boom* **senza carte**: il telefono di ogni giocatore fa da
carta personaggio, l'app distribuisce i ruoli, divide i giocatori tra le due stanze, tiene il tempo, gestisce i
leader, la scelta e lo scambio degli ostaggi, le condivisioni delle carte e la rivelazione finale.
La trattativa resta **a voce**, di persona.

In sintesi:
- due squadre: **Blu** (protegge il **Presidente**) e **Rossa** (ha il **Bombarolo**);
- i giocatori si dividono in **due stanze fisiche** (due locali, o due angoli lontani dello stesso salone);
- in ogni stanza c'è un **leader**, che a fine round sceglie gli **ostaggi** da mandare nell'altra stanza;
- durante il round ci si **mostra la carta** (solo il colore o la carta intera) per capire chi è chi;
- dopo l'ultimo scambio: se Presidente e Bombarolo sono **nella stessa stanza** vince la squadra Rossa,
  altrimenti vince la Blu.

È il primo gioco del progetto che **sfrutta davvero i 30 giocatori**: il regolamento originale parte da 6 e
migliora con i numeri grandi. Per questo è anche il primo candidato a mettere sotto stress il realtime con una
partita "vera" da 30.

**Nome.** «Two Rooms and a Boom» è un marchio di Tuesday Knight Games: nell'app serve un nome nostro, con regole,
testi e personaggi scritti da noi. Il gioco si chiama **«Stanze col botto»**, id del plugin `stanze-col-botto`.

## 2. Decisioni confermate con l'utente

| Tema | Decisione |
|---|---|
| Nome | **«Stanze col botto»**, id `stanze-col-botto` |
| Schermo | **Uno solo**. Mostra il **riassunto generale di chi è in quale stanza** (la composizione delle stanze è pubblica), timer e round; dopo lo sblocco, i leader (§5.4) |
| Scambi | **Si fanno con l'app**: il leader sceglie gli ostaggi sul telefono, l'app dice a ognuno dove andare e aggiorna stanze e schermo. Anche le condivisioni delle carte passano dall'app (§5.5) |
| Leader | **Non è segreto**: chi è nella stanza lo vede sempre, sull'app, appena viene scelto. Si sceglie **anche votando dall'app** (oltre alla nomina e all'usurpazione dell'originale). A fine round ogni stanza lo **blocca**, e **quando entrambe le stanze l'hanno bloccato** i due leader diventano visibili anche sullo schermo comune e sulle app dell'altra stanza (§5.4) |
| Mostrare la carta | Un **pulsante** mostra la propria carta o il proprio colore a un altro giocatore **senza reciprocità** (la «rivelazione» del regolamento). La reciprocità vale solo dove il regolamento la scrive: la **condivisione** (in inglese *share*) è per definizione reciproca e consensuale, e alcuni personaggi contano proprio le condivisioni (§5.5, §7) |
| Regolamento | Verificato sull'originale (§3): tabella degli ostaggi, regole dei leader, condivisioni, Giocatore d'azzardo, carta sepolta |
| Regia | **La regia sa tutto** (carte, stanze, voti, condivisioni). Se il conduttore vuole giocare c'è la **modalità cieca** (§6) |
| Leader nei round successivi | Dopo il primo sblocco **restano visibili a tutti**. Se una stanza cambia leader in un round successivo, il nuovo nome resta visibile solo a quella stanza fino al blocco successivo; lo schermo mostra intanto «Leader al round precedente» |
| Ostaggi in preparazione | **La stanza li vede** mentre il leader li sceglie (come l'annuncio a voce dell'originale); l'altra stanza e lo schermo solo a scambio pronto |
| Partenza del round successivo | I leader **votano «Avvia il round»**. Il round parte alla prima di queste condizioni: **entrambi i leader** hanno premuto; **5 secondi** dopo che il primo leader ha premuto; **15 secondi** dopo lo scambio; **la regia** dà l'ok (§5.3) |
| Ostaggi nella variante lunga | Presi dalla **carta del leader** del regolamento ufficiale (§3) |
| Abbinamento alle stanze | Si decide **all'inizio**, prima di distribuire le carte: **a caso**, **con i QR** mostrati sullo schermo comune prima di entrare nelle stanze, o **forzato dalla regia**; la regia può sempre correggere (§5.10) |
| Punti | Tutti i membri della squadra vincitrice ricevono gli stessi punti (100); il Giocatore d'azzardo altrettanti se indovina. Nessun bonus |
| Contatore delle condivisioni | **Nessun contatore** sullo schermo nella prima versione (sarebbe un piccolo indizio); eventualmente in futuro come opzione dell'istanza |
| Personaggi | **Prima versione:** Presidente, Bombarolo, membri Blu e Rossi, Giocatore d'azzardo. **Fase 2:** carta sepolta con Figlia del Presidente e Martire, Medico e Ingegnere (con le riserve), Timido, Riservato, Negoziatore, Sprovveduto, Agente, Angelo e Demone, Spie (§7.2). **Più avanti:** i personaggi che prendono o scambiano carte e quelli che spostano persone tra le stanze |
| Disconnessioni | Il giocatore resta nella sua stanza e può essere scelto come ostaggio; un leader disconnesso resta leader e, se non conferma gli ostaggi entro `hostageSeconds`, li sceglie il server a caso; l'avvio del round non lo aspetta (bastano i 15 s dopo lo scambio); la regia può nominare un altro leader o spostare il giocatore |
| Grafica | **Ispirata alla versione stampabile** (*print and play*) del gioco: stile piatto, rosso/blu/grigio, dinamite, tutto disegnato da noi (le immagini originali non si possono copiare). Si aggiunge un **quinto tema, `boom`** (§8.4) |

## 3. Il regolamento originale (verificato)

Fonti: regolamento ufficiale v3 di Tuesday Knight Games
([PDF](https://www.playkaboom.com/TwoRooms_Rulebook_v3.pdf), © 2014, con la carta del leader), regolamento su
[RulesPal](https://rulespal.com/two-rooms-and-a-boom/rulebook), pagina del gioco di
[Tuesday Knight Games](https://www.tuesdayknightgames.com/tworoomsandaboom). Il testo dei personaggi avanzati è nel
*Character Guide*, separato: per quelli vedi il §7.

**Carte base:** Presidente, Bombarolo, 7 Squadra Rossa, 7 Squadra Blu, Giocatore d'azzardo (grigio).
Da 6 a 30 giocatori, 7–20 minuti.

**Le regole di base:** il tempo è pubblico e la fine del round deve essere chiara a tutti; si resta nella propria
stanza; nessuna comunicazione tra le stanze (nemmeno a gesti); la carta è propria: la si mostra a chi si vuole, ma
**non si scambia** con altri e, nel gioco base, se la si mostra **la si mostra tutta** (il solo colore è una regola
del gioco avanzato).

**Round e ostaggi, gioco base** (3 round da 3, 2 e 1 minuto):

| Giocatori | Round da 3 min | Round da 2 min | Round da 1 min |
|---|---|---|---|
| 6–10 | 1 | 1 | 1 |
| 11–21 | 2 | 1 | 1 |
| 22+ | 3 | 2 | 1 |

**Round e ostaggi, gioco avanzato** (dalla carta del leader: 5 round da 5, 4, 3, 2 e 1 minuto, **solo con più di
10 giocatori**; con 6–10 la carta dice «solo 3 round e niente rivelazioni del colore senza 11 giocatori»):

| Giocatori | 5 min | 4 min | 3 min | 2 min | 1 min |
|---|---|---|---|---|---|
| 6–10 | — | — | 1 | 1 | 1 |
| 11–13 | 2 | 2 | 1 | 1 | 1 |
| 14–17 | 3 | 2 | 2 | 1 | 1 |
| 18–21 | 4 | 3 | 2 | 1 | 1 |
| 22+ | 5 | 4 | 3 | 2 | 1 |

- **Varianti:** tutti i round da 3 minuti con gli stessi ostaggi.
- **Senza timer:** i leader annunciano gli ostaggi, poi aspettano in corridoio e si danno il segnale.

**Leader:**
- **Nomina:** si indica un giocatore e si dice «Ti nomino leader!». **Non ci si può nominare da soli.** La
  leadership **non è mai segreta** (da noi la propria stanza la vede sempre, l'altra dal primo sblocco, §2).
- **Abdicazione:** il leader può passare la carta a un giocatore che accetta; chi accetta non può restituirla
  fino al round successivo.
- **Usurpazione:** finché c'è tempo, si alza una mano e con l'altra si indica il candidato (anche sé stessi).
  Quando **più della metà della stanza** indica la stessa persona, quella diventa leader. Senza maggioranza non
  cambia nulla.
- **Il leader non può essere ostaggio** e non può scegliere sé stesso.

**Fine del round:**
1. il leader **annuncia** gli ostaggi alla stanza; dopo l'annuncio **non si cambiano più**;
2. i leader fanno il **parlamentare** (*parley*): si incontrano tra le due stanze, senza gli ostaggi, così chi è più
   lento a decidere non è influenzato vedendo arrivare gli ostaggi dell'altro;
3. **parte il timer del round successivo** (non dopo l'ultimo round);
4. gli ostaggi vengono chiamati e si scambiano (stesso numero da entrambe le parti).

**Condivisioni e rivelazioni:**
- **Rivelazione privata:** mostrare la carta a un giocatore (a senso unico);
- **Rivelazione pubblica:** mostrarla a più giocatori; in quella *permanente* la carta resta sempre in vista;
- **Condivisione della carta:** reciproca, con il consenso di entrambi;
- **Rivelazione e condivisione del colore:** solo il colore, **ammesse solo con più di 10 giocatori**; altrimenti
  chi mostra la carta la mostra tutta;
- **«Non chiedere se non vuoi condividere»:** se chiedi e l'altro accetta, sei obbligato a condividere.

**Giocatore d'azzardo:** entra con un numero dispari di giocatori. Alla fine dell'ultimo round, prima della
rivelazione, si mostra e dichiara quale squadra vincerà: vince se indovina.

**Carta sepolta:** con i dispari (o anche con i pari) si può seppellire una carta a caso, che non va a nessuno.
In quel caso Presidente o Bombarolo potrebbero mancare, quindi si devono aggiungere la **Figlia del Presidente** e il
**Martire**, che li sostituiscono. I personaggi collegati (che esistono solo in coppia) non si seppelliscono.

**Fine della partita:** tutti rivelano; se Presidente e Bombarolo sono nella stessa stanza vince la Rossa,
altrimenti la Blu. Varianti: un grigio che perde prima della fine diventa Giocatore d'azzardo; una carta ricevuta
durante la partita è «pulita» (perde le condizioni precedenti).

## 4. Regole della versione per l'app

1. **Abbinamento alle stanze** (prima di tutto, §5.10). Si decide chi va in quale stanza in uno di tre modi:
   **a caso** (il server divide a metà), **con i QR** (lo schermo comune mostra un QR per stanza e ognuno scansiona
   quello della stanza in cui entra) o **forzato dalla regia** (sposta i giocatori a mano). In ogni modo la regia
   può correggere singoli abbinamenti. Le stanze restano bilanciate (al più un giocatore di differenza).
2. **Distribuzione.** Solo quando la regia conferma l'abbinamento il server assegna in segreto a ogni giocatore una
   carta (così nessuno sceglie la stanza in base alla propria carta). Con un numero dispari entra il Giocatore
   d'azzardo. Il telefono mostra a tutto schermo «Vai in: **Salotto**»; lo schermo comune mostra le due colonne con
   i nomi. La regia avvia il primo round quando tutti sono a posto.
3. **Round.** Parte il timer. In ogni stanza, nell'app: voto, nomina e abdicazione del leader secondo le
   regole originali (§5.4); condivisioni e rivelazioni (§5.5); il leader prepara la scelta degli ostaggi.
4. **Fine del round: blocco.** Allo scadere il leader di ogni stanza è **bloccato** (niente più voti né abdicazioni).
   Quando entrambe le stanze hanno un leader bloccato, i leader compaiono sullo schermo e su tutte le app.
5. **Ostaggi.** La stanza vede gli ostaggi mentre il leader li sceglie; il leader li conferma (definitivi, come
   l'annuncio originale). Quando entrambi hanno confermato, l'app mostra il riepilogo dello scambio, i telefoni
   degli ostaggi dicono «Vai in **Cucina**» e lo schermo aggiorna le stanze.
6. **Avvio del round successivo.** I leader premono «Avvia il round»; il round parte quando l'hanno premuto
   entrambi, oppure 5 secondi dopo il primo, oppure 15 secondi dopo lo scambio, oppure con l'ok della regia
   (la prima che capita). Come nell'originale, il timer riparte mentre gli ostaggi stanno ancora camminando.
7. **Fine.** Dopo l'ultimo scambio il Giocatore d'azzardo fa la sua previsione, poi la **rivelazione**: la TV
   mostra Presidente e Bombarolo, il botto (o il botto mancato), le carte di tutti e la squadra vincitrice. I punti
   vanno in `score_entries`.

## 5. Il plugin `stanze-col-botto`

### 5.1 Configurazione dell'istanza (`configSchema`)

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `roomNames` | `[string, string]` | `["Stanza A", "Stanza B"]` | Nomi mostrati su telefoni e TV (es. «Salotto», «Cucina») |
| `roomAssignment` | `"random"` \| `"qr"` \| `"host"` | `"random"` | Come si abbina ogni giocatore a una stanza (§5.10). La regia lo può cambiare anche nella fase `pairing` |
| `roundMode` | `"base"` \| `"long"` \| `"custom"` | `"base"` | `base`: 3-2-1 minuti con la prima tabella del §3; `long`: 5-4-3-2-1 con la tabella della carta del leader (solo con più di 10 giocatori, altrimenti si ripiega su `base`); `custom`: durate e ostaggi dalla tabella sotto |
| `customRounds` | `{ seconds, hostages6to10, hostages11to21, hostages22plus }[]` | vuoto | Solo per `custom` |
| `colorShare` | `"auto"` \| `"always"` \| `"never"` | `"auto"` | `auto`: colore ammesso solo con più di 10 giocatori, come l'originale |
| `characters` | personaggi attivi (§7) | solo quelli base | Interruttore per ogni personaggio disponibile, con la descrizione |
| `oddPlayer` | `"gambler"` \| `"bury"` | `"gambler"` | `bury` solo quando ci sono Figlia del Presidente e Martire (fase 2) |
| `lockSeconds` | intero | 20 | Tempo per eleggere un leader se una stanza ne è senza allo scadere (§5.4) |
| `hostageSeconds` | intero | 20 | Tempo dei leader per confermare gli ostaggi dopo il blocco |
| `startAfterFirstSeconds` | intero | 5 | Il round parte questi secondi dopo che il primo leader ha premuto «Avvia il round» |
| `startAfterExchangeSeconds` | intero | 15 | Il round parte comunque questi secondi dopo lo scambio |
| `points` | `{ win, gamblerWin }` | `{ 100, 100 }` | Punti a ogni membro della squadra vincitrice e al Giocatore d'azzardo che indovina |

La validazione dell'editor (`superRefine`) controlla le durate e la tabella `customRounds`; il controllo "ostaggi
meno dei giocatori della stanza" si fa in `init`, quando il numero di giocatori è noto.

### 5.2 Stato

```ts
type Team = "blue" | "red" | "grey";
type RoomId = 0 | 1;

interface Card {
  team: Team;
  character: CharacterId;      // "president" | "bomber" | "blue-member" | "red-member" | "gambler" | …
}

interface Share {
  seq: number;
  kind: "card-share" | "color-share" | "card-reveal" | "color-reveal" | "public-card" | "public-color";
  from: string;
  to: string | null;           // null per la rivelazione pubblica (destinatari = la stanza in quel momento)
  audience: string[];          // chi ha visto, fissato al momento
  room: RoomId;
  round: number;
  at: number;
  status: "pending" | "accepted" | "declined" | "expired";
}

interface RoomState {
  leader: string | null;
  leaderLocked: boolean;
  leaderVotes: Record<string, string>;     // elettore → candidato (solo della stessa stanza)
  abdicateOffer: { to: string; at: number } | null;
  abdicatedThisRound: string[];           // chi ha accettato e non può restituire fino al prossimo round
  hostagePicks: string[];
  hostagesConfirmed: boolean;
  startPressedAt: number | null;          // il leader ha premuto «Avvia il round» (fase `exchange`)
}

interface State {
  phase: Phase;
  seed: number;
  round: number;                          // 0-based
  rounds: { seconds: number; hostages: number }[];  // calcolati in init dal numero di giocatori
  players: string[];                      // ordine fisso
  cards: Record<string, Card>;
  room: Record<string, RoomId>;           // stanza attuale di ognuno (pubblica)
  rooms: [RoomState, RoomState];
  revealedLeaders: [string | null, string | null];  // leader visibili a tutti (aggiornati a ogni blocco di entrambe)
  exchanges: { round: number; fromA: string[]; fromB: string[] }[];
  shares: Share[];                        // registro: chi conosce cosa si calcola da qui
  nextSeq: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  gamblerGuess: "blue" | "red" | null;
  blind: boolean;                         // modalità cieca della regia (§6)
  outcome: { winner: "blue" | "red"; reason: string } | null;
}
```

Come per i gettoni di Parole Mannare, **chi conosce la carta di chi** è una funzione pura del registro `shares`
(voci `accepted`): un solo punto di verità per le viste e per le condizioni dei personaggi avanzati.

### 5.3 Fasi

```
pairing → deal → ( round → lock → hostages → exchange ) × N → gamble → reveal → done
```

| Fase | Cosa succede | Come finisce |
|---|---|---|
| `pairing` | Abbinamento alle stanze (a caso, QR o regia); schermo con i QR e le due colonne che si riempiono; nessuna carta ancora distribuita | La regia preme «Distribuisci le carte» (chi non è abbinato va a caso nella stanza più vuota) |
| `deal` | Carte distribuite, stanze fissate; ognuno tiene premuto per vedere la carta e va nella propria stanza | La regia preme «Avvia il round» |
| `round` | Timer, voto, nomina, abdicazione, «Mostra» e «Scambia», il leader prepara gli ostaggi; la regia può mettere in pausa | Allo scadere (o «Chiudi il round» della regia) |
| `lock` | I leader vengono bloccati. Una stanza senza leader ha `lockSeconds` per eleggerlo a maggioranza, poi il server lo estrae a caso | Entrambe le stanze bloccate → leader rivelati su schermo e app |
| `hostages` | I leader (ora pubblici) confermano gli ostaggi, che la loro stanza vede già; il parlamentare avviene a voce | Entrambi confermati o `hostageSeconds` scaduti (il server completa a caso le scelte mancanti) |
| `exchange` | Riepilogo dello scambio su schermo e telefoni, stanze aggiornate; i leader premono «Avvia il round» | Dopo l'ultimo round → subito `gamble`. Altrimenti parte il round successivo alla **prima** di: entrambi i leader hanno premuto; `startAfterFirstSeconds` (5 s) dopo il primo che ha premuto; `startAfterExchangeSeconds` (15 s) dopo lo scambio; comando `start-round` della regia |
| `gamble` | Il Giocatore d'azzardo sceglie Blu o Rossa; si salta se non c'è | Scelta fatta o tempo scaduto |
| `reveal` | Animazione del botto, carte di tutti, vincitore | La regia preme «Avanti» |
| `done` | `isFinished` vero: l'engine registra i punti | — |

**Avvio del round:** schermo e telefoni mostrano un conto alla rovescia verso la scadenza più vicina («Il round
parte tra 5 s»), che si accorcia quando un leader preme. La scadenza è in ora server, quindi è uguale ovunque;
la pressione di un leader arrivata nella stessa finestra di `GRACE_MS` dello scadere non cambia nulla (il round
parte comunque). La regia può sempre mettere in pausa.

**Tra un round e l'altro** il leader resta in carica (come nell'originale) e torna sbloccato all'inizio del round
successivo, quando lo si può di nuovo sostituire col voto. I leader rivelati restano visibili a tutti; se una
stanza cambia leader, il nuovo nome arriva all'altra stanza e allo schermo solo al blocco successivo.

### 5.4 Leader: voto, nomina, usurpazione, blocco

Le regole originali, tradotte in tocchi, più il voto dall'app:

- **Voto dall'app:** ogni giocatore della stanza può votare un candidato (anche sé stesso) e cambiare o ritirare il
  voto in qualsiasi momento del round. Appena un candidato ha **più della metà** dei giocatori della stanza diventa
  leader e i voti si azzerano. È lo stesso meccanismo per la prima elezione e per l'usurpazione dell'originale
  (mano alzata e dito puntato), quindi un solo input e una sola regola.
- **Nomina** (scorciatoia dell'originale, solo con la stanza senza leader): un giocatore tocca un nome e sceglie
  «Nomina leader». Non può nominare sé stesso. Il nominato diventa leader subito; se la stanza non è d'accordo, lo
  sostituisce col voto. Utile nel primo minuto, quando nessuno ha voglia di votare.
- **Abdicazione:** il leader tocca un nome e sceglie «Passa la leadership»; l'altro accetta o rifiuta. Chi accetta
  non può restituirla fino al round successivo.
- **Chi lo vede:** il leader **non è segreto**. Tutti i giocatori della stanza lo vedono sull'app appena viene scelto,
  con i conteggi dei voti in corso (servono a capire quanto manca per sostituirlo). L'altra stanza e lo schermo comune
  lo vedono dopo il blocco di entrambe le stanze (sotto).
- **Blocco:** allo scadere del timer il leader di ogni stanza è bloccato. Se una stanza non ha leader, ha
  `lockSeconds` per raggiungere una maggioranza; poi il server lo estrae a caso. Quando **entrambe** le stanze sono
  bloccate, `revealedLeaders` si aggiorna e i due nomi compaiono sullo schermo comune e su tutte le app.
- **Regia:** può nominare o cambiare un leader a mano in qualsiasi momento (comando `set-leader`), anche in
  modalità cieca.

### 5.5 Condivisioni e rivelazioni (nell'app)

Il regolamento distingue due cose, e l'app le tiene distinte:

- **Mostra** (la *rivelazione* del regolamento, **senza reciprocità**): A tocca il nome di B e preme «Mostra la
  carta» o «Mostra il colore». B vede subito a tutto schermo la carta (o il colore) di A per qualche secondo, senza
  dover accettare e senza dover ricambiare; poi la voce resta nella sua lista «Carte viste». È l'azione principale,
  un tocco sul nome e uno sul pulsante.
- **Mostra a tutta la stanza** (rivelazione pubblica): stesso pulsante, destinatario «Tutti nella stanza». Non va mai
  sullo schermo comune.
- **Scambia** (la *condivisione* del regolamento, **reciproca per definizione**): A propone «Scambiamoci la carta»
  (o il colore); B riceve «Anna vuole scambiare la carta con te: Accetta / Rifiuta». Se accetta, entrambi vedono la
  carta dell'altro nello stesso istante. Chi propone non può ritirarsi dopo l'accettazione («non chiedere se non vuoi
  condividere»). Serve perché il regolamento la prevede e perché **alcuni personaggi contano solo le condivisioni**,
  non le rivelazioni (§7): con il solo MVP (nessun personaggio avanzato) è equivalente a due «Mostra» incrociati, ma
  con l'app è atomica, nessuno dei due può guardare e poi tirarsi indietro.
- **Colore:** le opzioni sul colore compaiono solo se `colorShare` lo permette (con `auto`, più di 10 giocatori).
- **Vincoli:** solo tra giocatori della stessa stanza, al massimo un'offerta in attesa per giocatore, scadenza
  dell'offerta ~20 s o allo scadere del round. Le restrizioni dei personaggi avanzati (§7) si controllano sul server.
- La vista «colore» del telefono mostra **solo** un grande riquadro blu, rosso o grigio, senza nome del personaggio.

### 5.6 Input dei giocatori (`inputSchema`)

| Input | Chi | Fase |
|---|---|---|
| `{ type: "appoint", targetId }` | tutti tranne il bersaglio | `round`, `lock` (stanza senza leader) |
| `{ type: "vote-leader", targetId \| null }` | tutti | `round` (e `lock` per la stanza senza leader); `null` ritira il voto |
| `{ type: "abdicate", targetId }` / `{ type: "abdicate-answer", accept }` | leader / destinatario | `round` |
| `{ type: "pick-hostages", playerIds }` | leader | `round`, `hostages` (modificabile) |
| `{ type: "confirm-hostages" }` | leader | `hostages` (definitivo) |
| `{ type: "start-round" }` | leader | `exchange` («Avvia il round», §5.3) |
| `{ type: "share-offer", kind, targetId }` / `{ type: "share-answer", seq, accept }` | tutti / destinatario | `round` |
| `{ type: "reveal", kind, targetId \| null }` | tutti | `round` («Mostra», a senso unico; `null` = a tutta la stanza) |
| `{ type: "gamble", team }` | Giocatore d'azzardo | `gamble` |
| `{ type: "join-room", code }` | tutti | `pairing`, solo con `roomAssignment: "qr"` (codice del QR; rifiutato se la stanza è piena) |
| `{ type: "seen" }` | tutti | `deal` (facoltativo) |

Scelte arrivate entro `GRACE_MS` dallo scadere sono accettate (stessa tolleranza degli altri giochi).

### 5.7 Comandi della regia (`commandSchema`)

`start-round`, `end-round`, `pause`, `resume`, `set-leader { room, playerId }`, `move-player { playerId, room }` (anche in `pairing`, per forzare l'abbinamento), `shuffle-rooms` (abbinamento a caso), `set-assignment { mode }`, `deal`,
`set-hostages { room, playerIds }`, `set-blind { blind }` (§6), `next`.

### 5.8 Punti e risultato

Ogni membro della squadra vincitrice riceve `points.win`; il Giocatore d'azzardo `points.gamblerWin` se ha
indovinato. `result()` restituisce squadra vincitrice e motivo («Il Presidente era nella stanza del Bombarolo»),
così il gioco si può usare anche dentro un meta-gioco.

### 5.9 Chi vede cosa

| Informazione | Schermo | Sé stesso | Stessa stanza | Altra stanza | Regia | Regia cieca |
|---|---|---|---|---|---|---|
| Composizione delle stanze | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Timer, round, numero di ostaggi | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Propria carta | ❌ | ✅ (tieni premuto) | — | — | ✅ | solo la propria, dal telefono |
| Carta altrui | solo in `reveal` | dopo condivisione o rivelazione | dopo rivelazione pubblica | ❌ | ✅ | ❌ |
| Leader durante il round | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Voti per il leader | ❌ | il proprio | ✅ conteggi | ❌ | ✅ | ❌ |
| Leader dopo il blocco di entrambe (e nei round successivi, fino a un cambio) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ostaggi in preparazione | ❌ | il leader | ✅ | ❌ | ✅ | ❌ |
| Ostaggi confermati / scambio | ✅ a scambio pronto | ✅ | ✅ | ✅ | ✅ | ✅ |
| Condivisioni | ❌ | le proprie | ❌ | ❌ | ✅ | ❌ |
| Previsione del Giocatore d'azzardo | in `reveal` | ✅ | ❌ | ❌ | ✅ | ❌ |

### 5.10 Abbinamento alle stanze

Si fa nella fase `pairing`, **prima** di distribuire le carte: chi sceglie la stanza non conosce ancora la propria
carta, quindi non può (per esempio) mettersi apposta lontano dal Bombarolo.

| Modo | Come funziona |
|---|---|
| **A caso** (`random`, default) | Il server divide i giocatori a metà con il seme dello stato. La regia può rimescolare (`shuffle-rooms`) o spostare singoli giocatori |
| **Con i QR** (`qr`) | Lo schermo comune mostra due QR grandi, uno per stanza, **prima di entrare nelle stanze**. Ognuno scansiona il QR della stanza in cui va; il telefono conferma «Sei nel **Salotto**». Si può cambiare scansionando l'altro QR fino alla distribuzione. Una stanza piena (metà dei giocatori, arrotondata per eccesso) rifiuta nuovi ingressi: «Il Salotto è pieno, scegli la Cucina» |
| **Dalla regia** (`host`) | La regia trascina o tocca i giocatori tra le due colonne |

- **Correzioni:** in ogni modo la regia può spostare singoli giocatori (`move-player`) fino alla distribuzione, e
  anche dopo per rimediare (§5.7).
- **Chi non si è abbinato** quando la regia distribuisce le carte va a caso nella stanza più vuota.
- **Equilibrio:** le stanze non devono differire di più di un giocatore. Con l'abbinamento della regia «Distribuisci
  le carte» resta disattivato finché le stanze non sono bilanciate (con un avviso), negli altri modi è garantito.
- **I QR** riusano il meccanismo di Caccia ai Fantasmi: il link è `/play?stanza=CODICE` con un codice casuale
  generato a ogni partita (così una foto del QR di una serata precedente non vale). Si scansionano con lo scanner
  dell'app (caricato a richiesta, fuori dal pacchetto principale del telefono), con la fotocamera di sistema o
  digitando il codice. La fotocamera nel browser richiede HTTPS: col tunnel funziona, sulla LAN `http://` restano
  la fotocamera di sistema, il codice a mano e i due pulsanti «Salotto» / «Cucina» come ultima possibilità.
- **Cosa non è:** il QR non verifica dove si trova davvero un telefono durante la partita (lo schermo è in un posto
  solo). Serve a scegliere la stanza all'inizio; da lì in poi si conta sulla correttezza dei giocatori, come nel
  gioco dal vivo.

## 6. Modalità cieca della regia

Per quando il conduttore vuole giocare: la regia conduce la partita senza vedere nulla che un giocatore non veda.

- **Si attiva** dal pannello Live con l'interruttore «Gioco anch'io (regia cieca)», di norma prima di distribuire
  le carte (comando `set-blind`). Si può attivare anche più tardi, ma ormai la regia può aver visto qualcosa.
- **Cosa vede la regia cieca:** esattamente le informazioni dello schermo comune (stanze, timer, round, leader dopo
  lo sblocco, scambi), più lo stato tecnico necessario a condurre (chi è connesso, quanti hanno visto la carta,
  se i leader hanno confermato gli ostaggi, ma non chi hanno scelto). La propria carta la vede dal telefono, come
  tutti.
- **Cosa resta possibile:** avviare e chiudere i round, pausa e ripresa, nominare un leader, spostare un giocatore
  nell'altra stanza, avanzare. Non è possibile `set-hostages` (richiederebbe di vedere le scelte).
- **Il segreto non deve arrivare al browser:** in modalità cieca `hostView` **non contiene** carte, condivisioni,
  voti e scelte degli ostaggi: non basta nasconderle nell'interfaccia. Lo verificano un test anti-leak su
  `hostView` e lo scenario e2e sui frame WebSocket del socket della regia.
- **Disattivarla** chiede conferma («Vedrai tutte le carte: la tua partita non sarà più valida») e lo schermo
  comune mostra un avviso discreto «La regia vede le carte», per trasparenza verso gli altri giocatori.
- **Limiti accettati:** lo snapshot della partita nel database (`match_state_snapshots`) contiene lo stato
  completo, e la regia ha accesso al PC: la modalità cieca è una regola d'onore assistita, non una protezione.
  Nemmeno il link del Game Master serve qui: il gioco non lo usa.
- **Generalizzazione possibile** (non in questo piano): la stessa idea servirebbe anche a Parole Mannare. Se si
  rivela utile, la si porta nell'engine come campo facoltativo `hostView(state, { blind })`.

## 7. Personaggi

Il codice definisce un catalogo di personaggi; l'istanza sceglie quali usare. Ogni personaggio ha squadra,
descrizione (in `rulesText.ts`), eventuali restrizioni su ciò che può mostrare ed eventuale scelta finale. Gli
effetti sotto vengono dalle schede dei personaggi pubblicate su
[UltraBoardGames](https://www.ultraboardgames.com/two-rooms-and-a-boom/blue-character-cards.php) (il *Character
Guide* ufficiale non l'ho letto direttamente): sono riassunti, e nell'app vanno riscritti con parole nostre.

### 7.1 Personaggi della prima versione

| Personaggio | Squadra | Effetto | Tappa |
|---|---|---|---|
| Presidente | Blu | Deve stare lontano dal Bombarolo | MVP |
| Bombarolo | Rossa | Deve finire nella stanza del Presidente | MVP |
| Membro Blu / Membro Rosso | Blu / Rossa | Nessuno | MVP |
| Giocatore d'azzardo | Grigia | Prima della rivelazione dichiara chi vince | MVP |
| Figlia del Presidente / Martire | Blu / Rossa | Riserve di Presidente e Bombarolo se sepolti | Fase 2 (con la carta sepolta) |

Nessuno di questi conta le condivisioni: con il solo MVP «Mostra» e «Scambia» hanno lo stesso effetto sul gioco.

### 7.2 Quali personaggi contano le condivisioni

Nel regolamento la **condivisione della carta** (*card share*) è uno scambio reciproco e consensuale; la
**rivelazione** è a senso unico. I personaggi qui sotto reagiscono **solo alla condivisione**, quindi un «Mostra»
a senso unico non li attiva. Per questo l'app deve avere entrambe le azioni e registrare ogni condivisione.

**Condizioni di vittoria della squadra** (i più usati, i primi da aggiungere):

| Personaggio | Squadra | Condizione |
|---|---|---|
| Medico (riserva: Infermiera) | Blu | Il Presidente deve **condividere la carta** con il Medico entro la fine, altrimenti la Blu perde |
| Ingegnere (riserva: Meccanico) | Rossa | Il Bombarolo deve **condividere la carta** con l'Ingegnere entro la fine, altrimenti la Rossa perde |
| Cavaliere del Martedì | Blu | Se condivide la carta con il Bombarolo la partita finisce subito e vince la Blu |
| Dottor Boom | Rossa | Se condivide la carta con il Presidente la partita finisce subito e vince la Rossa |

**Effetti su chi condivide** (chi condivide con loro riceve una condizione o perde la carta):

- prendono o scambiano la carta: Alieno, Ladro di corpi, Cacciatore, Ladro d'identità, Patata bollente (grigio:
  chi condivide con lui deve scambiarsi la carta);
- danno una condizione: Criminale (diventi «timido»), Spacciatore («sprovveduto»: non puoi rifiutare una
  condivisione), Teppista («riservato»), Professore («esperto»), Mummia («maledetto», non puoi fare rumore),
  Gorgone (non puoi votare), Ipnotizzatore, Pifferaio (devi finire nella sua stanza), Cospiratore (diventi
  «traditore»), Vampiro, Lupo mannaro, Xenomorfo, Centopiedi;
- tolgono le condizioni: Medico da campo, Spazzino, Lealista, Psicologo.

**Obiettivi personali** (grigi): Clone e Robot (dipendono dal primo con cui condividono), MI6 (deve condividere con
Presidente e Bombarolo), Tiranno nucleare (vince se né Presidente né Bombarolo condividono con lui).

**Limitano o impongono le condivisioni:**

| Personaggio | Regola |
|---|---|
| Timido | Non può mostrare nessuna parte della carta |
| Riservato | Può solo condividere il colore |
| Negoziatore | Può solo condividere la carta (niente rivelazioni né colore) |
| Paranoico | Può condividere la carta una sola volta per partita |
| Esibizionista | Può solo rivelare a tutta la stanza |
| Sprovveduto | Non può rifiutare una proposta di condivisione |
| Agente | Una volta per round costringe un giocatore a condividere la carta con lui |
| Tutore dell'ordine | Una volta per round costringe due giocatori a condividere tra loro |
| Prepotente | Chi accetta di condividere il colore con lui deve invece mostrare tutta la carta |

**Contano le rivelazioni, non le condivisioni:** Usurpatore, Pirata, Arruolato, Sicurezza, Canguro, Ninja, Topo,
Signore del Tempo, Sindaco (rivelazione pubblica per attivare un potere); Interrogatore, Buttafuori, Cupido, Padre,
Madre (rivelazione privata).

**Cosa comporta per l'app:**
- il registro `shares` distingue `card-share`, `color-share` e le rivelazioni: le condizioni si calcolano da lì,
  con funzioni pure;
- le restrizioni (Timido, Riservato, …) si controllano sul server e il telefono nasconde i pulsanti non permessi;
- i personaggi che **scambiano le carte** (Alieno, Ladro d'identità, Patata bollente) cambiano la carta di un
  giocatore durante la partita: lo stato deve permetterlo fin dall'inizio (la carta attuale di ognuno, non solo
  quella distribuita), e la regola «una carta ricevuta è pulita» va gestita;
- i personaggi che **spostano persone** (Canguro, Ninja, Buttafuori, Topo) toccano le stanze fuori dallo scambio
  degli ostaggi: complessi, da tenere per ultimi;
- quelli che impongono comportamenti a voce (Mummia, Angelo, Demone, Mimo, Clown) sono solo testo sulla carta.

Fase 2 (confermata, §2): Medico/Ingegnere (con le riserve), Timido, Riservato, Negoziatore, Sprovveduto, Agente,
Angelo/Demone, Spie (carta del colore opposto alla squadra), carta sepolta con Figlia del Presidente e Martire.

## 8. Interfacce

### 8.1 Telefono del giocatore (fase `round`)

```
┌──────────────────────────┐
│ Salotto · Round 2 · 1:47 │
│ Leader: Carla            │  ← solo la propria stanza, fino allo sblocco
│ ──────────────────────── │
│ [ Tieni premuto: carta ] │
│ ──────────────────────── │
│ Nella stanza:            │
│  Anna   Bruno   Carla ★  │  ← tocca un nome: vota / nomina / mostra / scambia
│  Dario  Elena   Fabio 2✋ │
│ ──────────────────────── │
│ Carte viste: Bruno 🔵    │
│ ℹ️ Regole                 │
└──────────────────────────┘
```

- **Tocca un nome** → foglio dal basso con le azioni permesse (vota come leader, nomina, «Mostra la carta», «Mostra il colore», «Scambia» carta o
  colore, mostra la tua carta, passa la leadership se sei il leader).
- **Offerta in arrivo**: a tutto schermo, con Accetta/Rifiuta e scadenza; vibrazione dove esiste (non su iOS).
- **Leader**: in più la scheda «Ostaggi (0/2)» con i nomi da selezionare; dopo il blocco, «Conferma gli ostaggi».
- **Fine round**: suono e vibrazione (una stanza non ha la TV: il telefono deve bastare). Poi «In attesa che
  l'altra stanza blocchi il leader…», quindi i due leader, quindi lo scambio. Gli ostaggi vedono a tutto schermo
  «Sei un ostaggio: vai in **Cucina**».
- **Con 15 persone in una stanza** l'elenco deve stare in una schermata senza scorrere: griglia a 3 colonne, da
  verificare con Playwright con 15 nomi lunghi.
- **Il telefono non va mostrato agli altri** (§9): la schermata principale contiene la lista «Carte viste», che
  rivelerebbe le carte di terzi.

### 8.2 Regia (pannello Live)

Vista dedicata (`Host`, caricata a richiesta) a due colonne, una per stanza: giocatori con carta, leader e stato
del blocco, voti, ostaggi scelti, più il registro delle condivisioni. Pulsanti: avvia round, chiudi round,
pausa/ripresa, avanti; per ogni giocatore «Sposta nell'altra stanza» e «Nomina leader»; interruttore della modalità
cieca. In modalità cieca la stessa vista mostra solo le informazioni del §6.

### 8.3 Schermo comune

- **Abbinamento:** i due QR grandi (uno per stanza, con il nome) e sotto le due colonne che si riempiono man mano; con l'abbinamento a caso o della regia, solo le colonne.
- **Sempre:** le due stanze affiancate con i nomi (e gli avatar) di chi c'è, round, timer grande, ostaggi del round.
- **Durante il round:** nel primo round nessun leader, nei successivi quelli dell'ultimo blocco («Leader al round
  precedente»); nessuna informazione sulle condivisioni, nemmeno un contatore anonimo (§2).
- **Al blocco:** «In attesa del leader del Salotto…», poi i due leader con un'animazione. Nei round successivi i leader restano in vista, con la scritta «Leader al round precedente» finché non arriva il blocco nuovo.
- **Prima del round successivo:** chi dei due leader ha premuto «Avvia il round» e il conto alla rovescia.
- **Allo scambio:** frecce con i nomi degli ostaggi che passano da una colonna all'altra.
- **Rivelazione:** Presidente e Bombarolo evidenziati, animazione del botto (CSS e sprite liberi, niente PixiJS),
  carte di tutti, squadra vincitrice.
- In modalità cieca disattivata a partita iniziata: avviso «La regia vede le carte».

### 8.4 Grafica: ispirata alla versione stampabile

Decisione: il look si ispira al *print and play* e al regolamento ufficiale. Lì lo stile è **piatto e
grafico**: rosso acceso e bordeaux per la squadra Rossa, blu per la Blu, grigio per i neutrali; carte verticali con
il nome del personaggio scritto in grande lungo il bordo («YOU ARE THE…»), fascia colorata in basso con il nome della
squadra (la «barra del colore», cioè la parte che si mostra con una rivelazione del colore), icone semplici (stella
per la Blu, bomba per la Rossa, punto di domanda per il grigio), candelotti di dinamite come motivo, caratteri senza
grazie molto pesanti in maiuscolo.

**Cosa non si può fare:** copiare le immagini, i loghi o i file del *print and play*. Sono © 2014 Tuesday Knight
Games, il nome è un marchio, e nelle fonti consultate non c'è nessuna licenza libera (a differenza degli sprite
Kenney CC0 che il progetto usa altrove). Se l'utente ha i file stampabili, restano fuori dal repository.

**Cosa si fa:**
- un **tema nuovo, `boom`** (confermato), accanto a `gameshow`, `pixel`, `manga` e `retro80`: variabili CSS con la
  palette rosso/blu/grigio, un font libero e locale simile al Gotham Ultra del regolamento (es. **Montserrat Black**,
  licenza OFL), suoni del tema;
- la **carta sul telefono** disegnata da noi in CSS/SVG con la stessa struttura: nome verticale, icona della squadra,
  barra del colore in basso. La vista «solo colore» mostra proprio e solo quella barra, a tutta altezza;
- **icone e dinamite** disegnate da noi in SVG (leggere: il telefono resta sotto ~1,5 MB);
- l'**esplosione** della rivelazione solo sullo schermo comune, con CSS e particelle semplici.

Aggiungere un tema tocca il pacchetto dei temi (`data-theme`, font locali, `/preview` nei 5 temi, test sui temi):
è previsto dall'architettura (D7 di `PIANO.md`) e va riportato in `PIANO.md` e nell'elenco dei temi di `CLAUDE.md` al passo T7.

## 9. Mostrarsi il telefono di persona: i limiti

Con le carte vere ci si mostra la carta; con l'app la tentazione è girare il telefono. Funziona, ma ha quattro
problemi:

1. **Mostra più del dovuto.** Sulla schermata principale c'è la lista «Carte viste»: chi gira il telefono rivela
   anche le carte di altri giocatori. E un colore mostrato dal telefono può lasciar intravedere il personaggio.
2. **Il server non lo sa.** I personaggi che contano le condivisioni (§7.2, es. il Medico, che vale solo se il
   Presidente ha condiviso la carta con lui) non si possono verificare.
3. **Aggira le restrizioni.** Un Timido o un Riservato, girando il telefono, mostra tutto. Lo stesso vale per la
   regola «colore solo con più di 10 giocatori».
4. **Condivisione non atomica.** Con «Scambia» nell'app entrambi vedono o nessuno; di persona uno può guardare e
   poi tirarsi indietro (per mostrare senza reciprocità c'è già il pulsante «Mostra»).

**Proposta:** le regole spiegate nell'app dicono che **le carte si mostrano solo con l'app** e che il telefono non
si gira verso gli altri; la carta resta dietro «tieni premuto» e il telefono nasconde la lista «Carte viste» se non
la si apre. Resta una regola d'onore, come non sbirciare le carte in un gioco da tavolo.

## 10. Test

- **Unit test** (`stanze-col-botto.test.ts`): distribuzione delle carte da 6 a 30 giocatori (squadre pari, Presidente e
  Bombarolo sempre presenti, Giocatore d'azzardo solo con i dispari); abbinamento a caso bilanciato, con i QR (stanza piena rifiutata, codice sbagliato rifiutato, cambio di stanza permesso fino alla distribuzione, non abbinati assegnati alla stanza più vuota) e forzato dalla regia; nessuna carta prima della distribuzione; tabella degli ostaggi e
  `roundMode` (`long` sotto gli 11 giocatori ripiega su `base`); nomina (non di sé stessi), abdicazione (non
  restituibile nello stesso round), voto: leader con più della metà, voti azzerati dopo il cambio, pareggi senza effetto; blocco a fine round,
  elezione d'emergenza e estrazione a caso; leader rivelati solo con entrambe le stanze bloccate, e un cambio di leader nascosto all'altra stanza fino al blocco successivo; avvio del round con entrambi i leader, a 5 s dal primo, a 15 s dallo scambio o col comando della regia (vince la prima scadenza); tabelle `base` e `long` per ogni numero di giocatori; il leader non può
  essere ostaggio; ostaggi completati a caso se mancano; scelte entro `GRACE_MS` accettate, dopo rifiutate;
  «Mostra» a senso unico (nessuna informazione torna a chi mostra), «Scambia» solo con consenso; entrambi solo nella stessa stanza, colore secondo `colorShare`, scadenza, una sola offerta in attesa;
  esito per tutte le combinazioni; Giocatore d'azzardo; pausa e ripresa; contratto di `registry.test.ts`.
- **Anti-leak** (scorrimento dello stato a ogni passo): carte mai in `screenView` prima di `reveal`; nel `viewFor`
  solo la propria carta e quelle ottenute con condivisioni o rivelazioni; una condivisione di colore non manda mai
  il personaggio; **leader e voti di una stanza mai nel `viewFor` dell'altra né in `screenView` prima dello
  sblocco**; ostaggi in preparazione solo al leader; **`hostView` in modalità cieca senza carte, condivisioni,
  voti e scelte degli ostaggi**; un «Mostra» arriva solo al destinatario (o alla sua stanza) e non manda nulla in cambio a chi mostra.
- **Anteprima** (`/preview`, scene `scb-*` nel tema `boom` e nei 4 temi esistenti): carta nascosta, colore, carta intera, offerta in arrivo,
  usurpazione, attesa del blocco, leader rivelati, scelta e conferma degli ostaggi, ostaggio in viaggio, rivelazione;
  overflow con **15 giocatori** in una stanza e nomi lunghi, schermo con 30 nomi.
- **End-to-end** (`e2e/stanze-col-botto.spec.ts`): regia, schermo e 6–8 telefoni (più uno scenario con 11 per il colore);
  abbinamento con i QR (link `/play?stanza=…` e codice a mano, stanza piena), a caso e spostamento dalla regia;
  voto e nomina del leader, abdicazione, «Mostra» privato e a tutta la stanza, «Scambia» accettato e rifiutato, blocco e rivelazione
  dei leader, ostaggi, tre round, Giocatore d'azzardo, rivelazione e punti; una partita in modalità cieca.
  **Frame WebSocket**: nessuna carta altrui ai telefoni senza condivisione; nessun leader all'altra stanza e allo
  schermo prima dello sblocco; nessun segreto sul socket della regia cieca. Server pulito alla fine.
- **Bot e stress**: strategia `stanze-col-botto` in `tools/bots` (votano e nominano, mostrano e scambiano a caso, il leader
  sceglie gli ostaggi) e `pnpm stress --players 30 --scenario botto` con latenza e orologi sfasati; con 5
  giocatori l'avvio deve essere rifiutato.
- **Pacchetto Windows**: `pnpm package:win` + `pnpm package:check`.

## 11. Domande aperte

Nessuna: tutte le decisioni sono nel §2. Le prossime domande nasceranno dalle prime serate di prova (ritmo con
15 persone per stanza, durata dei round, bilanciamento) o dalla fase 2 dei personaggi.

## 12. Modifiche all'infrastruttura

1. **`minPlayers?` in `MinigameType`** e controllo in `engine.ts` accanto a quello di `maxPlayers` (oggi esiste solo il
   massimo: Parole Mannare dichiara "da 4" ma il minimo non è imposto). Per questo gioco 6; si applica anche a
   Parole Mannare (4). Messaggio: «Stanze col botto: servono almeno 6 giocatori, in serata ce ne sono 5».
2. **Vista `Host` dedicata** nel client (meccanismo già esistente, usato da Stanze Segrete).

Nessuna nuova tabella nel database: le condivisioni vivono nello stato (e negli snapshot). Lo schermo resta uno solo,
quindi niente viste dello schermo per stanza.

## 13. Fasi di lavoro

Ogni passo si chiude con test verdi e una piccola demo; commit semantici separati, solo su richiesta.

| Passo | Contenuto | Verifica |
|---|---|---|
| **T0 Decisioni** ✅ | Domande chiuse con l'utente | Tabella del §2 completa |
| **T1 Infrastruttura** | `minPlayers` in `MinigameType` ed engine (anche per Parole Mannare) | Unit test dell'engine |
| **T2 Logica del plugin (MVP)** | Config, distribuzione, stanze, fasi, leader (voto, nomina, abdicazione, blocco), ostaggi, condivisioni e rivelazioni, Giocatore d'azzardo, esito, punti, comandi della regia, modalità cieca | Unit test del §10 + `registry.test.ts` |
| **T3 Anti-leak** | Scorrimento dello stato, `hostView` cieca compresa | Test anti-leak del §10 |
| **T4 Viste** | Tema `boom`, `Controller`, `Screen`, `Host`, `rulesText.ts`, scene in `/preview` | Asserzioni Playwright su `/preview` |
| **T5 End-to-end** | Scenari del §10 | `pnpm test:e2e`, frame WebSocket |
| **T6 Bot e stress** | Strategia nei bot, scenario `stanze-col-botto` | `pnpm stress --players 30 --scenario botto`; 5 giocatori rifiutati |
| **T7 Documenti e pacchetto** | tema `boom` in `PIANO.md` (D7) e in `CLAUDE.md`, `docs/STANZE-COL-BOTTO.md`, sezione in `PIANO.md`, `GUIDA-HOST.md` (come preparare due stanze, la modalità cieca), riga in `CLAUDE.md` (test richiesti) | `pnpm test`, `pnpm test:e2e`, `pnpm package:win` + `pnpm package:check` |
| **T8 Personaggi fase 2** | Carta sepolta con Figlia del Presidente e Martire; i personaggi proposti nel §7.2 | Unit e anti-leak per ogni personaggio |

## 14. Rischi

- **Logistica fisica**: servono due locali vicini (o due zone lontane) e qualcuno che faccia rispettare la
  separazione. L'app non può verificarla. La guida per l'host deve spiegarlo bene.
- **Il leader segreto all'altra stanza** è una nostra variante (nell'originale la leadership non è mai segreta):
  durante il parlamentare i leader si incontrano comunque, e chi passa da una stanza all'altra come ostaggio può
  raccontarlo. È un'informazione che "trapela" in modo naturale, non un problema dell'app.
- **Ritmo**: con 15 persone per stanza le azioni frequenti (indicare, condividere) devono richiedere al massimo due
  tocchi.
- **Una sola TV**: chi è nella stanza senza TV dipende dal telefono per timer e avvisi; su iOS manca la vibrazione,
  quindi il suono di fine round deve essere chiaro (e l'audio sbloccato con il tocco iniziale).
- **Carico**: 30 telefoni che votano e cambiano voto di continuo generano molti aggiornamenti. Va misurato
  con lo stress test; se serve, si alleggeriscono le viste.
- **Telefoni mostrati di persona** (§9): regola d'onore.
- **Personaggi avanzati**: riassunti da una fonte non ufficiale (§7); prima della fase 2 vanno confrontati con il *Character Guide* e riscritti con parole nostre.
- **Bilanciamento**: il blocco e la rivelazione ritardata dei leader cambiano un po' il gioco originale. Si osserva
  nelle prime serate; simulare la deduzione sociale con i bot è poco affidabile, quindi niente script di
  bilanciamento per ora.
