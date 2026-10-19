# Agenti Segreti: guida

Gioco di parole e indizi a squadre nello stile di *Codenames*: la TV fa da tavolo con la griglia di parole, i
telefoni dei due **Capi-spia** mostrano la mappa segreta, e le squadre votano dal telefono quali carte scoprire. La
discussione resta **a voce**. Da **4 a 30 giocatori** (con meno di 4 o più di 30 il round non parte). Decisioni e
motivazioni in [PIANO-AGENTI-SEGRETI.md](PIANO-AGENTI-SEGRETI.md). «Codenames» è un marchio di Czech Games Edition:
qui il gioco si chiama *Agenti Segreti* e regole, testi e lista di parole sono nostri.

## Come si gioca

1. **Due squadre**, ognuna con un **Capo-spia**. Sulla TV ci sono **25 parole** (16 con la griglia 4×4). Dietro ogni
   parola c'è un agente dei Rossi, uno dei Blu, un civile innocente o l'**assassino**: lo sanno solo i Capi-spia.
2. La squadra che inizia (estratta a caso) ha **9 agenti** da trovare, l'altra **8**; i civili sono **7** e
   l'assassino **1** (4×4: 6 e 5 agenti, 4 civili).
3. **Indizio.** Il Capo-spia di turno scrive sul telefono **una parola** e un **numero** (da 1 a 9, oppure 0 o ∞):
   quante carte della sua squadra si collegano all'indizio. L'indizio compare sulla TV. Il server rifiuta da solo le
   parole della griglia e quelle che ne contengono una (o ne sono contenute) con almeno 4 lettere in comune
   («pescecane» con la carta «cane» no, «marino» con la carta «mare» sì).
4. **Voto.** La squadra discute a voce e vota sul telefono **una carta alla volta**; «Conferma» chiude la propria scelta.
   I voti sono pubblici: sulla TV compaiono come pallini con le iniziali. Si scopre la carta più votata:
   - un **agente della propria squadra**: si continua, fino al numero dell'indizio **più uno**;
   - un **civile** o un **agente avversario**: il turno passa (l'agente resta all'avversario);
   - l'**assassino**: la squadra **perde subito**.
   Con un **pareggio**, o senza voti, non si scopre nulla e il turno passa (un pareggio deciso da chi ha votato prima
   potrebbe scoprire l'assassino). Dopo la prima carta scoperta si può votare **«Passa»**. Con 0 o ∞ si possono
   scoprire quante carte si vuole.
5. **Fine.** Vince chi scopre per primo tutti i propri agenti, anche se l'ultimo l'ha scoperto l'avversario. Con un
   limite di turni, alla fine vince chi ha meno agenti da trovare (a parità, pareggio). La TV mostra la mappa intera.
6. **Punti.** Ogni membro della squadra vincitrice, Capo-spia compreso, prende `points.win` (100 di default), più
   `points.perAgent` per ogni agente della propria squadra scoperto (0 di default).

Le regole con i numeri della partita sono anche nel telefono (pulsante «ℹ️»), dal file `rulesText.ts`.

## Preparare il gioco (regia, `/admin`)

### Le parole (nel database)

Le parole non sono scritte nel programma: stanno nella **libreria**, come «Lista di parole» (lo stesso contenuto che
usa Reazione a catena). Al primo avvio il server crea la lista **«Parole di Agenti Segreti»** con 300 parole
d'esempio; da lì in poi è un contenuto come gli altri:

- **aggiungere e correggere**: «Modifica» sulla lista apre un'area di testo con **una parola per riga**; si scrive o
  si incolla un elenco intero. Sotto compaiono quante sono, i doppioni (maiuscole e accenti a parte: contano una
  volta) e le parole troppo lunghe. Nel gioco si saltano quelle oltre 20 lettere;
- **salvare**: «Salva» la scrive nel database (vale per le prossime partite); «Duplica» ne fa una copia da cambiare
  senza toccare l'originale;
- **esportare e importare**: «Esporta» scarica la lista in JSON (si reimporta con «Importa JSON»), «Scarica come testo
  (.txt)» nell'editor scarica le parole una per riga.

Se elimini o modifichi la lista d'esempio, al riavvio il server non la ricrea.

### L'istanza

Nella libreria si crea un'istanza di «Agenti Segreti»:

| Campo | Default | Note |
|---|---|---|
| Lista di parole | — | Una lista della libreria (per esempio «Parole di Agenti Segreti») |
| Parole proprie | nessuna | In più rispetto alla lista (anche al posto della lista). In tutto servono almeno 25 parole diverse (16 con 4×4), altrimenti la partita non parte. Le parole uscite nei round precedenti della partita non si ripropongono finché ne restano |
| Griglia | 5×5 | 4×4 per partite brevi o con pochi giocatori |
| Assassini | 1 | 0 = versione per bambini; ogni assassino in più toglie un civile |
| Tempo per l'indizio | 90 s | 0 = senza limite; allo scadere il turno passa |
| Tempo di ogni voto | 60 s | 0 = senza limite (si chiude quando confermano tutti) |
| Turni al massimo | 0 | 0 = nessun limite (comunque al massimo 50) |
| Indizi con 0 e ∞ | sì | |
| Punti | 100 alla vittoria, 0 per agente | |

### Squadre e Capi-spia

Se la serata ha **esattamente due team** con giocatori, ognuno con almeno 2 membri, le squadre sono quelli (chi non ha
un team va nella squadra più piccola); altrimenti l'app divide i giocatori a caso in due squadre equilibrate. Il
Capo-spia è estratto a caso, evitando chi lo è già stato nei round precedenti della stessa partita.

All'avvio del round la TV mostra le squadre e i Capi-spia, e la regia può:
- spostare un giocatore nell'altra squadra («→ Blu»; una squadra non scende sotto i 2 giocatori);
- cambiare il Capo-spia (🕶);
- rifare le squadre a caso («Mescola squadre»).

Poi **«Distribuisci»**: da qui i due Capi-spia vedono la mappa e squadre e Capi-spia non si cambiano più. Prima di
«Distribuisci» la griglia non arriva a nessuno, nemmeno ai Capi-spia.

### Durante la partita

| Pulsante | Quando |
|---|---|
| Pausa / Riprendi | Ferma il tempo dell'indizio o del voto |
| Indizio non valido | Un indizio che il controllo automatico non prende (sinonimi stretti, traduzioni, un pezzo di una carta): l'indizio resta in cronologia barrato e il turno passa |
| Fine turno | Il turno passa all'altra squadra |
| Annulla scoperta | Rimette coperta l'ultima carta scoperta e ripristina turno, indizio ed esito (anche dopo l'assassino), per gli errori di voto. Un solo livello, e non dopo un nuovo indizio |
| Termina la partita | Chiude subito: vince chi ha meno agenti da trovare |
| Avanti | Dopo la mappa finale: chiude il round e registra i punti |

### Regia cieca («Gioco anch'io»)

Con la casella spuntata la regia non riceve la mappa: vede le carte come la TV. Se la si toglie a partita iniziata,
la TV mostra «⚠ La regia vede la mappa».

## Consigli per la serata

- I **Capi-spia** stiano in disparte, o almeno con il telefono girato: il pulsante **«🙈 Nascondi»** copre la mappa con
  un tocco. Mentre la squadra vota non devono dire niente né fare facce.
- Con **squadre grandi** (10–15) il voto rischia la baraonda: i pallini sulla TV mostrano subito dove va la squadra, e
  «Conferma» chiude il voto appena tutti hanno scelto. Il tempo del voto tiene il ritmo.
- Per una partita breve: griglia 4×4, oppure un limite di turni.

## Per chi sviluppa

- Plugin: `packages/minigames/src/agenti-segreti/` (`index.ts` stato, fasi e viste; `clue.ts` controllo
  dell'indizio). L'istanza (`agentiSegretiLibrarySchema`) riferisce una lista di parole (`word-list.ts`, comune con
  Reazione a catena) e `buildConfig` la risolve all'avvio. Il voto usa il modulo comune
  `packages/minigames/src/team-vote.ts` con `onTie: "none"`.
- Parole d'esempio: `packages/server/src/seed-words.ts`, scritte nel database una volta sola da `library-seed.ts` (il
  segno `seed.agenti-segreti-words` in `settings` evita di ricrearle se la regia le elimina).
- Viste: `packages/client/src/minigames/agenti-segreti/` (TV, telefono, regia `AgentiHost.tsx`, regole
  `rulesText.ts`, anteprima `previewData.ts` con le scene `as-*`). Il testo delle carte si adatta alla larghezza con le
  container query (`cardText.ts`); nel tema pixel le parole lunghe vanno su due righe.
- **Privacy**: le carte coperte nelle viste di TV e agenti hanno solo `word` e `revealed` (la chiave `kind` non c'è);
  la mappa (`me.map`) arriva solo ai Capi-spia, dopo «Distribuisci»; l'errore dell'indizio solo a chi l'ha scritto.
- Test richiesti per ogni modifica a fasi, voto, indizio o viste: `agenti-segreti.test.ts` (compresi gli anti-leak),
  gli scenari `e2e/agenti-preview.spec.ts` e `e2e/agenti-segreti.spec.ts` e `pnpm stress --players 30 --scenario agenti`
  (con 3 giocatori l'avvio del round deve essere rifiutato). Se cambiano le regole si aggiorna `rulesText.ts`.
