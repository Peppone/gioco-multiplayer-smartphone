# Piano: «Parole Mannare» (deduzione sociale in stile Werewords)

> Stato: **implementato** (passi P1–P6). Guida d'uso in [PAROLE-MANNARE.md](PAROLE-MANNARE.md).
> Scostamenti dal piano: `werewolves` è un'enumerazione di stringhe (`auto`/`1`/`2`/`3`) e `maybePool` + `maybeUnlimited` sostituiscono `maybePool: null`, perché il form generato dall'editor non gestisce unioni né valori nulli; `set-mayor` senza `playerId` passa al giocatore successivo (pulsante «Cambia Sindaco»).
> Da leggere insieme a [PIANO.md](../PIANO.md) e [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

## 1. Obiettivo

Portare nel gioco le meccaniche di *Werewords* **senza scatola**: niente carte ruolo, gettoni, clessidra
o narratore. Non è una copia della companion app ufficiale: l'app sostituisce i **componenti fisici**, mentre
la conversazione resta tutta **a voce**, attorno a un tavolo o in piedi davanti alla TV.

In sintesi:
- un giocatore è il **Sindaco**: sceglie in segreto una parola e risponde alle domande dei compagni
  **trascinando i gettoni** sui loro nomi dal proprio telefono;
- gli altri fanno domande ad alta voce («È un animale?») per indovinare la parola entro il tempo;
- tra loro si nascondono il **Lupo** (o i Lupi), che conosce la parola e cerca di sviare, e il **Veggente**, che la
  conosce anche lui e cerca di aiutare senza farsi scoprire;
- se la parola viene indovinata, i Lupi hanno un'ultima possibilità: **trovare il Veggente**; se non viene
  indovinata, tutti **votano chi è il Lupo**.

L'app fa da tavolo: distribuisce i ruoli in privato, tiene il tempo, conta i gettoni, li mostra a tutti sulla TV
e sui telefoni, raccoglie i voti e assegna i punti.

**Nome.** «Werewords» è un marchio di Bezier Games: nell'app il gioco si chiama **«Parole Mannare»**
(id del plugin `parole-mannare`). Regole, testi e lista di parole sono scritti da noi.

## 2. Decisioni confermate con l'utente

| Tema | Decisione |
|---|---|
| Nome | **«Parole Mannare»**, id `parole-mannare` |
| Companion app | **No**: non si replica l'app ufficiale; si eliminano i componenti fisici |
| Domande | **Sempre a voce**: nessuna domanda si scrive sul telefono |
| Gettoni | Il Sindaco li assegna dal telefono **trascinando il nome sul gettone o il gettone sul nome** (entrambe le direzioni), con tocco-tocco come alternativa (§6.1) |
| Conteggio | La TV mostra **un riassunto per ogni giocatore**: quanti gettoni di ogni tipo ha ricevuto (§6.3) |
| Annulla | Il Sindaco può **annullare l'azione precedente**, anche più volte di seguito (§5.5) |
| Avvisi sui telefoni | A ogni gettone assegnato, **tutti i telefoni** mostrano a chi è andato e quale; chi lo riceve vede «a te» (§6.2) |
| Numero di giocatori | **Da 4 a 12** (`maxPlayers: 12`), due in più dei 10 della scatola base; oltre, le domande si accavallano e il Sindaco non regge il ritmo. Il resto della serata continua a reggere ~30 giocatori |
| Ruolo del Sindaco | **Ha un ruolo segreto**, come nel gioco originale: può essere Lupo, Veggente o Paesano |
| Numero di Lupi | **Adattato alla dimensione**: 1 Lupo da 4 a 6 giocatori, 2 da 7 a 11, **3 con 12** (la scala del regolamento Deluxe, che arriva a 20 giocatori). Sempre tra il 17% e il 29% dei giocatori. Configurabile (§4) |
| Pareggio nei voti | **Ballottaggio** tra i giocatori a pari voti (§3, punto 6) |
| Riserve dei gettoni | **Configurabili**, con default presi dal gioco originale: 36 Sì/No, 12 Forse, 1 Ci sei quasi, 1 Lontanissimo (§4) |

Restano scelte di default, modificabili senza toccare le decisioni: Sindaco estratto a caso (la regia lo può
cambiare prima di distribuire i ruoli), domande di 4 minuti, tema `manga`.

## 3. Regole in breve

1. **Ruoli.** Si estrae il Sindaco (pubblico) e si distribuiscono in segreto i ruoli: Lupo/Lupi, un Veggente,
   Paesani. Il Sindaco riceve anch'esso uno di questi ruoli.
2. **Parola.** Il Sindaco vede sul telefono 2–3 parole estratte dalla lista e ne sceglie una. Se non sceglie entro
   il tempo, la sceglie il server.
3. **Notte.** I Lupi vedono la parola e gli altri Lupi; il Veggente vede la parola. Nessuno chiude gli occhi:
   ognuno guarda il proprio telefono tenendo premuto (§6.2).
4. **Domande.** Parte il timer. I giocatori fanno domande ad alta voce; il Sindaco risponde assegnando un gettone a
   chi ha chiesto:
   - **✅ Sì** e **❌ No**: da una riserva comune (36 nell'originale); quando si dà l'ultimo, le domande terminano
     come allo scadere del tempo;
   - **❓ Forse**: riserva propria (12 nell'originale); quando finisce si continua solo con Sì e No;
   - **🟡 Ci sei quasi** e **🔴 Lontanissimo**: **uno solo** di ciascuno per partita; sono segnali **in aggiunta**
     alla risposta e non consumano la riserva;
   - **🎯 Esatto**: la parola è indovinata.
5. **Parola indovinata.** I Lupi (che si rivelano) hanno poco tempo per **scegliere insieme il Veggente**: vale la
   maggioranza dei Lupi. Se indicano il Veggente vincono i Lupi, altrimenti vince il villaggio. Se i Lupi sono
   pari (solo con 2 o 3 Lupi), **ballottaggio** tra i nomi pari; se sono ancora pari, i Lupi non hanno trovato il
   Veggente e vince il villaggio.
6. **Parola non indovinata.** La parola viene mostrata; dopo una breve discussione **tutti votano** chi è il Lupo.
   Se il più votato è un Lupo vince il villaggio, altrimenti vincono i Lupi.
   **Pareggio:** se due o più giocatori hanno lo stesso numero massimo di voti, si va al **ballottaggio**. La TV
   mostra solo i nomi pari, tutti rivotano scegliendo tra loro (i candidati compresi) entro `runoffSeconds`, e il
   più votato viene giudicato come sopra. Se anche il ballottaggio finisce pari, il villaggio non ha deciso e
   vincono i Lupi. Chi non vota non conta; se nessuno vota, vincono i Lupi.
7. **Rivelazione.** La TV mostra parola, ruoli di tutti e fazione vincitrice; i punti vanno in `score_entries`.

## 4. Configurazione dell'istanza (`configSchema`, genera il form dell'editor)

Le parole sono contenuto: si scrivono nell'editor della regia, mai nel codice.

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `words` | `{ text: string, difficulty: "facile" \| "media" \| "difficile" }[]` | lista di esempio | Almeno 3 parole per difficoltà usata |
| `difficulty` | `"facile" \| "media" \| "difficile" \| "mista"` | `"media"` | Da quale gruppo si estraggono le proposte |
| `wordChoices` | intero 1–4 | 3 | Quante parole vede il Sindaco |
| `wordPickSeconds` | intero | 20 | Tempo per scegliere la parola |
| `nightSeconds` | intero | 15 | Tempo per guardare il proprio ruolo |
| `questionSeconds` | intero | 240 | Durata delle domande |
| `yesNoPool` | intero ≥ 1 | 36 | Riserva comune di Sì e No (come nella scatola) |
| `maybePool` | intero ≥ 0 o `null` | 12 | `null` = Forse illimitati, 0 = niente Forse |
| `closeTokens` | intero 0–3 | 1 | Gettoni «Ci sei quasi» (0 = disattivato) |
| `farTokens` | intero 0–3 | 1 | Gettoni «Lontanissimo» (0 = disattivato) |
| `werewolves` | `"auto" \| 1 \| 2 \| 3` | `"auto"` | `auto`: 1 da 4 a 6 giocatori, 2 da 7 a 11, 3 con 12. Un numero fisso viene ridotto se lascerebbe meno di 3 non-Lupi |
| `correctGraceSeconds` | intero | 5 | Finestra per annullare un «Esatto» (§5.5) |
| `seerHuntSeconds` | intero | 30 | Tempo dei Lupi per trovare il Veggente |
| `voteSeconds` | intero | 60 | Discussione e voto sul Lupo |
| `runoffSeconds` | intero | 30 | Durata di un ballottaggio |
| `points` | `{ win: number, mayorBonus: number }` | `{ win: 100, mayorBonus: 0 }` | Punti a ogni membro della fazione vincitrice |

Le parole mostrate nei round precedenti non si ripropongono: il plugin implementa `shownItems`, così l'engine le
passa in `ctx.seen`.

## 5. Il plugin `parole-mannare`

### 5.1 Stato

```ts
type Role = "werewolf" | "seer" | "villager";
type Token = "yes" | "no" | "maybe" | "close" | "far" | "correct";

interface TokenEntry {
  seq: number;          // crescente, mai riusato (anche dopo un annulla)
  playerId: string;     // chi ha ricevuto il gettone
  token: Token;
  at: number;
  undone: boolean;      // annullato: resta nel registro per gli avvisi, ma non conta
}

interface State {
  phase: Phase;
  seed: number;
  players: string[];          // ordine fisso, usato da TV e telefono del Sindaco
  mayorId: string;
  roles: Record<string, Role>;
  wordOptions: string[];      // solo il Sindaco le vede
  word: string | null;
  log: TokenEntry[];          // registro dei gettoni: conteggi e riserve si calcolano da qui
  nextSeq: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  correctBy: string | null;   // chi ha indovinato (durante la finestra di annullamento)
  votes: Record<string, string>;   // voto sul Lupo o scelta dei Lupi sul Veggente
  runoff: string[] | null;         // candidati del ballottaggio in corso (null = primo voto)
  outcome: { winner: "village" | "werewolves"; reason: string } | null;
}
```

Conteggi per giocatore, riserve rimaste (Sì/No, Forse, Ci sei quasi, Lontanissimo) sono **funzioni pure del
registro** (voci con `undone: false`) e della configurazione: un solo punto di verità, niente contatori da tenere
allineati.

**Ballottaggio:** non è una fase a parte. Alla chiusura di un voto con più giocatori a pari voti massimi, la stessa
fase (`seer-hunt` o `werewolf-vote`) riparte con `runoff` = i nomi pari, `votes` azzerati e `phaseEndsAt` a
`runoffSeconds`. Alla chiusura di un ballottaggio ancora pari si applica l'esito del §3 (punti 5 e 6). Un solo
ballottaggio per voto.

### 5.2 Fasi

```
deal → word → night → questions ─┬─ (Esatto) → correct-grace ─┬─ (5 s) → seer-hunt ─┐
                                 │                            └─ (annulla) → questions
                                 └─ (tempo o Sì/No finiti) → werewolf-vote ──────────┤
                                                                                     ↓
                                                                          reveal → done
```

| Fase | Cosa succede | Come finisce |
|---|---|---|
| `deal` | Sindaco estratto e mostrato sulla TV; la regia può cambiarlo | La regia preme «Distribuisci» |
| `word` | Il Sindaco sceglie la parola; gli altri vedono «Il Sindaco sta scegliendo…» | Scelta fatta o tempo scaduto (scelta del server) |
| `night` | Ognuno tiene premuto per vedere il proprio ruolo (e la parola, se gli spetta) | Tempo scaduto o tutti hanno premuto «Ho visto» |
| `questions` | Timer, gettoni, avvisi; la regia può mettere in pausa | Esatto, tempo scaduto o riserva Sì/No esaurita |
| `correct-grace` | «Parola indovinata!» sulla TV, il Sindaco può ancora annullare | Dopo `correctGraceSeconds` → `seer-hunt`; con l'annulla → `questions` con il tempo residuo |
| `seer-hunt` | I Lupi si rivelano e scelgono insieme il Veggente (voto di team, vale la maggioranza dei Lupi) | Tutti i Lupi hanno votato o tempo scaduto; con un pareggio, ballottaggio |
| `werewolf-vote` | La parola viene mostrata, tutti votano chi è il Lupo | Tutti hanno votato o tempo scaduto; con un pareggio, ballottaggio |
| `reveal` | Ruoli, parola ed esito sulla TV | La regia preme «Avanti» |
| `done` | `isFinished` vero: l'engine registra i punti | — |

La rivelazione è una fase a parte (come in Caccia ai Fantasmi) perché l'engine chiude il round appena
`isFinished` è vero.

### 5.3 Input dei giocatori (`inputSchema`, validato con zod)

| Input | Chi | Fase | Note |
|---|---|---|---|
| `{ type: "pick-word", index }` | Sindaco | `word` | Indice in `wordOptions` |
| `{ type: "seen" }` | tutti | `night` | Facoltativo: chiude la notte prima del tempo |
| `{ type: "give", playerId, token }` | Sindaco | `questions` | Rifiutato: verso il Sindaco stesso, giocatore sconosciuto, gettone esaurito (Forse, Ci sei quasi, Lontanissimo). `correct` porta a `correct-grace` |
| `{ type: "undo" }` | Sindaco | `questions`, `correct-grace` | §5.5 |
| `{ type: "vote", targetId }` | tutti / solo Lupi | `werewolf-vote` / `seer-hunt` | Si può cambiare il voto fino alla chiusura; vale l'ultimo. Durante un ballottaggio `targetId` deve essere tra i candidati di `runoff` |

Il Sindaco è un **giocatore normale**: i suoi gettoni arrivano come input, non come comandi del Game Master.
Il server controlla `playerId === mayorId`.

### 5.4 Comandi della regia (`commandSchema`)

`set-mayor { playerId }` (solo in `deal`), `deal`, `pause`, `resume`, `undo` (stesso effetto dell'annulla del
Sindaco, anche dopo la finestra di «Esatto», per rimediare agli errori), `end-questions` (chiude le domande come
allo scadere del tempo), `close-vote`, `next`.

### 5.5 Annulla

- **Cosa annulla:** l'ultima voce non annullata del registro, qualunque gettone sia. Ripetendo si annulla quella
  prima, e così via.
- **Come:** la voce resta nel registro con `undone: true`: i conteggi la ignorano, un Forse, Ci sei quasi o
  Lontanissimo torna disponibile, il Sì/No torna nella riserva, e i telefoni possono mostrare «Annullato: …» (§6.2).
- **Il timer non si ferma e non torna indietro:** annullare non regala tempo.
- **Senza conferma:** un tocco solo. Un annulla sbagliato si ripara ridando il gettone.
- **«Esatto»:** si annulla solo durante `correct-grace` (o dalla regia). Si torna a `questions` con il tempo che
  restava al momento dell'«Esatto».

### 5.6 Punti

Ogni membro della fazione vincitrice riceve `points.win`, il Sindaco (della propria fazione) anche
`points.mayorBonus`. `result()` restituisce fazione vincitrice e motivo («Parola indovinata, Veggente salvo»,
«Il Lupo è stato scoperto», …), così il gioco si può usare anche dentro un meta-gioco.

### 5.7 Chi vede cosa (regola d'oro: solo viste filtrate)

| Informazione | TV | Sindaco | Lupo | Veggente | Paesano |
|---|---|---|---|---|---|
| Chi è il Sindaco | ✅ | ✅ | ✅ | ✅ | ✅ |
| Parole proposte | ❌ | ✅ (`word`) | ❌ | ❌ | ❌ |
| Parola scelta | solo da `werewolf-vote`/`reveal` | ✅ | ✅ | ✅ | solo da `werewolf-vote`/`reveal` |
| Proprio ruolo | ❌ | ✅ | ✅ | ✅ | ✅ |
| Ruoli altrui | solo in `reveal` | ❌ | gli altri Lupi | ❌ | ❌ |
| Chi sono i Lupi | da `seer-hunt` (si rivelano) | come sopra | ✅ | ❌ | ❌ |
| Registro dei gettoni | ✅ | ✅ | ✅ | ✅ | ✅ |
| Voti in corso | solo quanti hanno votato | ❌ | voti dei Lupi in `seer-hunt` | ❌ | ❌ |

Il Sindaco Lupo vede gli altri Lupi come qualunque Lupo. Il ruolo del Sindaco non compare mai nella parte pubblica.

## 6. Interfacce

### 6.1 Telefono del Sindaco (fase `questions`)

```
┌──────────────────────────┐
│ ⏱ 2:47      Sì/No: 23    │
│  Anna   Bruno   Carla    │  ← nomi: trascinabili e bersagli
│  Dario  Elena   Fabio    │
│ ──────────────────────── │
│   ✅ Sì        ❌ No      │  ← gettoni: trascinabili e bersagli
│   ❓ Forse     🟡 Quasi   │
│   🔴 Lontano   🎯 Esatto  │
│                          │
│  ↶ Annulla: «Sì a Carla» │
└──────────────────────────┘
```

- **Trascinamento in entrambe le direzioni:** nome → gettone o gettone → nome; una sola funzione di rilascio
  invia `give { playerId, token }` qualunque sia l'ordine.
- **Tocco-tocco:** toccando un nome (o un gettone) resta selezionato; il tocco successivo sull'altro tipo completa
  l'assegnazione. Un secondo tocco sullo stesso elemento annulla la selezione.
- **Ritorno visivo:** l'elemento trascinato segue il dito, il bersaglio sotto il dito si ingrandisce; vibrazione
  breve con `navigator.vibrate` dove esiste (non su iOS Safari).
- **Gettoni esauriti o già usati:** grigi, non accettano rilasci.
- **«Esatto»:** al rilascio chiede «Carla ha indovinato? Sì / No».
- **Annulla:** sempre visibile, mostra cosa annullerà; disattivato a registro vuoto.
- **Una sola schermata, senza scorrimento:** la griglia dei nomi si adatta a 3–11 giocatori.
- Il proprio ruolo e la parola restano dietro un pulsante «tieni premuto», per chi guarda da sopra la spalla.

**Realizzazione:** un hook `useDragPair` (Pointer Events + `document.elementFromPoint`, una cinquantina di righe)
nella cartella del gioco, senza librerie nuove. Gli elementi trascinabili hanno `touch-action: none`,
`user-select: none`, `-webkit-touch-callout: none`, come `.ss-hold` di Stanze Segrete.

### 6.2 Telefono dei giocatori

- **Ruolo:** pulsante «tieni premuto per vedere» con ruolo, parola (se spetta) e gli altri Lupi (se si è Lupo).
- **Avviso del gettone** a ogni assegnazione, in alto:
  - per tutti: «✅ Sì → Carla», per ~3 s;
  - per chi lo riceve: colore pieno, «✅ Sì **a te**!» e vibrazione dove disponibile;
  - un nuovo avviso sostituisce il precedente (niente code);
  - dopo un annulla: «↶ Annullato: Sì a Carla» in grigio;
  - «🎯 Carla ha indovinato!» per l'Esatto.
- **Storico breve:** le ultime 3–4 assegnazioni in piccolo sotto l'avviso. Il riassunto completo resta sulla TV.
- **Voto:** primitiva `vote` con i nomi (in `seer-hunt` solo per i Lupi; gli altri vedono «I Lupi cercano il
  Veggente…»). Nel ballottaggio compaiono solo i candidati pari, con il titolo «Ballottaggio».
- **Regole in app:** «ℹ️ Regole» a schermo intero con i numeri veri della partita (tempo, riserva, numero di Lupi)
  e la sezione del proprio ruolo, da `rulesText.ts`.

La vista del giocatore contiene le ultime N voci del registro: il client mostra l'avviso quando vede un `seq` nuovo.
Dopo una riconnessione non rimostra gli avvisi vecchi, li mette solo nello storico. Il Sindaco non riceve
l'avviso: ha già la conferma sul pulsante «Annulla».

### 6.3 Schermo condiviso (TV)

```
 ⏱ 2:47     Sì/No: 23   Forse: 9   🟡 Ci sei quasi: usato   🔴 Lontanissimo: libero
 Sindaco: Elena

 Anna    ✅ 4   ❌ 2   ❓ 1            Dario   ❌ 3
 Bruno   ✅ 1   ❌ 5        🔴          Fabio   ✅ 2   ❓ 3
 Carla   ✅ 6   ❌ 1   ❓ 2   🟡  ←      Gianni
```

- **Una riga per giocatore**, in ordine fisso (lo stesso del telefono del Sindaco); due colonne per 7–12 giocatori.
- **Ultimo gettone:** la riga di chi l'ha ricevuto si illumina per ~2 s e il conteggio fa un piccolo scatto.
- **Annulla:** il gettone annullato rimpicciolisce e sbiadisce, la riga lampeggia brevemente.
- **Barra in alto:** timer, riserve di Sì/No e Forse, gettoni «Ci sei quasi» e «Lontanissimo» rimasti.
- **Ballottaggio:** la TV mostra «Ballottaggio!» con i soli nomi pari e il nuovo timer.
- Nelle altre fasi: Sindaco estratto (`deal`), «Il Sindaco sceglie la parola…» (`word`), conto alla rovescia della
  notte, «Parola indovinata!» (`correct-grace`), Lupi rivelati (`seer-hunt`), parola e conteggio dei votanti
  (`werewolf-vote`), rivelazione finale con tutti i ruoli.

### 6.4 Regia (pannello Live)

Sindaco attuale con «Cambia Sindaco» (in `deal`), «Distribuisci», pausa e ripresa, «Annulla ultimo gettone»,
«Chiudi le domande», «Chiudi il voto», «Avanti». La regia vede parola e ruoli (`hostView`).

## 7. Fasi di lavoro

Ogni passo si chiude con test verdi e una piccola demo; commit semantici separati (nessun commit senza richiesta).

| Passo | Contenuto | Verifica |
|---|---|---|
| **P1 Logica del plugin** | Config, stato, fasi, input, comandi, registro dei gettoni con annulla, riserve, voti e ballottaggi, esito, punti, `shownItems` | Unit test: dare, annullare e ridare torna allo stato iniziale; annulla a più passi; «Ci sei quasi» annullato torna libero; Sì/No esauriti chiudono le domande, Forse esauriti no; «Ci sei quasi» e «Lontanissimo» non consumano la riserva; «Esatto» annullato nella finestra riprende col tempo residuo, dopo la finestra no (salvo la regia); input del Sindaco rifiutati da altri giocatori o fuori fase; gettone al Sindaco stesso rifiutato; esiti di `seer-hunt` e `werewolf-vote`; **ballottaggio** solo tra i pari, secondo pareggio con l'esito del §3; numero di Lupi da 4 a 12 giocatori (1/2/3) e riduzione di un numero fisso troppo alto; il contratto di `registry.test.ts` passa |
| **P2 Test anti-leak** | Scorrimento dello stato a ogni passo | Parola mai in `screenView` prima di `werewolf-vote`/`reveal`, mai nel `viewFor` dei Paesani prima di allora; parole proposte solo al Sindaco; ruoli altrui mai visibili (salvo Lupi tra loro); voti mai visibili ai non votanti |
| **P3 Viste** | `Controller` (Sindaco e giocatori), `Screen`, hook `useDragPair`, avvisi, regole in app; scene in `/preview` (ruolo, scelta della parola, domande lato Sindaco e giocatore, avviso «a te», annullato, finestra Esatto, caccia al Veggente, voto, ballottaggio, rivelazione) nei 4 temi | Asserzioni Playwright su `/preview`: niente overflow con 12 giocatori sul telefono del Sindaco e sulla TV; `touch-action: none` sugli elementi trascinabili; gettoni esauriti disabilitati nel DOM |
| **P4 End-to-end** | Scenario: regia avvia con 5 giocatori, il Sindaco sceglie la parola, la notte mostra i ruoli; il Sindaco **trascina** un nome su un gettone e un gettone su un nome, usa il **tocco-tocco**, annulla; la TV aggiorna conteggi ed evidenziazione; il telefono di chi riceve mostra «a te», gli altri «→ Nome», dopo l'annulla tutti «Annullato»; «Esatto» annullato e poi confermato; caccia al Veggente; rivelazione; seconda partita senza indovinare con voto sul Lupo finito pari, ballottaggio e esito | **Frame WebSocket:** la parola non arriva a schermo e Paesani prima del momento giusto; ruoli altrui mai inviati; server pulito alla fine (`Termina la partita` + `Torna alla lobby`) |
| **P5 Bot e stress** | Strategia in `tools/bots`: un Sindaco simulato assegna gettoni a raffica (anche annulla), gli altri votano | `pnpm stress --players 12` con latenza: nessun errore, conteggi coerenti con il registro; con 13 giocatori l'avvio viene rifiutato |
| **P6 Documenti e pacchetto** | Guida `docs/PAROLE-MANNARE.md`, sezione in `PIANO.md`, `GUIDA-HOST.md`, `rulesText.ts`, lista di parole di esempio in italiano | `pnpm test`, `pnpm test:e2e`, `pnpm package:win` + `pnpm package:check` |

## 8. Rischi residui

- **Ritmo del Sindaco:** è il collo di bottiglia. Mitigazioni: due soli gesti per gettone, tocco-tocco, annulla
  immediato, griglia dei nomi in ordine fisso (lo si impara dopo pochi secondi). Da provare presto con persone vere.
- **Gesti su iOS:** lo scorrimento della pagina o il menu del tocco prolungato possono rubare il trascinamento;
  la schermata del Sindaco non scorre e gli elementi hanno `touch-action: none`. Il tocco-tocco resta sempre come
  alternativa.
- **Troppi giocatori:** con più di 12 il gioco peggiora molto; il limite è imposto dall'engine (`maxPlayers`).
- **Sbirciare i telefoni:** ruolo e parola dietro «tieni premuto»; limite accettato, come le carte fisiche.
- **Parole di esempio:** vanno scritte da noi (niente liste ufficiali) e tarate per difficoltà dopo le prime serate.
- **Riserve con 12 giocatori:** i 36 Sì/No della scatola sono pensati per un tavolo più piccolo; con 11–12
  giocatori le domande sono di più e la riserva potrebbe finire prima del tempo. Si osserva nelle prime serate e,
  se serve, si alza `yesNoPool` dall'editor.
- **Ballottaggi ripetuti:** se ne fa uno solo per voto, così la partita non si blocca.
