# Come creare un nuovo minigioco

Ogni minigioco è un **plugin** in due parti:

| Parte | Dove | Cosa contiene |
|---|---|---|
| **Logica** | `packages/minigames/src/<id>/index.ts` | Funzioni pure e deterministiche, senza React. Gira sul server. |
| **Viste** | `packages/client/src/minigames/<id>/<Nome>Views.tsx` | Due componenti React: `Screen` (TV) e `Controller` (telefono). |

Esempio completo e semplice da copiare: **`vero-falso`**. Per il buzzer ordinato per latenza vedi `buzzer`, per i voti anonimi `sondaggio`.

> Regola d'oro: il client non vede mai lo stato grezzo. Il server gli manda solo `screenView` (pubblico) e `viewFor` (quel giocatore). I segreti (risposte, voti) stanno solo nello stato e in `hostView`.

## 1. La logica del plugin

Crea `packages/minigames/src/<id>/index.ts` ed esporta un oggetto `MinigameType`:

```ts
export const mioGioco: MinigameType<Config, State, Input, Command> = {
  id: "mio-gioco",            // minuscolo con trattini: è anche la chiave delle viste
  title: "Il mio gioco",      // nome mostrato all'admin
  defaultTheme: "gameshow",   // gameshow | pixel | manga | retro80 | boom
  configSchema,               // zod: genera il form dell'editor
  inputSchema,                // zod: cosa può inviare il telefono
  commandSchema,              // zod: cosa può inviare la regia ({ type: <id azione> })
  sampleConfig,               // esempio valido: è il punto di partenza dell'editor

  init(config, ctx, now) {},                       // stato iniziale (ctx = giocatori, team, seed)
  onInput(state, playerId, input, meta) {},        // un'intenzione di un giocatore
  onTick(state, now) {},                           // il tempo passa (timer, scadenze)
  onHostCommand(state, command, now) {},           // un comando della regia
  isFinished(state) {},                            // true = il server registra i punti e chiude il round
  result(state) {},                                // classifica del round
  scores(state) {},                                // punti da scrivere nel registro
  screenView(state) {},                            // SOLO info pubbliche
  viewFor(state, playerId, teamId) {},             // solo ciò che quel giocatore può vedere
  hostView(state) {},                              // vista della regia: può avere segreti + azioni
};
```

Regole che i test (vedi §4) verificano per te:

- **Pure**: nessun `Date.now()`, `Math.random()` o effetto collaterale. Il tempo arriva da `now` e `meta`; la casualità dal `ctx.seed`.
- **Stato = JSON**: niente `Map`, `Set`, funzioni o classi (serve per gli snapshot).
- **Niente cambiamenti inutili**: se non succede nulla, `onTick`/`onInput` restituiscono **lo stesso oggetto** `state`. Il server lo usa per sapere se deve rinviare le viste ai client.
- **Immutabile**: restituisci sempre un nuovo oggetto, non modificare quello ricevuto.
- **Squadre**: se il round forma le squadre da `ctx.teams` e dal `teamId` dei giocatori, dichiara `teamBased: true`: la regia potrà sostituire le squadre della serata con [squadre temporanee](SQUADRE-TEMPORANEE.md) e il plugin le riceve come se fossero quelle della serata (anche il capitano, `ParticipantInfo.captain`). I punti vanno sempre assegnati ai **giocatori** (`playerId`): è l'engine ad attribuirli alle squadre della serata.
- **Equità con la latenza**: per tutto ciò che dipende dalla velocità usa `fairTime({ claimed, receivedAt, rtt, openedAt })` e una tolleranza dopo la scadenza (`GRACE_MS` in `util.ts`). Mai il semplice ordine di arrivo.
- **Configurazione**: ogni campo con `.meta({ title, description })` in italiano. Suggerimenti per il form: `widget: "textarea"`, `widget: "lines"` (su un elenco di testi: un'area di testo con un elemento per riga, con doppioni e testi troppo lunghi segnalati; esempio: le liste di parole), `widget: "optionIndex"` (con `optionsKey`), `widget: "audio"` (carica un brano nella mediateca del server: il campo è una stringa validata con `MEDIA_FILE_PATTERN` e il file si legge da `/media/<file>`; esempio: `indovina-canzone`), `itemLabel`, `enumLabels`. I campi con `.default(...)` nascono già compilati.

### Azioni della regia

`hostView(state).actions` è un elenco `{ id, label, enabled, danger? }`. Il pannello Live mostra un pulsante per ciascuna e, al clic, invia `{ type: <id> }` a `onHostCommand`. Non serve scrivere nessuna interfaccia per la regia.

### Punti

`scores(state)` restituisce `{ playerId, teamId: null, points, reason }`: il server completa il team del giocatore e scrive nel registro `score_entries` una sola volta, quando `isFinished` diventa vero (o la regia termina il round). Da lì si calcolano classifica individuale e a squadre.

## 2. Registra il plugin

In `packages/minigames/src/index.ts` importalo e aggiungilo a `minigames`:

```ts
export const minigames = { [quizMultipla.id]: quizMultipla, /* … */ [mioGioco.id]: mioGioco };
```

Da qui l'editor dell'admin lo mostra già (pulsante «+ Il mio gioco» nella Libreria), con il form generato dallo schema.

## 3. Le viste React

Crea `packages/client/src/minigames/<id>/<Nome>Views.tsx` con due componenti:

```tsx
export function MioGiocoScreen({ view, clock, theme }: ViewProps) { /* TV */ }
export function MioGiocoController({ view, send, clock, theme }: ControllerProps) { /* telefono */ }
```

- `view` è esattamente ciò che ha restituito `screenView`/`viewFor`: definisci un'interfaccia TypeScript locale e fai il cast.
- `send({ ... })` invia un'intenzione (viene validata con `inputSchema` sul server). Il timestamp della pressione è aggiunto in automatico.
- Per i conto alla rovescia usa `<Countdown openedAt deadline clock />`: le scadenze sono in **ora server** e `clock` le converte.
- Suoni: `const sfx = useSfx(theme); sfx("start" | "tick" | "buzz" | "correct" | "wrong" | "reveal" | "fanfare" | "notify" | "mail")`, di solito in un `useEffect` che reagisce al cambio di fase.
- Il tema è già applicato dal contenitore (`data-theme`): usa le variabili CSS (`--panel`, `--accent`, `--opt-0…5`, `--radius`…) e le classi esistenti (`.question`, `.option`, `.answer`, `.big`, `.muted`, `.bars`, `.results`) invece di colori fissi.
- Sul telefono: pulsanti grandi, niente scroll, azioni con `onClick` (o `onPointerDown` se conta la rapidità).

Registra le viste in `packages/client/src/minigames/registry.ts`:

```ts
"mio-gioco": { Screen: MioGiocoScreen, Controller: MioGiocoController },
```

## 4. Test (obbligatori)

1. **Unit test del plugin** `<id>.test.ts` accanto al codice: regole di gioco, punteggi, input non validi, chi non è in serata, scadenze.
2. **Test anti-leak**: verifica che `screenView` e `viewFor` degli altri giocatori **non contengano** i segreti (risposta giusta, voti, stime altrui) prima del momento in cui diventano pubblici. Vedi `stima.test.ts` e `sondaggio.test.ts`.
3. **Contratto generico**: `packages/minigames/src/registry.test.ts` esegue su *ogni* plugin registrato i controlli di base (config di esempio valida, stato serializzabile, `onTick` senza cambi inutili, round completabile). Il tuo plugin li eredita da solo: devono passare.
4. **Test end-to-end** in `e2e/`: uno scenario che gioca il minigioco dal telefono alla classifica, controlla il DOM e (se ci sono segreti) il traffico WebSocket. Usa il fixture `newGame` di `e2e/support.ts` (vedi `e2e/minigames.spec.ts`). Lancia `pnpm test:e2e`.
5. Se il minigioco ha latenza o ordine di arrivo rilevanti, aggiungi una simulazione con ritardi casuali (vedi `buzzer.test.ts`).

## 3 bis. Viste leggere (invii raggruppati)

Il server **accorpa** gli invii (al massimo ogni ~80 ms) e **non rimanda a un telefono una vista identica** all'ultima inviata (`flush` in `realtime.ts`). Conviene quindi
tenere `viewFor` **essenziale**: ciò che cambia a ogni azione di un giocatore (posizioni, contatori, avanzamenti) e che riguarda solo lui o solo la TV non
deve stare nella vista di tutti gli altri telefoni, altrimenti ogni azione costa un messaggio per ogni giocatore (con 30 telefoni, ~30). Metti le informazioni
`solo schermo` in `screenView`. Le funzioni devono restituire viste **deterministiche** (stesso stato, stesso JSON): niente timestamp o contatori che cambiano da soli.

## 4 bis. Game Master e interfaccia ricca per la regia (facoltativo)

Per un gioco condotto da una persona (un GDR, un gioco a indizi) il plugin può dichiarare:

- `master: true`: il round ha un'interfaccia per il **Game Master**. La regia genera dal pannello Live un link limitato (`/master#t=…`, QR) che apre un telefono con la `hostView` del plugin e i soli comandi del plugin (`commandSchema`): niente CRUD, niente engine, niente rettifiche. Il token si può revocare e scade a fine partita.
- `maxPlayers: N` e `minPlayers: N`: l'engine rifiuta l'avvio del round se la serata ha più giocatori (o meno), con un messaggio chiaro alla regia.
- `messages(state)`: messaggi ed eventi del round (`RoundMessage[]`, id crescenti). L'engine li salva nel database dopo ogni cambio di stato, in modo idempotente (chiave unica round + id), anche quando lo stato ne tiene solo gli ultimi.
- Una vista `Host` nel registro del client (`Host: lazy(() => import("./<id>/<Nome>Host"))`): riceve `{ info, run(command), clock, theme }`, dove `info` è la `hostView.info` e `run` invia un comando al plugin. Compare nel pannello Live al posto dei pulsanti generici di `hostView.actions` e in `/master`. Va caricata con `lazy`, così non finisce nel pacchetto del telefono.

Esempio completo: `stanze-segrete` (guida in [STANZE-SEGRETE.md](STANZE-SEGRETE.md)). Ricorda che i contenuti segreti che il GM vede non devono mai comparire in `screenView` / `viewFor`: aggiungi i test anti-leak.

## 5. Anteprima grafica (facoltativa)

Aggiungi una scena a `packages/client/src/preview/Preview.tsx` per vedere il look del plugin nei quattro temi su `/preview?theme=…&scene=…`.

## Checklist finale

- [ ] `pnpm typecheck` senza errori
- [ ] `pnpm test` verde (incluso `registry.test.ts`)
- [ ] `pnpm test:e2e` verde
- [ ] Testi per giocatori e regia in italiano, nomi nel codice in inglese
- [ ] Nessun colore o font fisso nelle viste (solo variabili del tema)
- [ ] Il telefono resta leggero: niente librerie pesanti nel controller
