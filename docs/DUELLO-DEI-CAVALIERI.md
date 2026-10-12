# Duello dei Cavalieri: guida per la regia

Due **squadre** (o due **singoli giocatori**) sono rappresentate da due cavalieri. Si vincono minigiochi per ottenere carte segrete, poi le carte si usano per battere l'avversario. Gli altri giocatori fanno gli spettatori.

## Come funziona un duello

```
 Minigioco  →  Draft  →  (ripeti X volte)  →  Battaglia  →  ripeti…  →  KO / PV / oltranza
```

1. **Minigioco**: uno qualsiasi tra quelli scelti dalla regia (a caso senza ripetizioni, oppure scelto dalla regia ogni volta). Lo giocano i membri dei due lati; vince chi totalizza più punti (in parità: miglior piazzamento individuale, poi sorteggio). I punti del minigioco **non** vanno in classifica: servono solo a decidere chi sceglie per primo.
2. **Draft**: si offrono alcune carte (default 5). **Il vincitore ne sceglie una, poi lo sconfitto ne sceglie una, poi il vincitore ne sceglie una seconda** (default 2 + 1; si cambia con «Carte scelte da chi vince/perde»). Le carte non scelte tornano nel mazzo. Così, con 2 minigiochi per battaglia, la mano è di circa 3 carte e se ne giocano al massimo 2: si sceglie davvero cosa giocare e cosa tenere per dopo.
   - Vede le carte solo il team che sta scegliendo, e solo quelle rimaste: non sa quale hanno preso gli altri. (Il vincitore, alla sua seconda scelta, vede le carte che lo sconfitto ha lasciato.)
   - La scelta è un **voto di team**: ogni membro tocca la carta che preferisce e vede in tempo reale cosa hanno scelto i compagni. Vince la maggioranza; in parità prevale la carta votata per prima; se nessuno vota, si sceglie a caso.
3. **Battaglia** (ogni X minigiochi, default 2): i due team scelgono **in segreto e in contemporanea** fino a N carte da giocare (default 2), con lo stesso tipo di voto. Poi le carte si **rivelano insieme** e lo schermo racconta lo scontro evento per evento.
4. **Fine**: vince chi mette KO l'avversario (0 PV). Dopo le battaglie massime vince chi ha più PV; **in parità si gioca a oltranza** (battaglie senza minigioco, con carte fresche) finché uno ha più PV. Se dopo 10 battaglie a oltranza è ancora pari, decide il sorteggio.
5. **Punti serata**: solo l'esito conta. Ogni giocatore del lato vincente prende X punti, ogni giocatore del lato perdente Y (default 500 e 100). La regia conclude il duello con il pulsante «Concludi il duello».

Il telefono mostra le carte **compatte**: per vederne il testo si **tiene premuta** la carta (così chi è accanto non legge la mano).

## Le carte e gli effetti

Ogni carta ha: nome, icona, rarità, **iniziativa**, **copie** nel mazzo e da 1 a 3 **effetti**.

| Effetto | Cosa fa | Quando si risolve |
|---|---|---|
| **Scudo** N | Blocca N danni in questa battaglia | Fase 1 (difese) |
| **Contrattacco** N | Se vieni attaccato (una volta per carta, e solo se sopravvivi) rispedisci N danni, ignorando gli scudi | Fase 1 (difese) |
| **Cura** N | +N PV, fino al massimo | Fase 2 |
| **Attacco** N | N danni all'avversario | Fase 3 |
| **Veleno** N × T | Non fa danni subito: N danni (ignorano gli scudi) a ogni battaglia successiva, per T battaglie | Fase 4 |
| **Furto** | Ruba una carta casuale dalla mano avversaria (non quelle appena giocate); a mano vuota non fa nulla | Fase 4 |
| **Spia** | Rivela al tuo team una carta casuale della mano avversaria | Fase 4 |
| **Sabotaggio** N% | L'avversario perde N% dei punti nel prossimo minigioco (cumulabile, massimo 100%) | Fase 4 |
| **Colpo pesante** N | N danni, ma si risolve **per ultimo** | Fase 5 |

**Ordine di risoluzione**: difese → cure → attacchi → effetti → colpo pesante. Dentro ogni fase si risolve per **iniziativa decrescente**; a pari iniziativa decide il seme (equo per i due lati). **Il primo KO chiude subito la battaglia**: le azioni successive non avvengono (quindi un attacco più veloce può mettere KO prima che un colpo pesante arrivi).

## Come si prepara una serata con un duello

Il duello è un minigioco come gli altri: si crea in *Libreria* e si aggiunge a una partita come round.

1. **Squadre e giocatori**: in *Serate* crea la serata, scegli le squadre e assegna i giocatori. Gli sfidanti li decide la serata, non il modulo del duello:
   - **Due squadre**: le prime due squadre della serata **in ordine alfabetico** che hanno almeno un giocatore. Con più di due squadre le altre fanno da spettatori; per far sfidare altre squadre, togli dalla serata quelle che non devono giocare.
   - **Due giocatori**: due giocatori della serata estratti a sorte all'avvio.
2. **Minigiochi**: in *Libreria* crea le istanze che vuoi usare nel duello (quiz, buzzer, vero/falso, stima, sondaggio). Meglio quelli rapidi.
3. **Mazzo** (facoltativo): in *Libreria* crea un «Mazzo di carte (Duello)». Parte dal mazzo base da 15 carte, che puoi modificare dal modulo: nome, icona, rarità, iniziativa, copie ed effetti. Senza un mazzo si usa quello base.
4. **Il duello**: in *Libreria* premi **+ Duello dei Cavalieri**, dai un titolo, scegli chi si sfida, i minigiochi, il mazzo e le impostazioni (PV, battaglie, tempi, ecc.).
5. **Partita**: in *Serate* aggiungi una partita e, con **+ Aggiungi round dalla libreria…**, scegli il duello. Può stare da solo o insieme ad altri round (un quiz, poi il duello…): i punti del duello entrano in classifica come quelli di ogni round.
6. **Conduzione**: in *Live* avvia la partita e poi «Avvia round N: <titolo del duello>». La regia può chiudere un minigioco, saltare un draft o rivelare subito le carte; tutto il resto va avanti da solo.

Una stessa istanza del duello si può riusare in più serate e duplicare dalla Libreria per avere varianti (più brevi, con un altro mazzo…).

### Impostazioni (con i valori predefiniti)

| Impostazione | Default | Note |
|---|---|---|
| Punti vita dei cavalieri | 20 | Con più PV i duelli si allungano |
| Minigiochi tra una battaglia e l'altra | 2 | |
| Battaglie massime | 6 | Poi vince chi ha più PV (o si va a oltranza) |
| Carte offerte a ogni draft | 5 | Meglio più delle carte che si prendono |
| Carte scelte da chi vince / perde il minigioco | 2 / 1 | Il vincitore sceglie per primo e per ultimo |
| Carte giocabili per battaglia | 2 | |
| Carte massime in mano | 6 | Oltre il limite si scarta la più vecchia |
| Tempo per scegliere al draft / in battaglia | 15 s / 20 s | Il voto si chiude prima se tutti confermano |
| Se il team non vota in battaglia | una carta a caso | Oppure una carta difensiva, oppure nessuna |
| Scelta del minigioco | a caso senza ripetizioni | Oppure la sceglie la regia |
| Punti serata vincitori / perdenti | 500 / 100 | |

Durata indicativa con i valori predefiniti: 4-6 battaglie, cioè circa 8-12 minigiochi.

## Tarare un mazzo

Un mazzo sbilanciato rovina il duello. Dalla Libreria **esporta** il mazzo e analizzalo con le simulazioni:

```
pnpm duel:balance                                  # mazzo base
pnpm duel:balance mio-mazzo.json                   # mazzo esportato dalla Libreria
pnpm duel:balance mio-mazzo.json --hp 25 --duels 4000 --battles 6 --minigames 2
```

Il comando fa giocare migliaia di duelli tra bot casuali e stampa: durata mediana, quanti finiscono per KO, equilibrio tra i due lati e, per ogni carta, in quanti duelli è giocata e quanto spesso vince chi la gioca. Segnala come **FORTE** o **DEBOLE** le carte fuori dalla fascia 38-62%.

Cosa guardare:
- **Durata**: almeno il 60% dei duelli dovrebbe finire per KO; se sono tutti lunghi, riduci i PV o aumenta i danni.
- **Lati**: vicino a 50% / 50%. Uno squilibrio indica un vantaggio di posizione.
- **Carte**: una carta sopra il 62% è probabilmente troppo forte, sotto il 38% troppo debole. Spia e Sabotaggio risultano un po' basse perché i bot non sanno sfruttare l'informazione e il malus: è normale, ma non esagerare.

I bot sono casuali: i risultati sono una guida, non una verità. Una vera serata dice di più.

## Per chi sviluppa

- Logica pura e testata in `packages/minigames/src/knight-duel/`: `cards.ts` (carte, schema e mazzo base), `battle.ts` (risoluzione), `team-vote.ts`, `draft.ts`, `index.ts` (il plugin contenitore), `simulate.ts` e `analysis.ts` (bot e analisi).
- Il duello è un normale plugin-round. La sua istanza in libreria (`libraryConfigSchema`, che genera il modulo) riferisce altre istanze per id; `buildConfig` la traduce nella configurazione completa (`DuelConfig`) all'avvio della partita, leggendo la libreria e la serata, e sceglie gli sfidanti. Per l'engine è un round qualunque.
- I database creati quando il duello era una «modalità» di partita vengono migrati all'apertura (`migrateDuelMatches` in `packages/server/src/db.ts`): la partita diventa classica con un round-duello equivalente.
- Viste: `packages/client/src/minigames/knight-duel/`. Gli sprite sono **Kenney «Tiny Dungeon»** (CC0) in `packages/client/public/assets/kenney/`.
- Test: `pnpm test` (battaglie con tabelle di casi, 1000 duelli simulati, segretezza delle viste) e `pnpm test:e2e` (`e2e/duel.spec.ts`: duello completo con 4 telefoni e controllo del traffico WebSocket).
