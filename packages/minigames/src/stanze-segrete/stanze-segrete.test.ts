import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { type Command, type Input, type StanzeState, elapsedMs, stanzeSegrete as game, stanzeConfigSchema } from "./index.js";

const players = ["a", "b", "c"].map((id) => ({ id, nickname: `Nick-${id}`, teamId: null }));
const ctx: MinigameContext = { players, teams: [], seed: 5 };
const config = game.configSchema.parse({ ...game.sampleConfig, messageCooldownSec: 0 });

const meta = (at: number) => ({ receivedAt: at, claimedTime: at, rtt: 10 });
const cmd = (s: StanzeState, c: Command, at = 1000) => game.onHostCommand(s, c, at);
const input = (s: StanzeState, id: string, i: Input, at = 1000) => game.onInput(s, id, i, meta(at));

/** a in 0 (la A), b in 4 (il bivio... centro), c in 8; partita avviata. */
function started() {
  let s = game.init(config, ctx, 0);
  s = cmd(s, { type: "place", playerId: "a", cellId: 0 });
  s = cmd(s, { type: "place", playerId: "b", cellId: 4 });
  s = cmd(s, { type: "place", playerId: "c", cellId: 8 });
  return cmd(s, { type: "start" });
}
const grant = (s: StanzeState, c: Partial<Extract<Command, { type: "grant" }>> & { action: string }, at = 1000) =>
  cmd(s, { type: "grant", target: { players: ["a"] }, ...c } as Command, at);
const view = (s: StanzeState, id: string) => game.viewFor(s, id, null) as Record<string, any>;

describe("configurazione", () => {
  it("l'esempio è valido; ancora al centro, parola introvabile o stanze in meno sono rifiutate", () => {
    expect(game.configSchema.safeParse(game.sampleConfig).success).toBe(true);
    expect(stanzeConfigSchema.safeParse({ ...game.sampleConfig, anchor: 4 }).success).toBe(false);
    expect(stanzeConfigSchema.safeParse({ ...game.sampleConfig, words: ["MAMMA"] }).success).toBe(false);
    expect(stanzeConfigSchema.safeParse({ ...game.sampleConfig, rooms: (game.sampleConfig as any).rooms.slice(1) }).success).toBe(false);
    expect(stanzeConfigSchema.safeParse({ ...game.sampleConfig, customActions: [{ id: "x", label: "A" }, { id: "x", label: "B" }] }).success).toBe(false);
  });
});

describe("preparazione", () => {
  it("«Inizia» è rifiutato finché qualcuno non è piazzato", () => {
    let s = game.init(config, ctx, 0);
    s = cmd(s, { type: "place", playerId: "a", cellId: 0 });
    expect(cmd(s, { type: "start" }).phase).toBe("setup");
    expect(started().phase).toBe("play");
  });

  it("ognuno parte dove vuole il GM; place-spread e place-all", () => {
    const s = started();
    expect(s.positions).toEqual({ a: 0, b: 4, c: 8 });
    const all = cmd(s, { type: "place-all", cellId: 2 });
    expect(Object.values(all.positions)).toEqual([2, 2, 2]);
    const spread = cmd(game.init(config, ctx, 0), { type: "place-spread" });
    expect(new Set(Object.values(spread.positions)).size).toBe(3);
    expect(cmd(s, { type: "place", playerId: "a", cellId: 99 })).toBe(s);
  });

  it("il GM può accendere capacità già in preparazione", () => {
    const s = grant(game.init(config, ctx, 0), { action: "message" });
    expect(s.grants).toHaveLength(1);
  });
});

describe("capacità e croce", () => {
  it("senza permesso non si può fare nulla", () => {
    const s = started();
    for (const i of [{ type: "move", direction: "right" }, { type: "peek", direction: "right" }, { type: "sight" }, { type: "message", text: "ciao" }, { type: "guess", word: "USCITA" }] as Input[]) {
      expect(input(s, "a", i)).toBe(s);
    }
  });

  it("muoversi crea solo una richiesta: la posizione cambia solo se il GM approva", () => {
    let s = grant(started(), { action: "move" });
    s = input(s, "a", { type: "move", direction: "right" });
    expect(s.positions.a).toBe(0);
    expect(s.requests).toHaveLength(1);
    expect(input(s, "a", { type: "move", direction: "down" })).toBe(s); // una sola richiesta in attesa
    const id = s.requests[0]!.id;
    const ok = cmd(s, { type: "resolve", requestId: id, approve: true });
    expect(ok.positions.a).toBe(1);
    expect(ok.requests).toHaveLength(0);
    expect(view(ok, "a").feedback.kind).toBe("approved");
  });

  it("rifiuto: resta dov'è, con risposta facoltativa", () => {
    let s = input(grant(started(), { action: "move" }), "a", { type: "move", direction: "right" });
    s = cmd(s, { type: "resolve", requestId: s.requests[0]!.id, approve: false, reply: "La porta è bloccata" });
    expect(s.positions.a).toBe(0);
    expect(view(s, "a").messages.at(-1).text).toBe("La porta è bloccata");
  });

  it("frecce: muro, bloccata dal permesso, bloccata da una porta chiusa", () => {
    let s = grant(started(), { action: "move", directions: ["down", "up"] });
    // a è nell'angolo in alto a sinistra: «su» è un muro ma il telefono lo mostra aperto; sinistra e destra le toglie il permesso
    expect(view(s, "a").compass.move).toEqual({ up: "open", down: "open", left: "blocked", right: "blocked" });
    expect(JSON.stringify(view(s, "a").compass)).not.toContain("wall");
    expect(input(s, "a", { type: "move", direction: "right" })).toBe(s); // bloccata
    s = cmd(s, { type: "door", a: 3, b: 0, open: false });
    expect(view(s, "a").compass.move.down).toBe("blocked");
    expect(input(s, "a", { type: "move", direction: "down" })).toBe(s);
    s = cmd(s, { type: "door", a: 0, b: 3, open: true });
    expect(view(s, "a").compass.move.down).toBe("open");
    expect(cmd(s, { type: "door", a: 0, b: 4, open: false })).toBe(s); // non adiacenti
  });

  it("verso un muro la richiesta arriva al GM, segnalata, e l'approvazione non sposta nessuno", () => {
    let s = grant(started(), { action: "move" });
    s = input(s, "a", { type: "move", direction: "up" }); // a è nell'angolo: sopra c'è un muro
    expect(s.requests).toHaveLength(1);
    expect((game.hostView(s).info as any).requests[0].wall).toBe(true);
    s = cmd(s, { type: "resolve", requestId: s.requests[0]!.id, approve: true });
    expect(s.positions.a).toBe(0);
    expect(view(s, "a").feedback.kind).toBe("refused");
  });

  it("un lucchetto verso un muro si vede come qualsiasi altro: non rivela dove finisce la mappa", () => {
    const s = grant(started(), { action: "move", directions: ["down", "right"] });
    expect(view(s, "a").compass.move).toEqual({ up: "blocked", down: "open", left: "blocked", right: "open" });
  });

  it("set-directions cambia le frecce con il permesso già attivo", () => {
    let s = grant(started(), { action: "move" });
    s = cmd(s, { type: "set-directions", grantId: s.grants[0]!.id, directions: ["right"] });
    expect(view(s, "a").compass.move.down).toBe("blocked");
    expect(view(s, "a").compass.move.right).toBe("open");
  });

  it("spegnere una capacità la toglie dal telefono e annulla le richieste in attesa", () => {
    let s = input(grant(started(), { action: "move" }), "a", { type: "move", direction: "right" });
    expect(view(s, "a").pending).toHaveLength(1);
    s = cmd(s, { type: "revoke", target: { players: ["a"] }, action: "move" });
    expect(s.requests).toHaveLength(0);
    expect(view(s, "a").abilities).toHaveLength(0);
    expect(view(s, "a").compass.move).toBeUndefined();
    expect(view(s, "a").feedback.kind).toBe("cancelled");
    expect(input(s, "a", { type: "move", direction: "right" })).toBe(s);
  });

  it("revoca con target «all» e senza azione spegne tutto", () => {
    let s = grant(grant(started(), { action: "move" }), { action: "sight" });
    s = cmd(s, { type: "revoke", target: "all" });
    expect(s.grants).toHaveLength(0);
  });

  it("gli usi si consumano alla richiesta e la scadenza spegne la capacità al tick", () => {
    let s = grant(started(), { action: "move", uses: 1, durationSec: 30 }, 1000);
    s = input(s, "a", { type: "move", direction: "right" });
    expect(s.grants[0]!.usesLeft).toBe(0);
    s = cmd(s, { type: "resolve", requestId: s.requests[0]!.id, approve: true });
    expect(input(s, "a", { type: "move", direction: "right" })).toBe(s);
    const t = game.onTick(s, 31_001);
    expect(t.grants).toHaveLength(0);
  });

  it("spostare il giocatore annulla le sue richieste di movimento", () => {
    let s = input(grant(started(), { action: "move" }), "a", { type: "move", direction: "right" });
    s = cmd(s, { type: "place", playerId: "a", cellId: 8 });
    expect(s.requests).toHaveLength(0);
  });

  it("sbirciare: il GM mostra la lettera a tempo", () => {
    let s = input(grant(started(), { action: "peek" }), "a", { type: "peek", direction: "right" });
    s = cmd(s, { type: "resolve", requestId: s.requests[0]!.id, approve: true, showLetterSec: 5 }, 2000);
    expect(view(s, "a").sighting).toMatchObject({ cell: 1, letter: "C", until: 7000 });
    expect(view(game.onTick(s, 7001), "a").sighting).toBeNull();
  });

  it("azioni libere e soluzioni sono richieste al GM", () => {
    const cfg = game.configSchema.parse({ ...game.sampleConfig, customActions: [{ id: "chiave", label: "Usa la chiave" }] });
    let s = game.init(cfg, ctx, 0);
    for (const [i, id] of ["a", "b", "c"].entries()) s = cmd(s, { type: "place", playerId: id, cellId: i });
    s = cmd(s, { type: "start" });
    s = grant(s, { action: "custom:chiave" });
    s = input(s, "a", { type: "custom", actionId: "chiave" });
    expect(s.requests[0]).toMatchObject({ kind: "custom", actionId: "chiave" });
    expect(view(s, "a").abilities[0].label).toBe("Usa la chiave");
    s = grant(s, { action: "guess" });
    s = input(s, "a", { type: "guess", word: " uscita " });
    expect(s.requests.at(-1)!.word).toBe("USCITA");
    s = cmd(s, { type: "resolve", requestId: s.requests.at(-1)!.id, approve: true });
    expect(s.solved.a).toBe(true);
  });
});

describe("lettere", () => {
  it("nessuno le vede di diritto; un'occhiata mostra la lettera della propria stanza per il tempo previsto", () => {
    let s = grant(started(), { action: "sight", uses: 1 });
    expect(JSON.stringify(view(s, "a"))).not.toContain('"letter"');
    s = input(s, "a", { type: "sight" }, 2000);
    expect(view(s, "a").sighting).toMatchObject({ cell: 0, letter: "A", until: 10_000 });
    expect(input(s, "a", { type: "sight" }, 2100)).toBe(s); // una alla volta
    s = game.onTick(s, 10_001);
    expect(view(s, "a").sighting).toBeNull();
    s = input(s, "a", { type: "sight" }, 11_000); // gli usi sono finiti
    expect(view(s, "a").sighting).toBeNull();
  });

  it("sightScope su una stanza precisa e show-letter del GM", () => {
    let s = grant(started(), { action: "sight", sightScope: 7 });
    s = input(s, "a", { type: "sight" });
    expect(view(s, "a").sighting.letter).toBe("O");
    s = cmd(s, { type: "show-letter", target: { cell: 4 }, cellId: 6, seconds: 3 }, 2000);
    expect(view(s, "b").sighting).toMatchObject({ letter: "R", until: 5000 });
  });

  it("revocare l'occhiata toglie la lettera in corso", () => {
    let s = input(grant(started(), { action: "sight" }), "a", { type: "sight" });
    s = cmd(s, { type: "revoke", target: { players: ["a"] }, action: "sight" });
    expect(view(s, "a").sighting).toBeNull();
  });
});

describe("messaggi", () => {
  it("il giocatore legge sempre e risponde solo se il GM lo consente", () => {
    let s = cmd(started(), { type: "message", to: { player: "a" }, text: "Sento un rumore" });
    expect(view(s, "a").messages).toHaveLength(1);
    expect(view(s, "b").messages).toHaveLength(0);
    const id = s.messages[0]!.id;
    s = input(s, "a", { type: "reply", messageId: id, text: "Che rumore?" });
    expect(s.messages).toHaveLength(2);
    expect(input(s, "a", { type: "reply", messageId: id, text: "Ancora" })).toBe(s); // una risposta sola
    s = input(s, "a", { type: "ack", messageId: id }, 1500);
    expect(view(s, "a").messages[0].readAt).toBe(1500);
  });

  it("risposta rifiutata se il messaggio è chiuso, senza risposta o non è per te", () => {
    let s = cmd(started(), { type: "message", to: { player: "a" }, text: "Uno", allowReply: false });
    expect(input(s, "a", { type: "reply", messageId: s.messages[0]!.id, text: "x" })).toBe(s);
    s = cmd(started(), { type: "message", to: { player: "a" }, text: "Due" });
    expect(input(s, "b", { type: "reply", messageId: s.messages[0]!.id, text: "x" })).toBe(s);
    const closed = cmd(s, { type: "close-reply", messageId: s.messages[0]!.id });
    expect(input(closed, "a", { type: "reply", messageId: s.messages[0]!.id, text: "x" })).toBe(closed);
  });

  it("scrivere di propria iniziativa richiede la capacità; rispetta pausa e lunghezza", () => {
    const cfg = game.configSchema.parse({ ...game.sampleConfig, messageCooldownSec: 5, messageMaxLength: 20 });
    let s = game.init(cfg, ctx, 0);
    s = cmd(grant(s, { action: "message" }), { type: "start" });
    s = input(s, "a", { type: "message", text: "x".repeat(50) }, 1000);
    expect(s.messages[0]!.text).toHaveLength(20);
    expect(input(s, "a", { type: "message", text: "ancora" }, 3000)).toBe(s);
    expect(input(s, "a", { type: "message", text: "ancora" }, 6001).messages).toHaveLength(2);
  });

  it("messaggio a una stanza: lo ricevono solo gli occupanti di quel momento; «tutti» lo ricevono tutti", () => {
    let s = cmd(started(), { type: "message", to: { cell: 4 }, text: "Qui dentro" });
    expect(view(s, "b").messages).toHaveLength(1);
    expect(view(s, "a").messages).toHaveLength(0);
    s = cmd(s, { type: "message", to: "all", text: "A tutti" });
    expect(view(s, "a").messages).toHaveLength(1);
    expect(cmd(s, { type: "message", to: { cell: 7 }, text: "Vuota" })).toBe(s);
  });

  it("lo stato tiene al massimo 300 messaggi ma gli id restano crescenti", () => {
    let s = started();
    for (let i = 0; i < 320; i++) s = cmd(s, { type: "message", to: "all", text: `m${i}` });
    expect(s.messages).toHaveLength(300);
    const ids = game.messages!(s).map((m) => m.id);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
    expect(ids.at(-1)).toBe(320);
  });
});

describe("eventi", () => {
  it("un multicast arriva solo ai destinatari scelti; l'accettazione è idempotente", () => {
    let s = cmd(started(), { type: "event", to: ["a", "b"], text: "Crolla il soffitto" });
    expect(view(s, "a").pendingEvents).toHaveLength(1);
    expect(view(s, "c").pendingEvents).toHaveLength(0);
    expect(JSON.stringify(view(s, "c"))).not.toContain("soffitto");
    const id = s.events[0]!.id;
    s = input(s, "a", { type: "accept-event", eventId: id }, 2000);
    expect(view(s, "a").pendingEvents).toHaveLength(0);
    expect(view(s, "a").history[0]).toMatchObject({ text: "Crolla il soffitto", acceptedAt: 2000 });
    expect(input(s, "a", { type: "accept-event", eventId: id }, 3000)).toBe(s);
    expect(input(s, "c", { type: "accept-event", eventId: id })).toBe(s); // non destinatario
    expect(s.events[0]!.accepted).toEqual({ a: 2000, b: null });
  });

  it("la cronologia di un giocatore non contiene eventi altrui né gli altri destinatari", () => {
    let s = cmd(started(), { type: "event", to: ["b"], text: "Solo per B" });
    s = cmd(s, { type: "event", to: "all", text: "Per tutti" });
    const a = JSON.stringify(view(s, "a"));
    expect(a).toContain("Per tutti");
    expect(a).not.toContain("Solo per B");
    expect(a).not.toContain("recipients");
    expect(a).not.toContain('"to"');
    expect(JSON.stringify(game.screenView(s))).not.toContain("Per tutti");
  });

  it("un evento annullato sparisce da chi non l'aveva accettato e resta in cronologia", () => {
    let s = cmd(started(), { type: "event", to: "all", text: "Allarme" });
    const id = s.events[0]!.id;
    s = input(s, "a", { type: "accept-event", eventId: id }, 2000);
    s = cmd(s, { type: "cancel-event", eventId: id }, 3000);
    expect(view(s, "b").pendingEvents).toHaveLength(0);
    expect(view(s, "b").history[0]).toMatchObject({ cancelled: true });
    expect(input(s, "b", { type: "accept-event", eventId: id })).toBe(s);
    expect(view(s, "a").history[0]).toMatchObject({ acceptedAt: 2000 });
  });

  it("non si annulla un evento già accettato da tutti; messaggi ed eventi condividono il contatore", () => {
    let s = cmd(started(), { type: "event", to: ["a"], text: "E" });
    s = cmd(s, { type: "message", to: "all", text: "M" });
    expect(s.events[0]!.id).toBe(1);
    expect(s.messages[0]!.id).toBe(2);
    s = input(s, "a", { type: "accept-event", eventId: 1 });
    expect(cmd(s, { type: "cancel-event", eventId: 1 })).toBe(s);
    const rows = game.messages!(s);
    expect(rows.map((r) => r.kind)).toEqual(["event", "message"]);
    expect(rows[0]!.accepted).toEqual({ a: 1000 });
  });
});

describe("esiti, fasi e punti", () => {
  it("rivelazione, esiti e punti", () => {
    let s = started();
    s = cmd(s, { type: "set-outcome", playerId: "a", outcome: "fuggito" });
    s = grant(s, { action: "guess", target: { players: ["b"] } });
    s = input(s, "b", { type: "guess", word: "uscita" });
    s = cmd(s, { type: "resolve", requestId: s.requests[0]!.id, approve: true });
    s = cmd(s, { type: "public-reveal" });
    expect(s.phase).toBe("reveal");
    expect(game.isFinished(s)).toBe(false);
    s = cmd(s, { type: "end" });
    expect(game.isFinished(s)).toBe(true);
    expect(game.scores(s).map((d) => [d.playerId, d.points])).toEqual([["a", 300], ["b", 200]]);
    expect(game.result(s).ranking[0]).toMatchObject({ playerId: "a", rank: 1 });
  });

  it("dopo la rivelazione i comandi di gioco sono ignorati", () => {
    const s = cmd(started(), { type: "public-reveal" });
    expect(cmd(s, { type: "message", to: "all", text: "tardi" })).toBe(s);
    expect(cmd(s, { type: "place", playerId: "a", cellId: 3 })).toBe(s);
  });

  it("chi non è in serata non può nulla", () => {
    const s = cmd(started(), { type: "event", to: "all", text: "x" });
    expect(input(s, "z", { type: "accept-event", eventId: 1 })).toBe(s);
  });
});

describe("la mappa è nascosta finché il GM non la mostra", () => {
  it("di default schermo e telefoni non ricevono griglia, posizioni né dimensioni", () => {
    const s = started();
    expect(game.screenView(s)).toEqual({ phase: "play", mapShown: false });
    const v = view(s, "a");
    expect(v.mapShown).toBe(false);
    expect(v).not.toHaveProperty("rows");
    expect(v).not.toHaveProperty("cols");
    expect(v.others).toEqual([]);
    expect(v.rules).not.toHaveProperty("rows");
    expect(JSON.stringify(view(s, "z"))).not.toContain("rows");
  });

  it("show-map la mostra e la nasconde di nuovo; la rivelazione la mostra comunque", () => {
    let s = cmd(started(), { type: "show-map", visible: true });
    expect((game.screenView(s) as any).rows).toBe(3);
    expect(view(s, "a").rows).toBe(3);
    expect(view(s, "a").others).toHaveLength(2);
    expect(view(s, "a").rules.rows).toBe(3);
    expect(cmd(s, { type: "show-map", visible: true })).toBe(s);
    s = cmd(s, { type: "show-map", visible: false });
    expect(game.screenView(s)).toEqual({ phase: "play", mapShown: false });
    s = cmd(s, { type: "public-reveal" });
    expect((game.screenView(s) as any).letters).toHaveLength(9);
  });

  it("anche in preparazione il GM può mostrarla", () => {
    const s = cmd(game.init(config, ctx, 0), { type: "show-map", visible: true });
    expect((game.screenView(s) as any).rows).toBe(3);
  });
});

describe("oggetti", () => {
  // a è nella stanza 0, b nella 4, c nella 8; la scopa e la lettera sono nella stanza 4
  const withItems = () => {
    let s = started();
    s = cmd(s, { type: "place", playerId: "c", cellId: 4 });
    s = cmd(s, { type: "place-item", itemId: "scopa", cellId: 4 });
    return cmd(s, { type: "place-item", itemId: "lettera", cellId: 4 });
  };

  it("sono cinque, tutti inizialmente in nessuna stanza e invisibili ai giocatori", () => {
    const s = started();
    expect(s.cfg.items.map((i) => i.name)).toEqual(["Una scopa", "Una lettera", "Un libro", "Occhiali futuristici", "Una cassetta degli attrezzi"]);
    expect(s.items.every((i) => i.cell === null && !i.enabled)).toBe(true);
    expect(view(s, "a").items).toEqual([]);
  });

  it("assegnato a una stanza ma non abilitato, nessuno sa che esiste", () => {
    const s = withItems();
    expect(view(s, "b").items).toEqual([]);
  });

  it("abilitato: chi è nella stanza sa che c'è un oggetto ma non quale", () => {
    let s = cmd(withItems(), { type: "enable-item", itemId: "scopa", enabled: true });
    expect(view(s, "b").items).toEqual([{ ref: 0, known: false }]);
    expect(view(s, "c").items).toEqual([{ ref: 0, known: false }]);
    expect(view(s, "a").items).toEqual([]); // un altro giocatore, in un'altra stanza
    const raw = JSON.stringify(view(s, "b"));
    for (const word of ["scopa", "Scopa", "🧹", "Una scopa"]) expect(raw).not.toContain(word);
    expect(JSON.stringify(game.screenView(s))).not.toContain("scopa");
    // nemmeno l'oggetto abilitato in una stanza altrui compare
    s = cmd(s, { type: "enable-item", itemId: "lettera", enabled: true });
    expect(view(s, "b").items).toHaveLength(2);
  });

  it("palesare ai presenti: tutti quelli nella stanza vedono nome, icona e testo", () => {
    let s = cmd(withItems(), { type: "enable-item", itemId: "lettera", enabled: true });
    s = cmd(s, { type: "reveal-item", itemId: "lettera", to: "room" });
    for (const id of ["b", "c"]) {
      expect(view(s, id).items[0]).toMatchObject({ known: true, name: "Una lettera", icon: "✉️" });
      expect(view(s, id).items[0].text).toContain("uscita");
    }
    expect(JSON.stringify(view(s, "a"))).not.toContain("lettera");
  });

  it("palesare solo ad alcuni: gli altri presenti continuano a vedere un oggetto misterioso", () => {
    let s = cmd(withItems(), { type: "reveal-item", itemId: "scopa", to: { players: ["b"] } });
    expect(view(s, "b").items[0]).toMatchObject({ known: true, name: "Una scopa" });
    expect(view(s, "c").items[0]).toEqual({ ref: 0, known: false });
    expect(JSON.stringify(view(s, "c"))).not.toContain("Una scopa");
    // chi non è nella stanza non può scoprirlo, anche se indicato
    expect(cmd(s, { type: "reveal-item", itemId: "scopa", to: { players: ["a"] } })).toBe(s);
    // ripetere non cambia nulla
    expect(cmd(s, { type: "reveal-item", itemId: "scopa", to: { players: ["b"] } })).toBe(s);
    s = cmd(s, { type: "reveal-item", itemId: "scopa", to: "room" });
    expect(view(s, "c").items[0].known).toBe(true);
  });

  it("chi esce dalla stanza non vede più l'oggetto; spostare l'oggetto lo rende di nuovo misterioso", () => {
    let s = cmd(withItems(), { type: "reveal-item", itemId: "scopa", to: "room" });
    s = cmd(s, { type: "place", playerId: "b", cellId: 8 });
    expect(view(s, "b").items).toEqual([]);
    s = cmd(s, { type: "place-item", itemId: "scopa", cellId: 8 });
    expect(view(s, "b").items[0]).toEqual({ ref: 0, known: false });
    s = cmd(s, { type: "reveal-item", itemId: "scopa", to: "room" });
    s = cmd(s, { type: "conceal-item", itemId: "scopa" });
    expect(view(s, "b").items[0].known).toBe(false);
  });

  it("disabilitare lo nasconde del tutto; comandi non validi sono ignorati", () => {
    let s = cmd(withItems(), { type: "enable-item", itemId: "scopa", enabled: true });
    s = cmd(s, { type: "enable-item", itemId: "scopa", enabled: false });
    expect(view(s, "b").items).toEqual([]);
    expect(cmd(s, { type: "place-item", itemId: "inesistente", cellId: 1 })).toBe(s);
    expect(cmd(s, { type: "place-item", itemId: "scopa", cellId: 99 })).toBe(s);
    expect(cmd(s, { type: "reveal-item", itemId: "libro", to: "room" })).toBe(s); // in nessuna stanza
  });

  it("il master aggiunge oggetti durante la partita, anche già in una stanza e già percepibili", () => {
    let s = cmd(withItems(), { type: "item-add", name: "Una chiave arrugginita", icon: "🗝️", text: "Sul manico: 7", note: "Apre la porta tra 5 e 6", cellId: 4, enabled: true });
    expect(s.itemDefs).toHaveLength(6);
    expect(s.items.at(-1)).toMatchObject({ id: "x5", cell: 4, enabled: true, revealedTo: [] });
    // chi è nella stanza sa che c'è qualcosa, non cosa; nessun id o nome nel suo telefono
    const v = view(s, "b").items.find((i: any) => i.ref === 5);
    expect(v).toEqual({ ref: 5, known: false });
    expect(JSON.stringify(view(s, "b"))).not.toMatch(/chiave|x5|7/);
    s = cmd(s, { type: "reveal-item", itemId: "x5", to: { players: ["b"] } });
    expect(view(s, "b").items.find((i: any) => i.ref === 5)).toMatchObject({ known: true, name: "Una chiave arrugginita", icon: "🗝️", text: "Sul manico: 7" });
    expect(view(s, "c").items.find((i: any) => i.ref === 5)).toEqual({ ref: 5, known: false });
    // un oggetto senza stanza resta fuori dal gioco finché non lo si assegna
    s = cmd(s, { type: "item-add", name: "Una torcia" });
    expect(s.items.at(-1)).toMatchObject({ id: "x6", cell: null, enabled: false });
    s = cmd(s, { type: "place-item", itemId: "x6", cellId: 0 });
    expect(game.hostView(s).info).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id: "x6", cell: 0, name: "Una torcia" })]) });
  });

  it("il master modifica un oggetto esistente: chi lo conosce vede subito il testo nuovo, gli altri niente", () => {
    let s = cmd(withItems(), { type: "reveal-item", itemId: "scopa", to: { players: ["b"] } });
    const before = JSON.stringify(view(s, "c"));
    s = cmd(s, { type: "item-edit", itemId: "scopa", name: "Una scopa rotta", text: "Il manico è spezzato", note: "Nasconde un biglietto" });
    expect(view(s, "b").items.find((i: any) => i.ref === 0)).toMatchObject({ known: true, name: "Una scopa rotta", text: "Il manico è spezzato" });
    expect(JSON.stringify(view(s, "c"))).toBe(before); // chi non lo conosce non nota nulla
    expect((game.hostView(s).info as any).items.find((i: any) => i.id === "scopa")).toMatchObject({ name: "Una scopa rotta", note: "Nasconde un biglietto" });
    expect(s.log.at(-1)?.text).not.toContain("spezzato"); // il registro non porta i testi
    // si può svuotare il testo, i campi omessi restano, nessun cambiamento o oggetto inesistente: stato invariato
    const cleared = cmd(s, { type: "item-edit", itemId: "scopa", text: "" });
    expect(cleared.itemDefs.find((d) => d.id === "scopa")).toMatchObject({ name: "Una scopa rotta", text: "" });
    expect(cmd(s, { type: "item-edit", itemId: "scopa", name: "Una scopa rotta" })).toBe(s);
    expect(cmd(s, { type: "item-edit", itemId: "inesistente", name: "X" })).toBe(s);
  });

  it("il master scrive la descrizione di una stanza: la vede solo lui, si può cambiare e svuotare", () => {
    let s = cmd(withItems(), { type: "room-note", cellId: 4, note: "Una stanza umida, con un odore di muffa" });
    expect((game.hostView(s).info as any).rooms[4].note).toBe("Una stanza umida, con un odore di muffa");
    expect(JSON.stringify(game.screenView(s))).not.toContain("muffa");
    for (const id of ["a", "b", "c"]) expect(JSON.stringify(view(s, id))).not.toContain("muffa");
    expect(s.log.at(-1)?.text).not.toContain("muffa");
    s = cmd(s, { type: "room-note", cellId: 4, note: "" });
    expect((game.hostView(s).info as any).rooms[4].note).toBe("");
    expect(cmd(s, { type: "room-note", cellId: 4, note: "" })).toBe(s); // nessun cambiamento
    expect(cmd(s, { type: "room-note", cellId: 99, note: "x" })).toBe(s); // stanza inesistente
  });

  it("exportConfig riporta descrizioni e oggetti attuali ed è valido per lo schema dell'istanza", () => {
    let s = cmd(withItems(), { type: "room-note", cellId: 4, note: "Muffa alle pareti" });
    s = cmd(s, { type: "item-edit", itemId: "scopa", text: "Il manico è spezzato" });
    s = cmd(s, { type: "item-add", name: "Una torcia", cellId: 2, enabled: true });
    s = cmd(s, { type: "place-item", itemId: "libro", cellId: 4 }); // la posizione in partita non entra nell'istanza
    s = cmd(s, { type: "item-remove", itemId: "occhiali" });
    const out = game.exportConfig!(s);
    expect(stanzeConfigSchema.safeParse(out).success).toBe(true);
    expect(out.rooms[4].note).toBe("Muffa alle pareti");
    expect(out.items.find((i) => i.id === "scopa")?.text).toBe("Il manico è spezzato");
    expect(out.items.find((i) => i.id === "libro")?.cell).toBeNull();
    expect(out.items.find((i) => i.id === "occhiali")).toBeUndefined();
    expect(out.items.find((i) => i.name === "Una torcia")).toMatchObject({ cell: 2 });
    expect(out.rows).toBe(s.cfg.rows);
  });

  it("load-content carica descrizioni e oggetti: gli esistenti restano dove sono, i nuovi arrivano nascosti, gli altri spariscono", () => {
    let s = cmd(withItems(), { type: "reveal-item", itemId: "scopa", to: "room" });
    s = cmd(s, { type: "place-item", itemId: "scopa", cellId: 4 });
    s = cmd(s, { type: "enable-item", itemId: "scopa", enabled: true });
    const rooms = s.cfg.rooms.map((_, c) => ({ note: `Stanza ${c + 1}: descrizione caricata` }));
    const items = [
      { id: "scopa", name: "Una scopa nuova", icon: "🧹", text: "Pulita", note: "", cell: null },
      { id: "x9", name: "Una chiave", icon: "🗝️", text: "", note: "", cell: 2 },
    ];
    const loaded = cmd(s, { type: "load-content", rooms, items });
    expect((game.hostView(loaded).info as any).rooms[4].note).toBe("Stanza 5: descrizione caricata");
    expect(loaded.items.map((i) => i.id).sort()).toEqual(["scopa", "x9"]); // lettera, libro, occhiali, attrezzi tolti
    expect(loaded.items.find((i) => i.id === "scopa")).toMatchObject({ cell: 4, enabled: true }); // non si sposta né si nasconde
    expect(loaded.items.find((i) => i.id === "x9")).toMatchObject({ cell: 2, enabled: false, revealedTo: [] });
    expect(loaded.itemDefs.find((d) => d.id === "scopa")).toMatchObject({ name: "Una scopa nuova", text: "Pulita" });
    // un nuovo oggetto creato dopo non riusa un id già presente
    const next = cmd(cmd(loaded, { type: "item-add", name: "A" }), { type: "item-add", name: "B" });
    expect(new Set(next.itemDefs.map((d) => d.id)).size).toBe(next.itemDefs.length);
    // mappa diversa, id doppi o comando fuori fase: ignorato
    expect(cmd(s, { type: "load-content", rooms: rooms.slice(1), items })).toBe(s);
    expect(cmd(s, { type: "load-content", rooms, items: [items[0]!, items[0]!] })).toBe(s);
  });

  it("il master elimina un oggetto; i riferimenti degli altri non cambiano; limite e stanza non valida", () => {
    let s = cmd(withItems(), { type: "enable-item", itemId: "libro", enabled: true });
    s = cmd(s, { type: "place-item", itemId: "libro", cellId: 4 });
    s = cmd(s, { type: "item-remove", itemId: "scopa" });
    expect(s.items.find((i) => i.id === "scopa")).toBeUndefined();
    expect(s.itemDefs.find((d) => d.id === "scopa")).toBeUndefined();
    expect(view(s, "b").items.map((i: any) => i.ref)).toEqual([2]); // solo il libro: la lettera è in stanza ma non abilitata
    expect(cmd(s, { type: "item-remove", itemId: "scopa" })).toBe(s);
    expect(cmd(s, { type: "item-add", name: "Fuori mappa", cellId: 99 })).toBe(s);
    for (let i = 0; i < 40; i++) s = cmd(s, { type: "item-add", name: `O${i}` });
    expect(s.itemDefs).toHaveLength(30);
  });

  it("la regia vede tutto, compresi note e destinatari; la configurazione valida gli oggetti", () => {
    const s = cmd(withItems(), { type: "reveal-item", itemId: "scopa", to: { players: ["b"] } });
    const items = (game.hostView(s).info as any).items;
    expect(items[0]).toMatchObject({ id: "scopa", name: "Una scopa", cell: 4, revealedTo: ["b"] });
    expect(items[0].note).toContain("spostare");
    const dup = { ...game.sampleConfig, items: [{ id: "x", name: "A" }, { id: "x", name: "B" }] };
    expect(game.configSchema.safeParse(dup).success).toBe(false);
    expect(game.configSchema.safeParse({ ...game.sampleConfig, items: [{ id: "x", name: "A", cell: 40 }] }).success).toBe(false);
    const placed = game.configSchema.parse({ ...game.sampleConfig, items: [{ id: "x", name: "A", cell: 3 }] });
    expect(game.init(placed, ctx, 0).items[0]).toMatchObject({ cell: 3, enabled: false });
  });
});

describe("cronometri del master", () => {
  const timers = (s: any) => (game.hostView(s).info as any).timers as { id: string; label: string; running: boolean; laps: number; intervalSec: number | null }[];

  it("il tempo di gioco c'è fin dall'inizio, parte con «Inizia» e avvisa a ogni intervallo", () => {
    const init = game.init(config, ctx, 0);
    expect(timers(init)[0]).toMatchObject({ id: "t0", label: "Tempo di gioco", running: false, intervalSec: 300 });
    let s = started(); // «Inizia» a t = 1000
    expect(timers(s)[0]!.running).toBe(true);
    expect(game.onTick(s, 1000 + 299_000)).toBe(s); // nessun cambiamento prima dell'intervallo
    s = game.onTick(s, 1000 + 300_000);
    expect(timers(s)[0]!.laps).toBe(1);
    expect(s.log.at(-1)!.text).toBe("⏱ Tempo di gioco: trascorsi 5 min");
    expect(game.onTick(s, 1000 + 301_000)).toBe(s); // un solo avviso per intervallo
    s = game.onTick(s, 1000 + 600_500);
    expect(timers(s)[0]!.laps).toBe(2);
    expect(s.log.at(-1)!.text).toContain("10 min");
  });

  it("intervallo 0 = nessun avviso, solo il conto del tempo", () => {
    const cfg = game.configSchema.parse({ ...game.sampleConfig, clockIntervalSec: 0, messageCooldownSec: 0 });
    let s = game.init(cfg, ctx, 0);
    s = cmd(cmd(cmd(cmd(s, { type: "place", playerId: "a", cellId: 0 }), { type: "place", playerId: "b", cellId: 1 }), { type: "place", playerId: "c", cellId: 2 }), { type: "start" });
    expect(game.onTick(s, 10_000_000)).toBe(s);
    expect(elapsedMs(s.timers[0]!, 10_001_000)).toBe(10_000_000);
  });

  it("si aggiungono cronometri e intervalli, si fermano, riprendono, azzerano ed eliminano", () => {
    let s = cmd(started(), { type: "timer-add", label: "Gas nella Stanza 5", intervalSec: 60 }, 2000);
    const t = timers(s).find((x) => x.label === "Gas nella Stanza 5")!;
    expect(t).toMatchObject({ running: false, intervalSec: 60 });
    s = cmd(s, { type: "timer-start", timerId: t.id }, 2000);
    s = game.onTick(s, 2000 + 125_000); // due minuti: due intervalli
    expect(s.timers.find((x) => x.id === t.id)!.laps).toBe(2);
    s = cmd(s, { type: "timer-pause", timerId: t.id }, 2000 + 130_000);
    const paused = s.timers.find((x) => x.id === t.id)!;
    expect(paused).toMatchObject({ running: false, accumulatedMs: 130_000 });
    expect(game.onTick(s, 2000 + 999_000).timers.find((x) => x.id === t.id)!.laps).toBe(2); // in pausa non conta
    s = cmd(s, { type: "timer-start", timerId: t.id }, 500_000);
    expect(elapsedMs(s.timers.find((x) => x.id === t.id)!, 530_000)).toBe(160_000);
    s = cmd(s, { type: "timer-reset", timerId: t.id });
    expect(s.timers.find((x) => x.id === t.id)).toMatchObject({ running: false, accumulatedMs: 0, laps: 0 });
    s = cmd(s, { type: "timer-remove", timerId: t.id });
    expect(timers(s).map((x) => x.id)).toEqual(["t0"]);
    expect(cmd(s, { type: "timer-start", timerId: "inesistente" })).toBe(s);
  });

  it("al massimo 10 cronometri", () => {
    let s = started();
    for (let i = 0; i < 15; i++) s = cmd(s, { type: "timer-add", label: `T${i}` });
    expect(s.timers).toHaveLength(10);
  });

  it("rivelazione e fine li fermano, e il tempo trascorso resta quello", () => {
    let s = started();
    s = cmd(s, { type: "public-reveal" }, 61_000);
    expect(s.timers[0]).toMatchObject({ running: false, accumulatedMs: 60_000 });
    expect(game.onTick(s, 9_999_999)).toBe(s);
  });

  it("i cronometri sono solo del master: mai a schermo né sui telefoni", () => {
    let s = cmd(started(), { type: "timer-add", label: "SEGRETISSIMO", intervalSec: 60 });
    s = game.onTick(s, 1000 + 400_000);
    for (const v of [game.screenView(s), view(s, "a"), view(s, "z")]) {
      const raw = JSON.stringify(v);
      expect(raw).not.toContain("SEGRETISSIMO");
      expect(raw).not.toContain("Tempo di gioco");
      expect(raw).not.toContain("timers");
    }
  });
});

describe("anti-leak", () => {
  const letters = ["A", "C", "S", "T", "I", "U", "R", "O", "M"];
  const hasLetterField = (v: unknown) => /"letters?":/.test(JSON.stringify(v));

  it("le lettere non stanno mai nello schermo prima della rivelazione, né nel telefono senza occhiata", () => {
    let s = started();
    expect(hasLetterField(game.screenView(s))).toBe(false);
    expect(hasLetterField(view(s, "a"))).toBe(false);
    s = input(grant(s, { action: "sight" }), "a", { type: "sight" }, 2000);
    expect(view(s, "a").sighting.letter).toBe("A");
    // gli altri non vedono nulla
    expect(hasLetterField(view(s, "b"))).toBe(false);
    expect(hasLetterField(game.screenView(s))).toBe(false);
    // dopo la scadenza sparisce
    s = game.onTick(s, 10_001);
    expect(hasLetterField(view(s, "a"))).toBe(false);
    // note del GM mai fuori dalla regia
    const noted = game.init(game.configSchema.parse({ ...game.sampleConfig, rooms: (game.sampleConfig as any).rooms.map((r: any, i: number) => ({ ...r, note: `SEGRETO${i}` })) }), ctx, 0);
    for (const v of [game.screenView(noted), view(noted, "a")]) expect(JSON.stringify(v)).not.toContain("SEGRETO");
    expect(JSON.stringify(game.hostView(noted))).toContain("SEGRETO3");
    // alla rivelazione lo schermo mostra lettere e percorsi
    const done = cmd(started(), { type: "public-reveal" });
    const sv = game.screenView(done) as any;
    expect(sv.mapShown).toBe(true);
    expect(sv.letters).toEqual(letters);
    expect(sv.paths.map((p: any) => p.word)).toEqual(["MORTA", "USCITA"]);
  });

  it("permessi, richieste, messaggi e porte altrui non sono visibili; lo schermo non vede testi", () => {
    let s = grant(started(), { action: "move" });
    s = input(s, "a", { type: "move", direction: "right" });
    s = cmd(s, { type: "message", to: { player: "a" }, text: "TESTOSEGRETO" });
    s = cmd(s, { type: "door", a: 4, b: 5, open: false });
    s = input(grant(s, { action: "message" }), "a", { type: "message", text: "RISPOSTAPRIVATA" });
    const b = JSON.stringify(view(s, "b"));
    expect(b).not.toContain("TESTOSEGRETO");
    expect(b).not.toContain("RISPOSTAPRIVATA");
    expect(b).not.toContain("closedDoors");
    expect(view(s, "b").abilities).toEqual([]);
    expect(view(s, "b").pending).toEqual([]);
    const screen = JSON.stringify(game.screenView(s));
    for (const k of ["TESTOSEGRETO", "RISPOSTAPRIVATA", "grants", "requests", "closedDoors"]) expect(screen).not.toContain(k);
  });

  it("posizioni non pubbliche: né sullo schermo né sui telefoni altrui", () => {
    const cfg = game.configSchema.parse({ ...game.sampleConfig, positionsPublic: false });
    let s = game.init(cfg, ctx, 0);
    s = cmd(s, { type: "place", playerId: "a", cellId: 3 });
    s = cmd(s, { type: "show-map", visible: true });
    expect((game.screenView(s) as any).positions).toEqual({});
    expect(view(s, "b").others).toEqual([]);
    expect(view(s, "a").cell).toBe(3);
  });
});

describe("dadi", () => {
  it("il Master chiede un dado: il giocatore tira dal telefono e il risultato è tra 1 e le facce", () => {
    let s = cmd(started(), { type: "dice-call", target: { players: ["a"] }, sides: 20, label: "Forza" });
    expect(view(s, "a").dice.pending).toEqual([{ id: 1, sides: 20, label: "Forza" }]);
    expect(view(s, "b").dice.pending).toEqual([]);
    // Un altro giocatore non può tirare al posto suo.
    expect(input(s, "b", { type: "roll", rollId: 1 })).toBe(s);
    s = input(s, "a", { type: "roll", rollId: 1 }, 2000);
    const rolled = view(s, "a").dice.rolled[0];
    expect(rolled.result).toBeGreaterThanOrEqual(1);
    expect(rolled.result).toBeLessThanOrEqual(20);
    expect(view(s, "a").dice.pending).toEqual([]);
    // Non si ritira lo stesso dado.
    expect(input(s, "a", { type: "roll", rollId: 1 }, 3000)).toBe(s);
  });

  it("tiri nascosti: il numero non arriva né al giocatore né agli altri, ma il Master lo vede", () => {
    let s = cmd(started(), { type: "dice-roll", target: { players: ["a"] }, sides: 6, hidden: true });
    expect(view(s, "a").dice.rolled[0]).toMatchObject({ hidden: true, result: null });
    expect(view(s, "b").dice.rolled).toEqual([]);
    const host = (game.hostView(s) as any).info.dice[0];
    expect(host.result).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(view(s, "a"))).not.toContain(`"result":${host.result}`);
    s = cmd(started(), { type: "dice-call", target: "all", sides: 8, hidden: true });
    s = input(s, "a", { type: "roll", rollId: 1 });
    expect(view(s, "a").dice.rolled[0].result).toBeNull();
  });

  it("lancio privato del Master: nessun telefono lo vede", () => {
    const s = cmd(started(), { type: "dice-roll", sides: 12 });
    for (const id of ["a", "b", "c"]) expect(view(s, id).dice).toEqual({ pending: [], rolled: [] });
    expect((game.hostView(s) as any).info.dice).toHaveLength(1);
    expect(JSON.stringify(game.screenView(s))).not.toContain("dice");
  });

  it("tutti i dadi validi, i risultati restano nell'intervallo, i facce non valide sono rifiutate", () => {
    for (const sides of [4, 6, 8, 10, 12, 20] as const) {
      let s = started();
      for (let i = 0; i < 40; i++) s = cmd(s, { type: "dice-roll", sides });
      for (const r of (game.hostView(s) as any).info.dice) {
        expect(r.result).toBeGreaterThanOrEqual(1);
        expect(r.result).toBeLessThanOrEqual(sides);
      }
    }
    expect(game.commandSchema.safeParse({ type: "dice-roll", sides: 7 }).success).toBe(false);
  });

  it("annullare una richiesta in attesa; un dado già tirato non si annulla", () => {
    let s = cmd(started(), { type: "dice-call", target: { players: ["a"] }, sides: 4 });
    expect(cmd(s, { type: "dice-cancel", rollId: 1 }).dice).toHaveLength(0);
    s = input(s, "a", { type: "roll", rollId: 1 });
    expect(cmd(s, { type: "dice-cancel", rollId: 1 })).toBe(s);
  });
});
