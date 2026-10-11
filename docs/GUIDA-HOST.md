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
4. **Prova**: apri `/play` da un telefono, crea un profilo e fai una partita di prova da solo.

I giocatori si registrano da soli dal telefono (nome, avatar, colore). Poi li assegni alle squadre dalla scheda della serata.

## Durante la serata

1. **Lobby**: i giocatori inquadrano il QR e compaiono sullo schermo con il loro ping. Se un nome è grigio, quel telefono si è disconnesso (rientra da solo).
2. Nella scheda **Live** scegli la serata e premi **Avvia** sulla partita, poi **Avvia round N**.
3. Ogni minigioco ha i **suoi pulsanti** nella regia (per esempio *Apri il buzzer*, *Risposta corretta*, *Prossima domanda*). Lo schermo e i telefoni seguono da soli.
4. Tra un round e l'altro compare la classifica (giocatori e squadre). Puoi **assegnare o togliere punti a mano** con un motivo; resta tutto registrato.
5. A fine partita premi **Concludi la partita** e poi **Torna alla lobby**: lo schermo rimostra i QR per chi arriva dopo.

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
