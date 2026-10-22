# Squadre temporanee

Le squadre della serata sono fisse: le crei in anticipo e assegni i giocatori. A volte però serve formare squadre **al volo** (due squadre per un solo gioco, squadre mescolate a sorte, chi è arrivato tardi). Le **squadre temporanee** le sostituiscono per i round che usano le squadre, senza toccare la serata.

## Come si usano

Nella scheda **Live**, sotto «Giocatori della serata», c'è il riquadro **Squadre temporanee**:

1. **Sorteggia**: scegli quante squadre (1–8) e premi *Sorteggia*; i giocatori della serata sono divisi a caso in squadre che differiscono al massimo di uno. *Sorteggia di nuovo* rimescola. Oppure **Prepara a mano**.
2. Correggi quello che vuoi: nome e colore di ogni squadra, spostare un giocatore (menù «Squadra temporanea di …»), 👑 per il capitano, *+ Squadra*, ✕ per togliere una squadra. Chi resta fuori da tutte è «Senza squadra».
3. **Applica**. Se qualcosa non va (nomi uguali, squadra senza nome) il motivo è scritto sotto e il pulsante resta spento.
4. **Modifica** riapre le squadre già applicate; **Torna alle squadre della serata** le toglie.

Le squadre temporanee valgono **dal prossimo round** (un round già iniziato ha le sue) e restano finché non le togli o la partita finisce. Si possono preparare in ogni momento, anche durante un round.

## Quali giochi le usano

Solo i minigiochi che dichiarano `teamBased: true` (cioè che formano le squadre dai team della serata):

| Minigioco | Uso |
|---|---|
| Lunghezza d'Onda (a squadre) | le squadre che si sfidano |
| Agenti Segreti | le due squadre (con almeno 2 squadre con giocatori) |
| Artificieri | le squadre che disinnescano e scommettono |
| Pilota alla cieca | le squadre in corsa |
| Plancia di Comando | gli equipaggi |
| Duello dei Cavalieri | gli sfidanti: le prime due squadre per nome (ricomposti all'avvio del round) |
| Indovina la canzone | l'ordine di scelta della categoria e i capitani |

Gli altri (quiz, buzzer, vero/falso, stima, sondaggio, Parole Mannare, Stanze…) sono individuali o formano da soli i loro gruppi: **non vedono** le squadre temporanee e il loro round non cambia.

## Che cosa cambia (e che cosa no)

- I plugin ricevono giocatori e squadre temporanee come se fossero quelle della serata; `viewFor` riceve la squadra temporanea e il telefono mostra quel nome di squadra durante il round.
- **I punti non cambiano destinazione**: restano ai giocatori e alle **squadre della serata** (la classifica a squadre non vede mai le squadre temporanee). Chi gioca con i Verdi temporanei porta i suoi punti alla sua squadra della serata.
- Finito il round, ognuno torna alla squadra della serata.
- Un giocatore uscito dalla serata sparisce dalla squadra temporanea; una squadra senza più giocatori non compare nel round. Un giocatore aggiunto dopo non è in nessuna squadra temporanea finché non lo metti tu.
- Sopravvivono a un riavvio del PC (fanno parte della fotografia della partita).
- I capitani temporanei (👑) valgono solo nelle squadre temporanee; quelli della serata (👑 nella lista dei giocatori) valgono con le squadre della serata.

## Per chi sviluppa

- `MinigameType.teamBased?: true` (`packages/shared/src/minigame.ts`): lo dichiarano i plugin che usano `ctx.teams` / `teamId` dei giocatori.
- Comando di regia `{ type: "temp-teams", teams: [{ name, color, members, captain? }] | null }` (`hostCommandSchema`, validato anche lato engine: giocatori in serata, nessuno in due squadre, nomi unici, capitano nella sua squadra). Stato visibile alla regia in `GameAdminState.tempTeams`.
- `Engine.participantsFor` costruisce giocatori e squadre del round; `Live.roundRoster`/`roundTeams` ricordano ciò che il round ha visto, per `viewFor` e per il nome della squadra sul telefono. I minigiochi con `buildConfig` (il duello) vengono ricomposti con le squadre temporanee grazie a `RoundSpec.rawConfig`.
- `finalizeRound` continua a usare il roster reale per attribuire i punti alle squadre della serata.
- Logica del pannello (sorteggio, spostamenti, validazione): `packages/client/src/admin/tempTeams.ts`, con test.
- **Capitani della serata**: colonna `event_players.is_captain` (aggiunta con `ALTER TABLE` ai database esistenti), `PUT /api/admin/events/:id/players/:playerId/captain { captain }`, `ParticipantInfo.captain`.

## Test

`engine-temp-teams.test.ts` (validazione, round a squadre contro round individuali, punti alla serata, durante un round, riavvio, duello), `admin.test.ts` («capisquadra»), `tempTeams.test.ts`, ed `e2e/squadre-temporanee.spec.ts`.
