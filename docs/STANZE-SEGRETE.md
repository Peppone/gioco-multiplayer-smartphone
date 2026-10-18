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
**La regia può essere il Game Master:** non serve nessun link. Nel pannello Live, avviato il round, compare la stessa interfaccia del GM (con la nota «Stai conducendo tu come Game Master») e tutti i comandi funzionano da lì; il link serve solo per far condurre un altro telefono. Si possono usare anche insieme.

## 2. Che cosa vede e fa il GM (`/master`)

L'interfaccia è una colonna unica, pensata per il telefono.

- **Fase** e comandi: *Mostra la mappa a schermo e telefoni* / *Nascondi la mappa*, *Distribuisci*, *Inizia* (solo con tutti piazzati), *Rivela la mappa sullo schermo*, *Concludi*.
- **⏱ Tempo**: il **tempo di gioco** parte da solo con *Inizia* e si ferma alla rivelazione. Se l'istanza ha un intervallo (default 5 minuti) a ogni intervallo trascorso il contatore segna +1, la riga lampeggia, suona e vibra, e nel diario compare «⏱ Tempo di gioco: trascorsi 10 min». Puoi aggiungere altri **cronometri** (fino a 10, es. «Gas nella Stanza 5» ogni 2 minuti, oppure senza intervallo per un semplice conteggio), con *Avvia / Pausa / Riprendi / Azzera / Elimina*. Sono solo per il GM: schermo e telefoni non ne ricevono nulla.
- **Oggetti nuovi in partita**: «➕ Nuovo oggetto» (nome, icona, testo leggibile, nota, stanza) crea un oggetto quando vuoi, anche già nella stanza e percepibile; il cestino 🗑 lo elimina.
- **Richieste**: la coda di spostamenti, sbirciate, azioni libere e soluzioni, con *Approva / Rifiuta*,
  *Approva tutti gli spostamenti* e *Mostra la lettera per N s*. Suona e vibra quando ne arriva una.
- **Mappa** con le lettere e le note. Per piazzare o spostare un giocatore: **tocca il giocatore, poi la stanza**
  (più affidabile del trascinamento). Tocca il bordo tra due stanze per **chiudere o riaprire la porta** (🔒) per tutti.
- **Abilitazione rapida**: scegli giocatori (o «Tutti», o gli occupanti di una stanza), la capacità, durata e usi
  facoltativi, poi *Abilita* / *Disabilita*. *Spegni tutto* le toglie a tutti.
- **Menu del giocatore**: **tocca un giocatore sulla mappa** e si apre un menu con tutte le azioni per lui. Da PC è un pannello laterale a destra (la pagina si sposta per non coprire la mappa), da telefono un foglio dal basso; si chiude con ✕ o Esc. Dentro: spostamento (scelta della stanza o «Scegli sulla mappa»; «Togli dalla mappa»), esito, interruttori delle capacità con durata/usi e frecce da bloccare, «Mostra una lettera», un **evento solo per lui**, i **suoi oggetti** (palesa quelli della sua stanza solo a lui) e la conversazione privata.
- **Giocatori**: una scheda per ognuno con l'esito (in gioco / fuggito / eliminato), gli interruttori delle
  capacità, le **frecce da bloccare** per muoversi e sbirciare, «Mostra una lettera» e la conversazione privata.
- **🎒 Oggetti**: il catalogo dell'istanza (di esempio: una scopa, una lettera con un messaggio, un libro, degli occhiali futuristici, una cassetta degli attrezzi; ne puoi creare altri nell'editor, con icona, testo leggibile e nota per te). Per ogni oggetto scegli la **stanza** e, se vuoi, lo rendi **percepibile**; poi lo **palesi** ai presenti o a singoli giocatori. **✏️ Modifica** (su ogni oggetto, anche quelli dell'istanza) cambia icona, nome, testo leggibile e nota: chi lo conosce già vede subito il testo aggiornato, gli altri non notano nulla. La modifica vale solo per questa partita, non cambia l'istanza nella libreria.
- **Posta (chat)**: una conversazione per giocatore più gli **📢 Annunci** (messaggi a tutti o a una stanza), con non letti
  e anteprima dell'ultimo messaggio, le più recenti in alto. Si apre una conversazione toccandola: si legge tutto il
  filo (tuo e del giocatore, con «letto da N/M»), i non letti si segnano da soli e si risponde lì sotto con «Consenti
  risposta» (Invio invia, Maiusc+Invio va a capo); «← Chat» torna all'elenco.
- **Barra degli avvisi**: sempre in alto, mostra richieste e posta da leggere e i cronometri scaduti (si chiudono toccandoli);
  ogni voce porta alla sua sezione. Il numero di cose da fare compare anche nel titolo della scheda.
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

**Croce direzionale.** Le frecce sono sempre quattro, anche in una stanza d'angolo: ognuna è *aperta* o *bloccata* (🔒), e un muro appare come una freccia aperta, così i giocatori non deducono la forma della mappa. Se ne premono una che porta contro un muro, la richiesta ti arriva con l'avviso «⚠ muro: in quella direzione non c'è nessuna stanza» e approvarla non sposta nessuno (il giocatore vede «Il Master ha rifiutato»). Il GM blocca in due modi:
togliendo direzioni al permesso del singolo giocatore (modificabile anche dopo) o chiudendo una porta tra due stanze
per tutti. Il giocatore non sa perché una freccia è bloccata né dove porta.

**Lettere.** Nessuno le vede di diritto. Il permesso «Guarda la lettera» (di default **una sola occhiata**) mostra la
lettera per `defaultSightSec` secondi, **tenendo premuto** il riquadro; poi sparisce dal telefono, che non la
ricorda. Il GM può anche mostrarne una direttamente. Limite accettato: chi la vede può fotografarla.

**Oggetti.** Un oggetto assegnato a una stanza è invisibile finché non lo abiliti («I presenti sanno che c'è qualcosa»): da quel momento chi è nella stanza vede una scheda «❔ Un oggetto – c'è qualcosa qui, ma non sai cosa», senza nome, icona né testo (il server non li invia). Con **Palesa ai presenti** tutti quelli che sono nella stanza scoprono nome, icona e, se c'è, il testo (il messaggio di una lettera, le parole di un libro); con **Palesa a [nome]** solo quel giocatore, e gli altri continuano a vedere un oggetto misterioso. Chi esce dalla stanza non lo vede più; se sposti l'oggetto torna misterioso per tutti, e «Rendi di nuovo misterioso» cancella chi lo conosce. Gli oggetti non compaiono mai sullo schermo. Cosa l'oggetto *faccia* lo decidi tu: combinalo con capacità, porte e messaggi.

**Messaggi.** Il giocatore legge sempre. Può rispondere solo se il GM lascia «Consenti risposta» (una volta; il GM può chiudere le risposte quando vuole con «Chiudi le risposte»). Un messaggio nuovo vibra e compare a tutto schermo finché non viene letto.

**Eventi.** Una comunicazione ufficiale («Crolla il soffitto»). Compare a tutto schermo con scritto **«Evento:»** e
il giocatore deve premere **Accetta**; più eventi si mostrano in ordine. Il GM vede chi ha accettato e può annullare
un evento non ancora accettato da tutti. Ogni giocatore trova i **propri** eventi nella scheda «📜 Eventi»
(un multicast non rivela agli altri chi l'ha ricevuto). Gli eventi non vanno sullo schermo condiviso: se sono
pubblici, leggili ad alta voce.

**La mappa è nascosta.** Di default i giocatori non sanno com'è fatto il complesso: lo schermo dice solo che è "avvolto nel buio" e i telefoni non hanno la mini-mappa né le dimensioni (nemmeno nelle regole). Né la griglia né le posizioni arrivano ai client. Il GM la mostra con *Mostra la mappa a schermo e telefoni* quando vuole (anche subito in preparazione) e la può nascondere di nuovo. La rivelazione finale la mostra comunque. Restano visibili il numero della propria stanza e la croce con le frecce, che il GM controlla.

**Fasi.** *Preparazione* (scegli la stanza di partenza di ognuno, accendi capacità, chiudi porte) → *In gioco* (nessun
timer: si va al ritmo del GM) → *Rivelazione* (lo schermo accende le lettere e traccia i due percorsi, con l'esito
di ognuno) → *Conclusa*. Punti: chi è **fuggito** riceve `escapePoints`, chi ha la soluzione **convalidata**
`solvePoints`. Rettifiche manuali dei punti restano alla regia.

## 4. Chi vede cosa

| | Schermo | Telefono del giocatore | GM |
|---|---|---|---|
| Griglia e numeri delle stanze | solo se il GM mostra la mappa | solo se il GM mostra la mappa (il numero della propria stanza sempre) | ✅ |
| Lettere | solo alla rivelazione | solo durante un'occhiata concessa | ✅ |
| Note sulle stanze, porte chiuse, diario, cronometri | ❌ | ❌ | ✅ |
| Oggetti | ❌ | solo quelli della propria stanza, misteriosi finché il GM non li palesa a lui | ✅ con note e chi li conosce |
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
