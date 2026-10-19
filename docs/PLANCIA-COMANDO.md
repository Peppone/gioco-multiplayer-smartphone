# Plancia di Comando: guida

Gioco caotico e velocissimo in stile *Spaceteam*, in cui **tutti sono coinvolti allo stesso modo**: ogni telefono è un
**pannello** di comandi dai nomi assurdi («Valvola Gelatinosa», «Interruttore Perplesso»), ma gli **ordini** arrivano
agli altri: bisogna **gridarli**. Da **2 a 30 giocatori**, equipaggi da 2 a 8. Decisioni e motivazioni in
[PIANO-PLANCIA-COMANDO.md](PIANO-PLANCIA-COMANDO.md).

## Come si gioca

1. **Equipaggi.** In modalità «A squadre» ogni team della serata è l'equipaggio di un'astronave e si gareggia;
   in «Equipaggio unico» tutti sono nello stesso equipaggio e giocano contro il tempo.
2. **Il pannello.** Ogni giocatore ha 4–6 comandi sul telefono: **pulsanti** (da premere), **interruttori** (acceso/spento),
   **cursori** (da 0 a 5) e **selettori** (una parola tra poche). Ogni comando è su **un solo telefono** dell'equipaggio.
3. **L'ordine.** In alto compare un ordine a tempo («Porta la Valvola Gelatinosa a 3!») con una barra che si svuota. Quasi
   sempre riguarda un comando di un **compagno** (ogni tanto uno proprio): va letto ad alta voce. Chi ha quel comando lo
   porta al valore giusto. Appena è fatto l'ordine è eseguito e ne arriva un altro.
4. **Niente punti per la rapidità**: conta solo eseguire l'ordine **prima della scadenza** (giudicata all'ora equa dell'input,
   quindi la rete lenta non penalizza). Cambiare un comando che nessuno ha chiesto non fa nulla.
5. **Scafo.** Un ordine scaduto danneggia lo scafo (`damagePerMiss`, 5%): a zero l'astronave si ferma per il resto del round.
6. **Settori.** Ogni `sectorSeconds` (60 s) c'è un **salto**: pannelli nuovi, ordini più rapidi (−10% a settore, fino a
   `minOrderSeconds`) e, dal terzo settore, un comando in più per pannello (fino a 6).
7. **Eventi** (uno per settore, se attivi):
   - **Allarme generale**: tutti premono il pulsante rosso entro 5 secondi; ogni equipaggio in cui manca qualcuno perde scafo;
   - **Blackout**: per 8 secondi alcuni pannelli mostrano solo le iniziali dei nomi.
8. **Punti** (a ogni membro): `stepPoints` (10) per ordine eseguito, fino a `hullBonus` (100) in proporzione allo scafo
   rimasto e, tra più squadre, `podiumPoints` (150, 100, 50) secondo il piazzamento. Si arriva **più lontano** per **passi per
   membro** (non per totale, così le squadre piccole non sono svantaggiate), poi per scafo e per ordini eseguiti.

La TV mostra le astronavi nello spazio, con scafo, ordini eseguiti/scaduti, l'**ultimo ordine eseguito** (con 2 secondi di
ritardo, per non rivelare ciò che si sta ancora gridando), gli eventi e la classifica finale. **Non** mostra gli ordini in corso né i
pannelli. Le regole con i numeri della partita sono anche nel telefono («ℹ️»), dal file `rulesText.ts`.

## Preparare il gioco (regia, `/admin`)

Non c'è contenuto da scrivere: i nomi si compongono da due elenchi (sostantivi e aggettivi, circa 60 di esempio ciascuno)
modificabili nell'istanza. Nella libreria si crea un'istanza di «Plancia di Comando»:

| Campo | Default | Note |
|---|---|---|
| Modalità | A squadre | «Equipaggio unico»: tutti nello stesso equipaggio, anche con 30 giocatori (nessun limite di 8) |
| Settori | 5 | da 1 a 10 |
| Durata di un settore | 60 s | da 30 a 180 |
| Comandi per pannello | 4 | da 3 a 6 (dal terzo settore uno in più, fino a 6) |
| Tempo per un ordine | 12 s | primo settore, da 5 a 30; poi −10% a settore |
| Tempo minimo per un ordine | 6 s | da 3 a 15 |
| Ordini sul proprio pannello | 20% | gli altri riguardano un compagno |
| Danno per ordine scaduto | 5% | da 1 a 25 |
| Eventi | sì | allarme generale e blackout |
| Sostantivi / aggettivi | 60 / 60 | min 8 parole ciascuno; gli aggettivi vanno al maschile |
| Punti per ordine | 10 | |
| Bonus scafo | 100 | in proporzione allo scafo rimasto |
| Punti per piazzamento | 150, 100, 50 | solo tra squadre |

**Squadre**: in «A squadre» si usano i team della serata, ognuno con **da 2 a 8 giocatori**, altrimenti la partita non parte
(con 1 giocatore l'avvio è rifiutato; nessuno a cui gridare gli ordini). Senza team l'app divide i giocatori in gruppi da 4–6 (uno solo con pochi giocatori).

**Condurre** (pannello Live): vedi ogni equipaggio, scafo, ordini eseguiti e scaduti e, per ogni membro, **l'ordine in
corso**. Pulsanti: **Decollo**, **Pausa/Riprendi** (ferma il tempo e blocca i comandi), **Ripara gli scafi** (riporta al 50%
gli scafi sotto il 50% e rimette in moto chi era fermo; anche per un solo equipaggio), **Rimescola i pannelli**,
**Salta il settore** e **Termina il round** (restano i punti già fatti); **Avanti** dopo la classifica. Con **📵** accanto a un
giocatore si segna il suo telefono come **fuori uso** (batteria, connessione): non ha più comandi né ordini e i pannelli dei
compagni si rifanno senza i suoi comandi; di nuovo 📵 lo rimette in gioco.

## Equità e privacy

- Un input si giudica all'**ora equa** (`fairTime` + `GRACE_MS`): stessa pressione, ritardi diversi, stesso esito.
- Ogni telefono riceve **solo i propri comandi e il proprio ordine** (con il blackout, solo le iniziali dei nomi) e il proprio
  equipaggio in sintesi (scafo, evento): mai l'ordine di un compagno, i bersagli, gli altri equipaggi, il seme o l'evento in
  programma. La TV non riceve pannelli né ordini attivi. Lo garantiscono `plancia-leak.test.ts` (con la prova che il controllo
  segnala una fuga), i frame WebSocket dell'e2e e il controllo di privacy dello stress.
- La vista del telefono resta **essenziale**: avanzamento e classifica solo sulla TV. Così i cambi di stato degli altri non
  rimandano nulla ai telefoni (vedi la deduplicazione in `realtime.ts`).

## Misure dello stress

`pnpm stress --players 30 --scenario plancia`: 4 equipaggi da 7–8 bot, 3 settori da 30 s, eventi attivi, latenza 50–250 ms e orologi
sfasati; i bot «sentono» gli ordini (li leggono dalla regia automatica, come se i compagni li gridassero) e ne perdono ~8%:

- ~**890 comandi** in ~100 s (~9 al secondo) hanno prodotto ~**2 000 aggiornamenti** ai telefoni (circa 2 per comando: la
  deduplicazione evita di rimandare viste invariate, mentre senza sarebbero stati ~30 per comando);
- dopo un comando lo stato arriva a chi l'ha mandato in **mediana ~30 ms, p95 ~450 ms** (un pulsante non cambia la vista di chi lo preme, quindi il
  campione chiude col primo aggiornamento qualsiasi e la coda è attesa); la regia vede il cambio su tutti i telefoni in pochi ms;
- nessuna fuga di informazioni, punti coerenti con `scoring.ts` e con la classifica generale.

## Per chi sviluppa

- Codice: `packages/minigames/src/plancia-comando/` (`names.ts` nomi, `panels.ts` pannelli e ordini, `scoring.ts` classifica,
  `index.ts` il plugin) e `packages/client/src/minigames/plancia-comando/` (`PlanciaViews.tsx` TV e telefono,
  `PlanciaHost.tsx` regia, `plancia.css`, `previewData.ts` per `/preview`).
- **Nomi**: due elenchi (`nouns`, `adjectives`), accordati (`isFeminine`, `withArticle`), diversi nell'equipaggio e senza
  ripetizioni tra equipaggi (`taken`), con iniziali diverse per quanto possibile.
- **Cursore**: sul telefono il valore parte **solo al rilascio** (un trascinamento è un solo invio, da tastiera uno a tasto).
- Test: `pnpm test` (`panels.test.ts`, `plancia-comando.test.ts`, `plancia-leak.test.ts`, bot in
  `tools/bots/src/strategy-squadre.test.ts`), `e2e/plancia-preview.spec.ts` (nessun overflow a 360×640 con 6 comandi e i
  nomi più lunghi, TV, blackout, allarme, nei 5 temi), `e2e/plancia-comando.spec.ts` (equipaggi veri: ordine eseguito dal compagno,
  ordine scaduto, telefono fuori uso, salto, pausa, allarme, frame WebSocket) e `pnpm stress --players 30 --scenario plancia`
  (con 1 giocatore l'avvio deve essere rifiutato).
- **Regole in app**: bottone «ℹ️» del telefono, testo in `rulesText.ts` (il test controlla che i numeri compaiano):
  **se si cambiano le regole va aggiornato**.
