import { doorOpen } from "@gioco/shared";
/**
 * Cosa fa un bot in ogni minigioco: guarda la vista che il server gli ha mandato e decide gli input da inviare.
 * Restituisce una `key` che identifica la situazione (domanda, fase, battaglia…): il bot agisce una volta per key.
 */
export interface Decision {
  key: string;
  inputs: unknown[];
  /** Tempo di «riflessione» di questa decisione (ms, min e max) al posto di quello del bot. */
  thinkMs?: [number, number];
}

/**
 * Vista della regia di Artificieri, aggiornata dalla regia automatica: l'artificiere simulato «legge il manuale» da qui
 * (soluzioni e piani dei moduli), come farebbero gli esperti. I telefoni veri non l'hanno mai: è solo del simulatore.
 */
export const oracle: { artificieri: any | null; pilota: any | null } = { artificieri: null, pilota: null };

/** Ora server usata dai bot che aspettano porte e blocchi (ms): quella vera, tranne nei test che simulano il tempo. */
export const clock: { now: () => number } = { now: () => Date.now() };

export type Rnd = () => number;

const pick = <T>(list: T[], rnd: Rnd): T => list[Math.floor(rnd() * list.length)]!;

type View = Record<string, any>;

function decideRound(typeId: string, v: View, rnd: Rnd): Decision | null {
  switch (typeId) {
    case "quiz-multipla":
      if (v.phase === "question" && v.myChoice === null) return { key: `q${v.index}`, inputs: [{ type: "answer", choice: Math.floor(rnd() * v.options.length) }] };
      return null;

    case "buzzer":
      // Non tutti premono: così si formano code di dimensioni diverse.
      if (v.canBuzz && !v.buzzed && (v.phase === "open" || v.phase === "collecting") && rnd() < 0.35) return { key: `b${v.question}`, inputs: [{ type: "buzz" }] };
      return null;

    case "indovina-canzone":
      if (v.canBuzz && !v.buzzed && (v.phase === "playing" || v.phase === "collecting") && rnd() < 0.35) return { key: `ic${v.phase}-${v.position}`, inputs: [{ type: "buzz" }] };
      return null;

    case "vero-falso":
      if (v.phase === "statement" && v.myAnswer === null) return { key: `vf${v.index}`, inputs: [{ type: "answer", value: rnd() < 0.5 }] };
      return null;

    case "stima":
      if (v.phase === "question" && v.myGuess === null) {
        const lo = v.min ?? 0;
        const hi = v.max ?? 1000;
        return { key: `st${v.index}`, inputs: [{ type: "guess", value: Math.round(lo + rnd() * (hi - lo)) }] };
      }
      return null;

    case "sondaggio":
      if (v.phase === "voting" && v.myVote === null) {
        const input = v.kind === "options" ? { type: "vote", option: Math.floor(rnd() * v.options.length) } : v.candidates.length > 0 ? { type: "vote", target: pick(v.candidates as { id: string }[], rnd).id } : null;
        return input ? { key: `po${v.index}`, inputs: [input] } : null;
      }
      return null;

    case "zombie-hunt": {
      if (v.phase !== "play" || (v.role !== "human" && v.role !== "zombie") || v.bye || v.opponent === null || v.choice !== null) return null;
      const r = rnd();
      // lo zombie morde quasi sempre, ogni tanto si mimetizza (se ha carte)
      if (v.role === "zombie" && (r < 0.7 || v.cards.length === 0)) return { key: `zh${v.round}`, inputs: [{ type: "bite" }] };
      const cards = v.cards as { suit: number; value: number }[];
      const follow = cards.filter((c) => c.suit === v.suit); // obbligo di seme
      const card = pick(follow.length > 0 ? follow : cards, rnd);
      const input = r < 0.12 && v.shotgun ? { type: "shotgun" } : r < 0.24 && v.vaccine ? { type: "vaccine" } : { type: "play", suit: card.suit, value: card.value };
      return { key: `zh${v.round}`, inputs: [input] };
    }

    case "caccia-fantasmi": {
      if (v.phase !== "play") return null;
      // Un'azione sola per partita: i bot non conoscono i tempi di pausa e non devono martellare il server.
      if (v.role === "ghost") return { key: "gf-scan", inputs: [{ type: "scan", code: pick(GHOST_HUNT_BOT_CODES, rnd) }] };
      const suspects = (v.suspects ?? []) as { id: string }[];
      return suspects.length > 0 ? { key: "gf-accuse", inputs: [{ type: "accuse", target: pick(suspects, rnd).id }] } : null;
    }

    case "stanze-segrete":
      return decideStanze(v, rnd);

    case "shadow-tournament":
      return decideShadow(v, rnd);

    case "parole-mannare":
      return decideParole(v, rnd);

    case "stanze-col-botto":
      return decideBotto(v, rnd);

    case "agenti-segreti":
      return decideAgenti(v, rnd);

    case "artificieri":
      return decideArtificieri(v, rnd);

    case "pilota-cieco":
      return decidePilota(v, rnd);

    case "lunghezza-onda":
      return decideOnda(v, rnd);

    default:
      return null;
  }
}

/**
 * Parole Mannare: il Sindaco assegna gettoni a raffica (un nuovo gettone a ogni cambio del registro, ogni tanto annulla
 * e, di rado, dà l'«Esatto»); tutti gli altri guardano il ruolo e votano a caso. La `key` cambia con il registro e con
 * le riserve, così anche dopo un annulla il Sindaco continua.
 */
function decideParole(v: View, rnd: Rnd): Decision | null {
  const me = v.me;
  if (!me) return null;
  const others = (v.players as { id: string }[]).filter((p) => p.id !== v.mayor.id);
  const log = (v.log ?? []) as { seq: number; undone: boolean }[];
  const sig = `${log.at(-1)?.seq ?? 0}-${log.filter((e) => e.undone).length}-${v.reserves.yesNo}-${v.reserves.maybe}-${v.reserves.close}-${v.reserves.far}`;
  switch (v.phase) {
    case "word":
      return me.wordOptions ? { key: "pm-word", inputs: [{ type: "pick-word", index: Math.floor(rnd() * me.wordOptions.length) }] } : null;
    case "night":
      return me.seen ? null : { key: "pm-seen", inputs: [{ type: "seen" }] };
    case "questions": {
      if (!me.isMayor || others.length === 0) return null;
      const r = rnd();
      if (r < 0.08 && me.canUndo) return { key: `pm-q${sig}`, inputs: [{ type: "undo" }] };
      if (r < 0.1) return { key: `pm-q${sig}`, inputs: [{ type: "give", playerId: pick(others, rnd).id, token: "correct" }] };
      const available = (["yes", "yes", "no", "no", "maybe", "close", "far"] as const).filter((t) => (t === "maybe" ? v.reserves.maybe === null || v.reserves.maybe > 0 : t === "close" || t === "far" ? v.reserves[t] > 0 : v.reserves.yesNo > 0));
      return { key: `pm-q${sig}`, inputs: [{ type: "give", playerId: pick(others, rnd).id, token: pick([...available], rnd) }] };
    }
    case "correct-grace":
      return me.isMayor && rnd() < 0.3 ? { key: `pm-g${sig}`, inputs: [{ type: "undo" }] } : null;
    case "seer-hunt":
    case "werewolf-vote": {
      if (!me.canVote || me.targets.length === 0) return null;
      return { key: `pm-v${v.phase}-${(v.runoff ?? []).map((c: { id: string }) => c.id).join(",")}`, inputs: [{ type: "vote", targetId: pick(me.targets as { id: string }[], rnd).id }] };
    }
    default:
      return null;
  }
}

/**
 * Stanze col botto: nel round tutti votano il leader (per lo più il primo della stanza, così una maggioranza c'è), ogni
 * tanto mostrano la carta, propongono uno scambio o passano la leadership, e rispondono alle proposte; i leader scelgono
 * e confermano gli ostaggi e premono «Avvia il round». Le azioni del round partono una volta sola, finché non si è votato.
 */
function decideBotto(v: View, rnd: Rnd): Decision | null {
  const me = v.me;
  if (!me || me.room === null) return null;
  const roomPeople = (v.rooms[me.room] ?? []) as { id: string }[];
  const mates = roomPeople.filter((p) => p.id !== me.id);
  const focal = roomPeople.map((p) => p.id).sort()[0];
  const incoming = (me.incoming ?? []) as { seq: number }[];
  if (incoming.length > 0) return { key: `scb-ans${incoming[0]!.seq}`, inputs: [{ type: "share-answer", seq: incoming[0]!.seq, accept: rnd() < 0.7 }] };
  if (me.abdicationFrom) return { key: `scb-abd-ans-${v.round}-${me.abdicationFrom.id}`, inputs: [{ type: "abdicate-answer", accept: rnd() < 0.7 }] };
  switch (v.phase) {
    case "round": {
      if (me.canVote && me.myVote === null && focal) {
        const target = rnd() < 0.75 ? focal : pick(mates, rnd).id;
        const inputs: unknown[] = [{ type: "vote-leader", targetId: target }];
        if (me.canShare && mates.length > 0) {
          if (rnd() < 0.5) inputs.push({ type: "reveal", kind: "card", targetId: pick(mates, rnd).id });
          if (rnd() < 0.3) inputs.push({ type: "reveal", kind: "card", targetId: null });
          if (rnd() < 0.3) inputs.push({ type: "share-offer", kind: "card", targetId: pick(mates, rnd).id });
        }
        return { key: `scb-r${v.round}`, inputs };
      }
      if (me.isLeader && me.canAbdicate && mates.length > 0 && rnd() < 0.05) return { key: `scb-abd-${v.round}`, inputs: [{ type: "abdicate", targetId: pick(mates, rnd).id }] };
      return null;
    }
    case "lock":
      return me.canAppoint && me.myVote === null && focal ? { key: `scb-lock${v.round}`, inputs: [{ type: "vote-leader", targetId: focal }] } : null;
    case "hostages": {
      if (!me.canPickHostages && !me.canConfirmHostages) return null;
      const picks = (me.hostagePicks ?? []) as string[];
      if (picks.length < v.hostagesNeeded) {
        const chosen = [...picks];
        for (const p of [...mates].sort(() => rnd() - 0.5)) if (chosen.length < v.hostagesNeeded && !chosen.includes(p.id)) chosen.push(p.id);
        return { key: `scb-pick${v.round}`, inputs: [{ type: "pick-hostages", playerIds: chosen }] };
      }
      return me.canConfirmHostages ? { key: `scb-conf${v.round}`, inputs: [{ type: "confirm-hostages" }] } : null;
    }
    case "exchange":
      return me.canStart ? { key: `scb-start${v.round}`, inputs: [{ type: "start-round" }] } : null;
    case "gamble":
      return me.canGamble ? { key: "scb-gamble", inputs: [{ type: "gamble", team: rnd() < 0.5 ? "blue" : "red" }] } : null;
    default:
      return null;
  }
}

/**
 * Agenti Segreti: il Capo-spia di turno dà un indizio con un numero a caso; una volta su cinque prova una parola della
 * griglia (il server la rifiuta e lui ne scrive una valida, una parola inventata con «zq» che non somiglia a nessuna
 * carta). Gli agenti di turno votano per lo più la stessa carta coperta (una maggioranza c'è quasi sempre), dopo la
 * prima scoperta ogni tanto «Passa», e confermano. La `key` cambia a ogni carta scoperta e a ogni turno.
 */
function decideAgenti(v: View, rnd: Rnd): Decision | null {
  const me = v.me;
  if (!me) return null;
  const cards = (v.cards ?? []) as { word: string; revealed: boolean }[];
  const covered = cards.flatMap((c, i) => (c.revealed ? [] : [i]));
  if (me.canClue) {
    const retry = !!me.clueError;
    const word = !retry && rnd() < 0.2 ? cards[pick(covered, rnd)]!.word : `Zq${"bcdfglmnprstvz"[v.turnNumber % 14]}${"aeiou"[Math.floor(rnd() * 5)]}`;
    const count = v.rules.allowZeroInfinity && rnd() < 0.15 ? pick([0, "inf"], rnd) : 1 + Math.floor(rnd() * 3);
    return { key: `as-c-${v.turnNumber}-${retry ? "r" : "f"}`, inputs: [{ type: "clue", word, count }] };
  }
  if (!me.canVote || me.confirmed || me.myPick !== null || covered.length === 0) return null;
  const revealed = cards.length - covered.length;
  const key = `as-v-${v.turnNumber}-${revealed}`;
  if (v.canPass && rnd() < 0.25) return { key, inputs: [{ type: "pick", option: "pass" }, { type: "confirm" }] };
  // La carta «della squadra» cambia a ogni voto, uguale per tutti i bot (stesso turno, stesse carte scoperte).
  const focal = covered[(v.turnNumber * 7 + revealed * 3) % covered.length]!;
  return { key, inputs: [{ type: "pick", option: rnd() < 0.8 ? focal : pick(covered, rnd) }, { type: "confirm" }] };
}

/**
 * Lunghezza d'Onda: il Sensitivo sceglie uno spettro a caso e scrive un indizio; chi indovina «trascina» il quadrante
 * (una raffica di 4–8 `dial`, come un dito che si muove, anche in «tutti» dove il client vero ne manda uno solo: è il
 * caso peggiore per il server) e conferma; chi scommette sceglie sinistra o destra. Un'azione per turno e per fase.
 */
function decideOnda(v: View, rnd: Rnd): Decision | null {
  const me = v.me;
  if (!me) return null;
  const turn = v.turn.number as number;
  if (v.phase === "pick" && me.role === "psychic" && me.options) return { key: `lo-p-${turn}`, inputs: [{ type: "pick", index: Math.floor(rnd() * me.options.length) }] };
  if (v.phase === "clue" && me.role === "psychic") return { key: `lo-c-${turn}`, inputs: [{ type: "clue", text: `Indizio ${turn}` }] };
  if (v.phase === "guess" && me.role === "guesser" && !me.confirmed) {
    let pos = 10 + rnd() * 80;
    const inputs: unknown[] = [];
    for (let i = 4 + Math.floor(rnd() * 5); i > 0; i--) {
      pos = Math.min(100, Math.max(0, pos + (rnd() - 0.5) * 20));
      inputs.push({ type: "dial", pos: Math.round(pos * 2) / 2 });
    }
    inputs.push({ type: "confirm", pos: Math.round(pos * 2) / 2 });
    return { key: `lo-g-${turn}-${v.turn.clue}`, inputs };
  }
  if (v.phase === "counter" && me.role === "counter" && me.myCounter === null) return { key: `lo-x-${turn}`, inputs: [{ type: "counter", dir: rnd() < 0.5 ? "left" : "right" }] };
  return null;
}

/** Probabilità che l'artificiere simulato sbagli un'azione (per provare errori, accelerazione ed esplosioni). */
export const ARTIFICIERI_ERROR_RATE = 0.05;

/**
 * Artificieri: i bot delle altre squadre scommettono; l'artificiere preme «Inizia» e poi, un'azione alla volta, esegue il
 * piano che la regia automatica vede per il primo modulo non risolto (con qualche errore a caso); gli esperti non fanno
 * nulla (nessun bot sa leggere il manuale). La `key` contiene lo stato del modulo secondo la regia: si agisce una volta
 * sola per passo, anche se arrivano più viste.
 */
function decideArtificieri(v: View, rnd: Rnd): Decision | null {
  const me = v.me;
  if (!me || !v.turn) return null;
  const turn =`${v.turn.position}`;
  if (me.role === "bettor") {
    return v.phase === "bet" && me.canBet && me.myBet === null ? { key: `art-bet-${turn}`, inputs: [{ type: "bet", outcome: rnd() < 0.6 ? "defused" : "exploded" }] } : null;
  }
  if (me.role !== "defuser") return null;
  if (v.phase === "briefing" && me.canStart) return { key: `art-start-${turn}`, inputs: [{ type: "start" }] };
  if (v.phase !== "defuse") return null;
  const bomb = oracle.artificieri?.bomb;
  const m = bomb?.modules.find((x: View) => !x.solved);
  if (!m?.plan) return null;
  const fast: [number, number] = [40, 200];
  const key = `art-${turn}-${m.id}-${bomb.strikes}-${JSON.stringify(m.progress)}`;
  const next = m.plan.actions[0] as View;
  if (rnd() < ARTIFICIERI_ERROR_RATE) {
    const wrong = wrongArtificieri(m, next, rnd);
    if (wrong) return { key, inputs: [{ ...wrong, module: m.id }], thinkMs: fast };
  }
  return { key, inputs: [{ ...next, module: m.id }], thinkMs: fast };
}

/** Un'azione sbagliata sul modulo (che costa un errore), oppure `null` se non se ne trova una facile. */
function wrongArtificieri(m: View, next: View, rnd: Rnd): View | null {
  if (m.kind === "wires") {
    const cut = m.progress.cut as number[];
    const wrong = [...m.data.wires.keys()].filter((i: number) => i !== next.wire && !cut.includes(i));
    return wrong.length > 0 ? { type: "cut", wire: pick(wrong, rnd) } : null;
  }
  if (m.kind === "symbols") {
    const pressed = m.progress.pressed as number[];
    const wrong = [...m.data.symbols.keys()].filter((i: number) => i !== next.key && !pressed.includes(i));
    return wrong.length > 0 ? { type: "press", key: pick(wrong, rnd) } : null;
  }
  if (m.kind === "colors") return { type: "press", key: (next.key + 1) % 4 };
  if (m.kind === "word" && next.type !== "submit") return { type: "submit" };
  return null;
}

/**
 * Controllo di privacy su ogni vista ricevuta da un telefono: il motivo se contiene ciò che quel telefono non dovrebbe
 * vedere, altrimenti `null`. Agenti Segreti: niente colori delle carte coperte prima della rivelazione, niente mappa a
 * chi non è Capo-spia. Lunghezza d'Onda: il bersaglio solo al Sensitivo (da `clue`) prima della rivelazione, e in
 * «tutti contro tutti» niente posizioni altrui.
 */
export function privacyProblem(typeId: string, view: unknown): string | null {
  const v = view as View;
  if (typeId === "lunghezza-onda") {
    const early = ["pick", "clue", "guess", "counter"].includes(v.phase);
    if (!early) return null;
    if (v.result) return `risultato del turno in ${v.phase}`;
    if (v.me && "target" in v.me && (v.me.role !== "psychic" || v.phase === "pick")) return `bersaglio a un ${v.me.role} in ${v.phase}`;
    if (v.mode === "tutti" && v.teamDials !== null) return `posizioni altrui in ${v.phase}`;
    return null;
  }
  if (typeId === "artificieri") return artificieriPrivacy(v);
  if (typeId === "pilota-cieco") return pilotaPrivacy(v);
  if (typeId !== "agenti-segreti") return null;
  const over = v.phase === "reveal" || v.phase === "done";
  if (!over && (v.cards as Record<string, unknown>[]).some((c) => !c.revealed && "kind" in c)) return `colori delle carte coperte in ${v.phase}`;
  if (v.me && v.me.role !== "spymaster" && "map" in v.me) return `mappa a un ${v.me.role}`;
  return null;
}

/** Probabilità che il pilota simulato faccia un passo a caso invece di seguire il percorso. */
export const PILOTA_ERROR_RATE = 0.05;

const PILOT_DIRS = [
  { dir: "up", bit: 1, delta: (w: number) => -w },
  { dir: "right", bit: 2, delta: () => 1 },
  { dir: "down", bit: 4, delta: (w: number) => w },
  { dir: "left", bit: 8, delta: () => -1 },
] as const;

/** Percorso più breve tra due celle (indici), evitando alcune caselle; `null` se non c'è. */
function pilotPath(cells: number[], w: number, from: number, to: number, avoid: number[]): number[] | null {
  const prev = new Map<number, number>([[from, -1]]);
  const queue = [from];
  for (let q = 0; q < queue.length && !prev.has(to); q++) {
    const i = queue[q]!;
    for (const d of PILOT_DIRS) {
      const j = i + d.delta(w);
      if ((cells[i]! & d.bit) === 0 || prev.has(j) || (avoid.includes(j) && j !== to)) continue;
      prev.set(j, i);
      queue.push(j);
    }
  }
  if (!prev.has(to)) return null;
  const out = [to];
  while (out[0] !== from) out.unshift(prev.get(out[0]!)!);
  return out;
}

/**
 * Pilota alla cieca: il pilota simulato legge dalla regia automatica dove sono mine e porte (nessun bot sa «dirsele» a
 * voce) e fa un passo per volta lungo il percorso verso la chiave e poi l'uscita, aspettando i blocchi e le porte chiuse
 * con il tempo di riflessione; ogni tanto fa un passo a caso. Navigatori e spettatori non fanno nulla.
 */
function decidePilota(v: View, rnd: Rnd): Decision | null {
  const me = v.me;
  if (!me || me.role !== "pilot" || v.phase !== "run") return null;
  const info = oracle.pilota;
  const lane = info?.lanes.find((l: View) => l.teamId === me.teamId);
  const sec = info?.secrets.find((s: View) => s.teamId === me.teamId);
  if (!lane || !sec || lane.finishedAt !== null || info.levelStartedAt === null) return null;
  const now = clock.now();
  const target = sec.keys.find((k: number) => !lane.keysTaken.includes(k)) ?? lane.exit;
  const path = pilotPath(lane.cells, lane.w, lane.pos, target, sec.mines);
  if (!path || path.length < 2) return null;
  const next = path[1]!;
  // tra un passo e l'altro passano almeno `stepMs`: un passo più presto sarebbe rifiutato in silenzio e il bot resterebbe fermo
  let wait = Math.max(v.settings.stepMs, lane.frozenUntil - now);
  const door = sec.doors.find((d: View) => d.cell === next);
  if (door) {
    // aspetta il primo istante in cui la porta è aperta e lo resta per un po'
    const elapsed = (t: number) => t - info.levelStartedAt;
    let dt = 0;
    while (dt < 10_000 && !(doorOpen(door, elapsed(now + Math.max(wait, dt))) && doorOpen(door, elapsed(now + Math.max(wait, dt) + 600)))) dt += 50;
    wait = Math.max(wait, dt);
  }
  const key = `pc-${v.level}-${v.unit}-${lane.pos}-${lane.strikes}-${lane.frozenUntil}-${lane.keys.taken}`;
  const open = PILOT_DIRS.filter((d) => (lane.cells[lane.pos] & d.bit) !== 0);
  const dir = rnd() < PILOTA_ERROR_RATE && open.length > 0 ? pick([...open], rnd).dir : PILOT_DIRS.find((d) => lane.pos + d.delta(lane.w) === next)!.dir;
  return { key, inputs: [{ type: "move", dir }], thinkMs: [wait + 40, wait + 160] };
}

/** Chiavi, a qualunque profondità. */
function deepKeys(x: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(x)) x.forEach((y) => deepKeys(y, acc));
  else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) (acc.add(k), deepKeys(y, acc));
  return acc;
}

/**
 * Pilota alla cieca: nessun telefono riceve i segreti delle corsie (`secrets`); gli strati (`layerData`) solo i navigatori,
 * solo i propri; a fine gara (`level-end`) si scopre tutto, di proposito (`reveal`), prima mai.
 */
function pilotaPrivacy(v: View): string | null {
  const keys = deepKeys(v);
  if (keys.has("secrets")) return "segreti sul telefono";
  if (keys.has("reveal") && v.phase !== "level-end") return `strati scoperti in ${v.phase}`;
  const me = v.me;
  if (!me) return null;
  if ("layerData" in me) {
    if (me.role !== "navigator") return `strati a un ${me.role}`;
    const owned = [...me.layers].sort().join(",");
    const given = Object.keys(me.layerData).sort().join(",");
    if (owned !== given) return `strati diversi dai propri (${given} contro ${owned})`;
  }
  return null;
}

/**
 * Artificieri: nessun telefono riceve mai il bordo, i dati dei moduli, le regole, le soluzioni, le pagine altrui o le
 * scommesse; il manuale solo gli esperti (e solo da briefing), i comandi solo l'artificiere (e solo in disinnesco).
 */
function artificieriPrivacy(v: View): string | null {
  const keys = deepKeys(v);
  for (const secret of ["edgework", "data", "rules", "solution", "plan", "pages", "lastStrike", "bomb", "bets", "target"]) if (keys.has(secret)) return `chiave «${secret}» sul telefono`;
  const me = v.me;
  if (!me) return null;
  if ("manual" in me && (me.role !== "expert" || (v.phase !== "briefing" && v.phase !== "defuse" && me.manual.length > 0))) return `manuale a un ${me.role} in ${v.phase}`;
  if ("controls" in me && (me.role !== "defuser" || v.phase !== "defuse")) return `comandi a un ${me.role} in ${v.phase}`;
  if (me.role === "bettor" && v.phase === "bet" && v.turn && typeof v.turn.betsPlaced !== "number") return "scommesse non aggregate";
  return null;
}

/**
 * Shadow Tournament: carte a caso, azioni con probabilità moderata, mazzo a caso. La `key` include l'apertura della fase
 * dello scontro, così anche gli scambi rigiocati (pareggio, contromossa) ricevono una nuova risposta.
 */
function decideShadow(v: View, rnd: Rnd): Decision | null {
  if (v.role === "bye") return { key: `sh-bye-${v.turn}`, inputs: [{ type: "byeChoice", choice: rnd() < 0.5 ? "bye" : "npc" }] };
  if (v.role === "out") {
    const sides = (v.spotlight?.sides ?? []) as { id: string }[];
    return v.canPredict && !v.prediction && sides.length === 2 ? { key: `sh-pr-${v.turn}`, inputs: [{ type: "predict", winnerId: pick(sides, rnd).id }] } : null;
  }
  if (v.role !== "bout") return null;
  const b = v.bout, my = v.my;
  const key = `sh-${b.id}-${b.phase}-${b.openedAt}`;
  if (b.phase === "extraLife" && my.canExtraLife) return { key, inputs: [{ type: "extraLife", spend: rnd() < 0.5 }] };
  if (b.phase === "choose" && !my.pick) {
    const cards = (["attack", "defense", "trick"] as string[]).filter((c) => c !== my.blockedCard);
    return { key, inputs: [{ type: "play", card: pick(cards, rnd), bet: my.canBet && rnd() < 0.3 }] };
  }
  if (b.phase === "react" && !my.reacted && my.reactions.length > 0) {
    const action = pick(["pass", ...(my.reactions as string[])], rnd);
    return { key, inputs: [action === "swap" ? { type: "react", action, card: pick(my.swapCards as string[], rnd) } : { type: "react", action }] };
  }
  if (b.phase === "counter" && my.canCounter) return { key, inputs: [{ type: "react", action: rnd() < 0.5 ? "counter" : "pass" }] };
  if (b.phase === "reward" && my.canChooseDeck) return { key, inputs: [{ type: "deck", deck: rnd() < 0.5 ? "legendary" : "normal" }] };
  if (b.phase === "risk" && my.riskChoice) return { key, inputs: [{ type: "riskChoice", pay: my.riskChoice.canPayTokens ? "tokens" : "life" }] };
  return null;
}

/**
 * Stanze Segrete: un giocatore che fa quello che può quando il GM lo abilita. Accetta gli eventi, legge e risponde,
 * chiede di muoversi e di guardare la lettera, scrive al GM. Dopo ogni azione arriva un nuovo stato e ne segue
 * un'altra: è la «raffica» che mette sotto sforzo posta, richieste e database.
 */
function decideStanze(v: View, rnd: Rnd): Decision | null {
  if (!v.member) return null;
  const events = (v.pendingEvents ?? []) as { id: number }[];
  if (events.length > 0) return { key: `ss-ev-${events[0]!.id}`, inputs: [{ type: "accept-event", eventId: events[0]!.id }] };
  const msgs = (v.messages ?? []) as { id: number; mine: boolean; readAt: number | null; canReply: boolean }[];
  const unread = msgs.find((m) => !m.mine && m.readAt === null);
  if (unread) return { key: `ss-ack-${unread.id}`, inputs: [{ type: "ack", messageId: unread.id }] };
  const open = msgs.find((m) => m.canReply);
  if (open) return { key: `ss-reply-${open.id}`, inputs: [{ type: "reply", messageId: open.id, text: "Ricevuto, Master." }] };

  const pending = (v.pending ?? []) as { kind: string }[];
  const abilities = ((v.abilities ?? []) as { action: string }[]).map((a) => a.action);
  const move = v.compass?.move as Record<string, string> | undefined;
  if (move && !pending.some((r) => r.kind === "move")) {
    const dirs = Object.keys(move).filter((d) => move[d] === "open");
    if (dirs.length > 0) return { key: `ss-mv-${v.cell}-${v.feedback?.at ?? 0}`, inputs: [{ type: "move", direction: pick(dirs, rnd) }] };
  }
  if (abilities.includes("sight") && !v.sighting) return { key: `ss-sight-${v.cell}-${v.feedback?.at ?? 0}-${msgs.length}`, inputs: [{ type: "sight" }] };
  if (abilities.includes("message")) return { key: `ss-msg-${msgs.length}`, inputs: [{ type: "message", text: "Master, cosa succede?" }] };
  return null;
}

/**
 * Codici delle zone della configurazione di esempio di «Caccia ai Fantasmi». Chi gioca davvero li legge dai QR
 * appesi nella location, le viste non li contengono: i bot si affidano all'esempio (un test li tiene allineati).
 */
export const GHOST_HUNT_BOT_CODES = ["K7QD", "M2XP", "R9TV", "H4WZ"];

/** Il duello: minigioco figlio (avvolto in `child`), voto del draft e voto della battaglia. */
function decideDuel(v: View, rnd: Rnd): Decision | null {
  if (v.side === null || v.side === undefined) return null; // spettatore
  if (v.phase === "minigame" && v.minigame) {
    const inner = decideRound(v.minigame.typeId, v.minigame.view, rnd);
    return inner ? { key: `dm${v.battleNo}:${v.minigamesLeft}:${inner.key}`, inputs: inner.inputs.map((input) => ({ type: "child", input })) } : null;
  }
  if (v.phase === "draft" && v.draft?.role === "picker" && !v.draft.vote.confirmed) {
    const uid = pick(v.draft.cards as { uid: string }[], rnd).uid;
    return { key: `dd${v.battleNo}:${v.minigamesLeft}:${v.draft.first}`, inputs: [{ type: "draft-cast", uid }, { type: "draft-confirm" }] };
  }
  if (v.phase === "battle" && v.battle?.vote && !v.battle.vote.confirmed) {
    const hand = (v.hand ?? []) as { uid: string }[];
    if (hand.length === 0) return { key: `db${v.battleNo}`, inputs: [{ type: "vote-confirm" }] };
    const n = 1 + Math.floor(rnd() * Math.min(v.battle.vote.max, hand.length));
    const chosen = [...hand].sort(() => rnd() - 0.5).slice(0, n);
    return { key: `db${v.battleNo}`, inputs: [...chosen.map((c) => ({ type: "vote-cast", uid: c.uid })), { type: "vote-confirm" }] };
  }
  return null;
}

export function decide(typeId: string, view: unknown, rnd: Rnd): Decision | null {
  const v = view as View;
  return typeId === "knight-duel" ? decideDuel(v, rnd) : decideRound(typeId, v, rnd);
}

/** Generatore pseudo-casuale a seme: i bot sono riproducibili. */
export function makeRnd(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
