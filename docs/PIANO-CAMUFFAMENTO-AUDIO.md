# Piano: camuffare slogan, jingle e canzoni («Indovina la canzone»)

Stato: **fase 1 implementata** (2026-10-26). I tre camuffamenti provati in fase 0 (**Al contrario a pezzi**, **Spettro capovolto**, **Sillabe mescolate**) sono ora veri tipi di effetto, nella **stessa lista** degli altri effetti del brano (card, quantità, ordine, anteprima nel modulo e partita sullo schermo): `BUFFER_EFFECTS` in `packages/shared/src/media.ts`, funzioni pure in `transforms.ts`, preparazione del file in `prepare.ts` (si applica l'elenco fino all'ultimo camuffamento al file decodificato, il resto resta in tempo reale), lettore in `backends.ts`. Esito della prova d'ascolto di fase 0: «Al contrario a pezzi» e «Spettro capovolto» da soli lasciano ancora riconoscere lo slogan; si prova «Sillabe mescolate», da sola o con gli altri. **Fase 2 e fase 3 (campi numerici) implementate** (2026-10-26): Balbuziente, Vocoder a bande, Canticchiato (`transforms.ts`, `transforms-voice.ts`, `dsp.ts`), Bip e Silenzio, zone con campi «da / a» e «▶ Ascolta la zona», con schema, unit test (`transforms-voice.test.ts`, `transforms-zone.test.ts`, `prepare.test.ts`, test di schema del plugin). **Non ancora fatto**: scenari e2e dei nuovi effetti e delle zone, prova d'ascolto di vocoder e canticchiato su voci vere, Worker (tempi misurati su 240 s di audio in Node: vocoder 1–2,5 s a 4–16 bande, canticchiato 2 s, balbuziente 0,05 s; sul browser la pagina si blocca per altrettanto), «Svela gradualmente» per i camuffamenti **negli ascolti a spezzoni** (vedi sotto), preset e «Altre varianti» (fase 5), forma d'onda per trascinare la zona, pacchetto Windows. Guida: `INDOVINA-CANZONE.md`.

**Fase 4 implementata per l'ascolto continuo** (2026-10-27, anche a velocità diversa): `reveal.ts` divide il brano in tratti a nitidezza fissa (8 gradini, ogni 0,1 s), `renderChain` applica il camuffamento a ogni tratto con la quantità `k·(1 − nitidezza)` (dentro la zona dell'effetto, se c'è), e dopo la rampa resta l'originale al campione. I tratti si incollano con la dissolvenza delle zone. Gli effetti in tempo reale prima di un camuffamento restano a quantità piena. **Negli ascolti a spezzoni non attenua ancora** (servirebbe una versione per spezzone; da misurare con 12 spezzoni da 60 s). Test: `reveal.test.ts`, `prepare.test.ts`; manca lo scenario e2e.

**Fase 5 implementata** (2026-10-27): nella sezione «Effetti sull'audio» del pannello «Avanzato» c'è il menu «Camuffa» (`DisguisePresets` in `SongList.tsx`, preset in `presets.ts`): tipo di audio (Voce / slogan, Jingle, Canzone) e Leggero / Medio / Forte sostituiscono l'elenco degli effetti con la combinazione della tabella 3.3; «Altre varianti» cambia il seme degli effetti che lo usano (disattivato se non ce n'è). Test: `presets.test.ts` e lo scenario in `e2e/indovina-canzone-lista.spec.ts`. Le combinazioni vanno ancora **calibrate a orecchio** su voci e jingle veri. **Scenari e2e** aggiunti in `e2e/indovina-canzone-effetti.spec.ts`: elenco completo dei tipi, rampa «Svela gradualmente», bip e vocoder su zone. **Worker implementato** (2026-10-27): le trasformazioni pure girano in `disguise.worker.ts` (client in `disguise-async.ts`, con ripiego in linea se i Worker mancano o falliscono); gli effetti in tempo reale restano nel thread della pagina perché `OfflineAudioContext` non esiste nei Worker; lo scenario «Svela gradualmente» verifica che il Worker sia attivo. **Restano**: forma d'onda per trascinare la zona, «Svela gradualmente» a spezzoni, prova d'ascolto di vocoder e canticchiato su voci vere, verifica nel pacchetto Windows (`pnpm package:win`, `pnpm package:check`).

**Forma d'onda e spezzoni implementati** (2026-10-27). *Zone*: sotto l'anteprima, se un effetto ha una zona, compare la forma d'onda del file (`Waveform.tsx`; la matematica del trascinamento è in `zoneDrag.ts`): si trascinano il bordo sinistro, il destro o tutta la zona (anche con le frecce: ±0,1 s, con Maiusc ±1 s; arrotondamento al decimo, mai fuori dal brano, lunghezza minima 0,1 s) e il valore si registra al rilascio, quindi i campi «da / a» restano d'accordo e l'anteprima non si rifà a ogni pixel. *«Svela gradualmente» a spezzoni*: `snippetReveals` (`reveal.ts`) dà a ogni spezzone la nitidezza del suo momento (tempo già ascoltato negli spezzoni e nelle pause precedenti), `renderSnippets` (`prepare.ts`) prepara una versione per spezzone e le mette una dopo l'altra in un solo file; i lettori ricevono l'indice dello spezzone in `playAt`/`cue` e `preparedFileBackend` salta all'inizio giusto. Se gli spezzoni durano in tutto più di `PREPARE_MAX_SECONDS` (240 s) la rampa non si applica (il file preparato sarebbe troppo grande). Con i predefiniti (0,5 + 1 + 2 + 4 + 8 s) il file preparato dura 15,5 s. **Restano**: prova d'ascolto di vocoder e canticchiato su voci vere, calibrazione dei preset, verifica nel pacchetto Windows.

## 1. Perché gli effetti di oggi non bastano

Tutti gli effetti attuali (sfocato, telefono, distorsione, eco, senza voce) e tutte le modalità di ascolto (velocità, intonazione, ovattato a fasi, spezzoni) cambiano il **timbro** o il **tempo**, ma lasciano intatto quello che serve a capire le parole:

- la **sequenza dei suoni** (consonanti e vocali nell'ordine giusto);
- il **ritmo delle sillabe** e l'**intonazione** («ti-met-te-le-a-liiii»);
- le **formanti** tra 300 e 3400 Hz, cioè proprio la banda che il «Telefono» conserva: il telefono è stato *progettato* per far capire la voce.

Il parlato è robustissimo: si capisce con un passa-basso a 1 kHz, a velocità doppia, con l'intonazione spostata di un'ottava, distorto o con l'eco. In più uno slogan famoso ha un «aiuto dall'alto»: bastano due sillabe e il ritmo perché il cervello completi il resto. Aumentare la quantità degli effetti attuali non aiuta: prima di rendere le parole incomprensibili si distrugge tutto il resto e la clip diventa rumore, non un quiz.

Servono trasformazioni che **rompono le parole ma conservano indizi giocabili** (voce, ritmo, melodia, timbro del jingle). La letteratura sulla percezione del parlato ne indica alcune ben note, con un parametro che va con continuità da «incomprensibile» a «chiaro» (utile per «Svela gradualmente»).

## 2. Principi e approcci scartati

**Principi**
- Per gli slogan non basta cambiare velocità, intonazione o filtro: bisogna colpire la sequenza delle sillabe e la cadenza.
- Preset semplici con una descrizione chiara, senza parametri tecnici in vista.
- Il file originale non si tocca mai; tutto passa dall'elenco degli effetti del brano che esiste già, senza archivi paralleli.
- «Quanto è distorto» non è «quanto è difficile»: una clip molto distorta non è un buon quiz.

**Approcci scartati**
- **Varianti salvate come file**. Gli effetti sono *parametri* applicati in tempo reale sullo schermo, e ne dipendono «Svela gradualmente», l'ovattato a fasi, gli spezzoni e l'anteprima nell'editor. File audio camuffati romperebbero lo svelamento (serve il suono pulito accanto), raddoppierebbero lo spazio e richiederebbero un archivio di varianti con metadati. Una «variante» è **un elenco di effetti più un seme**: si salva nel brano come oggi, si riproduce identica, l'originale resta intatto per costruzione.
- **Altri filtri spettrali e mascheramento**: non nascondono le parole (già verificato sul campo). Preset fatti di combinazioni più forti degli effetti attuali avrebbero lo stesso problema.
- **Riconoscimento automatico del tipo di audio** (voce, jingle, canzone) e preset «Automatico»: fragili e poco utili. Chi prepara il quiz sa cosa sta caricando; basta un menu.
- **Stima dell'intelligibilità mostrata all'host**: metriche come STOI misurano se una frase *qualsiasi* si capisce, non se *uno slogan famoso* si riconosce. Sarebbe fuorviante proprio nel caso che interessa.
- **Un pannello di «impostazioni avanzate»**: esiste già (l'elenco degli effetti con le quantità); un secondo pannello duplicherebbe l'editor.

Vincoli da rispettare: compatibilità con svelamento, fasi e spezzoni, YouTube (dove non si può elaborare nulla), test sul segnale in uscita richiesti da `CLAUDE.md`, nessun dato ai telefoni.

## 3. Proposta

### 3.1 Nuovi effetti «che rompono le parole»

Ognuno è una funzione pura della quantità (10–300%, come gli altri), si aggiunge all'elenco degli effetti del brano e si combina con quelli esistenti. In ordine di rapporto efficacia/costo:

| Effetto (nome in app) | Cosa fa | Cosa resta come indizio | Come si svela | Realizzazione |
|---|---|---|---|---|
| **Al contrario a pezzi** | divide l'audio in finestre brevi e ognuna la suona al contrario. Sotto ~60 ms si capisce quasi tutto, sopra ~120–150 ms le parole diventano un borbottio | voce, ritmo, numero di sillabe, melodia del jingle quasi intatta | la finestra si accorcia fino a zero | elaborazione sul buffer (JS puro), seme non necessario |
| **Spettro capovolto** | ribalta le frequenze attorno a ~2 kHz (gli acuti diventano gravi e viceversa): il parlato diventa una lingua aliena | ritmo, cadenza, timbro «robotico» della voce, durata delle note | si mescola al suono pulito con una curva molto ripida (le parole riaffiorano tardi) | Web Audio in tempo reale: passa-basso, modulazione ad anello con un oscillatore, passa-basso |
| **Canticchiato** | sostituisce la voce con un «mmm» che segue solo la sua intonazione e il suo volume | melodia e ritmo esatti dello slogan, nient'altro | si mescola alla voce vera | analisi offline dell'intonazione (YIN) e sintesi di una sinusoide; adatto a voce sola, non a canzoni piene |
| **Vocoder a bande** | rifà il suono con rumore modellato su poche bande di frequenza: con 1–2 bande le parole spariscono, con 8 si capiscono | ritmo, dinamica, «sagoma» del suono | le bande crescono (1 → 16): è il modo più naturale di svelare | elaborazione sul buffer (filtri + inviluppi), oppure grafo Web Audio |
| **Sillabe mescolate** | taglia nei punti di silenzio o a energia minima e scambia brevi frammenti vicini (mai lontani) | voce, timbro, parole spezzate e fuori ordine | gli scambi diminuiscono | elaborazione sul buffer con **seme** (sempre la stessa clip a parità di seme) |
| **Balbuziente** | ripete a caso frammenti brevi e ne salta altri | voce e timbro | ripetizioni sempre più rare | buffer, con seme |

Da **non** aggiungere: rumore o brusio a basso rapporto segnale/rumore (nasconde le parole ma rende la clip sgradevole e premia chi è vicino alle casse), riverbero forte, altri filtri.

Le prime due sono le più promettenti per il tuo caso: «Al contrario a pezzi» toglie le parole e lascia la cadenza «ti-met-te-le-aliiii», che è esattamente l'«aha» che fa divertire; «Spettro capovolto» costa pochissimo ed è già nel modello attuale (nodi Web Audio in tempo reale).

### 3.2 Zone del brano: nascondere solo le parole chiave

Spesso basta nascondere **due parole** («Red Bull») e lasciare il resto. Proposta: ogni effetto può avere una **zona facoltativa** (da secondo a secondo, relativa al file). Fuori dalla zona il suono è quello del resto della catena.

- Prima versione: due campi numerici e un pulsante «Ascolta la zona».
- Seconda versione: forma d'onda nel modulo su cui trascinare la zona (lo schermo e l'anteprima hanno già il buffer decodificato).
- Un effetto «**Bip**» (tono a 1 kHz o silenzio) sulle sole zone, come la censura TV: semplicissimo, efficace sul nome del marchio, si combina con tutto.

### 3.3 Preset in un clic

Nel modulo del brano un menu **«Camuffa»** con il tipo di audio (Voce/slogan, Jingle, Canzone) e tre pulsanti **Leggero / Medio / Forte**. Un preset non è un sistema nuovo: **riempie l'elenco degli effetti** con una combinazione predefinita, che poi si ascolta con l'anteprima esistente e si ritocca a mano se serve. Esempi da calibrare a orecchio:

| | Voce/slogan | Jingle | Canzone |
|---|---|---|---|
| Leggero | al contrario a pezzi 80% | sfocato 100% | senza voce 100% |
| Medio | al contrario a pezzi 150% + telefono 60% | spettro capovolto 60% + sfocato 80% | senza voce 100% + al contrario a pezzi 80% |
| Forte | canticchiato 100% oppure vocoder 2 bande | spettro capovolto 100% + sillabe mescolate | senza voce + vocoder 4 bande |

**«Altre varianti»** cambia solo il seme (e piccole variazioni di quantità) dei preset che lo usano: tre pulsanti ▶ per confrontarle, «Usa questa» per tenerla. Nessun file generato, nessun archivio di varianti: la variante scelta è l'elenco salvato nel brano, con il suo seme.

### 3.4 Architettura

- **Due tipi di effetto**:
  - *in tempo reale* (come oggi, `connectEffects`): spettro capovolto, bip;
  - *sul buffer* (nuovo): al contrario a pezzi, canticchiato, vocoder, sillabe mescolate, balbuziente. Funzioni pure `Float32Array → Float32Array` in un modulo nuovo (es. `transforms.ts`), deterministiche con seme, testabili con Vitest su segnali sintetici.
- **Dove si applicano**: sullo schermo e nell'anteprima dell'editor, mai sul server e mai ai telefoni (che non ricevono nemmeno l'elenco degli effetti, come oggi). Si elabora solo la parte che serve (da «Parti da» per la durata massima dell'ascolto), così un brano lungo non pesa in memoria; l'elaborazione gira in un Worker per non bloccare lo schermo, e il brano è «pronto» solo a elaborazione finita (`whenReady`).
- **Lettori**: `bufferFileBackend` ha già il buffer, quindi gli effetti sul buffer si innestano lì. Per le modalità che usano l'elemento audio (velocità, intonazione, fasi) il buffer elaborato si converte in WAV in memoria (`blob:`) e si passa all'elemento: stesso codice di velocità e fasi di oggi. Con YouTube questi effetti non si possono usare (il modulo lo rifiuta, come già succede).
- **Svela gradualmente**: per gli effetti in tempo reale si mescola al pulito come oggi. Per quelli sul buffer la nitidezza dipende dal tempo ascoltato, che nell'ascolto continuo corrisponde alla posizione nel brano: si elabora una versione in cui la quantità scende lungo la clip. Con gli spezzoni (che ripartono sempre dallo stesso punto) si elabora **una versione per spezzone**, con la nitidezza di quello spezzone. Da verificare il costo con 12 spezzoni da 60 s; se è troppo, per gli spezzoni si svela a gradini.
- **Schema**: `effects` resta l'elenco attuale; ogni elemento acquista campi facoltativi (`seed`, `from`/`to` per la zona). Brani salvati prima: invariati.

### 3.5 Cosa lascerei fuori (o a dopo)

- Riconoscimento automatico del tipo di audio.
- Metriche di intelligibilità mostrate all'host.
- Archivio di varianti come file.
- Calibrazione automatica dei preset: più avanti si può registrare per ogni brano dopo quanti secondi qualcuno si è prenotato e se ha indovinato (i dati ci sono già nel round) e mostrare alla regia «brano troppo facile/difficile»; è un buon passo successivo, non un prerequisito.

## 4. Fasi

0. **Prova d'ascolto prima di tutto** (mezza giornata). Le soglie della letteratura valgono per frasi neutre, non per slogan famosi. Si implementano solo le funzioni pure di «Al contrario a pezzi» e «Spettro capovolto», agganciate all'anteprima dell'editor, e si prova con il vero «Red Bull ti mette le ali» e due o tre jingle a varie quantità. **Se nessuna delle due funziona sul tuo caso, il piano si rivede qui**, prima di aver costruito il resto.
1. **Effetti sul buffer** nel motore: modulo `transforms.ts`, innesto in `bufferFileBackend` e conversione in WAV per l'elemento audio, Worker, controlli di qualità sul risultato (niente silenzio, niente saturazione: normalizzazione e limitatore già presenti).
2. **Gli altri effetti** in ordine di utilità emersa dalla fase 0 (vocoder, canticchiato, sillabe mescolate, bip).
3. **Zone** con campi numerici, poi forma d'onda.
4. **Svela gradualmente** per gli effetti sul buffer (continuo, poi spezzoni).
5. **Preset e «Altre varianti»** nel modulo.
6. Documentazione (`INDOVINA-CANZONE.md`, `rulesText.ts` se cambia ciò che vedono i giocatori) e verifica nel pacchetto Windows.

## 5. Test

Coerenti con quanto chiede `CLAUDE.md` per il quiz musicale:

- **Unit** (`transforms.test.ts`, `effects.test.ts`): ogni trasformazione su segnali sintetici. Esempi: un glissando ascendente, dopo «Al contrario a pezzi», scende dentro ogni finestra e conserva l'inviluppo complessivo; un tono a 1 kHz con lo spettro capovolto a 4 kHz esce a 3 kHz; il canticchiato di un dente di sega a 200 Hz è una sinusoide a 200 Hz senza armoniche; il vocoder a 1 banda ha uno spettro piatto; stesso seme → stessa uscita, seme diverso → uscita diversa; quantità monotona; durata invariata; nessun campione oltre ±1; zona rispettata al campione.
- **E2E** (`e2e/indovina-canzone-effetti.spec.ts`): misura sul segnale in uscita dello schermo e dell'anteprima (come per gli effetti attuali), effetti sul buffer con velocità e con spezzoni, zona, preset che riempie l'elenco, «Altre varianti» che cambia il seme, telefoni senza file, titolo né effetti nei frame WebSocket.
- **Anti-leak**: invariato, ma da estendere ai nuovi campi.

## 6. Decisioni prese (2026-10-26)

1. **Fase 0 prima di tutto**: si implementano solo «Al contrario a pezzi» e «Spettro capovolto», agganciati all'anteprima dell'editor, e si provano sul vero «Red Bull ti mette le ali» e su due o tre jingle. Si prosegue con le fasi successive solo se almeno uno dei due funziona; altrimenti il piano si rivede.
2. **Zone sì, con campi numerici** (da secondo a secondo + «Ascolta la zona»). La forma d'onda trascinabile resta un passo successivo, non nella prima versione.
3. **Preset Leggero / Medio / Forte per tipo di audio** (Voce/slogan, Jingle, Canzone), più «Altre varianti» che cambia il seme. **Niente «Automatico»** e niente riconoscimento automatico del tipo di audio.
4. **Effetti inclusi**, oltre ai due principali: Vocoder a bande, Canticchiato, Sillabe mescolate, Bip e Balbuziente. L'ordine di implementazione nella fase 2 si decide dopo la prova d'ascolto della fase 0.
5. **Restano fuori**: varianti salvate come file, metriche di intelligibilità mostrate all'host, rumore o brusio come mascheramento. La calibrazione dai dati delle partite resta un'idea per dopo.
