# Pilota alla cieca: guida

Gara a squadre in un labirinto con **informazioni divise**: chi guida non vede i pericoli, chi vede i pericoli non guida.
Il **pilota** guarda la TV e muove la pedina con la croce del telefono; ogni **navigatore** vede sul telefono la mappa con
**un solo strato** di informazioni (mine, porte, chiavi o pattuglie) e deve dirlo a voce. Da **2 a 30 giocatori**. Decisioni e
motivazioni in [PIANO-PILOTA-CIECO.md](PIANO-PILOTA-CIECO.md).

## Come si gioca

1. **Squadre e corsie.** Ogni squadra ha il suo labirinto sulla TV: si vedono i muri, il pilota, l'ingresso, l'uscita
   (la bandierina), i punti di controllo (i rombi) e **dove** sono le porte. Non si vedono i pericoli. Le squadre corrono
   **insieme** (fino a 4 corsie, TV divisa) oppure **a turno** (una alla volta, labirinto a tutto schermo).
2. **Labirinti diversi ma equivalenti**: uno per squadra, con le stesse quantità di mine, porte, chiavi e pattuglie, e un
   percorso più breve di lunghezza simile (entro il 10% della media). Guardando le corsie altrui non si impara dove sono
   le mine.
3. **Il pilota** muove la pedina con la croce, un passo alla volta, con una pausa minima tra due passi (`stepMs`, 350 ms).
   Tenendo premuta una freccia si cammina. I muri non fanno nulla.
4. **Pericoli**:
   - **mina** o **pattuglia**: il pilota «salta», torna all'ultimo punto di controllo e resta fermo per `penaltyMs` (3 s);
     conta un errore. La mina diventa visibile a tutti; la pattuglia no. Una pattuglia raggiunge anche chi sta fermo;
   - **porta chiusa**: urto, fermo per 1 secondo (nessun errore). Le porte si aprono e chiudono a periodi regolari;
   - **chiave**: servono tutte per aprire l'uscita (con 0 chiavi l'uscita è sempre aperta). La TV mostra quelle raccolte.
5. **Arrivo**: con la chiave sull'uscita. L'ordine di arrivo si decide **all'ora equa** della pressione, non a quella di
   arrivo del messaggio. Allo scadere del tempo (`levelSeconds`, 150 s) chi non è arrivato prende punti in base alla strada
   fatta.
6. **Livelli**: `levels` (3) livelli sempre più difficili (labirinto più grande, più mine, porte più veloci, pattuglie dal
   livello 2). Il pilota **cambia a ogni livello**. A fine gara la TV **scopre tutti gli strati** di ogni corsia.
7. **Punti** (alla squadra, e li prende ogni membro): `finishPoints` per ordine di arrivo (150, 100, 75, 50; oltre la lista
   vale l'ultimo), `distancePoints` (fino a 50) a chi non arriva in proporzione alla strada, meno `strikePenalty` (10) per
   mina o pattuglia (mai sotto zero nel livello). In **«a turno»** i punti si assegnano a livello completo, perché l'ordine
   è per tempo di arrivo tra gare fatte una dopo l'altra.

Le regole con i numeri della partita, e la sezione del proprio ruolo, sono anche nel telefono («ℹ️»), dal file `rulesText.ts`.

**Gli strati.** Con più navigatori che strati ne avanzano senza strato; con meno, uno ne ha più di uno. Gli strati
effettivamente presenti dipendono dal livello (niente «pattuglie» al livello 1, niente «mine» con densità 0). Sul telefono
del navigatore compaiono anche il pilota dal vivo, e le porte con i **secondi al prossimo cambio**; le pattuglie si
muovono: tutto è calcolato in locale (`timeline.ts`, in `@gioco/shared`) dall'orologio sincronizzato, senza traffico.
«🙈 Nascondi» sfoca la mappa quando il pilota si avvicina.

## Preparare il gioco (regia, `/admin`)

I labirinti si generano dal seme: non c'è contenuto da scrivere. Nella libreria si crea un'istanza di «Pilota alla cieca»:

| Campo | Default | Note |
|---|---|---|
| Modalità | insieme | «a turno» una squadra alla volta; con più di 4 squadre «insieme» corre a gruppi di 4, uno dopo l'altro |
| Livelli | 3 | da 1 a 5 |
| Dimensione | medio | 9×9, 11×11 o 13×13 al primo livello, +2 a livello fino a 13 (15 a turno) |
| Mine | 8% | percentuale delle caselle (al massimo il 20%): aumentano a ogni livello, mai sul percorso più breve |
| Porte | 3 | da 0 a 8 |
| Chiavi | 1 | da 0 a 3 |
| Pattuglie | sì | dal livello 2 |
| Pausa tra due passi | 350 ms | da 150 a 1000 |
| Blocco dopo una mina | 3000 ms | |
| Durata di un livello | 150 s | da 30 a 600 |
| Punti per ordine di arrivo | 150, 100, 75, 50 | |
| Punti a chi non arriva | 50 | massimo, in proporzione alla strada |
| Penalità per mina o pattuglia | 10 | |

**Squadre**: si usano i team della serata, ognuno con almeno **2 giocatori** (il pilota e un navigatore), altrimenti la
partita non parte. Senza team l'app divide i giocatori in 2–4 squadre a caso (una sola con meno di 4 giocatori).

**Condurre**: il pannello Live mostra, per ogni corsia, **tutti gli strati** e chi li ha. Pulsanti: **Via** (altrimenti il
livello parte da solo dopo 10 s), **Pausa/Riprendi** (ferma il tempo; alla ripresa si sposta di altrettanto ogni
tempo, così porte e blocchi non saltano), **Avanti** (dopo ogni gara), **Cambia pilota** (prima del via, per chi è assente),
**Chiudi la gara** e **Termina il round** (restano i punti già fatti).

## Equità e privacy

- Un passo si giudica all'**ora equa** (`fairTime`): stessa pressione, ritardi di rete diversi, stesso esito su porte e
  pattuglie. Un passo in tempo che arriva poco dopo la scadenza vale ancora.
- La TV e il pilota non ricevono mai mine, orari delle porte, chiavi non raccolte né pattuglie, e un navigatore solo i propri
  strati, della propria corsia: lo garantiscono `pilota-leak.test.ts` (a ogni passo di partite intere, per ogni numero di
  navigatori, con una fuga inventata che il controllo deve segnalare), i frame WebSocket dell'e2e e il controllo di
  privacy dello stress. A fine gara si scopre tutto, di proposito.

## Misure dello stress (per Plancia di Comando)

`pnpm stress --players 30 --scenario pilota`: 4 squadre da 7–8 giocatori che corrono insieme (2 livelli, labirinti 9×9 e
11×11, `stepMs` 300 ms), con latenza di rete 50–250 ms e orologi sfasati; piloti simulati che fanno un passo ogni ~0,5 s ciascuno
(~3,5 passi al secondo in tutto):

- **441 passi** hanno prodotto **13 531 aggiornamenti** ai telefoni: **~31 invii per passo**, uno per ogni telefono, perché
  ogni cambio di stato rimanda tutte le viste a tutti (`flush` in `realtime.ts`);
- dopo un passo lo stato arriva a chi l'ha mandato in **mediana 3 ms, p95 4 ms, massimo 734 ms** (server e rete locale, senza la
  latenza simulata in arrivo); dopo un comando della regia l'aggiornamento arriva a tutti i telefoni in mediana 4 ms, p95 12 ms;
- porte e pattuglie non generano traffico (le calcolano i telefoni).

Il carico regge con 30 telefoni e 4 piloti a raffica, ma cresce con il quadrato dei giocatori: è il motivo del primo passo
obbligato di [Plancia di Comando](PIANO-PLANCIA-COMANDO.md) (raggruppare gli invii di `flush` e non rimandare viste
identiche), da affrontare prima di quel gioco.

## Per chi sviluppa

- Codice: `packages/minigames/src/pilota-cieco/` (`generate.ts` livelli ed equità, `move.ts` regole del movimento, `index.ts`
  il plugin) e `packages/client/src/minigames/pilota-cieco/` (la mappa in SVG, `LaneMap.tsx`, condivisa da TV e navigatori).
  Il generatore di labirinti è comune: `packages/minigames/src/maze.ts` (lo usa anche Artificieri); porte e pattuglie come
  funzioni del tempo in `packages/shared/src/timeline.ts`.
- **Funzioni pure del tempo**: porta aperta se `floor((t + offset) / period)` è pari; pattuglia lungo il suo tratto, avanti e indietro,
  una casella ogni `stepMs`. Server e telefoni usano le stesse funzioni.
- Test: `pnpm test` (`generate.test.ts` su migliaia di semi, `move.test.ts`, plugin, anti-leak), `e2e/pilota-preview.spec.ts` (layout
  nei 5 temi, porte e pattuglie che cambiano nel tempo, `touch-action`), `e2e/pilota-cieco.spec.ts` (partite con mina, porta
  chiusa e arrivo, frame WebSocket) e `pnpm stress --players 30 --scenario pilota` (con 1 giocatore l'avvio deve essere
  rifiutato).
