# Shadow Tournament: guida per la regia

Torneo a eliminazione, tutti contro tutti, a scontri di sasso-carta-forbice con una moneta (i **token**) per le azioni speciali. Le regole complete e le motivazioni sono in [PIANO-SHADOW-TOURNAMENT.md](PIANO-SHADOW-TOURNAMENT.md); come funziona il codice in [NUOVO-MINIGIOCO.md](NUOVO-MINIGIOCO.md).

## Come si usa

1. In **Libreria** aggiungi un'istanza «Shadow Tournament» (i valori predefiniti sono già quelli del regolamento) e mettila come round della partita.
2. Serve almeno **2 giocatori** (pensato per 4-30). Chi entra a torneo iniziato guarda dallo schermo.
3. Il gioco va avanti da solo: nessun Game Master. Dal pannello **Live** hai:
   - **Salta timer**: manda avanti la fase in corso (di un passo per volta);
   - **Pausa / Riprendi**: congela tutti i timer;
   - **Termina torneo**: chiude subito con la classifica attuale e i punti di conseguenza;
   - **Ritira «giocatore»**: il giocatore perde lo scontro in corso ed è eliminato (per chi se ne va a metà serata).

## Come si gioca (in breve)

- Ogni **scontro** è una serie di **scambi**: tutti e due scelgono in segreto Attacco, Difesa o Raggiro (Attacco > Raggiro > Difesa > Attacco). Chi perde uno scambio perde 1 vita; stessa carta = si rigioca.
- Si parte da **3 vite** a scontro. Chi perde lo scontro passa da **W a L**; alla seconda sconfitta è **eliminato**. Vince l'ultimo rimasto.
- **Token** (1 all'inizio, al massimo 5): vita extra prima dello scontro, **Scommessa**, **Scudo**, **Trappola**, **Cambia carta** (e la contromossa). Una sola azione per scambio.
- Chi vince uno scontro **pesca una carta ricompensa** dal mazzo **Normale** (sicuro) o **Leggendario** (rende di più, rischia di più).
- In numero dispari uno resta solo e sceglie **Bye** (salta il turno) o **NPC** (affronta un avversario interpretato da un eliminato a sorte, o dal computer; perdere conta come una sconfitta).
- Gli **eliminati** fanno l'NPC quando vengono estratti e **pronosticano** il vincitore dello scontro in evidenza.

Le regole sono sempre sul telefono (pulsante «?») con i costi della configurazione.

## Punti in classifica

| Cosa | Punti (predefiniti) |
|---|---|
| Piazzamento nel torneo | 1° 1000, 2° 700, 3° 500, poi a scalare fino a 100 per il primo eliminato |
| Ogni scontro vinto (anche contro l'NPC) | +50 |
| Ogni pronostico giusto di un eliminato | +30 |
| Chi fa l'NPC | niente |

## Configurazione dell'istanza

Tutto è modificabile dall'editor: vite iniziali e massime, token iniziali e massimi, costi di ogni azione, tempi (scelta 15 s, reazioni 8 s…), «tutti partono da L» (eliminazione diretta), turni massimi, punti e i due **mazzi** (carte, quantità, effetti su token e vite; una carta può essere «a scelta» fra i token e le vite).

Per accorciare un torneo: **2 vite** invece di 3, tempi di scelta più brevi, «tutti partono da L».

## Durata e bilanciamento

`pnpm balance:shadow` (~25 s) fa giocare il vero plugin a giocatori simulati che rispondono dopo ~5 s e stampa durata, uso di ogni azione e quanti tornei vince chi adotta uno stile contro chi gioca «bilanciato» (50% = nessun vantaggio). Si rilancia dopo ogni modifica a costi, mazzi o regole.

Esito dell'ultima misura (carte scelte a caso, quindi niente psicologia):

| Giocatori | Turni | Durata |
|---|---|---|
| 4 | ~5 | ~7 min |
| 8 | ~6 | ~9 min |
| 16 | ~7 | ~12 min |
| 30 | ~8 | ~14 min |

Persone vere ci mettono di più a decidere: conta il doppio. Nessuno stile domina: sempre Leggendario 45%, sempre Normale 53%, Scommessa sempre 48%, mai Scommessa 55%, Scudo sempre 53%, Trappola sempre 50%. Fa eccezione la **vita extra**: chi non la compra mai vince solo il 37% dei tornei contro un giocatore bilanciato, e chi non spende mai alcun token il 22%. Spendere i token conviene sempre.

## Privacy

Carta, Scommessa, vita extra, reazioni scelte e carta del Cambia carta restano nello stato del server fino alla rivelazione: schermo e avversari vedono solo «ha scelto ✓». I token, lo stato W/L e le vite sono pubblici. Lo verificano i test `shadow.test.ts` (anti-leak sulle viste) e `e2e/shadow-tournament.spec.ts` (frame WebSocket).

## Test

- `pnpm test`: regole degli scambi, accoppiamento, ricompense, flusso completo, anti-leak e tornei simulati da 2 a 30 giocatori.
- `pnpm test:e2e` (`e2e/shadow-tournament.spec.ts`): anteprima dei quattro temi senza overflow e un torneo da 4 telefoni fino alla classifica, con Bye/NPC e controllo dei frame WebSocket.
