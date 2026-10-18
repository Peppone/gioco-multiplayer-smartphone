# Parole Mannare: guida

Gioco di deduzione sociale in stile *Werewords*, senza scatola: l'app fa da tavolo (ruoli in privato, tempo, gettoni,
voti, punti) e la conversazione resta tutta **a voce**. Da **4 a 12 giocatori** (il resto della serata può essere più
numeroso solo se si sceglie un altro round: con più di 12 giocatori il round non parte). Decisioni e motivazioni in
[PIANO-PAROLE-MANNARE.md](PIANO-PAROLE-MANNARE.md). «Werewords» è un marchio di Bezier Games: qui il gioco si chiama
*Parole Mannare* e regole, testi e parole sono scritti da noi.

## Come si gioca

1. **Il Sindaco** è un giocatore estratto a caso (la regia può cambiarlo prima di distribuire i ruoli). Sceglie in segreto
   una parola tra 2–3 proposte e poi risponde alle domande dei compagni **assegnando gettoni dal telefono**.
2. **Ruoli segreti**: uno o più **Lupi** (conoscono la parola e cercano di sviare), un **Veggente** (la conosce e aiuta
   senza farsi scoprire), tutti gli altri **Paesani**. Anche il Sindaco ha un ruolo. Ognuno vede il proprio ruolo
   *tenendo premuto* un pulsante: nessuno chiude gli occhi.
3. **Domande** (4 minuti di default): i giocatori chiedono ad alta voce («È un animale?»); il Sindaco risponde dando
   un gettone a chi ha chiesto: ✅ Sì, ❌ No (riserva comune di 36), ❓ Forse (12), 🟡 Ci sei quasi e 🔴 Lontanissimo
   (uno solo ciascuno, in aggiunta alla risposta), 🎯 Esatto (parola indovinata).
4. **Parola indovinata** → i Lupi si rivelano e hanno 30 secondi per scegliere insieme il Veggente: se lo trovano
   vincono i Lupi, altrimenti il villaggio.
5. **Parola non indovinata** (tempo scaduto o Sì/No finiti) → la parola viene mostrata e tutti votano chi è il Lupo:
   se il più votato è un Lupo vince il villaggio, altrimenti i Lupi.
6. **Pareggio** in un voto → **ballottaggio** tra i giocatori a pari voti. Se finisce di nuovo pari: nella caccia al
   Veggente vince il villaggio, nel voto sul Lupo vincono i Lupi. Chi non vota non conta; se nessuno vota vincono i Lupi.
7. **Rivelazione**: la TV mostra la parola, i ruoli di tutti e la fazione vincitrice. Ogni membro della fazione
   vincitrice prende `winPoints` (100 di default); il Sindaco, se è tra i vincitori, anche `mayorBonus`.

Numero di Lupi automatico: **1** da 4 a 6 giocatori, **2** da 7 a 11, **3** con 12. Si può fissare a 1, 2 o 3: il numero
viene ridotto se lascerebbe meno di 3 non-Lupi.

## Preparare il gioco (regia, `/admin`)

**Libreria → «+ Parole Mannare»**: l'editor parte da una lista di esempio. Si possono cambiare:

- **Parole** (testo e difficoltà facile/media/difficile) e **difficoltà** usata per le proposte (o «mista»). Servono
  almeno tante parole della difficoltà scelta quante ne vede il Sindaco. Le parole già mostrate nei round precedenti
  della stessa partita non si ripropongono (se non bastano, si riusano le vecchie).
- Tempi: scelta della parola, notte, domande, finestra per annullare un «Esatto», caccia al Veggente, voto, ballottaggio.
- Gettoni: riserva di Sì/No, di Forse (o illimitati), numero di «Ci sei quasi» e «Lontanissimo» (0 = disattivati).
- Numero di Lupi e punti.

Aggiungi l'istanza come round di una partita. Dal pannello **Live**, avviato il round:

| Pulsante | Quando | Cosa fa |
|---|---|---|
| **Distribuisci i ruoli** | all'inizio | fa partire la scelta della parola (i ruoli sono già estratti, ma nessuno li vede) |
| **Cambia Sindaco** | solo prima di distribuire | passa al giocatore successivo |
| **Pausa / Riprendi** | in ogni fase a tempo | congela il timer |
| **Annulla ultimo gettone** | domande, finestra «Esatto», caccia al Veggente | come l'annulla del Sindaco; riporta alle domande anche un «Esatto» già confermato |
| **Chiudi le domande** | durante le domande | come allo scadere del tempo |
| **Chiudi il voto** | caccia al Veggente / voto sul Lupo | chiude subito il voto (o il ballottaggio) |
| **Avanti** | alla rivelazione | chiude il round e passa alla classifica |

La regia vede sempre parola, ruoli e riserve (riquadro informativo): per i giocatori e per la TV sono segreti.

## Il telefono del Sindaco

Una schermata sola, senza scorrimento: i **nomi** dei giocatori in alto, i **6 gettoni** in basso, il pulsante
**«↶ Annulla»** che mostra cosa annullerà.

- **Trascinare** un nome su un gettone, oppure un gettone su un nome (le due direzioni sono equivalenti).
- **Tocco-tocco**: toccare un nome (o un gettone) lo seleziona, il tocco su un elemento dell'altro tipo completa
  l'assegnazione; ritoccare lo stesso lo deseleziona. Funziona sempre, anche se il trascinamento non va (iOS).
- I gettoni esauriti sono grigi e non accettano rilasci. «Esatto» chiede conferma («Carla ha indovinato?»).
- **Annulla**: tocco singolo, si può ripetere per tornare indietro di più gettoni. Il tempo non torna indietro.
  Un «Esatto» si annulla solo nei pochi secondi della finestra (poi solo la regia).

## Gli altri telefoni e la TV

- A ogni gettone **tutti i telefoni** mostrano per qualche secondo «✅ Sì → Carla»; chi lo riceve vede «✅ Sì **a te**!» (e
  il telefono vibra, dove il browser lo permette). Dopo un annulla: «↶ Annullato: Sì a Carla».
- Il pulsante **ℹ️** apre le regole con i numeri veri della partita e la parte del proprio ruolo.
- La **TV** mostra una riga per giocatore con i gettoni ricevuti, le riserve rimaste, il timer; la riga di chi ha
  ricevuto l'ultimo gettone si illumina. Nelle altre fasi: Sindaco, notte, «Parola indovinata!», Lupi rivelati, voto con
  il conto di chi ha già votato, ballottaggio con i soli nomi pari, rivelazione finale.

## Privacy

Schermo e telefoni ricevono solo viste filtrate. La **parola** arriva al Sindaco, ai Lupi e al Veggente (dopo la scelta) e a
tutti solo da quando si vota il Lupo; le **proposte** solo al Sindaco; i **ruoli** altrui mai prima della rivelazione (i Lupi
si conoscono tra loro; i Lupi sono pubblici dalla caccia al Veggente); i **voti** non si vedono mai (solo quanti hanno
votato, e i Lupi vedono le scelte dei Lupi nella caccia al Veggente). Coperto da test anti-leak e da e2e sui frame WebSocket.

## Test e strumenti

- Unit test e anti-leak: `packages/minigames/src/parole-mannare/parole-mannare.test.ts`.
- Anteprima grafica: `/preview?theme=manga&scene=pm-questions` (scene `pm-*`); scenari Playwright in
  `e2e/parole-preview.spec.ts` (layout, nessun overflow, gesti) e `e2e/parole-mannare.spec.ts` (partite complete).
- Stress: `pnpm stress --players 12 --scenario parole` (un Sindaco simulato assegna gettoni a raffica e annulla, gli altri
  votano; con 13 giocatori l'avvio viene rifiutato).
- **Se si cambiano le regole** vanno aggiornati anche `packages/client/src/minigames/parole-mannare/rulesText.ts` (le
  regole mostrate nell'app) e questa guida.

## Limiti noti e cose da osservare nelle prime serate

- Il **ritmo del Sindaco** è il collo di bottiglia: da provare con persone vere.
- Con 11–12 giocatori i **36 Sì/No** della scatola possono finire prima del tempo: si alza `yesNoPool` dall'editor.
- Le **parole di esempio** sono poche e da tarare per difficoltà dopo le prime serate.
- Chi guarda il telefono altrui può sbirciare ruolo e parola nei pochi secondi in cui si tiene premuto: limite accettato,
  come con le carte fisiche.
