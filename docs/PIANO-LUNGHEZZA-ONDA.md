# Piano: «Lunghezza d'Onda» (indizi su uno spettro, in stile Wavelength)

> Stato: **implementato** (P1–P6), da provare con persone. Guida d'uso in [LUNGHEZZA-ONDA.md](LUNGHEZZA-ONDA.md).
> P4: `e2e/lunghezza-onda.spec.ts` (le due modalità, con i frame inviati e ricevuti); P5: `pnpm stress --scenario onda`
> (una partita per modalità, conti rifatti con `scoring.ts` e controllo di privacy su ogni vista dei bot).
> Scostamenti dal piano: `confirm` porta la posizione (imposta e conferma in un solo invio); i punti sono due campi
> piatti `unitPoints` e `counterPoints` (come in Parole Mannare); gli estremi degli spettri arrivano a 40 caratteri;
> i punti vanno in `score_entries` con una voce per giocatore a fine round, non una per turno.
> Le decisioni del §2 sono state approvate dall'utente. I punti che dipendono dal codice
> esistente (avvio con `buildConfig`, invio delle viste, roster, form dell'editor) sono stati **verificati** (§9).
> Da leggere insieme a [PIANO.md](../PIANO.md) e [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

## 1. Obiettivo

Portare nel gioco le meccaniche di *Wavelength*: un gioco che si spiega in 20 secondi, va bene anche per chi non
gioca mai e fa discutere molto.

In sintesi:
- la TV mostra uno **spettro** tra due estremi, per esempio «Freddo ↔ Caldo» o «Sopravvalutato ↔ Sottovalutato»;
- un giocatore, il **Sensitivo**, vede sul telefono dove cade il **bersaglio** nascosto e dà un **indizio**
  («Il caffè del bar») che secondo lui sta in quel punto dello spettro;
- gli altri spostano un **quadrante** sul telefono per indovinare il punto;
- la TV apre il coperchio con un'animazione e i punti dipendono dalla distanza dal centro del bersaglio.

L'app fa da tavolo: estrae spettri e bersagli, mostra il quadrante sulla TV, raccoglie le posizioni, tiene il tempo
e assegna i punti. La discussione resta **a voce**.

**Nome.** «Wavelength» è un marchio di Palm Court / CMYK: nell'app il gioco si chiama **«Lunghezza d'Onda»** (id
del plugin `lunghezza-onda`). Regole, testi e spettri sono scritti da noi.

## 2. Decisioni (confermate con l'utente)

| Tema | Decisione |
|---|---|
| Nome | **«Lunghezza d'Onda»**, id `lunghezza-onda`, tema predefinito `gameshow` |
| Modalità | **Due**, scelte nell'istanza (§3): **«Tutti contro tutti»** (default, regge 30 persone e non serve formare squadre) e **«A squadre»** (fedele all'originale) |
| Numero di giocatori | **Da 3 a 30** (`minPlayers: 3`, `maxPlayers: 30`); a squadre servono almeno 2 squadre con 2 giocatori (controllato all'avvio, §5.4) |
| Squadre | Si usano i **team della serata** (anche più di due); senza team, l'app divide i giocatori a caso in due squadre |
| Indizio | **Scritto dal Sensitivo sul telefono** e mostrato sulla TV (in una sala rumorosa tutti lo leggono); il Sensitivo può anche dirlo a voce |
| Scelta dello spettro | Il Sensitivo vede **2 spettri** e ne sceglie uno (come le due facce delle carte originali) |
| Posizione della squadra | **Mediana** delle posizioni confermate dei membri: niente portavoce, e un solo membro distratto non sposta il risultato |
| Posizioni degli altri | A squadre sono **pubbliche** (la TV mostra i pallini dei compagni: nell'originale il quadrante fisico lo vedono tutti); in «Tutti contro tutti» sono **segrete fino alla rivelazione**, altrimenti si copia |
| Quadrante sul telefono | **Semicerchio da trascinare** (nuovo controllo nella cartella del gioco), con pulsanti `‹ ›` per la regolazione fine; non la primitiva `number/slider`, che non rende l'idea del quadrante |
| Velocità | **Non conta**: niente punti-velocità, quindi nessun problema di latenza oltre alla tolleranza sulla scadenza |

## 3. Regole in breve

### 3.1 Turno (uguale nelle due modalità)

1. **Sensitivo.** A rotazione, in un ordine fissato all'inizio (a squadre alternando le squadre).
2. **Spettro.** Il Sensitivo sceglie uno dei 2 spettri proposti. Il server estrae il **bersaglio**: un punto da 0 a
   100 (0 = estremo sinistro), lontano almeno `edgeMargin` dai bordi.
3. **Indizio.** Il Sensitivo scrive l'indizio (1–60 caratteri). Regola di buon senso, giudicata dalla regia: niente
   numeri, niente sinonimi degli estremi, niente spiegazioni.
4. **Posizione.** Gli altri spostano il quadrante e confermano (si può cambiare fino alla scadenza).
5. **Rivelazione.** La TV apre il coperchio. Il bersaglio ha tre fasce:

   | Distanza dal centro | Punti (default) |
   |---|---|
   | ≤ `zoneWidth / 2` (centro) | 4 |
   | ≤ `zoneWidth × 1,5` | 3 |
   | ≤ `zoneWidth × 2,5` | 2 |
   | oltre | 0 |

   Con `zoneWidth` = 5 il bersaglio intero copre 25 punti su 100, circa come nell'originale.

### 3.2 «Tutti contro tutti»

- Ogni giocatore (Sensitivo escluso) indovina **da solo** e prende i punti della propria fascia × `unitPoints`.
- Il **Sensitivo** prende la **media** dei punti degli altri, arrotondata: conviene dare indizi chiari, non furbi.
- Chi non conferma e non ha mai mosso il quadrante non prende punti (e non abbassa la media del Sensitivo).
- Il round dura `turns` turni (default: tanti quanti i giocatori, al massimo 8).

### 3.3 «A squadre»

- La **squadra del Sensitivo** muove il quadrante; la sua posizione è la **mediana** dei membri che hanno confermato
  (o mosso il quadrante). La squadra prende i punti della fascia.
- Poi **ogni altra squadra** decide in `counterSeconds` se il centro del bersaglio sta **a sinistra o a destra** della
  posizione scelta: voto di maggioranza tra i suoi membri (pareggio = nessuna scommessa). Se ha ragione prende
  `counterPoints` (default 1). Se la squadra di turno ha fatto 4, la scommessa vale sempre 0, come nell'originale.
- Vince la prima squadra che arriva a `targetScore` (default 10), oppure chi ha più punti dopo `turns` turni.
  **Recupero** come nell'originale: se una squadra prende 4 ed è ancora dietro, gioca subito un altro turno
  (una sola volta di fila, attivabile con `catchUp`).
- Con più di due squadre si alternano le squadre di turno e **tutte** le altre fanno la scommessa.

## 4. Configurazione dell'istanza (`configSchema`, genera il form dell'editor)

Gli spettri sono contenuto e si scrivono nell'editor. Il form generato non gestisce unioni né valori nulli, quindi
si usano solo enumerazioni di stringhe e interi.

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `mode` | `"tutti" \| "squadre"` | `"tutti"` | §3.2 e §3.3 |
| `spectra` | `{ left: string, right: string }[]` | ~80 coppie di esempio | Almeno 2 (se finiscono si riusano); ogni estremo 1–40 caratteri |
| `turns` | intero 0–30 | 0 | 0 = automatico: in «tutti» un turno per giocatore fino a 8; a squadre fino a `targetScore` (con un massimo di 20) |
| `targetScore` | intero ≥ 1 | 10 | Solo a squadre |
| `zoneWidth` | intero 2–10 | 5 | Larghezza di una fascia, su 100 |
| `edgeMargin` | intero 0–20 | 5 | Il centro del bersaglio non cade più vicino di così ai bordi |
| `pickSeconds` | intero | 20 | Scelta dello spettro (allo scadere sceglie il server) |
| `clueSeconds` | intero ≥ 0 | 60 | 0 = senza limite. Allo scadere il turno salta e lo spettro si riusa |
| `guessSeconds` | intero | 60 | Il turno si chiude prima se tutti confermano |
| `counterSeconds` | intero | 20 | Solo a squadre |
| `catchUp` | booleano | `true` | Solo a squadre (§3.3) |
| `unitPoints` | intero 0–1000 | 25 | In «tutti» la fascia vale `fascia × unitPoints` (100 il centro); a squadre i punti della fascia vanno al tabellone e `unitPoints` li converte in `score_entries` alla fine |
| `counterPoints` | intero 0–4 | 1 | Scommessa giusta, a squadre |

Gli spettri usati nei round precedenti non si ripropongono: il plugin implementa `shownItems` (chiave
`"sinistra|destra"`) e l'engine li passa in `ctx.seen`.

## 5. Il plugin `lunghezza-onda`

### 5.1 Stato

```ts
interface Spectrum { left: string; right: string }

interface Turn {
  index: number;
  psychicId: string;
  side: string | null;               // squadra di turno (solo a squadre)
  options: Spectrum[];               // le 2 proposte, solo per il Sensitivo
  spectrum: Spectrum | null;
  target: number | null;             // 0–100 con mezzi punti: SEGRETO fino a `reveal`
  clue: string | null;
  dials: Record<string, { pos: number; confirmed: boolean }>;  // posizioni dei giocatori
  counter: Record<string, "left" | "right">;                   // scommesse (solo a squadre)
  result: TurnResult | null;         // calcolato alla rivelazione
}

interface State {
  phase: Phase;
  seed: number;
  cfg: LunghezzaConfig;
  players: string[];
  teams: { id: string; name: string; color: string; members: string[] }[];  // vuoto in «tutti»
  order: string[];                   // ordine dei Sensitivi
  turn: Turn;
  history: TurnResult[];             // per la classifica e la TV
  board: Record<string, number>;     // punti per giocatore («tutti») o per squadra («squadre»)
  catchUpUsed: boolean;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
}
```

Mediana, fascia, punti del turno e tabellone sono **funzioni pure** di `dials`, `counter`, `target` e `cfg`
(file `scoring.ts`, con i suoi test).

### 5.2 Fasi

```
pick → clue → guess ─┬─ («tutti») ──────────→ reveal ─┬─ (altri turni) → pick
                     └─ («squadre») → counter → reveal ┤
                                                       └─ (fine) → final → done
```

| Fase | Cosa succede | Come finisce |
|---|---|---|
| `pick` | Il Sensitivo sceglie lo spettro; la TV mostra «Tocca a Carla» | Scelta fatta o tempo scaduto (sceglie il server) |
| `clue` | Il Sensitivo vede il bersaglio e scrive l'indizio; la TV mostra lo spettro con il coperchio chiuso | Indizio inviato; allo scadere il turno salta |
| `guess` | Gli altri muovono il quadrante | Tutti hanno confermato o tempo scaduto (+ `GRACE_MS`) |
| `counter` | Solo a squadre: le altre squadre scelgono sinistra o destra | Tutte hanno votato o tempo scaduto |
| `reveal` | Coperchio aperto, posizioni, punti del turno | La regia preme «Avanti» |
| `final` | Classifica del round | La regia preme «Avanti» |
| `done` | `isFinished` vero: l'engine registra i punti | — |

### 5.3 Input dei giocatori (`inputSchema`, validato con zod)

| Input | Chi | Fase | Note |
|---|---|---|---|
| `{ type: "pick", index }` | Sensitivo | `pick` | 0 o 1 |
| `{ type: "clue", text }` | Sensitivo | `clue` | 1–60 caratteri, spazi ai bordi tolti |
| `{ type: "dial", pos }` | chi indovina (in «tutti» tutti tranne il Sensitivo; a squadre i membri della squadra di turno tranne il Sensitivo) | `guess` | `pos` 0–100, arrotondato a 0,5. Muovere il quadrante toglie la conferma |
| `{ type: "confirm", pos }` | come sopra | `guess` | Imposta la posizione e chiude la propria scelta |
| `{ type: "counter", dir }` | membri delle altre squadre | `counter` | `"left"` o `"right"`; vale l'ultimo |

**Frequenza (verificato in `realtime.ts`):** ogni input che cambia lo stato fa salire `engine.version` e `flush()`
rimanda **subito tutte le viste a tutti** (TV, regia e ogni telefono): non c'è un invio selettivo per vista né un
accorpamento nel tempo. Il server accetta al massimo 20 input al secondo per giocatore (`inputLimiter`). Quindi:
- **«Tutti»:** il telefono muove la lancetta **solo in locale** e manda `dial` **al rilascio** del dito (e i pulsanti
  `‹ ›` dopo una pausa di ~300 ms). Un trascinamento produce un solo invio: con 29 giocatori sono poche decine di
  invii per turno.
- **«Squadre»:** i compagni devono vedere i pallini dal vivo, quindi durante il trascinamento il telefono manda
  `dial` al massimo **ogni 250 ms**, più l'invio al rilascio. Con 15 compagni che trascinano insieme si arriva a ~60
  cambi di stato al secondo, ciascuno inviato a ~31 client: va misurato con lo stress (P5).
- Se lo stress mostra ritardi, la soluzione è accorpare gli invii in `flush()` (al massimo uno ogni ~50 ms). È una
  modifica a `realtime.ts`, quindi a parte e con i test che `CLAUDE.md` richiede per quel file (`master.test.ts`,
  `e2e/stanze-segrete.spec.ts`, stress di Stanze Segrete).

Gli input arrivati dopo la scadenza contano entro `GRACE_MS` se `fairTime` dice che erano in tempo, come negli
altri giochi a tempo.

### 5.4 Comandi della regia (`commandSchema`)

`pause`, `resume`, `reject-clue` (indizio non valido: il Sensitivo lo riscrive, il tempo riparte), `skip-turn`
(passa al Sensitivo successivo, per chi è assente), `close` (chiude la fase in corso come allo scadere), `next`,
`end` (chiude il round dopo il turno in corso e mostra la classifica).

All'avvio, a squadre, servono almeno 2 squadre con almeno 2 giocatori. `minPlayers` non basta (conta i giocatori,
non le squadre): il controllo va in `buildConfig`. **Verificato in `engine.ts`:** `startMatch` chiama `buildConfig`
per ogni round che lo definisce, anche senza `libraryConfigSchema`, con giocatori e team della serata; un
`{ ok: false, error }` blocca l'avvio con «*titolo del round*: *errore*» per la regia. Il controllo avviene quindi
all'avvio della **partita**, non del singolo round: va bene, perché il roster non cambia durante la partita.
`buildConfig` restituisce la stessa configurazione, senza modificarla.

**Giocatori senza team** (con `teamId` nullo): a squadre finiscono nella squadra con meno membri, in ordine.

**Roster fisso (verificato):** l'engine fissa i giocatori all'avvio della partita e ignora gli input di chi non c'è.
Chi arriva dopo gioca dalla partita successiva: non serve gestire gli ingressi a metà round.

### 5.5 Punti

- **«Tutti»:** per ogni turno `fascia × unitPoints` a chi indovina, la media al Sensitivo. A fine round una voce
  per giocatore in `score_entries`, con il motivo «Lunghezza d'Onda».
- **«Squadre»:** il tabellone conta i punti come nell'originale (2–4 + scommesse); alla fine ogni membro di ogni
  squadra riceve `tabellone della squadra × unitPoints`. Come nel Duello dei Cavalieri le voci hanno `teamId: null`:
  l'engine le attribuisce al team della serata del giocatore (`finalizeRound`), e la classifica dei team somma
  tutte le voci del team (`scores.ts`).
- `result()` restituisce la classifica per giocatore (a squadre: tutti i membri di una squadra a pari rango), usabile
  anche dai meta-giochi.

### 5.6 Chi vede cosa (regola d'oro: solo viste filtrate)

| Informazione | TV | Sensitivo | Chi indovina | Altre squadre (a squadre) | Regia |
|---|---|---|---|---|---|
| Spettri proposti | ❌ | ✅ (`pick`) | ❌ | ❌ | ✅ |
| Spettro scelto, indizio | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Bersaglio** | solo in `reveal` | ✅ (da `clue`) | solo in `reveal` | solo in `reveal` | ✅ |
| Posizioni dei compagni, a squadre | ✅ | ✅ | ✅ | ✅ | ✅ |
| Posizioni altrui, «tutti» | solo in `reveal` (prima solo quanti hanno confermato) | solo in `reveal` | la propria | — | ✅ |
| Scommesse sinistra/destra | solo in `reveal` (prima quante squadre hanno deciso) | solo in `reveal` | solo in `reveal` | quelle della propria squadra | ✅ |

- Nelle viste prima di `reveal` il campo `target` **non esiste** (non è `null`): il test anti-leak verifica le chiavi.
- Il Sensitivo non riceve le posizioni altrui in «tutti» prima di `reveal`: potrebbe fare segni a qualcuno.
- La regia vede il bersaglio. Non serve una regia cieca: chi conduce non gioca a questo gioco; se si vuole far
  giocare anche la regia, si aggiunge `set-blind` come in Stanze col botto (fuori dalla prima versione).

## 6. Interfacce

### 6.1 Il quadrante (componente condiviso tra TV e telefono)

Un solo componente SVG `Dial` nella cartella del gioco, disegnato in base al tema: semicerchio, etichette degli
estremi, lancetta, coperchio che si apre, fasce colorate del bersaglio (4 al centro, 3 e 2 ai lati), pallini dei
giocatori. Niente PixiJS: un SVG con Framer Motion basta e tiene leggero il telefono.

### 6.2 Schermo condiviso (TV)

```
                Indizio: «Il caffè del bar»   (Sensitivo: Carla)        ⏱ 0:34
                          ╭────────────╮
                     ╭────╯    ▒▒▒▒    ╰────╮        ▒ = coperchio chiuso
                   ╭─╯         ▒▒▒▒         ╰─╮
                  FREDDO       ╲              CALDO
                                 ╲ (lancetta della squadra, solo a squadre)
                Confermati: 17 / 23
```

- In `clue` e `guess` il coperchio è chiuso; a squadre si vedono i pallini dei compagni e la lancetta della mediana
  che si muove dal vivo.
- In `reveal`: rullo di tamburi, il coperchio si apre, compaiono le fasce. In «tutti» i pallini atterrano tutti
  insieme con le iniziali (con 29 pallini si raggruppano quelli vicini in un pallino con il numero) e sotto il
  quadrante compaiono i 3 più vicini e i punti del Sensitivo. A squadre: lancetta, fascia colpita, scommesse.
- Barra laterale con la classifica o il tabellone; in `final` la classifica del round.

### 6.3 Telefono del Sensitivo

- In `pick`: i 2 spettri come due grandi pulsanti.
- In `clue`: il quadrante con il bersaglio scoperto (con il pulsante **«Nascondi»**) e il campo per l'indizio con
  «Invia». Promemoria: «Niente numeri e niente sinonimi degli estremi».
- In `guess`: il bersaglio resta visibile solo a lui, con la scritta «Non fare facce!».

### 6.4 Telefono di chi indovina

- Il quadrante a tutta larghezza: si trascina la lancetta (Pointer Events, `touch-action: none` come `.ss-hold` di
  Stanze Segrete), con i pulsanti `‹ ›` per spostarla di 0,5 e la posizione in grande. Sotto, «Conferma».
- A squadre: i pallini dei compagni e la mediana in tempo reale.
- In `counter` (altre squadre): due grandi pulsanti «⬅ Più a sinistra» / «Più a destra ➡» e il voto dei compagni.
- Fuori dal proprio ruolo: «Tocca alla squadra Blu» con l'indizio, per seguire la discussione.
- **Regole in app**: «ℹ️ Regole» con i numeri veri della partita, da `rulesText.ts`.

### 6.5 Regia (pannello Live)

Turno e Sensitivo attuali, bersaglio, posizioni e scommesse (dalla `hostView`); pausa e ripresa, «Indizio non
valido», «Salta il turno», «Chiudi», «Avanti», «Termina dopo questo turno».

## 7. Fasi di lavoro

Ogni passo si chiude con test verdi e una piccola demo; commit semantici separati (nessun commit senza richiesta).

| Passo | Contenuto | Verifica |
|---|---|---|
| **P1 Logica del plugin** | Config, stato, ordine dei Sensitivi, estrazione deterministica di spettri e bersagli, fasi delle due modalità, input, comandi, `scoring.ts` (fasce, mediana, scommesse, recupero, media del Sensitivo), punti, `shownItems` | Unit test: stesso seme → stessi bersagli; bersaglio mai entro `edgeMargin` dai bordi; confini delle fasce (esattamente a `zoneWidth / 2` è centro); mediana con numero pari e dispari di membri e con chi non ha mosso il quadrante; scommessa giusta, sbagliata, pari e con 4 punti della squadra; recupero una sola volta di fila; fine a `targetScore` e a `turns`; media del Sensitivo che ignora chi non ha giocato; input rifiutati fuori fase, dal Sensitivo sul quadrante, dalle altre squadre in `guess`; `pos` fuori da 0–100 rifiutato dallo schema; input in ritardo entro `GRACE_MS`; avvio a squadre rifiutato con una squadra sola; il contratto di `registry.test.ts` passa |
| **P2 Test anti-leak** | Scorrimento dello stato a ogni passo, nelle due modalità | Nessuna chiave `target` in `screenView` e in `viewFor` dei non-Sensitivi prima di `reveal`; spettri proposti solo al Sensitivo; in «tutti» nessuna posizione altrui prima di `reveal` (nemmeno al Sensitivo); scommesse di una squadra mai alle altre prima di `reveal` |
| **P3 Viste** | Componente `Dial`, `Controller`, `Screen`, regole in app; scene in `/preview` (`lo-*`: scelta, indizio del Sensitivo, quadrante del giocatore, squadra con mediana, scommessa, rivelazione con 29 pallini, finale) nei 5 temi | Asserzioni Playwright su `/preview`: nessun overflow a 360×640 e sulla TV; `touch-action: none` sul quadrante; trascinamento simulato con il mouse che cambia la posizione mostrata; raggruppamento dei pallini vicini |
| **P4 End-to-end** | Scenario «tutti»: 4 giocatori, il Sensitivo sceglie lo spettro e scrive l'indizio, gli altri trascinano e confermano, la TV rivela; indizio rifiutato dalla regia; turno saltato. Scenario «squadre»: 2 team, mediana dal vivo sulla TV, scommessa, recupero, fine a `targetScore` | **Frame WebSocket:** il bersaglio arriva solo al Sensitivo e alla regia prima di `reveal`; in «tutti» le posizioni altrui non arrivano prima di `reveal`; in «tutti» un trascinamento manda un solo `dial` (al rilascio), a squadre non più di uno ogni 250 ms; server pulito alla fine (`Termina la partita` + `Torna alla lobby`) |
| **P5 Bot e stress** | Strategia in `tools/bots`: Sensitivi che scelgono e scrivono, giocatori che trascinano (molti `dial` di fila) e confermano, scommesse | `pnpm stress --players 30 --scenario onda` (in «tutti» e a squadre) con latenza e orologi sfasati: nessun errore, punti coerenti con `scoring.ts`, tempi di aggiornamento nella norma con 29 quadranti in movimento; con 2 giocatori l'avvio viene rifiutato |
| **P6 Documenti e pacchetto** | Guida `docs/LUNGHEZZA-ONDA.md`, sezione in `PIANO.md` e in `CLAUDE.md` (test richiesti), `GUIDA-HOST.md`, `rulesText.ts`, ~80 spettri di esempio in italiano | `pnpm test`, `pnpm test:e2e`, `pnpm package:win` + `pnpm package:check` |

## 8. Rischi residui

- **Indizi del Sensitivo:** il gioco vive di indizi ben pensati; chi è bloccato rallenta tutti. Mitigazioni: 2 spettri
  tra cui scegliere, `clueSeconds`, «Salta il turno» della regia. Sugli spettri di esempio conviene preferire coppie
  soggettive e da discutere («Romantico ↔ Inquietante») a quelle misurabili («Piccolo ↔ Grande»).
- **Traffico dei quadranti:** ogni cambio di stato rimanda tutte le viste a tutti (§5.3). In «tutti» si invia solo
  al rilascio; a squadre si limita la frequenza sul client e si misura con lo stress del P5. Se non basta, si
  accorpano gli invii in `realtime.ts` (modifica separata, con i suoi test).
- **Rotazione con 30 giocatori:** in «tutti» non tutti fanno il Sensitivo in un round (8 turni al massimo). L'ordine
  parte da un giocatore a caso; ricordare chi l'ha già fatto nei round precedenti richiederebbe un'informazione
  dall'engine che oggi non c'è (`ctx.seen` è pensato per i contenuti). Si valuta dopo le prime serate.
- **Sensitivo che fa facce o segni:** limite accettato, come al tavolo; il promemoria sul telefono aiuta.
- **Quadrante su iOS:** lo scorrimento della pagina può rubare il trascinamento; la schermata non scorre, il
  quadrante ha `touch-action: none` e i pulsanti `‹ ›` restano un'alternativa.
- **Spettri di esempio:** vanno scritti da noi (niente carte ufficiali) e rivisti dopo le prime serate.
- **Squadre di dimensioni diverse:** la classifica dei team somma i punti dei membri, quindi una squadra da 8 che
  vince vale più di una da 5. È così per tutti i giochi della serata; **per ora si tiene così**, l'utente lo rivede
  più avanti.

## 9. Verifiche sul codice (prima dell'implementazione)

| Punto del piano | Esito | Dove |
|---|---|---|
| `buildConfig` chiamato anche senza `libraryConfigSchema`, con il roster, e capace di bloccare l'avvio | ✅ | `engine.ts`, `startMatch` |
| `minPlayers`/`maxPlayers` controllati dall'engine all'avvio del round | ✅ | `engine.ts`, `next` |
| Roster fisso per tutta la partita, input di chi non c'è ignorati | ✅ (corretto il piano: niente ingressi a metà round) | `engine.ts`, `startMatch` e `input` |
| Ogni cambio di stato rimanda tutte le viste a tutti | ✅ (corretto il piano: invio al rilascio in «tutti», 250 ms a squadre) | `realtime.ts`, `flush` |
| Limite di 20 input al secondo per giocatore | ✅ compatibile con 4 invii al secondo | `realtime.ts`, `inputLimiter` |
| `teamId: null` attribuito dall'engine al team del giocatore; classifica dei team = somma delle voci | ✅ | `engine.ts`, `finalizeRound`; `scores.ts` |
| Form dell'editor: oggetti, liste di oggetti, booleani, interi, enumerazioni; niente unioni né `null` | ✅ (`spectra` come lista di oggetti, come le parole di Parole Mannare) | `admin/schema-form/SchemaForm.tsx` |
| `.refine` sulla configurazione ammesso (lo schema JSON lo ignora, il server lo valida) | ✅ | `library-service.ts`, altri plugin |
| `fairTime` e `GRACE_MS` disponibili | ✅ | `shared/src/fairtime.ts`, `minigames/src/util.ts` |
| Stress con `--scenario` nuovo | ✅ va aggiunto `onda` all'elenco e una funzione in `scenario.ts` | `tools/bots/src/run.ts` |
