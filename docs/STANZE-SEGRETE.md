# Stanze Segrete: guida per il Game Master

Un gioco di ruolo ispirato a *Room 25*. I giocatori sono chiusi in un complesso di stanze a griglia (3 × 3 di
default), ognuna con una **lettera** nascosta, e devono trovare l'uscita. Le lettere formano due parole intrecciate
(nella mappa di esempio **MORTA** e **USCITA**, che finiscono entrambe con la A in un angolo).

Il **Game Master** (GM) è una persona, non il software: racconta, decide, risponde. Il programma fa da tavolo e da
messaggero. Il GM **non gioca**: non è in classifica e non ha un profilo giocatore. I giocatori sono **da 1 a 10**.

## 1. Preparare il gioco (regia, `/admin`)

1. **Libreria → «+ Stanze Segrete»**: l'editor parte dalla mappa di esempio. Puoi cambiare:
   - la **lettera** e la **nota privata** di ogni stanza (la nota la vede solo il GM: ci metti la descrizione da leggere);
   - la **stanza della lettera iniziale** (deve essere in un angolo: è solo un suggerimento, il GM decide dove
     mettere davvero i giocatori), le **parole da controllare** e la **soluzione**;
   - la durata di un'occhiata alla lettera, i limiti dei messaggi, gli **eventi pronti**, le **azioni libere**
     (es. «Cerca nella stanza», «Usa la chiave») e i punti;
   - se lo schermo mostra in quale stanza sta ognuno.
   L'editor segnala se una parola non si legge sulla mappa (stanze adiacenti in orizzontale o verticale, mai in diagonale).
2. Aggiungi l'istanza come **round** di una partita. La serata deve avere **al massimo 10 giocatori**: con di più il
   round non parte e la regia vede «massimo 10 giocatori, in serata ce ne sono N».
3. Dal pannello **Live** avvia la partita e il round. Compare il riquadro **«Link del Game Master»**: premi
   **Genera il link** e dai il QR (o il link) al telefono del GM.

Il link vale **solo per questa partita** (al massimo 12 ore), apre solo i comandi di questo gioco e si può
**revocare o rigenerare** in ogni momento: il telefono revocato perde subito l'accesso. Il token sta nel frammento
`#` dell'indirizzo (non finisce nei log) e il telefono lo ricorda, così dopo il blocco schermo si rientra da soli.
Se regia e GM sono la stessa persona, la stessa interfaccia è già nel pannello Live.

## 2. Che cosa vede e fa il GM (`/master`)

L'interfaccia è una colonna unica, pensata per il telefono.

- **Fase** e comandi: *Distribuisci*, *Inizia* (solo con tutti piazzati), *Rivela la mappa sullo schermo*, *Concludi*.
- **Richieste**: la coda di spostamenti, sbirciate, azioni libere e soluzioni, con *Approva / Rifiuta*,
  *Approva tutti gli spostamenti* e *Mostra la lettera per N s*. Suona e vibra quando ne arriva una.
- **Mappa** con le lettere e le note. Per piazzare o spostare un giocatore: **tocca il giocatore, poi la stanza**
  (più affidabile del trascinamento). Tocca il bordo tra due stanze per **chiudere o riaprire la porta** (🔒) per tutti.
- **Abilitazione rapida**: scegli giocatori (o «Tutti», o gli occupanti di una stanza), la capacità, durata e usi
  facoltativi, poi *Abilita* / *Disabilita*. *Spegni tutto* le toglie a tutti.
- **Giocatori**: una scheda per ognuno con l'esito (in gioco / fuggito / eliminato), gli interruttori delle
  capacità, le **frecce da bloccare** per muoversi e sbirciare, «Mostra una lettera» e la conversazione privata.
- **Posta**: i messaggi dei giocatori (non letti in evidenza) e il modulo per scrivere a un giocatore, a una stanza
  o a tutti, con «Consenti risposta».
- **⚡ Eventi**: testo (o evento pronto), destinatari (Tutti / scelta / occupanti di una stanza / tutti tranne…),
  *Invia*. L'elenco mostra «Accettato da N di M», chi manca e *Annulla*.
- **Diario** della partita (spostamenti, occhiate, soluzioni, eventi), visibile solo al GM.

## 3. Le regole del gioco

**Capacità.** Nessuno può fare nulla finché il GM non lo abilita. Le capacità sono interruttori che il GM accende e
spegne quando vuole, anche in preparazione, con effetto immediato (il pulsante compare o sparisce dal telefono,
con una breve vibrazione). Durata e numero di usi sono facoltativi.

| Capacità | Cosa permette |
|---|---|
| Muoversi | Mostra la **croce**: premere una freccia *chiede* di spostarsi, il GM approva o rifiuta |
| Sbirciare | Come muoversi, ma chiede di guardare la stanza adiacente |
| Guardare la lettera | Mostra la lettera della propria stanza (o di una stanza precisa) per pochi secondi |
| Scrivere al Master | Scrivere di propria iniziativa (rispondere a un messaggio non richiede nulla) |
| Proporre la soluzione | Il GM vede la parola, dice se è giusta e la convalida |
| Azioni libere | Richieste al GM definite nell'istanza |

Spegnere una capacità annulla le richieste in attesa di quel tipo («Il Master ha annullato la richiesta»).
Ogni uso si consuma al momento della richiesta, non dell'approvazione. Al massimo uno spostamento in attesa per giocatore.

**Croce direzionale.** Ogni freccia è *aperta*, *bloccata* (🔒) o assente (muro). Il GM blocca in due modi:
togliendo direzioni al permesso del singolo giocatore (modificabile anche dopo) o chiudendo una porta tra due stanze
per tutti. Il giocatore non sa perché una freccia è bloccata né dove porta.

**Lettere.** Nessuno le vede di diritto. Il permesso «Guarda la lettera» (di default **una sola occhiata**) mostra la
lettera per `defaultSightSec` secondi, **tenendo premuto** il riquadro; poi sparisce dal telefono, che non la
ricorda. Il GM può anche mostrarne una direttamente. Limite accettato: chi la vede può fotografarla.

**Messaggi.** Il giocatore legge sempre. Può rispondere solo se il GM lascia «Consenti risposta» (una volta; il GM può chiudere le risposte quando vuole con «Chiudi le risposte»). Un messaggio nuovo vibra e compare a tutto schermo finché non viene letto.

**Eventi.** Una comunicazione ufficiale («Crolla il soffitto»). Compare a tutto schermo con scritto **«Evento:»** e
il giocatore deve premere **Accetta**; più eventi si mostrano in ordine. Il GM vede chi ha accettato e può annullare
un evento non ancora accettato da tutti. Ogni giocatore trova i **propri** eventi nella scheda «📜 Eventi»
(un multicast non rivela agli altri chi l'ha ricevuto). Gli eventi non vanno sullo schermo condiviso: se sono
pubblici, leggili ad alta voce.

**Fasi.** *Preparazione* (scegli la stanza di partenza di ognuno, accendi capacità, chiudi porte) → *In gioco* (nessun
timer: si va al ritmo del GM) → *Rivelazione* (lo schermo accende le lettere e traccia i due percorsi, con l'esito
di ognuno) → *Conclusa*. Punti: chi è **fuggito** riceve `escapePoints`, chi ha la soluzione **convalidata**
`solvePoints`. Rettifiche manuali dei punti restano alla regia.

## 4. Chi vede cosa

| | Schermo | Telefono del giocatore | GM |
|---|---|---|---|
| Griglia e numeri delle stanze | ✅ | ✅ | ✅ |
| Lettere | solo alla rivelazione | solo durante un'occhiata concessa | ✅ |
| Note sulle stanze, porte chiuse, diario | ❌ | ❌ | ✅ |
| Posizioni | se pubbliche | la propria (e le altre se pubbliche) | ✅ |
| Capacità e richieste | ❌ | solo le proprie | ✅ |
| Messaggi | ❌ | solo la propria conversazione e quelli per tutti/la propria stanza | ✅ |
| Eventi | ❌ | solo quelli ricevuti | ✅ con destinatari e accettazioni |

Il testo dei giocatori non compare mai sullo schermo condiviso.

## 5. Dopo la serata

Messaggi ed eventi sono **salvati nel database** (tutti, anche oltre i 300 che lo stato tiene in memoria). Dalla
regia, scheda **Messaggi**: scegli la serata, filtra messaggi o eventi, vedi chi ha accettato e quando, **esporta in
JSON** o **elimina** tutto di quella serata. Sono dati dei giocatori: tienili di conto. Il testo non compare mai nei log del server.

## 6. Per chi sviluppa

- Plugin: `packages/minigames/src/stanze-segrete/` (mappa pura in `map.ts`, configurazione in `config.ts`).
- Viste: `packages/client/src/minigames/stanze-segrete/` (`StanzeViews` per schermo e telefono, `StanzeHost` per il GM).
- Il ruolo GM è generico: vedi [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md), sezione «Game Master».
- Prove: `pnpm test`, `pnpm test:e2e` (scenari `stanze-segrete` e `stanze-preview`), `pnpm stress --players 10 --scenario stanze`.
