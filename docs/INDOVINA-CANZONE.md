# Indovina la canzone (quiz musicale)

La musica suona **solo sullo schermo condiviso**; i telefoni sono buzzer. Chi si prenota per primo (ora equa, come nel buzzer) ferma la musica e risponde a voce; la regia dice se è giusta. Più si ascolta, meno punti vale la risposta.

Questa guida riguarda le funzioni che rendono il brano più o meno riconoscibile e la scelta della categoria. Per il resto (file o link YouTube, punti, penalità) vedi il modulo dell'istanza: ogni campo ha la sua descrizione.

## File accettati: audio e video mp4

Il brano si carica come file dal modulo (mp3, m4a, aac, ogg, wav, webm, flac) oppure come **video mp4**, per esempio un videoclip scaricato: del file si usa **solo la traccia audio**, il video non compare mai né sullo schermo né sui telefoni (rivelerebbe il brano). L'mp4 si comporta come ogni altro file: effetti sul suono, «Svela gradualmente» e spezzoni crescenti funzionano uguale.

- Limite di **100 MB** a file (un mp4 pesa molto più di un mp3 della stessa durata); l'anteprima nel modulo suona l'audio del video.
- Vanno bene gli mp4 con audio AAC (quelli di quasi tutti i telefoni e dei siti di download): il browser dello **schermo** deve saperli decodificare, e Edge e Chrome su Windows lo fanno. Con gli spezzoni crescenti lo schermo scarica e decodifica tutto il file prima di suonare, quindi un video molto lungo ci mette qualche secondo in più a essere pronto.
- Il tipo del file si riconosce anche dall'estensione, perché Windows a volte non dichiara il tipo di un `.mp4`.

## Svelare gradualmente il suono

Ogni brano può avere un **effetto sull'audio** (sfocato, molto sfocato, senza voce). Di solito l'effetto resta uguale per tutto l'ascolto. Con **«Svela gradualmente il suono»** (impostazione del round) l'effetto si attenua col passare del tempo, fino al brano intero:

- *sfocato / molto sfocato*: la frequenza di taglio del filtro sale da ovattato a trasparente;
- *senza voce*: il suono senza voce sfuma nel brano originale.

**«Suono nitido al (% dell'ascolto)»** dice a che punto dell'ascolto il brano è intero: 100 = solo all'ultimo istante, 80 = gli ultimi 20% si sentono interi.

Il tempo che conta è quello **ascoltato**: se la musica si ferma (prenotazione, risposta sbagliata) il suono resta com'era, e ripartendo continua da lì. Funziona solo con i file caricati (non con YouTube, il cui audio non si può elaborare). Il round non si salva se «Svela gradualmente» è acceso ma nessun brano ha un effetto.

## Ascolto a spezzoni crescenti

**«Come si ascolta» → «A spezzoni crescenti»**: il brano riparte sempre dal punto scelto (*Parti da*) e dura di più a ogni giro, con una pausa in mezzo. Con i valori predefiniti: 0,5 s, pausa, 1 s, pausa, 2 s, pausa, 4 s, pausa, 8 s.

- **Durata degli spezzoni** (da 1 a 12, da 0,1 s a 60 s l'uno) e **pausa** (da 0,2 s a 10 s) si configurano nel round.
- L'ascolto dura la somma di spezzoni e pause (compresa l'ultima pausa, per rispondere): **«Durata dell'ascolto» non vale più**.
- Ci si può prenotare **anche durante le pause**. Il tempo ascoltato è quello trascorso, pause comprese, quindi anche i punti scendono lungo tutta la durata.
- Dopo una risposta sbagliata la musica riprende dal punto in cui si era fermata.
- Lo schermo mostra «Spezzone 2 di 5 (1 s)» e se sta suonando o è in pausa.
- Con i file caricati lo schermo decodifica il brano in memoria e programma attacco e stacco di ogni spezzone **al campione**: anche uno spezzone da mezzo secondo dura mezzo secondo. L'ascolto parte 0,4 s dopo il comando della regia (`LOOP_LEAD_MS`), così con un po' di latenza il primo spezzone non è accorciato. Con **YouTube** gli spezzoni funzionano ma sono meno precisi (il lettore impiega qualche centinaio di millisecondi a partire e a fermarsi): per spezzoni brevi usa i file.
- Si combina con l'effetto e con «Svela gradualmente» (il suono si schiarisce lungo tutto l'ascolto).

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
- `packages/shared/src/playback.test.ts`: tempi degli spezzoni e curva della nitidezza.
- E2E `e2e/indovina-canzone-mp4.spec.ts`: veri mp4 (H.264 + AAC) registrati da Edge con un tono a 440 Hz; si misura che l'elemento audio parta senza errori, che il tono esca dal grafo Web Audio con un effetto e negli spezzoni, che il caricamento dal modulo funzioni anche senza tipo dichiarato e che i telefoni non ricevano file né titolo. Il codificatore AAC è quello di Windows: il test gira solo dove c'è Edge.
- E2E `e2e/indovina-canzone.spec.ts` (base, YouTube, effetti) e `e2e/indovina-canzone-categorie.spec.ts` (categorie, capitani, spezzoni misurati sulle sorgenti Web Audio, svelamento misurato sul segnale in uscita).
