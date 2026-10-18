# Stanze col botto: guida

Gioco di deduzione sociale in due stanze nello stile di *Two Rooms and a Boom*, senza carte: il telefono di ogni
giocatore è la carta personaggio, l'app abbina le persone alle stanze, distribuisce i ruoli, tiene il tempo, gestisce
leader, ostaggi e condivisioni e fa la rivelazione finale. La trattativa resta **a voce, di persona**. Da **6 a 30
giocatori** (con meno di 6 o più di 30 il round non parte). Decisioni e motivazioni in
[PIANO-STANZE-COL-BOTTO.md](PIANO-STANZE-COL-BOTTO.md). «Two Rooms and a Boom» è un marchio di Tuesday Knight Games:
qui il gioco si chiama *Stanze col botto* e regole, testi e grafica sono nostri.

## Come si gioca

1. **Due squadre.** La **Blu** protegge il **Presidente**, la **Rossa** ha il **Bombarolo**. Con un numero dispari di
   giocatori c'è anche il **Giocatore d'azzardo**, senza squadra.
2. **Due stanze fisiche** (due locali, o due angoli lontani dello stesso salone). Chi sceglie la stanza non conosce
   ancora la propria carta: l'abbinamento si fa *prima* di distribuire le carte.
3. **Il telefono è la carta.** Si vede *tenendo premuto* il pulsante in alto: il vicino non sbircia. Non si gira il
   telefono verso gli altri: per mostrare la carta si usano i pulsanti dell'app (così il gioco sa chi ha visto cosa).
4. **Round a tempo** (3, 2 e 1 minuto di default). Durante il round si parla, si vota il **leader** e ci si mostra le
   carte per capire chi è chi.
5. **Fine del round.** Il leader di ogni stanza sceglie gli **ostaggi** da mandare nell'altra stanza; i telefoni degli
   ostaggi dicono in quale stanza andare. I leader premono «Avvia il round» e si ricomincia.
6. **Dopo l'ultimo scambio** (se c'è il Giocatore d'azzardo, prima fa la sua previsione) tutti rivelano la carta: se
   Presidente e Bombarolo sono **nella stessa stanza** vince la squadra **Rossa** (il botto!), altrimenti la **Blu**.
   Ogni membro della squadra vincitrice prende `winPoints` (100 di default); il Giocatore d'azzardo `gamblerPoints` se
   ha indovinato.

### Ostaggi per round (gioco base)

| Giocatori | Round da 3 min | Round da 2 min | Round da 1 min |
|---|---|---|---|
| 6–10 | 1 | 1 | 1 |
| 11–21 | 2 | 1 | 1 |
| 22 o più | 3 | 2 | 1 |

Con `Lungo` ci sono 5 round (5-4-3-2-1 minuti) con la tabella della carta del leader del regolamento, **solo con più di
10 giocatori** (sotto si ripiega sul gioco base). Con `Personalizzato` durate e ostaggi si scrivono nell'istanza. Gli
ostaggi non superano mai la stanza più piccola meno il leader.

### Il leader

- **Voto**: ogni giocatore può votare un compagno (anche sé stesso) e cambiare o ritirare il voto finché c'è tempo.
  Chi ha **più della metà** dei voti della stanza diventa leader e i voti si azzerano. È lo stesso meccanismo della
  prima elezione e della sostituzione del leader già in carica.
- **Nomina**: se la stanza non ha un leader, chiunque può nominarne uno (non sé stesso).
- **Passaggio**: il leader può passare la carica a un compagno che accetta; chi accetta non può restituirla nello
  stesso round.
- **Il leader non può essere ostaggio.**
- **Chi lo vede**: la propria stanza lo vede subito. L'altra stanza e lo schermo lo vedono quando **entrambe le
  stanze hanno bloccato** il proprio leader (a fine round). Nei round successivi i leader restano visibili; se una
  stanza cambia leader, il nuovo nome arriva agli altri solo al blocco successivo e lo schermo scrive «Leader al
  round precedente» nel frattempo.
- **Blocco**: allo scadere del round i leader non si possono più cambiare. Una stanza senza leader ha
  `lockSeconds` per eleggerlo, poi lo estrae il server.

### Mostrare la carta

- **Mostra** (rivelazione): tocca un nome → «Mostra la carta». Chi la riceve la vede a tutto schermo per qualche secondo
  senza dover ricambiare; poi resta nella lista **«Carte viste»**, che sta dietro un pulsante. «Mostra la carta a
  tutti» la mostra a tutta la stanza (mai allo schermo comune).
- **Scambia** (condivisione): tocca un nome → «Scambia la carta». L'altro accetta o rifiuta; se accetta, entrambi
  vedono la carta dell'altro nello stesso istante. Una sola proposta in attesa per giocatore, scade dopo 20 secondi.
- **Solo il colore**: «Mostra il colore» e «Scambia il colore» mandano solo la squadra, senza il personaggio. Sono
  ammessi solo con **più di 10 giocatori**, come nel gioco originale (impostazione `colorShare`).
- Si mostra e si scambia **solo con chi è nella tua stanza**.

## Preparare il gioco (regia, `/admin`)

**Libreria → «+ Stanze col botto»**: l'editor parte dall'esempio. Si possono cambiare:

- **Nomi delle stanze** (es. Salotto e Cucina), mostrati su telefoni e schermo.
- **Abbinamento alle stanze**: *A caso* (default), *Con i QR* o *Dalla regia* (vedi sotto).
- **Round**: base, lungo o personalizzato; **solo colore** (automatico, sempre, mai).
- Tempi: elezione del leader a fine round, conferma degli ostaggi, avvio del round dopo il primo leader e dopo lo
  scambio, previsione del Giocatore d'azzardo.
- Punti.

Aggiungi l'istanza come round di una partita. Dal pannello **Live**, avviato il round:

| Pulsante | Quando | Cosa fa |
|---|---|---|
| **Distribuisci le carte** | abbinamento | assegna le carte e fissa le stanze (i non abbinati vanno nella stanza più vuota). Disattivato se le stanze non sono bilanciate |
| **Rimescola** / modo di abbinamento | abbinamento | ridivide a caso; cambia tra a caso, QR e regia |
| **⇄** accanto a un giocatore | sempre | lo sposta nell'altra stanza (se era leader, la carica resta vacante) |
| **★** accanto a un giocatore | dopo la distribuzione | lo nomina leader della sua stanza |
| **Avvia il round** | carte distribuite | fa partire il primo round |
| **Chiudi il round** | round in corso | come allo scadere del tempo |
| **Avvia il prossimo round** | dopo uno scambio | come se i leader avessero premuto |
| **Pausa / Riprendi** | fasi a tempo | congela il timer |
| **Avanti** | rivelazione | chiude il round e passa alla classifica |

### Abbinamento alle stanze

| Modo | Come funziona |
|---|---|
| **A caso** | il server divide a metà; si può rimescolare o correggere a mano |
| **Con i QR** | lo schermo comune mostra due QR (uno per stanza); ognuno scansiona quello della stanza in cui va, con lo scanner dell'app, con la fotocamera di sistema oppure scrivendo il codice. Si può cambiare scansionando l'altro QR finché la regia non distribuisce le carte. Una stanza piena (metà dei giocatori, arrotondata per eccesso) rifiuta nuovi ingressi |
| **Dalla regia** | la regia sposta i giocatori tra le due colonne |

I QR sono nuovi a ogni partita (una foto di una serata precedente non vale). La fotocamera **dentro l'app** richiede il
collegamento sicuro (https, cioè il tunnel); sulla rete locale restano la fotocamera di sistema e il codice a mano.
Il QR non verifica dove si trova davvero un telefono durante la partita: serve a scegliere la stanza all'inizio.

### Regia cieca («Gioco anch'io»)

Per quando il conduttore vuole giocare: spuntando **«Gioco anch'io (regia cieca)»**, di norma prima di distribuire le
carte, la regia conduce la partita **senza vedere** carte, voti, condivisioni né le scelte degli ostaggi: il pannello
mostra solo ciò che vede lo schermo comune, più lo stato tecnico (chi ha bloccato il leader, chi ha confermato gli
ostaggi). La propria carta la vede dal telefono, come tutti. Non può scegliere gli ostaggi al posto dei leader; può
avviare e chiudere i round, mettere in pausa, nominare un leader e spostare un giocatore.

Quei segreti **non arrivano al browser** della regia (non sono solo nascosti nell'interfaccia): lo verificano un test
anti-leak e uno scenario end-to-end sui frame del socket. Disattivarla chiede conferma («Vedrai tutte le carte: la
tua partita non sarà più valida») e lo schermo comune mostra «La regia vede le carte». È comunque una regola
d'onore: lo snapshot della partita nel database contiene lo stato completo.

## Logistica

- Servono **due locali vicini** (o due zone lontane del salone) e qualcuno che faccia rispettare la separazione:
  tra le stanze non si comunica in nessun modo. L'app non può verificarlo.
- C'è **un solo schermo**: chi è nella stanza senza TV si affida al telefono per timer e avvisi (suono e vibrazione a
  fine round; la vibrazione non c'è su iPhone, quindi il suono è importante: il primo tocco sblocca l'audio).
- Con 15 persone per stanza la lista dei nomi sul telefono sta in una schermata, senza scorrere.

## Personaggi

La prima versione ha: **Presidente**, **Bombarolo**, **membri Blu e Rossi**, **Giocatore d'azzardo**. Il catalogo dei
personaggi avanzati (Medico, Ingegnere, Timido, Riservato, Negoziatore, Agente, la carta sepolta con Figlia del
Presidente e Martire…) è nel piano (§7) e resta da fare (passo T8).

## Per chi sviluppa

- Plugin: `packages/minigames/src/stanze-col-botto/` (`index.ts` e `stanze-col-botto.test.ts`). Tutte le funzioni sono
  pure; **chi conosce la carta di chi** è una funzione del registro `shares` (`knownBy`).
- Viste: `packages/client/src/minigames/stanze-col-botto/` (`BottoViews.tsx` per schermo e telefono, `BottoHost.tsx` per
  la regia, `CardFace.tsx`, `rulesText.ts`, `previewData.ts`, `botto.css`). Il tema è `boom`.
- **Se si cambiano le regole va aggiornato `rulesText.ts`** (le regole spiegate nell'app).
- Test richiesti dopo ogni modifica a stanze, leader, ostaggi, condivisioni o regia cieca: i test del plugin (compresi
  gli anti-leak), gli scenari `e2e/stanze-col-botto-preview.spec.ts` e `e2e/stanze-col-botto.spec.ts` e
  `pnpm stress --players 30 --scenario botto` (con 5 giocatori l'avvio del round deve essere rifiutato).
