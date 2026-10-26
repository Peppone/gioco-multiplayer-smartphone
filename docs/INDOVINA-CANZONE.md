# Indovina la canzone (quiz musicale)

La musica suona **solo sullo schermo condiviso**; i telefoni sono buzzer. Chi si prenota per primo (ora equa, come nel buzzer) ferma la musica e risponde a voce; la regia dice se è giusta. Più si ascolta, meno punti vale la risposta.

Questa guida riguarda le funzioni che rendono il brano più o meno riconoscibile e la scelta della categoria. Per il resto (file o link YouTube, punti, penalità) vedi il modulo dell'istanza: ogni campo ha la sua descrizione.

## File accettati: audio e video mp4

Il brano si carica come file dal modulo (mp3, m4a, aac, ogg, wav, webm, flac) oppure come **video mp4**, per esempio un videoclip scaricato: del file si usa **solo la traccia audio**, il video non compare mai né sullo schermo né sui telefoni (rivelerebbe il brano). L'mp4 si comporta come ogni altro file: effetti sul suono, «Svela gradualmente» e spezzoni crescenti funzionano uguale.

- Limite di **100 MB** a file (un mp4 pesa molto più di un mp3 della stessa durata); l'anteprima nel modulo suona l'audio del video.
- Vanno bene gli mp4 con audio AAC (quelli di quasi tutti i telefoni e dei siti di download): il browser dello **schermo** deve saperli decodificare, e Edge e Chrome su Windows lo fanno. Con gli spezzoni crescenti lo schermo scarica e decodifica tutto il file prima di suonare, quindi un video molto lungo ci mette qualche secondo in più a essere pronto.
- Il tipo del file si riconosce anche dall'estensione, perché Windows a volte non dichiara il tipo di un `.mp4`.

## Effetti sul suono: più effetti insieme, ognuno con la sua quantità

Ogni brano ha un **elenco di effetti** («Effetti sull'audio» nel modulo, fino a 8). Si aggiungono con **«+ Aggiungi effetto»**, si riordinano con ↑ ↓ e si tolgono con ✕. Gli effetti si applicano **uno dopo l'altro nell'ordine dell'elenco** (l'ordine conta: un'eco dopo la distorsione non suona come prima) e si può usare lo stesso effetto più volte.

| Effetto | Cosa fa | A 100% | Oltre (fino a 300%) |
|---|---|---|---|
| Sfocato | filtro passa-basso: melodia e ritmo restano, consonanti e acuti spariscono | taglia a 1,2 kHz | scende fino a 60 Hz: resta quasi solo il basso (165% ≈ il vecchio «molto sfocato», 450 Hz) |
| Senza voce | cancella ciò che sta al centro del suono (di solito la voce) e rimette il basso | voce tolta, basso all'80% | toglie anche il basso riaggiunto, che porta con sé un po' di voce |
| Telefono | banda stretta, suono «da telefono» | 300–3400 Hz | fino a 1200–1500 Hz: poco più di un sibilo |
| Distorsione | saturazione morbida | spinta ×6 | spinta fino a ×25 |
| Eco | ripetizione dopo 0,32 s | 55% con rinvio al 40% | fino a 100% con rinvio all'80% (mai oltre, così non si accumula) |

- **Quantità**: ogni effetto ha il suo cursore, da **10 a 300%** (passo 5, con il campo numerico accanto). 100 è l'effetto «pieno» di riferimento, sotto è più leggero, sopra è esteso. Le funzioni che traducono la quantità in parametri audio sono pure (`blurCutoffHz`, `telephoneBand`, `noVoiceMix`, `distortionDrive`, `echoSettings` in `packages/client/src/minigames/indovina-canzone/effects.ts`) e sono verificate monotone su tutto l'intervallo.
- Un **limitatore** in fondo alla catena evita che la somma di più effetti (con i recuperi di volume) saturi la scheda audio.
- Funzionano solo con i **file caricati** (non YouTube): il modulo non salva un link YouTube con degli effetti.
- Con **«Svela gradualmente»** tutti gli effetti si attenuano insieme fino al brano intero: ognuno scala la propria quantità (lo sfocato sale di frequenza, il «senza voce» sfuma nell'originale, distorsione ed eco si dosano contro il suono pulito, il telefono allarga la banda). Il round non si salva se è acceso ma nessun brano ha effetti.
- Con l'**ovattato a fasi** il filtro passa-basso lo guidano le fasi: lo sfocato del brano non vale (lo sostituisce quello delle fasi, `effectsForListening` in `packages/shared/src/media.ts`), gli **altri effetti restano**.
- **Brani salvati prima**: avevano un solo effetto (`effect`: sfocato, molto sfocato, senza voce). Alla lettura diventa il primo dell'elenco (sfocato 100%, sfocato 165%, senza voce 100%), con lo stesso suono di prima; il vecchio campo sparisce al primo salvataggio. Finché non si salva, nel modulo compare «Effetto della versione precedente» (con «Nessuno» per toglierlo).
- **Gli effetti non arrivano mai ai telefoni**, come il file e il titolo.

### Sentire gli effetti in fase di setup

Nel modulo del brano, il lettore «Anteprima» suona il file **con tutti gli effetti scelti** (stessa catena audio dello schermo) e li **segue mentre li cambi**: aggiungere, togliere o spostare un effetto, o muovere il cursore di una quantità, si sente subito anche a brano in riproduzione (la catena si rifà 120 ms dopo l'ultimo cambio, così il cursore non crea scatti). La casella **«Ascolta con gli effetti»** (visibile solo se ce n'è almeno uno) si toglie per confrontare con il brano originale. L'anteprima non applica «Svela gradualmente»: suona sempre gli effetti pieni.

## Come si ascolta: brano per brano

Ogni brano sceglie **la propria modalità di ascolto** (campo «Modalità di ascolto del brano» nel modulo). «Come si ascolta» del round (continuo o a spezzoni, con durata, spezzoni e pausa) è solo il **predefinito**: i brani su «Come nel round» lo seguono, quindi le istanze salvate prima funzionano come prima. Nel modulo ogni modalità mostra solo i suoi campi.

| Modalità | Cosa si sente | Campi del brano |
|---|---|---|
| Come nel round | quella del round | durata dell'ascolto (facoltativa) |
| Continuo | il brano, di seguito | durata dell'ascolto (facoltativa) |
| A spezzoni crescenti | spezzoni sempre più lunghi, con una pausa in mezzo | durate degli spezzoni e pausa (vuoti = quelli del round) |
| Più lento o più veloce | il brano a velocità costante | velocità (0,5–2), mantieni l'intonazione, durata |
| Velocità diversa, poi normale | il brano parte alla velocità scelta e torna normale con un passaggio morbido | velocità, dopo quanti secondi torna normale, durata del passaggio, mantieni l'intonazione, durata |
| Molto ovattato, poi poco, poi normale | filtro forte, poi leggero, poi nessun filtro, con passaggi morbidi | secondi della fase 1, secondi della fase 2, durata di ogni passaggio, durata |

Un round può mescolare le modalità: un brano a spezzoni, il successivo più lento, il successivo continuo con 8 secondi. Punti e fine dell'ascolto seguono sempre il **tempo ascoltato** (a orologio), qualunque sia la modalità: con la velocità doppia 30 secondi fanno sentire un minuto di brano, ma i punti scendono sui 30 secondi.

### Più lento o più veloce

- **Velocità** da 0,5 (metà) a 2 (doppia). **Mantieni l'intonazione** (predefinito): cambia solo il tempo, la voce resta com'è; se lo togli il brano suona più grave quando è lento e più acuto quando è veloce, come un disco a un'altra velocità.
- **«Velocità diversa all'inizio, poi normale»**: dopo *N* secondi di ascolto la velocità sale (o scende) fino a 1 con un passaggio morbido di *M* secondi. La posizione nel brano è l'integrale della velocità (`songMsAt` in `packages/shared/src/playback.ts`): riprendere dopo una risposta sbagliata riparte dal punto in cui si era.
- Si combina con gli **effetti sull'audio** e con «Svela gradualmente». Non si combina con gli spezzoni (sono modalità alternative).
- Solo con i **file caricati**: l'audio di YouTube non si può elaborare. Il modulo non salva un brano YouTube con queste modalità.

### Molto ovattato, poi poco, poi normale

La fase 1 dura *a* secondi con il filtro «molto sfocato», poi un passaggio morbido di *t* secondi porta al filtro «sfocato», che dura *b* secondi, poi un secondo passaggio di *t* secondi apre il filtro del tutto: il brano torna normale dopo **a + b + 2t** secondi. I passaggi usano una curva morbida (senza spigoli) e la frequenza di taglio cresce in modo esponenziale, come l'orecchio sente. Con questa modalità lo «Sfocato» tra gli effetti del brano non vale (le fasi guidano il filtro), gli altri effetti restano e «Svela gradualmente» non si applica.

### Controlli al salvataggio

- Se il suono non torna normale prima della fine dell'ascolto (per esempio fasi di 22 s con un ascolto di 20 s), il modulo non salva e dice quale brano: allunga l'ascolto o accorcia le fasi.
- Velocità e fasi con un link YouTube sono rifiutate con un messaggio.

### Provare l'ascolto in fase di setup

Nel modulo, sotto il lettore di ogni brano, **«▶ Prova l'ascolto»** fa suonare il brano **come lo sentirà lo schermo**, con la modalità, i parametri, gli effetti e il punto di partenza di *quel* brano e i predefiniti del round (stesso motore, `startListening` in `packages/client/src/minigames/indovina-canzone/listening.ts`). Si ferma da solo alla fine dell'ascolto o con «■ Ferma la prova». Il lettore normale sopra suona il file intero, con gli effetti scelti.

## Svelare gradualmente il suono

Di solito gli effetti restano uguali per tutto l'ascolto. Con **«Svela gradualmente il suono»** (impostazione del round) si attenuano col passare del tempo, fino al brano intero (vedi sopra come si attenua ciascun effetto).

**«Suono nitido al (% dell'ascolto)»** dice a che punto dell'ascolto il brano è intero: 100 = solo all'ultimo istante, 80 = gli ultimi 20% si sentono interi.

Il tempo che conta è quello **ascoltato**: se la musica si ferma (prenotazione, risposta sbagliata) il suono resta com'era, e ripartendo continua da lì. Funziona solo con i file caricati (non con YouTube, il cui audio non si può elaborare). Il round non si salva se «Svela gradualmente» è acceso ma nessun brano ha un effetto.

## Ascolto a spezzoni crescenti

**«A spezzoni crescenti»** (per tutto il round in «Come si ascolta», oppure brano per brano): il brano riparte sempre dal punto scelto (*Parti da*) e dura di più a ogni giro, con una pausa in mezzo. Con i valori predefiniti: 0,5 s, pausa, 1 s, pausa, 2 s, pausa, 4 s, pausa, 8 s.

- **Durata degli spezzoni** (da 1 a 12, da 0,1 s a 60 s l'uno) e **pausa** (da 0,2 s a 10 s) si configurano nel round (predefiniti) e, se serve, brano per brano.
- L'ascolto dura la somma di spezzoni e pause (compresa l'ultima pausa, per rispondere): **«Durata dell'ascolto» non vale più**.
- Ci si può prenotare **anche durante le pause**. Il tempo ascoltato è quello trascorso, pause comprese, quindi anche i punti scendono lungo tutta la durata.
- Dopo una risposta sbagliata la musica riprende dal punto in cui si era fermata.
- Lo schermo mostra «Spezzone 2 di 5 (1 s)» e se sta suonando o è in pausa.
- Con i file caricati lo schermo decodifica il brano in memoria e programma attacco e stacco di ogni spezzone **al campione**: anche uno spezzone da mezzo secondo dura mezzo secondo. L'ascolto parte 0,4 s dopo il comando della regia (`LOOP_LEAD_MS`), così con un po' di latenza il primo spezzone non è accorciato. Con **YouTube** gli spezzoni funzionano ma sono meno precisi (il lettore impiega qualche centinaio di millisecondi a partire e a fermarsi): per spezzoni brevi usa i file.
- Si combina con gli effetti e con «Svela gradualmente» (il suono si schiarisce lungo tutto l'ascolto).

## Categorie scelte dai capisquadra

Ogni brano può avere **una o più categorie** (una per riga, fino a 5, per esempio «Anni 80» e «Rock»). Con **«I capisquadra scelgono la categoria del prossimo brano»**:

1. Prima di ogni brano compare la fase **«scelta della categoria»**. Tocca alle squadre **a turno** (in ordine di nome): sceglie il **capitano** della squadra di turno, dal suo telefono, tra le categorie che hanno ancora brani da suonare (con quanti ne restano).
2. Il server estrae un brano **non ancora suonato** di quella categoria. Un brano in due categorie, una volta suonato, sparisce da entrambe. I brani senza categoria stanno in «Altri brani».
3. Se resta una sola categoria non c'è niente da scegliere: il brano parte da solo.
4. Il capitano ha **«Tempo per scegliere»** (predefinito 20 s). Scaduto, la categoria è **estratta a sorte** (sempre la stessa con lo stesso seme del round). La regia può scegliere al posto del capitano con i pulsanti *Scegli «…»* del pannello.
5. Senza squadre (o con giocatori senza squadra) sceglie la regia o la sorte.

Lo schermo mostra chi deve scegliere, il conto alla rovescia e le categorie; **niente file, titoli o risposte** prima della scelta (il test anti-leak lo verifica), e il telefono di chi non sceglie non riceve nemmeno l'elenco delle categorie.

### Capitano della squadra

Il capitano è designato dalla regia: nella scheda **Live** (o nella scheda della serata), accanto a ogni giocatore con una squadra, il pulsante 👑. Ce n'è **al massimo uno per squadra**: sceglierne uno toglie il ruolo al precedente. Chi cambia squadra, o la cui squadra esce dalla serata, smette di essere capitano. Senza capitano designato è il primo della squadra in ordine alfabetico.

Il quiz è un minigioco **a squadre** (`teamBased`): con le [squadre temporanee](SQUADRE-TEMPORANEE.md) i capisquadra sono quelli delle squadre temporanee (scelti nel pannello con 👑). I punti vanno comunque ai giocatori e alle loro squadre della serata.

## Test e verifica

- `indovina-canzone.test.ts`: funzioni pure (spezzoni, anticipo, scelta, turni, sorte, regia, brani esauriti) e **anti-leak**.
- `packages/shared/src/playback.test.ts`: tempi degli spezzoni, curva della nitidezza, velocità (posizione nel brano = integrale della velocità, confrontata con l'integrale numerico), fasi dell'ovattato e scelta della modalità di ogni brano con i predefiniti del round.
- `packages/client/src/minigames/indovina-canzone/effects.test.ts`: quantità di ogni effetto (100% = valori di prima, monotone su 0–300%, curva della saturazione, eco stabile). `packages/shared/src/media.test.ts`: conversione del vecchio effetto singolo ed effetti con le fasi.
- `packages/client/src/minigames/indovina-canzone/listening.test.ts`: il motore di riproduzione con un lettore finto e timer finti (spezzoni, velocità e passaggio, curva del filtro, ripartenza a metà, annullamento, timer in anticipo).
- `packages/client/src/admin/schema-form/logic.test.ts`: `isShown`, i campi che compaiono solo con certe modalità.
- E2E `e2e/indovina-canzone-modalita.spec.ts`: velocità e posizione dell'elemento audio, intonazione (440 Hz che resta tale o scende a 220 Hz), passaggio morbido della velocità, fasi del filtro misurate sul segnale in uscita, modalità diverse brano per brano nella stessa partita, telefoni senza nulla delle modalità, editor (campi per modalità, salvataggio per brano, errori) e «Prova l'ascolto».
- E2E `e2e/indovina-canzone-effetti.spec.ts`: più effetti sommati sullo schermo (voce e acuti tolti insieme, misurato sul segnale in uscita; mai ai telefoni), editor con cursore e campo numerico che vanno di pari passo, quantità estesa, secondo effetto sommato e tolto con l'anteprima che lo segue, istanza col vecchio effetto singolo convertita in elenco. L'analizzatore Web Audio mescola ogni analisi con la precedente all'80%: le misure lasciano passare una ventina di analisi prima di leggere.
- E2E `e2e/indovina-canzone-mp4.spec.ts`: veri mp4 (H.264 + AAC) registrati da Edge con un tono a 440 Hz; si misura che l'elemento audio parta senza errori, che il tono esca dal grafo Web Audio con un effetto e negli spezzoni, che il caricamento dal modulo funzioni anche senza tipo dichiarato e che i telefoni non ricevano file né titolo. Il codificatore AAC è quello di Windows: il test gira solo dove c'è Edge.
- E2E `e2e/indovina-canzone.spec.ts` (base, YouTube, effetti, anteprima dell'editor con effetti misurata sul segnale in uscita) e `e2e/indovina-canzone-categorie.spec.ts` (categorie, capitani, spezzoni misurati sulle sorgenti Web Audio, svelamento misurato sul segnale in uscita).
