# Piano: «Cripta Maledetta» (dungeon crawler cooperativo isometrico, telefoni come telecomando)

> Stato: **confermato, da implementare** (nessun codice scritto; si parte da P0, §11). Il gioco a cui ci ispiriamo è
> *Eon Altar*, ma nell'app usiamo nome, mondo, classi e mostri nostri: ambientazione **fantasy classica**, id `cripta`.
> Tutte le decisioni del §2 sono **confermate** dall'utente (il §15 riassume le risposte alle domande aperte).
> I punti che dipendono dal codice esistente sono verificati nel §14.
> Da leggere insieme a [PIANO.md](../PIANO.md) e [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

## 1. Obiettivo

Un'avventura cooperativa in cui un **gruppo di 3–6 eroi** attraversa un sotterraneo a stanze, combatte, raccoglie
bottino, prende decisioni di storia e affronta un boss finale.

- La **TV** mostra la mappa **isometrica** con eroi, mostri, luci, effetti e dialoghi: è lì che si guarda.
- Ogni **telefono** è il comando del proprio eroe: movimento, abilità con ricarica, oggetti, interazioni, voti di
  storia. Il telefono **non ha la mappa**: chi gioca guarda la TV, come con un joypad.
- Combattimento in **tempo reale con ricariche**, ma **tattico e lento** (§5.2): niente riflessi da videogioco
  d'azione, perché tra il dito e lo schermo passano 250–400 ms.
- L'avventura è un **contenuto** (istanza dell'editor), non codice: la v1 ne porta una di 45–60 minuti, poi se ne
  aggiungono altre senza toccare il motore.
- Gli altri giocatori della serata (oltre i 6 eroi) non restano a guardare: fanno da **pubblico** con un ruolo
  leggero (§4.10).

È il **primo gioco in tempo reale continuo** del progetto: tutti gli altri avanzano a fasi, passi o scadenze. Per
questo il piano parte da una fase di fattibilità (P0, §11) che decide se il resto si fa.

## 2. Decisioni

### 2.1 Impianto

| Tema | Decisione |
|---|---|
| Nome e mondo | **«Cripta Maledetta»**, fantasy classico (cavalieri, maghi, scheletri, negromanti) |
| Giocatori | Gruppo cooperativo di **3–6 eroi**; gli altri giocatori della serata sono pubblico |
| Combattimento | **Tempo reale con ricariche**: ogni abilità ha una ricarica; il movimento è continuo sulla griglia |
| Portata | Motore completo + **una sola avventura breve** (45–60 min). Niente progressione tra serate nella v1 |
| Grafica | **Isometrico 2.5D** sulla TV con PixiJS (caricato a richiesta, solo su `/screen`) |

### 2.2 Regole e scelte di dettaglio

| Tema | Decisione | Motivo |
|---|---|---|
| Ritmo | **Tempo reale «tattico»**: velocità eroi ~3 caselle/s, telegrafi dei mostri **≥ 1 s**, ricariche base 2–12 s. Se la prova di guida di P0 lo boccia, si passa a **turni simultanei** brevi (~2 s) | Con 250–400 ms di ritardo complessivo (§5.2) solo un ritmo tattico resta giusto |
| Bersagli | **Automatici** (il nemico più vicino nella direzione in cui guardi), con un pulsante «🎯 Cambia» | Il telefono non ha la mappa: mirare a mano è impossibile |
| Sconfitta | Il gruppo ha **3 candele** (vite, regolabili 0–5): se cadono tutti, si perde una candela e si riparte dall'ingresso della stanza; senza candele l'avventura finisce | Una serata non può buttare 40 minuti per un errore all'ultima stanza |
| Scelta degli eroi | Si **prenotano dal telefono** nella fase `lobby`; in eccesso decide il sorteggio col seme; la regia può spostare chiunque a mano | Funziona senza preparazione; la regia resta padrona |
| Pubblico | Barra delle **benedizioni** riempita a tocchi, voto sugli eventi tra una stanza e l'altra, **punti al pubblico** che ha partecipato se il gruppo vince (§4.10, §4.11) | Coinvolge 20+ persone senza toccare il bilanciamento del gruppo |
| Asset e stile | Lo **stile si decide in P0** in base ai kit isometrici CC0 completi e animati; se nessuno basta, piano B disegnato in codice (§9.2) | Coerenza e licenza contano più della preferenza di stile |
| Tema predefinito | Scelto in P0 insieme allo stile (`pixel` se gli asset sono pixel art) | La scena isometrica ha grafica propria; il tema veste HUD, dialoghi e telefono |
| Game Master | **Facoltativo** (`master: true`): legge i dialoghi e attiva gli eventi scritti nell'avventura; senza GM i dialoghi avanzano da soli o col pulsante della regia | La regia generica basta per giocare |
| Persistenza | **Nessuna nella v1**: gli eroi nascono a ogni avventura; salvataggi e progressione tra serate dopo la prova con persone | Niente tabelle nuove finché il gioco non è provato |
| Mappa nell'editor | Nuovo widget `"map"` (area di testo a larghezza fissa, spazi conservati) | Il widget `"lines"` toglie le righe vuote e segnala i doppioni: le righe di muro si ripetono (§14) |

## 3. Una partita, dal punto di vista di chi gioca

1. **Lobby del round** (~60 s): la TV mostra le quattro classi; sul telefono ognuno tocca «Voglio giocare» e la
   classe preferita. Gli eroi scelti vedono il ritratto della propria classe e il proprio colore; gli altri vedono
   «Sei nel pubblico».
2. **Intro**: la TV racconta l'antefatto (testo dell'avventura, letto dalla regia o dal Game Master).
3. **Esplorazione**: il gruppo entra nella prima stanza. Sul telefono ognuno ha una croce/joystick e il pulsante
   d'azione contestuale («Apri», «Raccogli», «Parla», «Rialza»).
4. **Combattimento**: entrando in una stanza con mostri le porte si chiudono. Si schivano le aree segnate sul
   pavimento, si usano le abilità, il Guerriero attira i mostri, il Chierico cura.
5. **Bottino e livello**: aperto il forziere, gli oggetti compaiono sul pavimento; chi li raccoglie li vede sul
   telefono. Dopo le stanze chiave il gruppo sale di livello e ognuno sceglie un potenziamento sul telefono.
6. **Bivio**: un dialogo propone una scelta («Liberiamo il prigioniero o prendiamo l'oro?»); gli eroi votano.
7. **Boss**: tre fasi, l'ultima richiede coordinamento (due eroi su due piastre insieme).
8. **Fine**: la TV mostra statistiche del gruppo (danni, cure, rialzi, candele rimaste) e i punti della serata.

## 4. Regole (v1)

I numeri sono indicativi: si fissano con la simulazione di P2 (`pnpm balance:cripta`) e vanno poi riportati in
`rulesText.ts`.

### 4.1 Eroi e statistiche

Ogni eroe ha: **PV** (punti vita), **Attacco**, **Difesa**, **Velocità**, **Potere** (scala abilità e cure). Il
danno inflitto è `max(1, round(base × Attacco/10 × (1 − Difesa/(Difesa+20))))`, con un ±10% dal seme dello stato.

Le classi sono **uniche nel gruppo** finché ce ne sono; con 5–6 eroi due classi si ripetono (il sorteggio dà la
priorità a chi ha chiesto la classe per primo).

### 4.2 Classi

| Classe | Ruolo | PV | Abilità 1–4 (ricarica indicativa) | Speciale (si carica) |
|---|---|---|---|---|
| **Guerriero** | Tank | 140 | Fendente (2 s, arco frontale) · Provocazione (10 s, minaccia ×3 per 4 s) · Scudo alzato (8 s, −60% danni frontali per 3 s, rallenta) · Carica (12 s, scatto di 4 caselle, stordisce 1 s) | Grido di guerra: +30% Attacco al gruppo per 8 s |
| **Mago** | Danno ad area | 80 | Dardo (1,5 s, proiettile) · Palla di fuoco (8 s, area 3×3 dopo 0,5 s) · Gelo (10 s, rallenta del 50% in cono) · Teletrasporto (14 s, 4 caselle nella direzione) | Tempesta: area 5×5 per 4 s |
| **Ranger** | Danno a distanza | 100 | Colpo mirato (2 s, portata 7) · Raffica (9 s, 3 colpi a ventaglio) · Trappola (12 s, immobilizza 2 s chi la calpesta) · Balzo (10 s, 3 caselle all'indietro) | Pioggia di frecce: tutti i mostri visibili, danno ridotto |
| **Chierico** | Cura e supporto | 100 | Cura (3 s, l'alleato più ferito in portata 5) · Benedizione (12 s, +20% Difesa al gruppo per 6 s) · Scudo sacro (10 s, assorbe 40 danni su un alleato) · Purifica (8 s, toglie veleno e rallentamento) | Resurrezione: rialza **tutti** gli eroi a terra al 50% |

- Lo **speciale** si carica col danno fatto e ricevuto, le cure e i rialzi (0–100%): quando è pieno il pulsante si
  illumina. Evita un'altra ricarica a tempo e premia chi partecipa.
- **Direzione**: ogni eroe guarda verso l'ultima direzione di movimento; le abilità «frontali» usano quella.
- **Abilità di movimento** (Carica, Teletrasporto, Balzo) si fermano al primo muro: mai dentro un muro.

### 4.3 Movimento

- Continuo su griglia: la posizione è in **centesimi di casella** (interi, §5.3), 8 direzioni dalla croce.
- Collisioni contro i muri (cerchio contro caselle); eroi e mostri si respingono dolcemente (nessun blocco totale:
  un eroe non resta mai incastrato tra due compagni).
- **Porte**: aperte in esplorazione; si chiudono quando tutto il gruppo è entrato in una stanza con mostri (chi è
  rimasto fuori viene portato dentro dopo 5 s, con un avviso sul telefono).

### 4.4 Combattimento

- **Mostri** (~8 tipi nella v1): scheletro (mischia), arciere (distanza), ratto (sciame, deboli), sacerdote (cura i
  mostri), golem (lento, colpi ad area), spettro (attraversa i muri bassi), melma (si divide), negromante (evoca).
- **Minaccia**: ogni mostro tiene un valore per eroe (danno ricevuto, cure fatte nelle vicinanze, Provocazione). Il
  bersaglio è l'eroe con più minaccia, se entro 1,5× la distanza del più vicino; altrimenti il più vicino.
- **Telegrafi**: gli attacchi forti dei mostri segnano sul pavimento l'area colpita per **1–1,5 s** prima di
  colpire (rosso che si riempie). Si schivano uscendo dall'area. È la principale abilità richiesta ai giocatori.
- **Stati**: rallentato, stordito, immobilizzato, avvelenato, protetto. Ogni stato ha un istante di fine assoluto
  (`until`), mai un contatore.
- **Scalatura**: PV e numero dei mostri crescono col numero di eroi (tabella in `adventure.ts`, tarata in P2).

### 4.5 Caduta e rialzo

- A 0 PV un eroe **cade**: resta sulla mappa, il telefono mostra «A terra — aspetta un compagno».
- Un compagno lo **rialza** restando entro 1 casella per 3 s col pulsante «Rialza» (interrompibile se si muove o
  viene colpito); l'eroe torna al 30% dei PV. La Resurrezione del Chierico rialza tutti subito.
- **Tutti a terra** → si perde una candela, la stanza si azzera (mostri, porte, forzieri non aperti) e il gruppo
  riparte dall'ingresso con PV pieni. **Senza candele** → sconfitta.

### 4.6 Bottino e inventario

- **Forzieri** (contenuto fissato nell'avventura o estratto dal seme da una tabella) e **mostri** lasciano oggetti a
  terra; li raccoglie chi ci passa sopra col pulsante «Raccogli».
- **Equipaggiamento**: tre posti (arma, armatura, amuleto) con bonus alle statistiche. Al raccoglierlo il telefono
  mostra il confronto con l'oggetto attuale: «Equipaggia», «Tieni nello zaino», «Dai a…» (solo a un compagno entro 2
  caselle).
- **Consumabili**: pozioni (cura 50%) e pergamene (un'abilità una tantum). Zaino da 6 posti.
- Il **contenuto di un forziere chiuso** non è in nessuna vista finché non viene aperto (§7.7).

### 4.7 Livelli

- Il gruppo sale di livello dopo ogni **stanza chiave** (segnata nell'avventura), fino al livello 4.
- Ogni eroe sceglie **uno di due potenziamenti** della propria classe (es. «Palla di fuoco più grande» o «Dardo
  rimbalzante»). Scelta sul telefono con 20 s di tempo; allo scadere vale il primo. Il gioco è fermo durante la
  scelta (fase `levelup`).

### 4.8 Storia e bivi

- **Dialoghi**: riquadri di testo sulla TV, con ritratto di chi parla; si avanza col pulsante della regia (o del Game
  Master) o in automatico dopo un tempo proporzionale alla lunghezza.
- **Bivi**: voto degli eroi con il modulo `team-vote` (`createVote`, `castVote`, `resolveVote`): 30 s, maggioranza;
  in parità decide il seme. Durante il voto il gioco è fermo.
- Le scelte possono: cambiare il bottino, aprire o chiudere una stanza facoltativa, attivare un aiuto o un malus
  nel boss (es. il prigioniero liberato combatte con il gruppo per una fase).

### 4.9 Boss

- Tre fasi (a 100%, 66% e 33% dei PV), ognuna con un'animazione d'ingresso e il gioco fermo per 2 s.
- Meccaniche: aree telegrafate a ondate, evocazione di aiutanti, **zone da lasciare** (il pavimento si sgretola) e
  **piastre**: due eroi su due piastre diverse per 2 s rendono il boss vulnerabile. Le piastre si giudicano dalle
  posizioni, quindi non serve l'ora equa.

### 4.10 Pubblico

Chi non è un eroe ha sul telefono:

- **Benedizione**: un pulsante con ricarica di 3 s per persona. Ogni tocco riempie una barra condivisa (visibile
  solo sulla TV); a barra piena il gruppo riceve una benedizione (cura del 25% o scudo di 30 per 6 s, alternate dal
  seme). La barra si riempie al massimo una volta ogni 60 s, così il pubblico aiuta senza rendere il gioco banale.
- **Eventi tra le stanze**: ogni tanto la TV propone due eventi («Un mercante: pozioni per tutti» o «Un'imboscata:
  più bottino ma più mostri»); vota il pubblico con `team-vote`.
- Il telefono del pubblico mostra solo la **propria ricarica** e l'eventuale voto: mai la barra o lo stato del
  gruppo, che cambiano di continuo (§5.6).

### 4.11 Punti della serata

| Voce | Chi | Default |
|---|---|---|
| Stanza liberata | Ogni eroe | 20 |
| Vittoria sul boss | Ogni eroe | 100 |
| Candela rimasta | Ogni eroe | 25 |
| Contributo individuale | I primi 3 eroi per contributo (danno + 2×cure + 30×rialzi + minaccia assorbita, normalizzati per classe) | 30 / 20 / 10 |
| Vittoria del gruppo | Ogni persona del pubblico che ha toccato almeno una benedizione | 40 |

I punti si scrivono in `score_entries` tramite `scores()` a fine round, come per ogni plugin.

## 5. Il tempo reale dentro i vincoli del progetto

### 5.1 Cosa offre già il server

- Tick ogni **100 ms** (`setInterval(realtime.tick, 100)`): `onTick(state, now)`.
- Invii delle viste **accorpati** (al massimo uno ogni 80 ms, `DEFAULT_FLUSH_MS`) e **viste identiche non
  rimandate** a un telefono (`flush` in `realtime.ts`). Ogni invio contiene la **vista intera**, non le differenze.
- Al più **20 input al secondo** per giocatore (`inputLimiter`); messaggi in arrivo fino a 64 KB.
- `fairTime` e `meta.claimedTime` per l'ora equa; orologio sincronizzato (`clock`) nelle viste.

### 5.2 Bilancio dei ritardi

| Tratto | Tempo tipico |
|---|---|
| Telefono → server (rete cellulare + Quick Tunnel) | 50–150 ms |
| Attesa del prossimo passo di simulazione | 0–100 ms |
| Accorpamento dell'invio | 0–80 ms |
| Server → TV (di solito in LAN o sullo stesso PC) | 5–20 ms |
| Interpolazione sulla TV (§9.4) | 100 ms |
| **Totale dal dito allo schermo** | **~250–400 ms** |

Conseguenze sul disegno del gioco: telegrafi di almeno 1 s, mostri lenti, nessuna abilità che richieda tempismo
sotto il mezzo secondo, schivata come spostamento (non come pulsante). P0 lo misura con telefoni veri via tunnel.

### 5.3 Simulazione a passo fisso, pura

- La logica è una **griglia 2D**: l'isometria è solo il disegno. Collisioni, percorsi e portate si calcolano in
  caselle; posizioni e velocità sono **interi in centesimi di casella** (JSON stabile, nessun dubbio sui decimali).
- `advance(state, t)` esegue passi da 100 ms fino a `t`: movimento, ricariche, IA, proiettili, danni, stati,
  telegrafi. È una funzione pura: stessi input con gli stessi istanti → stesso stato.
- `onInput` prima porta la simulazione a `meta.receivedAt` con `advance`, poi registra l'intenzione: lo stato è
  funzione degli input con il loro istante di arrivo, indipendente da quando arriva il tick.
- `onTick(state, now)` chiama `advance(state, now)`. Se non c'è nulla in movimento (esplorazione con tutti fermi,
  dialogo, voto) restituisce **lo stesso oggetto** (contratto di `registry.test.ts`).
- **Salti di tempo**: se tra due tick passano più di 2 s (PC sospeso, debugger), la simulazione esegue al massimo
  20 passi e tratta il resto come una pausa (sposta tutti gli istanti assoluti, come la pausa della regia). Il test
  di contratto avanza di 30 s per tick e non deve far morire il gruppo.
- La casualità (danni, IA, bottino) usa il seme nello stato (`makeRng`/`deriveSeed` già usati dagli altri plugin).

### 5.4 Intenzioni dal telefono

| Intenzione | Quando parte | Note |
|---|---|---|
| `move { dir }` | Al cambio di direzione **e ogni 1 s** mentre il dito resta giù | `dir` = una di 8 direzioni o `"stop"`. Se il server non riceve nulla da 1,5 s l'eroe si ferma: copre telefoni bloccati, disconnessioni e dita che escono dallo schermo |
| `skill { slot }` | Alla pressione | Rifiutata se `now < readyAt` o se l'eroe è a terra/stordito. Il bersaglio è automatico |
| `target { cycle }` | Alla pressione | Passa al bersaglio successivo in portata; la TV lo cerchia col colore dell'eroe |
| `interact` | Alla pressione | Azione contestuale (apri, raccogli, parla, rialza tenendo premuto) |
| `item { slot, action }` | Dal menu zaino | Usa, equipaggia, dai a un compagno vicino |
| `choose { option }` | In `levelup` | Potenziamento |
| `vote { option }` | Bivi ed eventi | Modulo `team-vote` |
| `bless` | Pubblico | Ricarica di 3 s per persona |
| `ping` | Alla pressione | «Dove sono?»: l'eroe lampeggia sulla TV per 1 s |

Con il tasto tenuto premuto un eroe manda ~1 messaggio al secondo; 6 eroi a raffica di abilità restano molto
sotto il limite di 20/s. Il pubblico (fino a 24 persone, un tocco ogni 3 s) aggiunge ~8 input/s.

### 5.5 Ricariche e scadenze come istanti assoluti

Ricariche (`readyAt`), stati (`until`), telegrafi (`hitsAt`), rialzi (`reviveDoneAt`): tutti in **ora server**. Il
telefono disegna l'anello di ricarica da solo con `clock`, quindi la sua vista **non cambia** mentre la ricarica
scorre. La pausa della regia sposta tutti questi istanti in avanti della durata della pausa (come in
`pilota-cieco`).

### 5.6 Viste e traffico

- **TV** (`screenView`): stanze visitate, eroi, mostri visibili, proiettili, telegrafi, oggetti a terra, numeri di
  danno recenti, barra delle benedizioni, dialogo corrente. Stima: 6 eroi + 20 mostri + 10 effetti × ~60 byte +
  mappa visitata ~2 KB → **~4–5 KB per invio**, ~10 invii/s in combattimento → **~50 KB/s** verso la TV (in LAN).
- **Telefono di un eroe** (`viewFor`): solo il proprio eroe (PV, stati, ricariche, speciale, zaino, azione
  contestuale, bersaglio corrente come nome), la stanza corrente come nome, la fase, l'eventuale voto. **Niente
  posizioni**, niente PV dei compagni: cambiano di continuo e annullerebbero la deduplicazione. In combattimento
  cambia 1–3 volte al secondo (colpi ricevuti), solo per quel telefono.
- **Pubblico**: fase, propria ricarica, eventuale voto. Quasi mai cambia.
- **Regia** (`hostView`): mappa intera, mostri non ancora incontrati, contenuto dei forzieri, scelte dei bivi,
  pulsanti (§7.5). Cambia come la TV: va bene, la regia è una sola pagina.
- La mappa visitata viaggia a ogni invio perché `realtime.ts` manda viste intere. Se in P0 risulta un problema,
  si valuta una parte statica con versione (`mapVersion`) che il client tiene in memoria: è una modifica a
  `realtime.ts` e richiede i suoi test (`realtime-flush.test.ts` e gli altri elencati in CLAUDE.md), quindi solo se
  le misure lo chiedono.

### 5.7 Equità

È cooperativo: nessuno gareggia contro un altro sulla velocità. La ricarica parte all'arrivo sul server
(`receivedAt`) e il `fairTime` non serve. Le piastre del boss si giudicano dalle posizioni nella simulazione. I voti
usano la scadenza in ora server di `team-vote`.

### 5.8 Nebbia di guerra

Le stanze non visitate non sono nelle viste (né TV né telefoni). I mostri di una stanza entrano nelle viste solo
quando il primo eroe varca la porta. Lo verifica il test anti-leak (§12).

## 6. Configurazione dell'istanza (`configSchema`)

### 6.1 Parametri

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `adventure` | oggetto (§6.2) | avventura d'esempio | Il contenuto |
| `difficulty` | `"facile" \| "normale" \| "difficile"` | `"normale"` | Moltiplica PV e danni dei mostri (0,75 / 1 / 1,3) |
| `candles` | intero 0–5 | 3 | 0 = nessuna seconda possibilità |
| `heroSlots` | intero 3–6 | 6 | Numero massimo di eroi |
| `lobbySeconds` | intero 20–180 | 60 | Scelta degli eroi |
| `voteSeconds` | intero 10–60 | 30 | Bivi ed eventi |
| `audience` | booleano | `true` | Benedizioni ed eventi del pubblico |
| `points` | oggetto | §4.11 | Una voce per riga della tabella |

### 6.2 L'avventura

```ts
interface Adventure {
  title: string;
  intro: DialogLine[];
  map: string[];                 // righe a larghezza fissa, un carattere per casella (legenda sotto)
  rooms: {
    tag: string;                 // lettera minuscola presente una sola volta nella stanza sulla mappa
    name: string;
    key?: boolean;               // stanza chiave: livello in più alla fine
    optional?: { unlockedBy: string };   // id di un esito di bivio
    encounter?: { waves: { monster: MonsterId; at: string; count?: number }[][] };   // `at` = marcatore maiuscolo
    chests?: { at: string; loot: LootEntry[] | "random" }[];
    onEnter?: string;            // id di un dialogo
  }[];
  dialogs: { id: string; lines: DialogLine[]; choice?: { prompt: string; options: { label: string; outcome: string }[] } }[];
  boss: { room: string; monster: BossId; phases: BossPhase[] };
}
```

Legenda della mappa: `#` muro, `.` pavimento, `+` porta, `@` partenza, `~` acqua/fossa (non si attraversa, i
proiettili sì), `a`–`z` etichetta della stanza (è anche pavimento), `A`–`Z` marcatori per mostri, forzieri, piastre,
spazio = vuoto.

**Validazione** (in `configSchema.superRefine`, con messaggi in italiano per l'editor): righe della stessa
lunghezza; ogni regione di pavimento separata da porte ha esattamente un'etichetta; ogni stanza raggiungibile dalla
partenza; ogni marcatore riferito esiste ed è dentro la stanza giusta; il boss è nell'ultima stanza; gli esiti dei
bivi riferiti esistono; dimensione massima 64×64.

**Editor**: nella v1 la mappa si scrive come testo nel nuovo widget `"map"` (carattere a larghezza fissa, spazi e
righe vuote conservati, legenda sotto l'area di testo, errori della validazione evidenziati per riga). Un editor
visuale a pennello è fuori dalla v1.

## 7. Il plugin `cripta`

### 7.1 Stato

```ts
type Fixed = number;                  // centesimi di casella
type Dir8 = "n" | "ne" | "e" | "se" | "s" | "so" | "o" | "no";

interface Hero {
  playerId: string;
  cls: ClassId;
  color: string;
  x: Fixed; y: Fixed; facing: Dir8;
  move: Dir8 | null; moveRefreshedAt: number;
  hp: number; maxHp: number; stats: Stats;
  readyAt: number[];                  // per slot di abilità, ora server
  special: number;                    // 0–100
  effects: { kind: EffectKind; until: number; value?: number }[];
  downAt: number | null; reviveBy: { playerId: string; doneAt: number } | null;
  targetId: string | null;
  gear: { weapon?: Item; armor?: Item; amulet?: Item };
  bag: Item[];
  upgrades: UpgradeId[];
  tally: { damage: number; healing: number; revives: number; threatTaken: number };
}

interface Monster {
  id: string; kind: MonsterId;
  x: Fixed; y: Fixed; facing: Dir8;
  hp: number; maxHp: number;
  threat: Record<string, number>;
  nextActAt: number;
  telegraph: { cells: number[]; hitsAt: number; damage: number } | null;
  effects: { kind: EffectKind; until: number }[];
}

interface State {
  phase: "lobby" | "intro" | "play" | "dialog" | "vote" | "levelup" | "wipe" | "boss-phase" | "victory" | "defeat" | "final" | "done";
  seed: number; rngStep: number;
  cfg: CriptaConfig;
  grid: Grid;                         // muri, porte, stanze: derivati dalla mappa in init
  simTime: number;                    // istante dell'ultimo passo eseguito
  heroes: Hero[];
  audience: { playerId: string; blessReadyAt: number; touched: boolean }[];
  monsters: Monster[];
  projectiles: Projectile[];
  loot: { id: string; item: Item; x: Fixed; y: Fixed }[];
  rooms: Record<string, { visited: boolean; cleared: boolean; chestsOpened: string[] }>;
  currentRoom: string;
  doorsLocked: boolean;
  candles: number;
  groupLevel: number;
  outcomes: string[];                 // esiti dei bivi già decisi
  dialog: { id: string; line: number; until: number | null } | null;
  vote: TeamVote | null;
  blessMeter: number; blessReadyAt: number;
  boss: { phase: number } | null;
  floaters: { id: number; x: Fixed; y: Fixed; text: string; until: number }[];   // numeri di danno, solo TV
  phaseEndsAt: number | null;
  pausedAt: number | null;
}
```

### 7.2 Moduli

```
packages/shared/src/dungeon/      tipi delle viste, proiezione isometrica, direzioni (server e client)
packages/minigames/src/cripta/
  map.ts          lettura e validazione della mappa, regioni, stanze, raggiungibilità
  grid.ts         collisioni, visibilità, flusso dei percorsi (BFS per stanza verso gli eroi)
  sim.ts          advance(): movimento, ricariche, abilità, proiettili, danni, stati, telegrafi
  ai.ts           comportamento dei mostri per tipo (puro, seme nello stato)
  classes.ts      classi, abilità, potenziamenti (dati)
  monsters.ts     tipi di mostro e boss (dati)
  items.ts        oggetti, tabelle di bottino, confronto
  adventure.ts    schema zod dell'avventura, scalatura col numero di eroi
  sample.ts       avventura d'esempio (sampleConfig)
  views.ts        screenView, viewFor, hostView
  index.ts        il plugin: init, onInput, onTick, onHostCommand, isFinished, result, scores
packages/client/src/minigames/cripta/
  CriptaViews.tsx         Screen (contenitore + HUD in React) e Controller (telefono, niente Pixi)
  IsoScene.ts             scena Pixi, caricata con lazy() solo dentro CriptaScreen
  Joystick.tsx            croce a 8 direzioni con `touch-action: none` e invio a cambio + ogni 1 s
  rulesText.ts            regole mostrate nell'app
tools/bots/src/strategy-cripta.ts     bot eroe e pubblico
tools/balance/cripta.ts               pnpm balance:cripta
```

### 7.3 Fasi

```
lobby → intro → play ⇄ dialog / vote / levelup
                  ├─ tutti a terra → wipe → play (candela in meno) │ defeat
                  └─ boss: play ⇄ boss-phase → victory
victory | defeat → final → done
```

| Fase | Cosa succede | Come finisce |
|---|---|---|
| `lobby` | Prenotazioni e classi; la TV mostra le classi e chi le ha scelte | Tempo scaduto o «Inizia» della regia; con meno di 3 eroi l'avvio è rifiutato |
| `intro` | Dialogo d'apertura | Regia/GM o tempo |
| `play` | Simulazione attiva | Dialogo, bivio, livello, tutti a terra, fase del boss |
| `dialog` | Simulazione ferma, testo sulla TV | Regia/GM o tempo |
| `vote` | Simulazione ferma, voto (eroi sui bivi, pubblico sugli eventi) | Tutti hanno votato o scadenza |
| `levelup` | Simulazione ferma, scelta del potenziamento | Tutti hanno scelto o 20 s |
| `wipe` | Animazione, si spegne una candela, la stanza si azzera | 3 s |
| `boss-phase` | Ingresso della nuova fase del boss | 2 s |
| `victory` / `defeat` | Statistiche del gruppo | «Avanti» della regia |
| `final` | Punti della serata | «Avanti» della regia |

### 7.4 Ingressi e controlli

`inputSchema` come nel §5.4, validato con zod. Gli input di chi non è eroe (salvo `bless` e i voti del pubblico),
di un eroe a terra (salvo `ping`) o fuori dalla fase giusta lasciano lo stato identico (contratto di
`registry.test.ts`).

### 7.5 Comandi della regia

`start` (chiude la lobby), `pause`, `resume`, `next` (avanza dialogo o fase finale), `skip-dialog`, `swap-hero`
(sposta un giocatore tra eroi e pubblico, solo in lobby), `revive-all` (aiuto: rialza tutti, `danger`),
`skip-room` (libera la stanza, `danger`), `end` (porta a `final`, `danger`).

La sequenza `start` → `next`/`skip-room` ripetuti deve portare il round a termine con i soli comandi della regia:
è richiesto dal test di contratto. `minPlayers: 3` è controllato dall'engine; il plugin funziona comunque con 2
giocatori (il test di contratto ne usa 2).

### 7.6 Squadre

Il gruppo è uno solo: il plugin **non** dichiara `teamBased` (le squadre della serata non contano). I punti vanno
ai giocatori (`teamId: null`, completato dal server), quindi sommano anche nelle classifiche a squadre. Non si
dichiara `maxPlayers`: oltre i 6 si diventa pubblico.

### 7.7 Chi vede cosa

| Informazione | TV | Eroe (proprio) | Eroe (altri) | Pubblico | Regia |
|---|---|---|---|---|---|
| Stanze visitate, posizioni, PV visibili, telegrafi | ✅ | ❌ (solo il proprio eroe) | ❌ | ❌ | ✅ |
| Stanze non visitate e loro mostri | ❌ | ❌ | ❌ | ❌ | ✅ |
| Contenuto di un forziere chiuso | ❌ | ❌ | ❌ | ❌ | ✅ |
| Oggetto a terra | ✅ (icona) | ✅ quando ci è sopra | ❌ | ❌ | ✅ |
| Zaino e ricariche di un eroe | ❌ | ✅ | ❌ | ❌ | ✅ |
| Esiti dei bivi non ancora votati | ❌ | ❌ | ❌ | ❌ | ✅ |
| Voti dei singoli durante il voto | solo il conteggio | il proprio | ❌ | il proprio | ✅ |
| Barra delle benedizioni | ✅ | ❌ | ❌ | ❌ | ✅ |

Nelle viste le chiavi delle informazioni segrete **non esistono** (nemmeno con valore nullo): il test anti-leak le
cerca nel JSON.

## 8. Interfacce

### 8.1 TV

```
 ┌─ CRIPTA MALEDETTA ── Sala delle Ossa ─────────────── 🕯🕯🕯 ── Liv. 2 ─┐
 │                          ◇ ◇ ◇                                       │
 │                       ◇ ◇ ☠ ◇ ◇ ◇                                    │
 │                    ◇ ◇ ◇ ◇ ▒▒▒ ◇ ◇ ◇        ▒ telegrafo (si riempie)  │
 │                 ◇ ◇ 🛡 ◇ ◇ ▒▒▒ ◇ ☠ ◇ ◇                                 │
 │                    ◇ ◇ ◇ ✦ ◇ ◇ ◇ ◇          ✦ Mago (anello viola)     │
 │                       ◇ 🏹 ◇ ✚ ◇                                       │
 │                          ◇ ◇ ◇                                       │
 ├──────────────────────────────────────────────────────────────────────┤
 │ 🛡 Anna ████████░░  ✦ Luca █████░░░░░  🏹 Sara ███████░░  ✚ Gio ██████ │
 │ Benedizioni del pubblico ▓▓▓▓▓▓░░░░                                  │
 └──────────────────────────────────────────────────────────────────────┘
```

- Scena isometrica a tutto schermo (Pixi, §9); HUD in React sopra (PV del gruppo, candele, livello, nome della
  stanza, barra delle benedizioni), con le variabili del tema.
- Sotto ogni eroe: nome del giocatore e anello del suo colore; il bersaglio di ogni eroe ha un anello sottile dello
  stesso colore.
- Dialoghi in un riquadro in basso con ritratto; i bivi mostrano le opzioni e il conteggio dei voti.

### 8.2 Telefono di un eroe

```
┌──────────────────────────────┐
│ ✦ MAGO · Luca   ❤ 52/80      │
│ 🎯 Scheletro      [ Cambia ] │
│                              │
│      ↖  ↑  ↗      ┌───┐┌───┐ │
│      ←  ●  →      │ 1 ││ 2 │ │
│      ↙  ↓  ↘      └───┘└───┘ │
│                   ┌───┐┌───┐ │
│  [ Apri forziere ]│ 3 ││ 4 │ │
│                   └───┘└───┘ │
│  [🎒 Zaino] [📍]   [★ 78%]   │
└──────────────────────────────┘
```

- Orientamento verticale, nessuno scroll, nessun overflow a 360×640.
- Croce a sinistra (`touch-action: none`, eventi pointer, si trascina anche fuori dai tasti), abilità a destra con
  l'anello della ricarica calcolato da `clock`. Su Android, vibrazione breve quando l'eroe viene colpito o è dentro
  un telegrafo (`navigator.vibrate`, assente su iOS: solo un bordo rosso).
- Pulsante contestuale grande, zaino in un foglio che sale dal basso, «📍» per il `ping`.
- A terra: la croce sparisce, resta «A terra — aspetta un compagno» e il `ping`.

### 8.3 Telefono del pubblico

Un grande pulsante «✨ Benedici» con la propria ricarica, e il voto quando c'è un evento. In lobby: «Voglio essere un
eroe» finché ci sono posti.

### 8.4 Regia

Pannello Live con i pulsanti di `hostView.actions` (§7.5) e un riepilogo testuale: stanza, PV di ogni eroe,
mostri rimasti, candele, prossimo dialogo, esiti dei bivi. Con `master: true` una vista `Host` in
`lazy` mostra la mappa completa e gli eventi scritti nell'avventura.

## 9. Grafica isometrica

### 9.1 Proiezione e ordine di disegno

- Tile 64×32: `schermoX = (x − y) × 32`, `schermoY = (x + y) × 16`; la funzione sta in `shared/dungeon` ed è testata
  (andata e ritorno casella ↔ schermo).
- Livelli: pavimento, oggetti a terra, entità e muri ordinati per `x + y` (poi per livello), effetti, numeri di
  danno.
- I muri tra la camera e un eroe diventano semitrasparenti.
- Camera: inquadra la stanza corrente e tutti gli eroi, con spostamento morbido; in una stanza 16×16 il pavimento
  sta tutto in 1920×1080.

### 9.2 Asset

- **Il rischio maggiore sono gli asset**, non il codice: servono tile, eroi, mostri e boss con **stile coerente**,
  animazioni (ferma, corsa, attacco, colpita, a terra) e **licenza libera** senza account (niente negozi di asset).
- In P0 si cercano kit isometrici **CC0** (Kenney, OpenGameArt) e si verificano licenza, stile, orientamento (4 o 8
  direzioni) e animazioni. I file e le licenze si annotano in `docs/CRIPTA.md`.
- **Piano B**: eroi e mostri disegnati in codice (forme, gradienti, ombre, contorni) su tile generati in codice, con
  animazioni di schiacciamento/allungamento, particelle e lampi. Meno ricco ma coerente e a costo zero.
- Budget: asset della TV ≤ 10 MB, serviti dal server locale (funziona anche senza internet) e inclusi nel pacchetto
  Windows; il telefono non li scarica.

### 9.3 Caricamento

`registry.ts` importa le viste in modo statico ed è usato anche da `/play`: `CriptaViews.tsx` finisce quindi nel
pacchetto del telefono. Per questo `CriptaScreen` carica la scena con `lazy(() => import("./IsoScene"))` e Pixi
non viene mai importato altrove. P0 e P6 verificano che il pacchetto di `/play` non contenga Pixi e resti sotto
~1,5 MB.

### 9.4 Fluidità

- La TV riceve ~10 istantanee al secondo e disegna a 60 fps **interpolando** tra le ultime due (con 100 ms di
  ritardo voluto); proiettili e telegrafi si disegnano dal loro istante assoluto con `clock`.
- Effetti puramente visivi (scintille, scossa dello schermo, polvere) nascono sul client dagli eventi della vista,
  mai dal server.
- Obiettivo: 6 eroi + 20 mostri + effetti a 60 fps su un PC con GPU integrata; senza GPU (Edge dei test, WebGL
  software) basta che la scena funzioni.

### 9.5 Verifica senza screenshot

Come da CLAUDE.md: la scena espone un oggetto di prova (`window.__cripta`, solo con `?debug=1` o in `/preview`) con
entità disegnate, posizioni proiettate, ordine di disegno, numero di sprite e frame al secondo. I test Playwright
controllano quello, il DOM dell'HUD e i frame WebSocket.

## 10. Bot e bilanciamento

- **Bot eroe** (`strategy-cripta.ts`): legge la propria vista e, per muoversi, la `screenView` (come un giocatore
  che guarda la TV); va verso il bersaglio o si tiene a distanza secondo la classe, esce dai telegrafi con un tempo
  di reazione configurabile (300–800 ms), usa le abilità appena pronte, rialza i compagni. Errori casuali (5%).
- **Bot pubblico**: tocca «Benedici» a intervalli casuali, vota a caso.
- **`pnpm balance:cripta`** (~30 s): fa giocare il vero plugin, senza server, a gruppi simulati di 3–6 eroi con
  diverse combinazioni di classi e tempi di reazione. Stampa: percentuale di vittorie, candele usate, durata per
  stanza, contributo per classe, cause di caduta.
- Obiettivi: a abilità media vittoria 55–75% con `normale`; durata di una stanza 1–3 minuti; nessuna classe
  indispensabile (togliendo una classe la vittoria non scende più di 15 punti); con 3 e con 6 eroi la difficoltà
  percepita resta simile.

## 11. Fasi di lavoro

Ogni passo si chiude con test verdi e una piccola demo; commit semantici separati (nessun commit senza richiesta).

| Passo | Contenuto | Verifica |
|---|---|---|
| **P0 Fattibilità** (prima di tutto) | (a) Scena Pixi isometrica su `/screen` con stato finto: una stanza, 6 eroi, 20 mostri, telegrafi, interpolazione. (b) Scelta degli asset o piano B (§9.2). (c) Prova di guida: un eroe mosso da un telefono vero via Quick Tunnel, con misura del ritardo dal dito alla TV. (d) Bot che mandano `screenView` finte a 10 Hz con 6 telefoni e latenze diverse: dimensione degli invii e tempi di aggiornamento | Decisione **go/no-go** con l'utente: ritardo percepito accettabile, asset scelti, Pixi fuori dal pacchetto del telefono, scena funzionante su Edge senza GPU, banda annotata |
| **P1 Motore** | `map.ts`, `grid.ts`, `sim.ts` (movimento, collisioni, ricariche, danni, caduta e rialzo, salti di tempo), plugin minimale giocabile con una stanza | Stessi input → stesso stato (anche spezzando gli stessi input in tick diversi); invarianti su migliaia di passi casuali (nessuno nei muri, PV in [0, max], nessun istante nel passato dopo una pausa); `onTick` restituisce lo stesso oggetto da fermi; contratto di `registry.test.ts` |
| **P2 Classi, mostri, bilanciamento** | 4 classi con potenziamenti, 8 mostri, boss a fasi, IA, minaccia, bottino, strumento `balance:cripta` | Obiettivi del §10 raggiunti e annotati; unit test per ogni abilità e ogni comportamento dei mostri |
| **P3 Telefono** | Lobby, croce, abilità con ricarica, zaino, contestuale, voti, pubblico, «ℹ️ Regole» | Giocabile da Safari iOS e Chrome Android; nessun overflow a 360×640; un solo `move` per cambio di direzione più uno al secondo tenendo premuto |
| **P4 Schermo** | Scena completa: tile, sprite animati, camera, nebbia, luci, effetti, dialoghi, HUD, suoni del tema; scene `/preview` (`cr-*`) | Fluida con 6 eroi e 20 mostri; ordine di disegno corretto (test su `window.__cripta`) |
| **P5 Avventura ed editor** | Widget `"map"` con validazione per riga, avventura d'esempio (5–6 stanze, un bivio, una stanza facoltativa, boss), `rulesText.ts`, guida `docs/CRIPTA.md` | 45–60 minuti giocabili con persone; l'avventura d'esempio passa la validazione e il bilanciamento |
| **P6 Verifica** | Anti-leak, e2e, stress, prova rapida, pacchetto Windows, aggiornamento di `PIANO.md` e `CLAUDE.md` | §12 tutto verde |

P0 va fatta e valutata **prima** di impegnarsi sul resto: decide le due parti più incerte (ritardo percepito e
grafica). Se la prova di guida risulta sgradevole, l'alternativa da discutere è un combattimento **a turni
simultanei** brevi (ogni 2 s tutti scelgono un'azione), che il server gestisce come gli altri giochi a fasi.

## 12. Test (secondo CLAUDE.md)

- **Unit** su `map` (validazione: righe diverse, stanze senza etichetta o con due, stanze irraggiungibili, marcatori
  sbagliati), `grid`, `sim`, `ai`, abilità, oggetti, punti.
- **Determinismo**: stessa sequenza di input con istanti → stesso JSON di stato, con tick a 100 ms, a 30 s e con
  input in mezzo ai tick.
- **Anti-leak** (`cripta-leak.test.ts`, con la prova che il controllo segnala una fuga): in ogni fase e su molti
  semi, `screenView` e `viewFor` (eroi e pubblico) non contengono stanze non visitate, mostri non incontrati,
  contenuto dei forzieri chiusi, esiti dei bivi non decisi, zaini o ricariche altrui.
- **Latenza simulata**: bot con orologi sfasati e ritardi casuali; con lo stesso tempo di reazione l'esito medio non
  deve cambiare oltre una tolleranza dichiarata tra 20 ms e 200 ms di latenza.
- **Contratto** (`registry.test.ts`) e **prova rapida** (`test-session.test.ts`, `e2e/prova-rapida.spec.ts`): con
  giocatori finti la lobby deve completarsi da sola; se serve, configurazione in `OWN_CONFIG`.
- **E2E Playwright**: `e2e/cripta-preview.spec.ts` (scene `/preview` nei 5 temi, nessun overflow a 360×640,
  `touch-action` della croce, ordine di disegno) ed `e2e/cripta.spec.ts` (una partita breve: frame WebSocket con
  ogni telefono che riceve solo il proprio eroe, mai stanze o mostri non rivelati; un solo `move` per cambio di
  direzione; Pixi mai scaricato da `/play`; server pulito alla fine).
- **Stress**: `pnpm stress --players 30 --scenario cripta` (6 eroi + 24 pubblico; con 2 giocatori l'avvio del round
  deve essere rifiutato), con confronto dei tempi di aggiornamento rispetto a `--scenario pilota` e `plancia`.
- **Bilanciamento**: `pnpm balance:cripta` dopo ogni modifica a classi, mostri, oggetti o scalatura; poi si aggiorna
  `rulesText.ts`.
- **Pacchetto Windows**: `pnpm package:win` + `pnpm package:check` (asset della TV inclusi, Pixi nel chunk lazy).

## 13. Rischi

| Rischio | Effetto | Mitigazione |
|---|---|---|
| Ritardo dal dito alla TV | Il gioco sembra «molle», le schivate falliscono | Ritmo tattico (§5.2), telegrafi lunghi, misura in P0; piano alternativo a turni simultanei |
| Asset incoerenti o insufficienti | Aspetto amatoriale | Scelta in P0, piano B in codice |
| Prestazioni della TV | Scatti con molti effetti | Interpolazione, effetti sul client, limite di entità per stanza (validazione) |
| Chi gioca non trova il proprio eroe | Confusione | Colori e nomi sotto gli eroi, `ping`, ritratto e colore sul telefono |
| Disconnessione di un eroe | Eroe che cammina da solo o resta fermo | Movimento che si ferma dopo 1,5 s senza notizie; l'eroe resta in gioco e si rialza come gli altri; la regia può farlo controllare a un altro giocatore in lobby |
| Durata (45–60 min) dentro una serata | Il resto della serata si ferma | `skip-room`, `difficulty`, candele; avventure più brevi in seguito |
| Pubblico annoiato | Metà della sala non gioca | Benedizioni ed eventi; punti al pubblico se il gruppo vince |
| Traffico verso la TV | Ritardi con tunnel lento | La TV di solito è in LAN; misure in P0 e nello stress; eventuale parte statica con versione (§5.6) |
| Contenuto difficile da scrivere | Poche avventure | Validazione chiara per riga, avventura d'esempio commentata nella guida |

## 14. Verifiche sul codice (prima dell'implementazione)

| Punto del piano | Esito | Dove |
|---|---|---|
| Tick ogni 100 ms | ✅ | `server/src/index.ts` (`setInterval(realtime.tick, 100)`) |
| Invii accorpati (80 ms) e viste identiche non rimandate | ✅ | `server/src/realtime.ts`, `flush`, `DEFAULT_FLUSH_MS` |
| Le viste viaggiano intere, senza differenze | ✅ da misurare in P0 (§5.6) | `realtime.ts` |
| 20 input al secondo per giocatore | ✅ compatibile (~1 `move`/s tenendo premuto) | `realtime.ts`, `inputLimiter` |
| `InputMeta.receivedAt` per avanzare la simulazione all'arrivo | ✅ | `shared/src/minigame.ts` |
| `onTick` deve restituire lo stesso oggetto se non cambia nulla | ✅ vincolo da rispettare (§5.3) | `minigames/src/registry.test.ts` |
| Test di contratto con 2 giocatori e tick da 30 s, solo comandi della regia | ✅ vincolo da rispettare (§5.3, §7.5) | `registry.test.ts` |
| `minPlayers` controllato dall'engine | ✅ | `shared/src/minigame.ts` |
| Modulo `team-vote` per bivi ed eventi | ✅ | `minigames/src/team-vote.ts` |
| `master: true` e vista `Host` in lazy per il Game Master | ✅ | `NUOVO-MINIGIOCO.md` §4 bis |
| Widget `"lines"` adatto alla mappa | ❌ toglie le righe vuote e segnala i doppioni: serve il widget `"map"` | `client/src/admin/schema-form/SchemaForm.tsx`, `LinesField` |
| Pixi installato | ❌ da aggiungere a `packages/client` | `packages/client/package.json` |
| Viste dei minigiochi caricate in modo statico anche da `/play` | ✅ quindi Pixi va in `lazy` dentro la scena (§9.3) | `client/src/minigames/registry.ts`, `play/Play.tsx` |
| Seme e generatore casuale riusabili | ✅ | `minigames/src/knight-duel/rng.ts` |
| Stress con `--scenario` nuovo | da aggiungere `cripta` | `tools/bots/src/run.ts` |

## 15. Domande risolte

| Domanda | Risposta dell'utente |
|---|---|
| Nome e ambientazione | Fantasy classico, «Cripta Maledetta» |
| Chi sono gli eroi con più di 6 persone | Prenotazione dal telefono, sorteggio se sono troppi, correzione a mano della regia |
| Ruolo del pubblico | Benedizioni ed eventi come nel §4.10, con punti al pubblico se il gruppo vince |
| Asset e stile | Si decide in P0 in base agli asset CC0 disponibili; piano B in codice se non bastano |
| Game Master | Facoltativo |
| Persistenza | Rimandata a dopo la v1 |
| Ritmo | Tempo reale tattico; turni simultanei come alternativa se P0 lo boccia |
| Sconfitta | Candele, 3 di default, ripartenza dall'ingresso della stanza |

Restano da decidere **in P0**, con le misure in mano: stile degli asset e tema predefinito, e il via libera
(go/no-go) al tempo reale.
