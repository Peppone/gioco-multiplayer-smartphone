# Lunghezza d'Onda: guida

Gioco di indizi su uno spettro nello stile di *Wavelength*: a turno un **Sensitivo** vede sul telefono dove cade un
bersaglio nascosto su uno spettro («Freddo ↔ Caldo») e scrive un indizio; gli altri spostano un **quadrante** sul
telefono per indovinare il punto, e la TV apre il coperchio. La discussione resta **a voce**. Da **3 a 30 giocatori**.
Decisioni e motivazioni in [PIANO-LUNGHEZZA-ONDA.md](PIANO-LUNGHEZZA-ONDA.md). «Wavelength» è un marchio di Palm
Court / CMYK: qui il gioco si chiama *Lunghezza d'Onda* e regole, testi e spettri sono nostri.

## Come si gioca

1. **Spettro.** Il Sensitivo di turno sceglie uno dei due spettri proposti sul suo telefono. Il server estrae il
   bersaglio, un punto da 0 a 100, lontano dai bordi almeno `edgeMargin`.
2. **Indizio.** Il Sensitivo vede il bersaglio (con «🙈 Nascondi» lo copre) e scrive un indizio che secondo lui sta
   in quel punto («Il caffè del bar»). Niente numeri, niente sinonimi degli estremi: lo giudica la regia.
3. **Quadrante.** Gli altri trascinano la lancetta sul semicerchio (con `‹ ›` per la regolazione fine) e confermano;
   si può cambiare finché c'è tempo. Il turno si chiude prima se tutti confermano.
4. **Rivelazione.** La TV apre il coperchio: il bersaglio ha cinque fasce, **4 punti al centro**, 3 e 2 ai lati,
   0 fuori. Con `zoneWidth` = 5 il bersaglio intero copre 25 punti su 100.

### Tutti contro tutti (predefinita)

- Ognuno indovina **per sé** e prende `fascia × unitPoints` (100 al centro con il default di 25). Le posizioni
  degli altri restano segrete fino alla rivelazione, altrimenti si copia.
- Il Sensitivo prende la **media** dei punti di chi ha giocato: conviene dare indizi chiari.
- Turni: uno per giocatore fino a 8 (o il numero scritto nell'istanza).

### A squadre

- Indovina la **squadra del Sensitivo**: la sua posizione è la **mediana** dei membri, mostrata dal vivo sulla TV
  insieme ai pallini dei compagni. La squadra prende i punti della fascia.
- Le **altre squadre** scommettono a maggioranza se il centro del bersaglio sta **più a sinistra o più a destra**
  della lancetta: chi ha ragione prende `counterPoints` (1), ma niente se la squadra di turno ha fatto 4.
- Vince la prima squadra che arriva a `targetScore` (10), oppure chi ha più punti dopo i turni (al massimo 20).
- **Recupero:** chi fa 4 ed è ancora dietro gioca subito un altro turno (una volta di fila; `catchUp`).
- In classifica ogni punto del quadrante vale `unitPoints` per **ogni membro** della squadra.
- Squadre: i team della serata se almeno due hanno giocatori (anche più di due; chi non ha un team va nella più
  piccola), altrimenti due squadre a caso. Servono almeno 2 squadre da 2 giocatori: altrimenti la partita non parte.

Le regole con i numeri della partita sono anche nel telefono (pulsante «ℹ️»), dal file `rulesText.ts`.

## Preparare il gioco (regia, `/admin`)

| Campo | Default | Note |
|---|---|---|
| Modalità | Tutti contro tutti | Oppure a squadre |
| Spettri | 80 coppie d'esempio | Almeno 2; ogni estremo fino a 40 caratteri. Quelli dei round precedenti della partita non si ripropongono |
| Turni | 0 (automatico) | Tutti contro tutti un turno per giocatore (al massimo 8); a squadre fino al punteggio (al massimo 20) |
| Punteggio da raggiungere | 10 | Solo a squadre |
| Larghezza di una fascia | 5 su 100 | |
| Distanza minima dai bordi | 5 su 100 | |
| Tempi | spettro 20 s, indizio 60 s (0 = senza limite), quadrante 60 s, scommessa 20 s | Allo scadere dello spettro sceglie il server; dell'indizio il turno salta |
| Recupero | sì | Solo a squadre |
| Punti | 25 per punto del quadrante, 1 per la scommessa | |

### Durante la partita (pannello Live)

| Pulsante | Quando |
|---|---|
| Avanti / Concludi | Dopo la rivelazione si passa al turno dopo; alla classifica finale si chiude il round e si registrano i punti |
| Indizio non valido | Durante il quadrante: il Sensitivo riscrive l'indizio e il tempo riparte |
| Salta il turno | Il Sensitivo è assente o il turno è da buttare |
| Chiudi la fase | Chiude subito la fase in corso, come allo scadere |
| Termina dopo questo turno | Il round finisce alla fine del turno in corso |
| Pausa / Riprendi | Ferma il tempo |

La regia vede il bersaglio nel riquadro informativo: non giocare se conduci.

## Per chi sviluppa

- Plugin: `packages/minigames/src/lunghezza-onda/` (`index.ts` stato, fasi e viste; `scoring.ts` fasce, mediana,
  scommesse e punti; `spectra.ts` spettri d'esempio).
- Viste: `packages/client/src/minigames/lunghezza-onda/` (`Dial.tsx` quadrante condiviso tra TV e telefono,
  `OndaViews.tsx`, regole `rulesText.ts`, anteprima `previewData.ts` con le scene `lo-*`).
- **Frequenza degli invii:** in «tutti» la posizione parte una volta sola, al rilascio del dito; a squadre anche
  durante il trascinamento, al massimo ogni 250 ms, perché i compagni la vedono dal vivo (lo controlla l'e2e).
- **Privacy:** il bersaglio non c'è (la chiave manca) nelle viste di TV e giocatori prima della rivelazione, tranne per
  il Sensitivo da quando ha scelto lo spettro; in «tutti» niente posizioni altrui prima della rivelazione.
- Test richiesti per ogni modifica a fasi, punti, squadre o quadrante: `scoring.test.ts` e `lunghezza-onda.test.ts`
  (compresi gli anti-leak), gli scenari `e2e/onda-preview.spec.ts` e `e2e/lunghezza-onda.spec.ts` e
  `pnpm stress --players 30 --scenario onda` (una partita per modalità; con 2 giocatori l'avvio deve essere rifiutato).
  Se cambiano le regole si aggiorna `rulesText.ts`.
