# Guida per l'host: organizzare una serata con Gioco

Questa guida è per chi conduce la serata. Non serve saper programmare.

## Che cosa serve

- **Un PC Windows** (anche portatile) che resta acceso e collegato per tutta la serata: ci gira il gioco.
- **Uno schermo grande** (TV o proiettore) collegato al PC, per mostrare la pagina `/screen`.
- **Internet sul PC** (anche modesto). Se il locale non ha internet, usa l'**hotspot di un telefono** collegando il PC a quella rete.
- **I telefoni dei giocatori**: nessuna app da installare, basta il browser (Safari su iPhone, Chrome su Android).

Il traffico di gioco è minimo (pochi KB al secondo per giocatore).

## Installazione (una sola volta)

1. Decomprimi `gioco-ros-win.zip` in una cartella, per esempio `C:\Gioco`. **Non serve nessun installer.**
2. Alla prima apertura Windows può mostrare avvisi perché il programma non è firmato:
   - **SmartScreen** («Windows ha protetto il PC»): clicca *Maggiori informazioni* → *Esegui comunque*.
   - **Firewall di Windows**: quando chiede se consentire l'accesso, scegli **Reti private** (serve ai telefoni in Wi-Fi per raggiungere il PC).
3. Controlla che nella sottocartella `bin` ci sia `cloudflared.exe`: serve per far giocare i telefoni con i **dati cellulari** (4G/5G). Senza, si può giocare solo dalla stessa rete Wi-Fi del PC.

## Avvio

1. Doppio clic su **`Avvia Gioco.bat`**. Si apre una finestra nera: **non chiuderla durante la serata**.
2. Si aprono due pagine nel browser:
   - **`/admin`**: la regia, da cui conduci la serata. **La prima volta crea la password** (almeno 8 caratteri) e conservala.
   - **`/screen`**: lo schermo per il pubblico. Trascina questa finestra sul proiettore e premi **F11** per il tutto schermo.
3. Nella finestra nera compaiono gli indirizzi: schermo, regia, rete locale e (dopo qualche secondo) l'indirizzo **internet**.
4. Sullo schermo ci sono **due QR code**:
   - **Via internet**: funziona con qualsiasi connessione, anche 4G/5G. È quello da usare di norma.
   - **Rete locale**: funziona se il telefono è nello stesso Wi-Fi del PC; utile se internet è lento.

Se non c'è internet, usa **`Avvia senza internet (solo rete locale).bat`**.

## Preparare la serata (prima che arrivino gli ospiti)

Dalla regia (`/admin`):

1. **Squadre**: crea le squadre (nome, emblema, colore).
2. **Libreria**: crea i minigiochi che vuoi usare (quiz, buzzer, vero/falso, stima, sondaggio). Parti dall'esempio già compilato e modificalo dal modulo; puoi anche esportare e importare file JSON per riusare i contenuti.
3. **Serate**: crea la serata, scegli le squadre e aggiungi le **partite**. Una partita classica è una sequenza di minigiochi presi dalla libreria; il **Duello dei Cavalieri** ha una guida a parte ([DUELLO-DEI-CAVALIERI.md](DUELLO-DEI-CAVALIERI.md)).
4. **Prova**: apri `/play` da un telefono, crea un profilo e fai una partita di prova da solo. Per provare **un solo minigioco** senza preparare nulla usa la prova rapida (qui sotto).

I giocatori si registrano da soli dal telefono (nome, avatar, colore). Poi li assegni alle squadre dalla scheda della serata.

### Prova rapida di un minigioco

Nella **Libreria**, accanto a ogni minigioco c'è **🧪 Prova**: scegli quanti telefoni finti vuoi (di solito 6) e se dividerli in due squadre, poi **Avvia la prova**. Non servono serata, squadre, partita né giocatori veri.

- Si apre la scheda **🧪 Prova** con lo **schermo** e un **telefono per ogni giocatore di prova** nella stessa pagina (la dimensione dei telefoni si regola, e si possono nascondere), e accanto i **comandi della regia** del minigioco. La prova parte già dal primo round.
- Tocca i telefoni con il mouse come farebbero gli ospiti. I telefoni di prova sono muti; per sentire i suoni usa l'audio dello schermo (un clic dentro lo schermo lo sblocca) oppure **Apri lo schermo in una finestra** per proiettarlo su un'altra finestra o sulla TV.
- Nessun punto resta registrato: giocatori, squadre e partita di prova non compaiono negli elenchi e spariscono a fine prova (anche se il PC si riavvia). Chiudi con **Chiudi la prova**, oppure dal pannello Live con *Termina la partita* e *Torna alla lobby*.
- Si prova un minigioco alla volta e non mentre se ne gioca uno vero. I minigiochi con un limite di giocatori ti propongono numeri validi.
- Se ricarichi la pagina della regia durante la prova, la ritrovi al suo posto.

## Durante la serata

1. **Lobby**: i giocatori inquadrano il QR e compaiono sullo schermo con il loro ping. Se un nome è grigio, quel telefono si è disconnesso (rientra da solo).
2. Nella scheda **Live** cerca la serata (scrivi una parte del nome della serata o della partita; maiuscole e accenti non contano) e premi **Avvia** sulla partita, poi **Avvia round N**. Le serate sono raggruppate in *In corso*, *Attive*, *Bozze* e *Chiuse* (le chiuse stanno ripiegate in fondo) e i pulsanti in alto le filtrano, con il conto di quante ce ne sono. Una serata diventa *Attiva* da sola quando ne avvii una partita; la scheda **Serate** ha lo stesso elenco con ricerca e filtri.
3. Ogni minigioco ha i **suoi pulsanti** nella regia (per esempio *Apri il buzzer*, *Risposta corretta*, *Prossima domanda*). Lo schermo e i telefoni seguono da soli.
4. Tra un round e l'altro compare la classifica (giocatori e squadre). Puoi **assegnare o togliere punti a mano** con un motivo; resta tutto registrato.
5. A fine partita premi **Concludi la partita** e poi **Torna alla lobby**: lo schermo rimostra i QR per chi arriva dopo.

**Squadre temporanee e capitani**: nel pannello Live, accanto a ogni giocatore con una squadra, il pulsante 👑 lo fa **capitano** della squadra (uno per squadra). Il riquadro **Squadre temporanee** forma squadre al volo (a sorte o a mano) che sostituiscono quelle della serata nei round a squadre (Lunghezza d'Onda, Agenti Segreti, Artificieri, Pilota alla cieca, Plancia di Comando, Duello, Indovina la canzone) dal round successivo; i punti restano ai giocatori e alle squadre della serata. Guida: [SQUADRE-TEMPORANEE.md](SQUADRE-TEMPORANEE.md).

**Indovina la canzone**: oltre al brano continuo, ogni round può usare **spezzoni crescenti** (0,5 s, pausa, 1 s, pausa, 2 s…), **svelare gradualmente** l'effetto sull'audio fino al brano intero, e far **scegliere la categoria** del prossimo brano ai capitani delle squadre, a turno (con pulsanti della regia per scegliere al loro posto). Guida: [INDOVINA-CANZONE.md](INDOVINA-CANZONE.md).

**Stanze Segrete (con Game Master)**: se il round in corso è un gioco con Game Master, nel pannello Live compare il riquadro **«Link del Game Master»**. Premi *Genera il link* e fai inquadrare il QR al telefono di chi conduce (o copia il link). Il link vale solo per quella partita e puoi revocarlo o rigenerarlo quando vuoi. Il gioco accetta al massimo 10 giocatori per serata. Dopo la serata, scheda **Messaggi** per rileggere, esportare o eliminare messaggi ed eventi. Guida completa: [STANZE-SEGRETE.md](STANZE-SEGRETE.md).

**Parole Mannare**: gioco di deduzione a voce per 4–12 giocatori (con più di 12 il round non parte). Dal pannello Live premi *Distribuisci i ruoli* (prima, se vuoi, *Cambia Sindaco*); il Sindaco risponde alle domande dal proprio telefono e la regia segue ruoli e parola nel riquadro informativo. Pulsanti utili: *Pausa*, *Annulla ultimo gettone*, *Chiudi le domande*, *Chiudi il voto*, *Avanti* alla rivelazione. Guida completa: [PAROLE-MANNARE.md](PAROLE-MANNARE.md).

**Stanze col botto**: deduzione sociale per 6–30 giocatori che si dividono in **due stanze fisiche** (due locali vicini, o due angoli lontani del salone: tra le stanze non si può comunicare). Prima di cominciare scegli come abbinare i giocatori (a caso, con i QR mostrati sullo schermo, o a mano dalla regia), poi premi *Distribuisci le carte* e *Avvia il round*. Se vuoi giocare anche tu, spunta **«Gioco anch'io (regia cieca)»** prima di distribuire le carte: non vedrai carte, voti né scelte degli ostaggi. Lo schermo è uno solo: chi sta nell'altra stanza si affida al telefono per tempo e avvisi (alza il volume, su iPhone non c'è la vibrazione). Guida completa: [STANZE-COL-BOTTO.md](STANZE-COL-BOTTO.md).

**Lunghezza d'Onda**: indizi su uno spettro per 3–30 giocatori, tutti contro tutti oppure a squadre (lo scegli nell'istanza; a squadre servono almeno due team da 2 giocatori). Il gioco va da solo: il Sensitivo di turno sceglie lo spettro e scrive l'indizio sul telefono, gli altri trascinano il quadrante. Tu premi *Avanti* dopo ogni rivelazione e *Concludi* alla classifica finale. Pulsanti utili: *Indizio non valido* (numeri o sinonimi degli estremi: il Sensitivo lo riscrive), *Salta il turno* (Sensitivo assente), *Termina dopo questo turno*, *Pausa*. Nel riquadro vedi il bersaglio: se conduci, non giocare. Guida completa: [LUNGHEZZA-ONDA.md](LUNGHEZZA-ONDA.md).

**Agenti Segreti**: parole e indizi a squadre per 4–30 giocatori. All'avvio lo schermo mostra le due squadre e i Capi-spia: dal pannello Live puoi spostare qualcuno (→), cambiare Capo-spia (🕶) o *Mescola squadre*, poi premi *Distribuisci*. Da lì il gioco va da solo: il Capo-spia scrive l'indizio sul telefono e la sua squadra vota le carte. Pulsanti utili: *Pausa*, *Indizio non valido* (per gli indizi furbi che il controllo automatico non prende), *Annulla scoperta* (se la squadra ha votato per sbaglio), *Fine turno*, *Avanti* alla mappa finale. Per giocare anche tu spunta **«Gioco anch'io (regia cieca)»** prima di distribuire. Consiglia ai Capi-spia di stare in disparte e di usare «Nascondi». Le parole sono nella libreria, nella lista «Parole di Agenti Segreti»: le puoi correggere, ampliare (una per riga), duplicare ed esportare come ogni contenuto. Guida completa: [AGENTI-SEGRETI.md](AGENTI-SEGRETI.md).

**Artificieri**: disinnesco a squadre per 2–30 giocatori (ogni team della serata con almeno 2 giocatori; senza team l'app li divide in squadre da 3–5). Gioca una squadra alla volta: l'**artificiere** guarda la bomba sulla TV e agisce dal telefono, gli **esperti** si girano di spalle alla TV e leggono il manuale sul telefono (ognuno ha pagine diverse: devono parlare), le altre squadre scommettono. Tu premi *Avanti* dopo ogni esito (o *Inizia* se l'artificiere non lo fa). Nel pannello vedi la **soluzione di ogni modulo**: usala per aiutare chi è in difficoltà, non per condurre. Pulsanti utili: *Pausa*, *Cambia artificiere* (assente), *Annulla l'ultimo errore* (tocco sbagliato evidente), *Esplodi*/*Disinnesca*, *Salta la squadra*, *Termina il round*. Metti i giocatori in squadre da 3 a 6. Il modulo «Parola» ha bisogno di una lista di parole (per esempio «Parole di Agenti Segreti»). Guida completa: [ARTIFICIERI.md](ARTIFICIERI.md).

**Pilota alla cieca**: gara in un labirinto per 2–30 giocatori (ogni team della serata con almeno 2 giocatori; senza team l'app li divide in 2–4 squadre). Il **pilota** guarda la TV e muove la pedina con la croce del telefono, ma non vede i pericoli; ogni **navigatore** vede sul telefono un solo strato (mine, porte, chiavi o pattuglie) e lo deve dire a voce. Le squadre corrono insieme (fino a 4 corsie sulla TV) oppure a turno, lo scegli nell'istanza. Tu premi *Via* (altrimenti parte da sola dopo 10 secondi) e *Avanti* a fine gara. Nel pannello vedi **tutti gli strati** e chi li ha. Pulsanti utili: *Pausa*, *Cambia pilota* (assente, prima del via), *Chiudi la gara*, *Termina il round*. I piloti non devono guardare i telefoni dei compagni. Guida completa: [PILOTA-CIECO.md](PILOTA-CIECO.md).

**Il Pianeta Nascosto**: gioco di deduzione logica da tavolo, per squadre (1–30 giocatori, fino a 6 osservatori tra squadre e robot), fedele alle regole di *The Search for Planet X*. Ogni team è un osservatorio che cerca il Pianeta X, nascosto in un settore che sembra vuoto, rilevando e puntando i settori del cielo visibile, leggendo ricerche e conferenze e pubblicando teorie con gettoni limitati. Sulla TV c'è il tabellone, su ogni telefono il foglio appunti della squadra. Tu premi *Inizia*, e *Avanti* / *Chiudi la fase* quando serve; la regia è **cieca** finché non premi *Mostra la soluzione*. Con una squadra sola aggiungi almeno un robot. Dura 20–40 minuti a tavolino e va presentato come gioco da «serata da tavolo»: i livelli *Ragazzi* e *Principiante* danno più informazioni iniziali. Se hai l'app ufficiale puoi importarne gli schemi dalla Libreria (riquadro «Schemi dell'app ufficiale»). Guida completa: [PIANETA-NASCOSTO.md](PIANETA-NASCOSTO.md).

**Plancia di Comando**: gioco caotico per 2–30 giocatori in stile *Spaceteam*. Ogni team della serata è l'equipaggio di un'astronave (da 2 a 8 giocatori; senza team l'app li divide in gruppi da 4–6) oppure, scegliendo «Equipaggio unico» nell'istanza, giocano tutti insieme. Ogni telefono ha un pannello di comandi dai nomi assurdi e un **ordine** a tempo che riguarda quasi sempre il pannello di un compagno: va **gridato**. Ordine eseguito, l'astronave avanza; scaduto, lo scafo si danneggia. Tu premi *Decollo* e, a fine round, *Avanti*. Nel pannello vedi l'ordine di ogni giocatore. Pulsanti utili: *Pausa*, *Ripara gli scafi*, *Rimescola i pannelli*, *Salta il settore*, *Termina il round*, e il 📵 accanto a un giocatore con il telefono scarico o senza rete (i pannelli dei compagni si rifanno senza i suoi comandi). Guida completa: [PLANCIA-COMANDO.md](PLANCIA-COMANDO.md).

**Reazioni**: i giocatori possono mandare emoji dal telefono; volano sullo schermo.

**Audio**: il browser blocca l'audio finché non si clicca. Sulla pagina `/screen` clicca una volta sul pulsante 🔊 (o ovunque). L'audio dello schermo esce dal PC: se usi un proiettore/TV via HDMI, scegli l'uscita HDMI come dispositivo audio di Windows.

## Prima di cominciare: lista di controllo (10 minuti)

- [ ] PC collegato all'alimentazione; **risparmio energia disattivato** (lo schermo non deve spegnersi né il PC andare in stop).
- [ ] Gioco avviato, finestra nera aperta.
- [ ] `/screen` sul proiettore, a tutto schermo (F11), con i due QR visibili.
- [ ] Un telefono **in 4G con il Wi-Fi spento** riesce a entrare dal QR internet.
- [ ] Audio dello schermo acceso e udibile (clic su 🔊).
- [ ] Contenuti pronti: squadre, minigiochi, partita, giocatori assegnati.
- [ ] Hai annotato la **password admin**.

## Se qualcosa non va

| Problema | Che fare |
|---|---|
| Un telefono non carica la pagina con il QR internet | Prova il **QR rete locale** (stesso Wi-Fi), oppure ricarica la pagina. Gli indirizzi nuovi possono impiegare qualche secondo a diventare raggiungibili. |
| Il QR internet non compare / «tunnel non disponibile» | Manca `cloudflared.exe` in `bin`, oppure non c'è internet sul PC. Usa il QR rete locale o l'hotspot. Il gioco riprova da solo a riconnettere il tunnel (l'indirizzo può cambiare: lo schermo aggiorna il QR). |
| Un telefono si è bloccato o ha perso la connessione | Basta riaprire la pagina: **rientra da solo** con il suo profilo, e ritrova lo stato della partita. |
| Un giocatore ha cambiato telefono | Dalla pagina `/play`: *Ho già un profilo* → nome e **PIN a 4 cifre** (mostrato alla creazione del profilo). Dopo 5 PIN sbagliati il recupero si blocca per un minuto. |
| Un giocatore ha dimenticato il PIN | Regia → **Giocatori**: cerca il nome e premi *Mostra PIN*. Per i profili creati prima di questa funzione il PIN non è recuperabile: premi *Nuovo PIN* (il vecchio smette di valere, il telefono resta collegato). |
| Un nome è già preso | Scegline un altro, oppure usa il recupero se è il tuo profilo. |
| «La porta 3000 è già in uso» | Il gioco è già aperto in un'altra finestra: chiudila. |
| Il PC si è spento o riavviato a metà partita | **Riavvia il gioco**: la partita riprende da dove era e i giocatori rientrano da soli. I timer scaduti nel frattempo si risolvono subito. |
| La regia chiede di nuovo la password | La sessione dura 12 ore e sopravvive al riavvio del gioco; se è scaduta (o hai reimpostato la password) la pagina torna da sola al login: rientra con la password. |
| Dimenticato la password admin | Con il gioco spento, doppio clic su **`Reimposta password regia.bat`**: toglie solo la password (profili, serate e punti restano). Poi riavvia il gioco e, aprendo `/admin`, scegline una nuova. |
| Il buzzer sembra «ingiusto» | Il gioco compensa la latenza di ogni telefono (orologio sincronizzato e finestra di raccolta di 250 ms): vince chi ha premuto davvero per primo. Lo schermo mostra il ping di ciascuno nella lobby. |

## I tuoi dati

- Tutto (profili, serate, punteggi) sta nel file **`data\gioco.sqlite`** nella cartella del gioco, sul **tuo PC**. Per fare un **backup** copia la cartella `data` a gioco spento.
- La password admin è salvata solo come impronta (hash), mai in chiaro.
- Per far giocare i telefoni in 4G il traffico passa dal servizio gratuito **Cloudflare Quick Tunnel** (nessun account). Non c'è nessun altro servizio esterno.
- Gli avatar e i nomi dei giocatori non lasciano il PC, a parte l'inoltro del traffico di gioco attraverso il tunnel.

## Aggiornare il gioco

Scarica la nuova versione, decomprimila in una cartella nuova e **copia dentro la tua cartella `data`** della versione precedente. Così profili e storico restano.

## Per chi sviluppa

- `pnpm start`: avvia il gioco dal codice. `pnpm test`, `pnpm test:e2e`: controlli automatici.
- `pnpm stress`: avvia un server di prova isolato e fa giocare **30 giocatori simulati** (latenza e orologi sfasati) a una partita classica e a un duello, con un report di coerenza e tempi. `pnpm test:stress` lo esegue come test.
- `pnpm package:win` crea il pacchetto per Windows; `pnpm package:check [--tunnel]` lo verifica avviando il server impacchettato.
