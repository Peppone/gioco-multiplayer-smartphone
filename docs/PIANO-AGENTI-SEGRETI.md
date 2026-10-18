# Piano: «Agenti Segreti» (parole e indizi a squadre, in stile Codenames)

> Stato: **implementato** (P0–P6), da provare con persone. Le decisioni del §2 sono state approvate dall'utente; i punti
> che dipendono dal codice esistente sono stati **verificati** (§9); gli scostamenti decisi durante l'implementazione
> sono nel §10. Guida d'uso in [AGENTI-SEGRETI.md](AGENTI-SEGRETI.md).
> Da leggere insieme a [PIANO.md](../PIANO.md) e [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

## 1. Obiettivo

Portare nel gioco le meccaniche di *Codenames* sfruttando ciò che l'app fa meglio: **uno schermo pubblico e
segreti privati sui telefoni**.

In sintesi:
- due squadre (**Rossi** e **Blu**), ognuna con un **Capo-spia**;
- la TV mostra una griglia di **25 parole**; solo i Capi-spia vedono sul telefono la **mappa segreta**: quali parole
  sono degli agenti rossi, quali dei blu, quali sono civili innocenti e quale è l'**assassino**;
- a turno il Capo-spia dà un **indizio** di una parola e un numero («Mare, 2») e la sua squadra **vota dal telefono**
  quali parole toccare;
- vince la squadra che trova per prima tutti i propri agenti; chi tocca l'assassino perde subito.

L'app fa da tavolo: forma le squadre, distribuisce la mappa, mostra indizi e carte scoperte, raccoglie i voti, tiene
il tempo e assegna i punti. La discussione nella squadra resta **a voce**.

**Nome.** «Codenames» è un marchio di Czech Games Edition: nell'app il gioco si chiama **«Agenti Segreti»** (id del
plugin `agenti-segreti`). Regole, testi e lista di parole sono scritti da noi.

## 2. Decisioni (confermate con l'utente)

| Tema | Decisione |
|---|---|
| Nome | **«Agenti Segreti»**, id `agenti-segreti`, tema predefinito `retro80` (atmosfera da spionaggio anni '80) |
| Numero di giocatori | **Da 4 a 30** (`minPlayers: 4`, `maxPlayers: 30`): almeno un Capo-spia e un agente per squadra |
| Squadre | Se la serata ha **esattamente 2 team** con giocatori, ognuno con almeno 2 membri, si usano quelli (chi non ha un team va nella squadra più piccola); altrimenti l'app divide i giocatori a caso in due squadre equilibrate. La regia può spostare i giocatori in `setup` |
| Più di due squadre | **No** nella prima versione (la variante a 3 squadre complica griglia e turni); si valuta dopo le prime serate |
| Capo-spia | Uno per squadra, **estratto a caso** a ogni partita evitando chi lo è già stato nella serata; la regia lo può cambiare in `setup` |
| Indizio | **Scritto dal Capo-spia sul telefono** (parola + numero) e mostrato sulla TV: in una sala rumorosa con 30 persone tutti lo leggono, e il server rifiuta da solo gli indizi che sono parole della griglia (§5.5). Il Capo-spia può anche dirlo a voce |
| Scelta delle parole | **Voto di squadra** con il modulo `team-vote` (§5.6): niente «portavoce» che tocca per tutti |
| Voti sulla TV | **Pubblici**: la TV mostra i pallini dei voti sulle carte, come le dita sulle carte del gioco da tavolo. La discussione è comunque a voce |
| Timer | Facoltativi: indizio 90 s, voto 60 s (0 = senza limite) |
| Regia cieca | Come in Stanze col botto: con «Gioco anch'io» `hostView` **non contiene la mappa** |

## 3. Regole in breve

1. **Preparazione.** Si formano le squadre e si estraggono i Capi-spia. Il server estrae 25 parole e una mappa:
   **9 agenti** per la squadra che inizia (estratta a caso), **8** per l'altra, **7 civili** e **1 assassino**.
2. **Indizio.** Il Capo-spia di turno scrive **una parola** e un **numero** da 0 a 9, oppure **∞**.
   Il numero dice quante parole della griglia si collegano all'indizio.
3. **Voto.** La squadra vota una parola alla volta. La parola più votata viene **scoperta** sulla TV con il suo colore:
   - **agente della propria squadra**: si continua a votare, fino a *numero + 1* parole in tutto;
   - **civile** o **agente avversario**: il turno passa (la carta avversaria resta all'avversario);
   - **assassino**: la squadra **perde subito**.
   Dopo la prima parola, tra le opzioni del voto compare **«Passa»**, che chiude il turno.
   Con **0** o **∞** la squadra può scoprire quante parole vuole (almeno una).
4. **Fine.** Vince chi scopre per primo tutti i propri agenti, anche se l'ultimo l'ha scoperto l'avversario.
   Se nessuno vince entro `maxTurns` (facoltativo), vince chi ha meno agenti da trovare; a parità, pareggio.
5. **Rivelazione.** La TV mostra la mappa completa; i punti vanno in `score_entries`.

## 4. Configurazione dell'istanza (`configSchema`, genera il form dell'editor)

Le parole sono contenuto e si scrivono nell'editor della regia. Il form generato non gestisce unioni né valori
nulli, quindi si usano solo enumerazioni di stringhe e interi (come in Parole Mannare).

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `words` | `string[]` (lista dell'editor, `itemLabel: "Parola"`, al massimo 300 come in Parole Mannare) | lista di esempio (~300 parole) | Almeno 25 (16 con 4×4), con un `.refine`; il plugin scarta i doppioni dopo la normalizzazione (§5.5). Per liste lunghe resta l'import JSON della libreria |
| `gridSize` | `"5x5" \| "4x4"` | `"5x5"` | Con 4×4: 6/5 agenti, 4 civili, 1 assassino (partite brevi o pochi giocatori) |
| `assassins` | intero 0–3 | 1 | 0 = niente assassino (versione per bambini); ogni assassino in più toglie un civile |
| `clueSeconds` | intero ≥ 0 | 90 | 0 = senza limite. Allo scadere il turno passa |
| `guessSeconds` | intero ≥ 0 | 60 | Durata di **ogni** voto; 0 = senza limite (si chiude quando tutti confermano) |
| `maxTurns` | intero ≥ 0 | 0 | 0 = nessun limite (§3, punto 4) |
| `allowZeroInfinity` | booleano | `true` | Abilita gli indizi con 0 e ∞ |
| `points` | `{ win: number, perAgent: number }` | `{ win: 100, perAgent: 0 }` | `win` a ogni membro della squadra vincitrice (Capo-spia compreso); `perAgent` per ogni agente della propria squadra scoperto |

Le parole usate nei round precedenti non si ripropongono finché la lista ne ha abbastanza: il plugin implementa
`shownItems` e l'engine le passa in `ctx.seen`.

## 5. Il plugin `agenti-segreti`

### 5.1 Stato

```ts
type Side = "red" | "blue";
type CardKind = Side | "civilian" | "assassin";

interface Card {
  word: string;
  kind: CardKind;            // segreto finché `revealed` è falso
  revealed: boolean;
  revealedBy: Side | null;
}

interface Clue {
  seq: number;
  side: Side;
  word: string;
  count: number | "inf";     // 0–9 o infinito
  guesses: number;           // parole scoperte con questo indizio
}

interface State {
  phase: Phase;
  seed: number;
  cfg: AgentiConfig;
  teams: Record<Side, { members: string[]; spymaster: string; name: string; color: string }>;
  starting: Side;
  turn: Side;
  turnNumber: number;
  cards: Card[];             // 25 (o 16), in ordine di griglia
  clues: Clue[];             // registro degli indizi: la TV ne mostra la cronologia
  vote: TeamVote | null;     // voto in corso (modulo team-vote)
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  undo: { cardIndex: number; prevTurn: Side; prevPhase: Phase } | null; // per «Annulla scoperta» della regia
  blind: boolean;            // regia cieca (§5.8)
  blindBroken: boolean;
  outcome: { winner: Side | "draw"; reason: "agents" | "assassin" | "turns" } | null;
}
```

Agenti rimasti, indizio attivo e parole ancora scopribili sono **funzioni pure** di `cards` e `clues`.

### 5.2 Fasi

```
setup → clue ─→ guess ─┬─ (agente proprio, tentativi rimasti) → guess
          ↑            ├─ (civile, avversario, «Passa», tempo, tentativi finiti) → clue (altra squadra)
          │            ├─ (tutti gli agenti di una squadra) → reveal
          │            └─ (assassino) → reveal
          └────────────┘                                      reveal → done
```

| Fase | Cosa succede | Come finisce |
|---|---|---|
| `setup` | Squadre e Capi-spia sulla TV; la regia può spostare giocatori e cambiare Capo-spia | La regia preme «Distribuisci» |
| `clue` | Il Capo-spia di turno scrive l'indizio; la TV mostra «Il Capo-spia rosso pensa…» | Indizio inviato; allo scadere di `clueSeconds` il turno passa |
| `guess` | La squadra di turno vota una parola (o «Passa») | Tutti i membri hanno confermato o tempo scaduto; poi si scopre la parola |
| `reveal` | Mappa completa, esito, punti | La regia preme «Avanti» |
| `done` | `isFinished` vero: l'engine registra i punti | — |

La scoperta di una carta non è una fase: `guess` riparte subito con un nuovo `TeamVote`. Il client anima la carta
quando vede `revealed` diventare vero. La rivelazione è una fase a parte (come in Caccia ai Fantasmi) perché
l'engine chiude il round appena `isFinished` è vero.

### 5.3 Input dei giocatori (`inputSchema`, validato con zod)

| Input | Chi | Fase | Note |
|---|---|---|---|
| `{ type: "clue", word, count }` | Capo-spia di turno | `clue` | `word`: 1–30 caratteri, **una parola sola** (sono ammessi trattino e apostrofo: «arcobaleno», «dopo-sci»). `count`: 0–9 o `"inf"`. Rifiutato secondo il §5.5 |
| `{ type: "pick", option }` | membri della squadra di turno, **Capo-spia escluso** | `guess` | `option` = indice di una carta coperta o `"pass"` (solo dopo la prima scoperta del turno). Inoltrato a `castVote` |
| `{ type: "confirm" }` | come sopra | `guess` | `confirmVote`: se confermano tutti, il voto si chiude prima |

Il rifiuto di un indizio non lascia lo stato invariato in silenzio: il server mette `clueError` nella vista del
solo Capo-spia («"Mare" è una parola della griglia»), così il telefono mostra il motivo.

### 5.4 Comandi della regia (`commandSchema`)

`move-player { playerId, side }` e `set-spymaster { side, playerId }` (solo in `setup`), `shuffle-teams`,
`deal`, `pause`, `resume`, `reject-clue` (indizio non valido a giudizio della regia, per esempio una parola che
contiene un pezzo di una carta: il turno passa), `end-turn`, `undo-reveal` (rimette coperta l'ultima carta
scoperta e ripristina turno e fase, per gli errori di voto; un solo livello), `set-blind { blind }`, `next`.

### 5.5 Controllo automatico dell'indizio

L'indizio e le parole si **normalizzano** prima del confronto: minuscole, niente accenti, niente spazi agli estremi.
Il server rifiuta:
- un indizio uguale a una parola **ancora coperta** della griglia;
- un indizio che contiene una parola coperta, o ne è contenuto, se la parte in comune ha almeno 4 lettere
  («marino» con la carta «mare» passa, «pescecane» con la carta «cane» no);
- più parole separate da spazi, o un numero fuori dai limiti.

I casi più sottili (sinonimi stretti, traduzioni, rime) restano alla regia con `reject-clue`, come al tavolo, dove
li giudica l'altra squadra.

### 5.6 Voto di squadra

Si riusa il modulo `team-vote` di `knight-duel`, spostandolo in `packages/minigames/src/team-vote.ts` (oggi sta
nella cartella del duello, che è l'unico a usarlo; un plugin non dovrebbe importare dalla cartella di un altro):
- `createVote({ options: [indici delle carte coperte, + "pass" dopo la prima scoperta], max: 1, members, deadline })`;
- si chiude con `isVoteDone` (tutti confermano o scade `guessSeconds` + `GRACE_MS`);
- **esito**: l'opzione con più voti. Con il voto **pari**, o senza voti, **non si scopre nulla e il turno passa**:
  non si usa lo spareggio per ordine di voto di `resolveVote`, perché un pareggio deciso da chi ha votato prima
  potrebbe scoprire l'assassino. Si aggiunge a `resolveVote` un'opzione facoltativa `onTie: "none"` (con un test):
  con il primo posto pari restituisce `picked: []`. Il duello non la passa e non cambia comportamento.

Con un solo agente in squadra (oltre al Capo-spia), il voto è di fatto la sua scelta.

### 5.7 Punti

A ogni membro della squadra vincitrice `points.win`, con `perAgent` per ogni agente della propria squadra scoperto
(anche dall'avversario). Come nel Duello dei Cavalieri le voci hanno `playerId` e `teamId: null`: l'engine le
attribuisce al team della serata del giocatore (`finalizeRound`) e la classifica dei team somma tutte le voci del
team (`scores.ts`). Con le squadre estratte a caso, quindi, i punti di un giocatore vanno comunque al suo team della
serata. `result()` restituisce la classifica (prima la
squadra vincitrice) e serve anche ai meta-giochi come il duello.

### 5.8 Chi vede cosa (regola d'oro: solo viste filtrate)

| Informazione | TV | Capo-spia (entrambi) | Agente della squadra di turno | Agente dell'altra squadra | Regia |
|---|---|---|---|---|---|
| Parole della griglia | ✅ | ✅ | ✅ | ✅ | ✅ |
| Colore delle carte **coperte** | solo in `reveal` | ✅ | ❌ | ❌ | ✅ (❌ con la regia cieca) |
| Colore delle carte scoperte | ✅ | ✅ | ✅ | ✅ | ✅ |
| Indizi | ✅ | ✅ | ✅ | ✅ | ✅ |
| Voti in corso | ✅ (pallini sulle carte) | ✅ | ✅ | ✅ | ✅ |
| Errore dell'indizio rifiutato | ❌ | solo il proprio | ❌ | ❌ | ✅ |

- Le carte coperte nella vista dei non-Capi e nello `screenView` hanno **solo** `word` e `revealed: false`: il
  campo `kind` non c'è proprio, non è nemmeno `null`. Il test anti-leak verifica le chiavi, non solo i valori.
- Un giocatore che diventa Capo-spia (cambio in `setup`) riceve la mappa; chi smette di esserlo non la riceve più.
  Restano gli occhi: chi l'ha vista lo sa, ma si cambia solo prima di «Distribuisci».
- Regia cieca: `set-blind` come in Stanze col botto. Se viene disattivata a partita iniziata, la TV mostra «La regia
  vede la mappa» (`blindBroken`).

## 6. Interfacce

### 6.1 Schermo condiviso (TV)

```
 🔴 Rossi: 5 da trovare          ⏱ 0:42          🔵 Blu: 3 da trovare
 Indizio rosso: «MARE» · 2   (tentativi: 1/3)

 ┌────────┬────────┬────────┬────────┬────────┐
 │ BALENA │ PONTE  │ ▓▓▓▓▓▓ │ LUNA   │ ROMA   │   ▓ = scoperta (colore della carta)
 │  ●●    │        │ civile │        │  ●     │   ● = voti della squadra di turno
 ├────────┼────────┼────────┼────────┼────────┤
 │  ...                                       │
 └────────────────────────────────────────────┘
 Cronologia: 🔴 Mare·2  🔵 Spazio·3  🔴 Ferro·1
```

- Le carte scoperte si **girano** con il colore della squadra (o grigio per i civili, nero per l'assassino);
  l'animazione dell'assassino è più lunga e teatrale (con suono del tema).
- I pallini dei voti hanno il colore della squadra; il numero di confermati compare sotto il timer.
- La cronologia degli indizi aiuta chi torna dal bagno.
- In `reveal`: la mappa intera si scopre carta per carta, poi la squadra vincitrice.

### 6.2 Telefono del Capo-spia

- **Mappa**: la stessa griglia della TV con il colore di ogni carta (bordo e sfondo tenue; le scoperte sbarrate).
  Pulsante **«Nascondi»** che copre la mappa con un tocco, per quando ci si avvicina agli altri.
- **Indizio** (fase `clue`, al proprio turno): campo di testo per la parola e una fila di pulsanti `0 1 2 … 9 ∞`
  per il numero, poi «Invia». Sotto, l'eventuale errore del §5.5.
- Agli altri turni: «Tocca al Capo-spia blu…» con la mappa sempre consultabile.
- Promemoria fisso: «Non dire niente e non fare facce mentre la squadra vota!».

### 6.3 Telefono degli agenti

- La griglia delle parole (solo testo e carte scoperte), toccabile durante il proprio voto: un tocco seleziona,
  un secondo tocco deseleziona, «Conferma» chiude la propria scelta. «Passa» compare come carta in più.
- I compagni sono visibili come iniziali sulle carte (dalla `memberView` di `team-vote`).
- Fuori dal proprio turno la griglia è in sola lettura, con l'indizio avversario in alto.
- **Una sola schermata, senza scorrimento**: 5×5 su un telefono stretto (360 px) vuol dire carte da ~64 px. Il testo
  si adatta (font più piccolo per le parole lunghe, a capo sulla sillaba solo se serve). Il test di P3 controlla che
  nessuna parola della lista di esempio esca dalla carta.
- **Regole in app**: «ℹ️ Regole» con i numeri veri della partita, da `rulesText.ts`.

### 6.4 Regia (pannello Live)

Squadre con trascinamento dei giocatori o i pulsanti «→ Rossi / → Blu» (in `setup`), «Mescola squadre», Capo-spia
di ogni squadra, «Distribuisci», pausa e ripresa, «Indizio non valido», «Fine turno», «Annulla scoperta», regia
cieca, «Avanti». Senza la regia cieca la regia vede la mappa.

## 7. Fasi di lavoro

Ogni passo si chiude con test verdi e una piccola demo; commit semantici separati (nessun commit senza richiesta).

| Passo | Contenuto | Verifica |
|---|---|---|
| **P0 Modulo condiviso** | Spostare `team-vote.ts` fuori da `knight-duel` (import aggiornati) e aggiungere `onTie: "none"` | I test esistenti del duello restano verdi; nuovo test sul pareggio |
| **P1 Logica del plugin** | Config, stato, squadre e Capi-spia, estrazione deterministica di parole e mappa, fasi, indizio con controllo automatico, voto, scoperte, tentativi *n + 1*, 0 e ∞, «Passa», assassino, fine per agenti e per turni, annulla della regia, punti, `shownItems` | Unit test: mappa con 9/8/7/1 (e 4×4); stesso seme → stessa griglia; indizio uguale a una carta coperta o con una parte in comune di ≥ 4 lettere rifiutato, parola di una carta già scoperta ammessa; input del Capo-spia rifiutati dagli altri e fuori fase; il Capo-spia non vota; voto pari → nessuna scoperta e turno passato; carta avversaria → turno passato e agente all'avversario; ultimo agente scoperto dall'avversario → vince il proprietario; assassino → sconfitta immediata; «Passa» non disponibile prima della prima scoperta; `undo-reveal` ripristina tutto; tempo scaduto in `clue` passa il turno; il contratto di `registry.test.ts` passa |
| **P2 Test anti-leak** | Scorrimento dello stato a ogni passo | `screenView` e `viewFor` dei non-Capi senza la chiave `kind` nelle carte coperte (fino a `reveal`); `clueError` solo al Capo-spia che ha sbagliato; `hostView` cieca senza mappa; cambio di Capo-spia in `setup` toglie la mappa al vecchio |
| **P3 Viste** | `Controller` (Capo-spia e agenti), `Screen`, regole in app; scene in `/preview` (`as-*`: setup, indizio, voto con pallini, scoperta, assassino, rivelazione, Capo-spia nascosto) nei 5 temi | Asserzioni Playwright su `/preview`: nessun overflow della griglia 5×5 a 360×640 con le parole più lunghe della lista; carte coperte senza attributi di colore nel DOM dei telefoni degli agenti; pulsante «Nascondi» funzionante |
| **P4 End-to-end** | Scenario: regia avvia con 6 giocatori su 2 team, sposta un giocatore e cambia un Capo-spia; indizio rifiutato e poi valido; la squadra vota (anche un pareggio), scopre un agente, un civile; l'altra squadra «Passa»; annulla della regia; partita fino all'assassino e un'altra fino a tutti gli agenti | **Frame WebSocket:** la mappa arriva solo ai due Capi-spia (e alla regia non cieca); la TV non riceve `kind` delle carte coperte; server pulito alla fine (`Termina la partita` + `Torna alla lobby`) |
| **P5 Bot e stress** | Strategia in `tools/bots`: Capi-spia simulati che danno indizi validi a caso (anche rifiutati), agenti che votano e confermano | `pnpm stress --players 30 --scenario agenti` con latenza e orologi sfasati: nessun errore, punti coerenti; con 3 giocatori l'avvio viene rifiutato |
| **P6 Documenti e pacchetto** | Guida `docs/AGENTI-SEGRETI.md`, sezione in `PIANO.md` e in `CLAUDE.md` (test richiesti), `GUIDA-HOST.md`, `rulesText.ts`, lista di ~300 parole di esempio in italiano | `pnpm test`, `pnpm test:e2e`, `pnpm package:win` + `pnpm package:check` |

## 8. Rischi residui

- **Squadre da 15:** con 30 giocatori il voto rischia di diventare una baraonda. Mitigazioni: pallini dei voti
  sulla TV (si vede subito dove va la squadra), conferma che chiude il voto prima, timer. Da provare presto.
- **Sbirciare il telefono del Capo-spia:** pulsante «Nascondi» e il consiglio di stare in disparte; limite
  accettato, come la carta chiave fisica.
- **Indizi furbi:** il controllo automatico prende solo i casi evidenti; il resto lo giudica la regia.
- **Griglia sul telefono:** 25 carte su 360 px sono al limite; se la leggibilità non regge, gli agenti votano anche
  dalla TV a voce e il telefono mostra la griglia a 5 colonne con scorrimento verticale (da decidere dopo P3).
- **Lista di parole:** va scritta da noi (niente liste ufficiali) ed evitare parole troppo simili tra loro
  (es. «mare» e «mari»): il server scarta i doppioni dopo la normalizzazione, ma i quasi-doppioni li segnala
  l'editor solo come avviso.
- **Partite lunghe:** con squadre grandi un turno può durare minuti; `guessSeconds` e `maxTurns` lo tengono a bada,
  e la griglia 4×4 è pensata per le serate con poco tempo.
- **Squadre di dimensioni diverse:** la classifica dei team somma i punti dei membri, quindi una squadra da 8 che
  vince vale più di una da 5. È così per tutti i giochi della serata; **per ora si tiene così**, l'utente lo rivede
  più avanti.

## 9. Verifiche sul codice (prima dell'implementazione)

| Punto del piano | Esito | Dove |
|---|---|---|
| `ctx.players` porta il `teamId` della serata; `ctx.teams` elenca i team della serata (anche senza giocatori) | ✅ si filtrano i team con giocatori | `engine.ts`, `next` |
| `minPlayers`/`maxPlayers` controllati dall'engine all'avvio del round | ✅ | `engine.ts`, `next` |
| Roster fisso per tutta la partita, input di chi non c'è ignorati | ✅ nessun ingresso a metà round da gestire | `engine.ts`, `startMatch` e `input` |
| `team-vote` usato solo dal duello | ✅ lo spostamento tocca `knight-duel/index.ts`, `draft.ts` e il test | `minigames/src/knight-duel` |
| `resolveVote` con voti pari sceglie chi ha votato per primo | ✅ per questo serve `onTie: "none"` (P0) | `team-vote.ts`, `resolveVote` |
| Ogni cambio di stato rimanda tutte le viste a tutti | ✅ i voti sono tocchi singoli (al massimo qualche decina al secondo con 15 votanti), nessun limite di frequenza da aggiungere | `realtime.ts`, `flush` |
| `teamId: null` attribuito dall'engine al team del giocatore | ✅ | `engine.ts`, `finalizeRound`; `scores.ts` |
| Form dell'editor: liste, oggetti, booleani, interi, enumerazioni; niente unioni né `null`; `widget` su una lista vale per ogni elemento | ✅ (corretto il piano: `words` come lista, non come area di testo) | `admin/schema-form/SchemaForm.tsx` |
| `.refine` sulla configurazione ammesso | ✅ | `library-service.ts`, altri plugin |
| Regia cieca con `set-blind` | ✅ modello da copiare | `stanze-col-botto/index.ts` |
| Stress con `--scenario` nuovo | ✅ va aggiunto `agenti` all'elenco e una funzione in `scenario.ts` | `tools/bots/src/run.ts` |

## 10. Scostamenti decisi durante l'implementazione

| Punto | Piano | Implementato | Perché |
|---|---|---|---|
| Mappa in `setup` | Il Capo-spia la riceve appena nominato | Nessuno riceve la griglia prima di «Distribuisci» | Più semplice e più sicuro: chi smette di essere Capo-spia in `setup` non l'ha mai vista |
| Capo-spia «già stato» | Evitato nella serata | Evitato nei round precedenti della **partita** | L'engine passa ai round solo `ctx.seen` della partita: i Capi-spia ci vanno con un prefisso (`@capo-spia:`) accanto alle parole uscite |
| Turni senza limite | `maxTurns: 0` = nessun limite | Al massimo 50 turni | Una serie di turni saltati non deve durare per sempre (e il contratto di `registry.test.ts` vuole un round che finisce) |
| Comandi della regia | Nessun «termina» | Aggiunto `end` («Termina la partita»): vince chi ha meno agenti da trovare | Serve alla regia per chiudere una partita che si trascina |
| «Annulla scoperta» | Un livello | Un livello, valido anche dopo l'assassino; non più dopo un nuovo indizio | Dopo un nuovo indizio il gioco è andato avanti e annullare confonderebbe |
| Indizio | Una parola, trattino e apostrofo | Come da piano, e rifiutati anche numeri e simboli (con il motivo) | Le cifre nell'indizio aggirerebbero il numero |
| «Nascondi» | Pulsante sotto la mappa | Nella barra in alto del telefono | Il telefono del Capo-spia sta in una schermata anche con il modulo dell'indizio |
| Testo delle carte | Font più piccolo per le parole lunghe | Corpo calcolato dalla larghezza della carta (container query, `cardText.ts`); nel tema pixel due righe | Un'unica regola per tutti i temi; il test prova tutte le 300 parole d'esempio |
| Stress | Nessun errore, punti coerenti | In più: ogni vista ricevuta da ogni bot passa un controllo di privacy (`privacyProblem`) | Lo stress con 30 telefoni è il modo più ampio di cercare fughe della mappa |
