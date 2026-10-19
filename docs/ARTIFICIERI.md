# Artificieri: guida

Gioco a squadre con **informazioni divise**, nello stile di *Keep Talking and Nobody Explodes*: una persona (l'**artificiere**)
vede la bomba sulla TV ma non sa come si disinnesca, i compagni (gli **esperti**) hanno il manuale sul telefono ma non
vedono la bomba. L'unico canale tra loro è **la voce**. Da **2 a 30 giocatori**. Decisioni e motivazioni in
[PIANO-ARTIFICIERI.md](PIANO-ARTIFICIERI.md). «Keep Talking and Nobody Explodes» è un marchio di Steel Crate Games: qui il
gioco si chiama *Artificieri* e moduli, regole e testi del manuale sono nostri.

## Come si gioca

1. **Una squadra alla volta** sulla TV. Gli altri sono il pubblico e **scommettono**.
2. **Scommesse** (default 15 s): le altre squadre scelgono dal telefono «Disinnescata» o «Esplode». Si passa avanti
   appena hanno scommesso tutti.
3. **Briefing**: la TV dice «Esperti: di spalle alla TV!». Gli esperti si girano e aprono il manuale; l'artificiere
   preme «Inizia!» sul telefono (o la regia preme «Inizia»). La bomba compare sulla TV solo ora.
4. **Disinnesco**: parte il timer (default 5 minuti). L'artificiere descrive ciò che vede, gli esperti cercano la
   regola nel manuale e dicono cosa fare; lui agisce dal telefono, una scheda per modulo.
   - un'azione giusta disinnesca il modulo (spia verde);
   - una sbagliata è un **errore**: scossa sulla TV e, se è attivo, **il timer accelera del 25%** per ogni errore;
   - con **3 errori** (configurabile) o a timer scaduto la bomba **esplode**; con tutti i moduli disinnescati è
     **disinnescata**.
5. **Esito**: la TV mostra il risultato e chi ha scommesso giusto; la regia preme «Avanti» per la squadra dopo.
6. **Punti**: ogni membro della squadra di turno prende `modulePoints` (50) per ogni modulo disinnescato, anche se la
   bomba poi esplode, più, se è disinnescata, `defusePoints` (200) e `timeBonus` (1) per ogni secondo rimasto. Chi
   scommette giusto prende `betPoints` (50). Le regole con i numeri della partita sono anche nel telefono («ℹ️»), dal
   file `rulesText.ts`.

**Il bordo.** Sul bordo della bomba, visibile solo sulla TV, ci sono numero di serie, batterie, spie (sigle accese o
spente) e porte: molte regole le usano come condizione. Nel numero di serie non compaiono I, O, Q, Y né le cifre 0 e 1
(non si confondono a distanza); le vocali possibili sono A, E, U.

## I moduli

| Modulo | Sulla TV | Sul telefono dell'artificiere | Nel manuale |
|---|---|---|---|
| **Fili** (3–6 fili) | fili colorati, numerati dall'alto | un tasto «Taglia» per filo | per ogni numero di fili, regole in ordine (colori, ultimo filo, bordo): vale la prima vera |
| **Pulsante** | pulsante con una scritta e, solo mentre è tenuto, una striscia colorata | «Premi e rilascia» e «Tieni premuto» | quando premere o tenere; se si tiene, su quale **cifra delle unità dei secondi** rilasciare in base al colore della striscia |
| **Simboli** | 3–4 simboli strani | gli stessi simboli come tasti | 6 colonne di 7 simboli: i simboli stanno tutti in una colonna e si premono nel suo ordine |
| **Colori** | 4 luci che lampeggiano in una sequenza che si allunga | 4 tasti colorati | due tabelle (con o senza vocale nel seriale) con righe per 0, 1, 2+ errori: colore visto → colore da premere |
| **Labirinto** | griglia 6×6 senza muri, con 2 cerchi, la posizione e l'arrivo | 4 frecce | 9 labirinti con i muri: i due cerchi dicono qual è. Sbattere contro un muro è un errore |
| **Parola** | 5 rotelle di lettere (se ne vede una per rotella) | `‹ ›` per ogni rotella e «Invia» | un elenco di parole da 5 lettere: una sola si compone con le lettere delle rotelle |

Le regole sono **generate dal seme di ogni bomba**: chi ha guardato il turno di un'altra squadra non impara le
soluzioni (a meno di `sameManual`, che usa la stessa edizione del manuale per tutte le bombe: più facile, ma
avvantaggia chi gioca dopo). Ogni modulo ha una sola soluzione, verificata dai test su migliaia di semi.

Il **manuale è diviso a pagine** tra gli esperti: ogni pagina ad almeno uno, e ognuno vede il titolo di tutte le pagine
con il nome di chi le ha, per sapere a chi chiedere. Con un solo esperto, tutte le pagine sono sue.

## Preparare il gioco (regia, `/admin`)

### Squadre

Si usano i **team della serata**: ognuno con almeno **2 giocatori** (l'artificiere e un esperto), altrimenti la partita
non parte (con un team da 1 il messaggio dice quale). Consigliati da **3 a 6** per squadra: con troppi esperti il manuale
si ripete. I giocatori senza team non giocano la bomba ma scommettono. Se la serata **non ha team**, l'app divide i
giocatori a caso in squadre da 3–5. L'artificiere ruota nella squadra (chi l'ha già fatto passa in fondo); la regia può
cambiarlo con **«Cambia artificiere»** prima di iniziare.

### L'istanza

| Campo | Default | Note |
|---|---|---|
| Difficoltà | media | numero e complessità delle regole (facile: 3–4 fili, 3 simboli, 3 lampi, elenco di 12 parole; difficile: fino a 6 fili, 5 lampi, 30 parole) |
| Moduli per bomba | 4 | da 3 a 6; ogni tipo si ripete se i moduli superano i tipi |
| Tipi di modulo ammessi | tutti tranne «Parola» | «Parola» richiede una lista di parole |
| Durata del timer | 300 s | da 60 a 900 |
| Errori prima dell'esplosione | 3 | da 1 a 5 |
| Il timer accelera a ogni errore | sì | +25% per errore |
| Bombe per squadra | 1 | da 1 a 3 (con 6 squadre ogni bomba aggiunge circa 40 minuti) |
| Stesso manuale per tutte le bombe | no | vedi sopra |
| Tempo per le scommesse | 15 s | 0 = senza scommesse |
| Punti | 50 / 200 / 1 / 50 | per modulo, per bomba disinnescata, per secondo rimasto, per scommessa giusta |
| Lista di parole | — | per il modulo «Parola»: una «Lista di parole» della libreria (per esempio «Parole di Agenti Segreti»); si usano le parole di **5 lettere** (maiuscole e accenti a parte) |
| Parole proprie | nessuna | in più rispetto alla lista; per il modulo servono almeno **12** parole di 5 lettere |

### Condurre la serata (pannello Live)

Il pannello mostra tutto: bordo, i moduli con la **soluzione** di ciascuno (per aiutare chi è in difficoltà), le
pagine del manuale di ogni esperto, le scommesse e il manuale completo. Pulsanti: **Inizia** (al posto dell'artificiere),
**Pausa/Riprendi** (ferma il timer, anche quello delle scommesse), **Avanti**, **Cambia artificiere**, **Annulla
l'ultimo errore** (per un tocco sbagliato evidente: toglie l'errore e riporta il timer alla velocità precedente, ma non
restituisce il tempo; funziona anche subito dopo un'esplosione per errori), **Esplodi** / **Disinnesca** (chiudono il
turno a mano), **Salta la squadra** (nessun punto) e **Termina il round** (restano i punti già fatti).

Se nella sala non ci si può girare, per ora non c'è una modalità «bomba sul telefono»: è un'estensione futura
(il [piano](PIANO-ARTIFICIERI.md) spiega perché).

## Equità e privacy

- Il timer e le azioni dipendono dall'**ora equa** (`fairTime`) e dalla sincronizzazione dell'orologio, mai dall'ordine
  di arrivo: il rilascio del pulsante si giudica sul secondo in cui il dito si alza, con ±150 ms di tolleranza sul cambio
  di cifra. Un'azione fatta in tempo che arriva poco dopo la scadenza vale ancora.
- I telefoni non ricevono **mai** il bordo, i dati dei moduli, le regole, le soluzioni o le scommesse altrui: l'artificiere
  ha solo i **comandi**, gli esperti solo le **proprie pagine**, il pubblico solo timer, errori e moduli risolti. La TV
  non ha mai regole, soluzioni, pagine o scommesse, e la striscia del pulsante compare solo mentre è tenuto premuto.
  Lo garantiscono `artificieri-leak.test.ts` (a ogni passo di partite intere, con una fuga inventata che il controllo
  deve segnalare), i frame WebSocket dell'e2e e il controllo di privacy dello stress.

## Per chi sviluppa

- Codice: `packages/minigames/src/artificieri/` (`bomb.ts` genera la bomba e il manuale, `modules/*.ts` un generatore e un
  giudice per tipo, `turns.ts` squadre e pagine, `index.ts` il plugin) e `packages/client/src/minigames/artificieri/`.
  Il generatore di labirinti è comune: `packages/minigames/src/maze.ts` (perfetto o con cicli, percorso più breve), usato
  anche da Pilota alla cieca.
- **Regole come dati**: ogni regola è una struttura (`{ when: [...], cut: ... }`), da cui vengono sia il giudice sia il
  testo del manuale: non possono contraddirsi. Per aggiungere un tipo di modulo: un file in `modules/` che implementa
  `ModuleDef` (`genRules`, `genData`, `judge`, `solution`, `manual`), l'aggiunta a `MODULE_KINDS` in fondo (l'ordine dà il
  seme delle regole, quindi aggiungere in fondo non cambia gli altri tipi) e a `MODULES` in `bomb.ts`, le viste del
  client e un passo nello scenario e2e.
- Test: `pnpm test` (generatori su migliaia di semi, plugin, anti-leak, `maze.test.ts`), `e2e/artificieri-preview.spec.ts`
  (layout nei 5 temi, 6 moduli, manuale, regole, `touch-action`), `e2e/artificieri.spec.ts` (partite complete, frame
  WebSocket) e `pnpm stress --players 30 --scenario artificieri` (squadre da 5, artificieri simulati che leggono le
  soluzioni dalla vista della regia, con il 5% di errori; con 1 giocatore l'avvio deve essere rifiutato).
