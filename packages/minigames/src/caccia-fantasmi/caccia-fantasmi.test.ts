import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { type GhostHuntState, ghostHunt as gh, ghostWeight } from "./index.js";

const players = ["g", "a", "b", "c", "d"].map((id) => ({ id, nickname: `Nick-${id}`, teamId: null }));
const ctx: MinigameContext = { players, teams: [], seed: 7 };

const config = gh.configSchema.parse({
  ...gh.sampleConfig,
  ghostCount: 1,
  durationSec: 100,
  headStartSec: 10,
  scanCooldownSec: 5,
  accuseCooldownSec: 5,
  jailSec: 30,
  stunSec: 20,
  holdPointsPerSec: 2,
  flipPoints: 20,
  catchPoints: 100,
  wrongPenalty: 30,
  winPoints: 200,
  // Le regole di base si provano senza blocco né peso (aritmetica semplice); blocco e peso hanno test propri.
  zoneLockSec: 0,
  ghostWeight: 1,
});

const meta = (at: number) => ({ receivedAt: at, claimedTime: at - 10, rtt: 20 });
const scan = (s: GhostHuntState, id: string, code: string, at: number) => gh.onInput(s, id, { type: "scan", code }, meta(at));
const look = (s: GhostHuntState, id: string, code: string, at: number) => gh.onInput(s, id, { type: "look", code }, meta(at));
const accuse = (s: GhostHuntState, id: string, target: string, at: number) => gh.onInput(s, id, { type: "accuse", target }, meta(at));

/** Partita avviata a t=0: ruoli fissi dal seme, il fantasma è uno solo. */
function started(cfg = config) {
  const s0 = gh.init(cfg, ctx, 0);
  const ghost = Object.keys(s0.roles).find((id) => s0.roles[id] === "ghost")!;
  const hunters = Object.keys(s0.roles).filter((id) => s0.roles[id] === "hunter");
  return { s: gh.onHostCommand(s0, { type: "start" }, 0), ghost, hunters };
}

const CODE = (i: number) => config.zones[i]!.code;

describe("caccia-fantasmi", () => {
  it("configurazione: codici unici e ben formati", () => {
    expect(gh.configSchema.safeParse(gh.sampleConfig).success).toBe(true);
    const dup = { ...gh.sampleConfig, zones: [{ name: "A", code: "AAAA" }, { name: "B", code: "AAAA" }] };
    expect(gh.configSchema.safeParse(dup).success).toBe(false);
    expect(gh.configSchema.safeParse({ ...gh.sampleConfig, zones: [{ name: "A", code: "ab" }, { name: "B", code: "BBBB" }] }).success).toBe(false);
    expect(gh.configSchema.safeParse({ ...gh.sampleConfig, zones: [{ name: "A", code: "AAAA" }] }).success).toBe(false);
  });

  it("i ruoli sono deterministici, i fantasmi sono quanti richiesti e mai più della metà", () => {
    const a = gh.init(config, ctx, 0);
    expect(JSON.stringify(a.roles)).toBe(JSON.stringify(gh.init(config, ctx, 0).roles));
    expect(Object.values(a.roles).filter((r) => r === "ghost")).toHaveLength(1);
    const many = gh.init({ ...config, ghostCount: 10 }, ctx, 0);
    expect(Object.values(many.roles).filter((r) => r === "ghost")).toHaveLength(2);
    const auto = gh.init({ ...config, ghostCount: 0 }, ctx, 0);
    expect(Object.values(auto.roles).filter((r) => r === "ghost")).toHaveLength(1);
  });

  it("prima del via nessuno può scansionare, poi parte il tempo", () => {
    const s0 = gh.init(config, ctx, 0);
    const { ghost } = started();
    expect(scan(s0, ghost, CODE(0), 100)).toBe(s0);
    expect(gh.onTick(s0, 999_999)).toBe(s0);
    const s = gh.onHostCommand(s0, { type: "start" }, 1_000);
    expect(s).toMatchObject({ phase: "play", endsAt: 101_000, huntersFrom: 11_000 });
  });

  it("scansionare conquista la zona e dà punti ogni secondo al proprietario", () => {
    const { s, ghost } = started();
    let n = scan(s, ghost, CODE(0), 1_000);
    expect(n.zones[0]).toMatchObject({ owner: "ghost", holder: ghost });
    n = gh.onTick(n, 6_500); // la zona è tenuta dal secondo 1: accreditati 5 secondi interi
    expect(n.totals[ghost]).toBe(5 * 2);
    expect(n.seconds.ghost).toBe(5);
    expect(gh.onTick(n, 6_700)).toBe(n); // meno di un secondo: nessun cambiamento
  });

  it("il codice si accetta in minuscolo e con spazi; uno sconosciuto dà un esito senza cambiare le zone", () => {
    const { s, ghost } = started();
    const ok = scan(s, ghost, ` ${CODE(1).toLowerCase()} `, 1_000);
    expect(ok.zones[1]!.owner).toBe("ghost");
    const bad = scan(s, ghost, "ZZZZ", 1_000);
    expect(bad.zones).toEqual(s.zones);
    expect(bad.feedback[ghost]!.kind).toBe("unknown");
  });

  it("i cacciatori sono fermi durante il vantaggio dei fantasmi", () => {
    const { s, hunters } = started();
    const early = scan(s, hunters[0]!, CODE(0), 5_000);
    expect(early.zones[0]!.owner).toBeNull();
    expect(early.feedback[hunters[0]!]).toMatchObject({ kind: "headStart", until: 10_000 });
    expect(accuse(s, hunters[0]!, "g", 5_000).catches).toBe(0);
    expect(scan(s, hunters[0]!, CODE(0), 10_500).zones[0]!.owner).toBe("hunter");
  });

  it("pausa tra due scansioni e zona già della propria fazione", () => {
    const { s, ghost } = started();
    const a = scan(s, ghost, CODE(0), 1_000);
    const tooSoon = scan(a, ghost, CODE(1), 3_000);
    expect(tooSoon.zones[1]!.owner).toBeNull();
    expect(tooSoon.feedback[ghost]).toMatchObject({ kind: "cooldown", until: 6_000 });
    const own = scan(a, ghost, CODE(0), 7_000);
    expect(own.feedback[ghost]!.kind).toBe("own");
    expect(own.zones[0]!.holder).toBe(ghost);
    expect(scan(a, ghost, CODE(1), 6_000).zones[1]!.owner).toBe("ghost");
  });

  it("strappare una zona al nemico dà punti extra e passa la tenuta; i punti già maturati restano a chi la teneva", () => {
    const { s, ghost, hunters } = started();
    let n = scan(s, ghost, CODE(0), 1_000);
    n = scan(n, hunters[0]!, CODE(0), 21_000);
    expect(n.zones[0]).toMatchObject({ owner: "hunter", holder: hunters[0] });
    expect(n.totals[ghost]).toBe(20 * 2); // fino al secondo 20
    expect(n.totals[hunters[0]!]).toBe(20); // flipPoints
    expect(n.feedback[hunters[0]!]!.kind).toBe("flip");
  });

  it("un'accusa giusta imprigiona il fantasma, libera le sue zone e premia il cacciatore", () => {
    const { s, ghost, hunters } = started();
    let n = scan(s, ghost, CODE(0), 1_000);
    n = scan(n, ghost, CODE(1), 7_000);
    n = accuse(n, hunters[0]!, ghost, 12_000);
    expect(n.catches).toBe(1);
    expect(n.zones.every((z) => z.owner === null)).toBe(true);
    expect(n.lockedUntil[ghost]).toBe(42_000);
    expect(n.totals[hunters[0]!]).toBe(100);
    // in prigione non scansiona
    expect(scan(n, ghost, CODE(2), 20_000).zones[2]!.owner).toBeNull();
    expect(scan(n, ghost, CODE(2), 42_000).zones[2]!.owner).toBe("ghost");
    // già in prigione: nessun doppio premio né penalità
    const again = accuse(n, hunters[1]!, ghost, 15_000);
    expect(again.catches).toBe(1);
    expect(again.feedback[hunters[1]!]!.kind).toBe("already");
    expect(again.totals[hunters[1]!] ?? 0).toBe(0);
  });

  it("un'accusa sbagliata blocca l'accusatore e costa punti", () => {
    const { s, hunters } = started();
    const n = accuse(s, hunters[0]!, hunters[1]!, 12_000);
    expect(n.catches).toBe(0);
    expect(n.totals[hunters[0]!]).toBe(-30);
    expect(n.lockedUntil[hunters[0]!]).toBe(32_000);
    expect(scan(n, hunters[0]!, CODE(0), 20_000).zones[0]!.owner).toBeNull();
    expect(n.events.at(-1)).toMatchObject({ kind: "miss", a: "Nick-" + hunters[0], b: "Nick-" + hunters[1] });
  });

  it("i fantasmi non accusano; non ci si accusa da soli; pausa tra le accuse", () => {
    const { s, ghost, hunters } = started();
    expect(accuse(s, ghost, hunters[0]!, 20_000)).toBe(s);
    expect(accuse(s, hunters[0]!, hunters[0]!, 20_000).feedback[hunters[0]!]!.kind).toBe("self");
    const n = accuse(s, hunters[0]!, ghost, 12_000);
    const spam = accuse(n, hunters[1]!, ghost, 13_000);
    expect(spam.catches).toBe(1); // l'altro cacciatore ha una pausa propria, ma il bersaglio è già in prigione
    const wait = accuse(accuse(s, hunters[0]!, hunters[1]!, 12_000), hunters[0]!, ghost, 13_000);
    expect(wait.catches).toBe(0); // bloccato dall'accusa sbagliata
  });

  it("a fine tempo vince chi ha tenuto le zone più a lungo e i punti finiscono nel registro", () => {
    const { s, ghost, hunters } = started();
    let n = scan(s, ghost, CODE(0), 1_000);
    n = scan(n, ghost, CODE(1), 7_000);
    n = scan(n, hunters[0]!, CODE(2), 11_000);
    n = gh.onTick(n, 100_000);
    expect(n.phase).toBe("reveal");
    expect(gh.isFinished(n)).toBe(false); // prima la rivelazione, poi il round si chiude
    expect(gh.onTick(n, 100_500)).toBe(n);
    expect(gh.isFinished(gh.onTick(n, 120_000))).toBe(true);
    expect(n.winner).toBe("ghost");
    expect(n.seconds.ghost).toBeGreaterThan(n.seconds.hunter);
    const pts = Object.fromEntries(gh.scores(n).map((d) => [d.playerId, d.points]));
    expect(pts[ghost]).toBeGreaterThan(200); // tenuta + premio vittoria
    expect(pts[hunters[1]!]).toBeUndefined(); // hunter sconfitto senza azioni: niente
    expect(gh.result(n).ranking[0]!.playerId).toBe(ghost);
  });

  it("pareggio: metà premio a tutti", () => {
    const { s } = started();
    const n = gh.onTick(s, 100_000);
    expect(n.winner).toBe("draw");
    expect(n.totals.g).toBe(100);
    expect(n.totals.a).toBe(100);
  });

  it("la regia può terminare la caccia in anticipo", () => {
    const { s, ghost } = started();
    const n = gh.onHostCommand(scan(s, ghost, CODE(0), 1_000), { type: "end" }, 20_000);
    expect(n).toMatchObject({ phase: "reveal", winner: "ghost", revealUntil: 40_000 });
    // la rivelazione mostra i ruoli di tutti, che prima erano segreti
    const screen = gh.screenView(n) as { players: { id: string; role: string }[] };
    expect(screen.players.find((p) => p.id === ghost)!.role).toBe("ghost");
    expect(gh.isFinished(gh.onHostCommand(n, { type: "end" }, 21_000))).toBe(true); // «Concludi»
    expect(gh.onHostCommand(s, { type: "start" }, 5)).toBe(s); // già avviata
  });

  it("chi non è in serata non influenza la partita", () => {
    const { s } = started();
    expect(scan(s, "estraneo", CODE(0), 20_000)).toBe(s);
    expect(accuse(s, "estraneo", "g", 20_000)).toBe(s);
  });

  it("ANTI-LEAK: lo schermo e i telefoni non mostrano ruoli, chi tiene una zona né lo stato delle zone", () => {
    const { s, ghost, hunters } = started();
    const n = scan(scan(s, ghost, CODE(0), 1_000), hunters[0]!, CODE(1), 11_000);
    const screen = JSON.stringify(gh.screenView(n));
    expect(screen).not.toContain("Nick-" + ghost);
    for (const secret of ["holder", '"role"', '"roles"', '"owner"', '"seconds"', '"seen"', "changedAt"]) expect(screen, secret).not.toContain(secret);
    expect(n.events).toEqual([]); // le conquiste non finiscono nel registro pubblico
    // un cacciatore che non è passato dalle zone non sa nulla né dei ruoli né delle zone
    const other = gh.viewFor(n, hunters[1]!, null) as { zones: { name: string; seen: unknown }[]; points: unknown };
    const hv = JSON.stringify(other);
    for (const secret of ["holder", '"owner":"ghost"', '"owner":"hunter"', '"seconds"', '"roles"', '"mates":["']) expect(hv, secret).not.toContain(secret);
    expect(other.zones.every((z) => z.seen === null)).toBe(true);
    expect(other.points).toBeNull(); // i punti personali tradirebbero una zona ancora tenuta
    expect(JSON.parse(hv).suspects.every((x: { jailedUntil: number }) => x.jailedUntil === 0)).toBe(true);
    // il fantasma conosce i compagni, non i cacciatori
    const two = gh.init({ ...config, ghostCount: 2 }, ctx, 0);
    const [g1, g2] = Object.keys(two.roles).filter((id) => two.roles[id] === "ghost");
    expect(gh.viewFor(two, g1!, null)).toMatchObject({ role: "ghost", mates: ["Nick-" + g2] });
  });

  it("controllare una zona di persona ne rivela lo stato solo a chi la guarda, senza conquistarla", () => {
    const { s, ghost, hunters } = started();
    const taken = scan(s, ghost, CODE(0), 1_000);
    const looked = look(taken, hunters[0]!, CODE(0), 12_000);
    // la zona resta del fantasma e il cacciatore non guadagna né perde nulla
    expect(looked.zones[0]).toMatchObject({ owner: "ghost", holder: ghost });
    expect(looked.totals[hunters[0]!] ?? 0).toBe(0);
    expect(looked.nextScanAt[hunters[0]!]).toBeUndefined(); // non consuma la pausa delle scansioni
    expect(looked.feedback[hunters[0]!]).toMatchObject({ kind: "look", zone: 0, owner: "ghost", since: 1_000 });
    const mine = gh.viewFor(looked, hunters[0]!, null) as { zones: { seen: { owner: string; at: number } | null }[] };
    expect(mine.zones[0]!.seen).toMatchObject({ owner: "ghost", at: 12_000 });
    expect(mine.zones[1]!.seen).toBeNull();
    // gli altri non vedono nulla di quell'osservazione
    const others = gh.viewFor(looked, hunters[1]!, null) as { zones: { seen: unknown }[] };
    expect(others.zones.every((z) => z.seen === null)).toBe(true);
    expect(JSON.stringify(gh.screenView(looked))).not.toContain("ghost\"");
  });

  it("quello che si è visto resta com'era finché non si torna a guardare", () => {
    const { s, ghost, hunters } = started();
    let n = look(s, hunters[0]!, CODE(0), 12_000); // libera
    n = scan(n, ghost, CODE(0), 13_000); // dopo, il fantasma la infesta
    const stale = gh.viewFor(n, hunters[0]!, null) as { zones: { seen: { owner: unknown } | null }[] };
    expect(stale.zones[0]!.seen!.owner).toBeNull();
    n = look(n, hunters[0]!, CODE(0), 20_000);
    expect((gh.viewFor(n, hunters[0]!, null) as typeof stale).zones[0]!.seen!.owner).toBe("ghost");
  });

  it("chi conquista una zona ne conosce poi lo stato; lo vede anche chi la trova già sua", () => {
    const { s, ghost } = started();
    const n = scan(s, ghost, CODE(0), 1_000);
    expect((gh.viewFor(n, ghost, null) as { zones: { seen: { owner: string } }[] }).zones[0]!.seen.owner).toBe("ghost");
    const again = scan(n, ghost, CODE(0), 9_000);
    expect(again.feedback[ghost]).toMatchObject({ kind: "own", owner: "ghost", since: 1_000 });
  });

  it("controllare è soggetto agli stessi limiti: vantaggio dei fantasmi, prigione, codice sconosciuto", () => {
    const { s, ghost, hunters } = started();
    expect(look(s, hunters[0]!, CODE(0), 5_000).feedback[hunters[0]!]).toMatchObject({ kind: "headStart" });
    expect(look(s, hunters[0]!, "ZZZZ", 12_000).feedback[hunters[0]!]!.kind).toBe("unknown");
    const jailed = accuse(s, hunters[0]!, ghost, 12_000);
    expect(look(jailed, ghost, CODE(0), 20_000).feedback[ghost]!.kind).toBe("locked");
    expect(look(s, "estraneo", CODE(0), 12_000)).toBe(s);
  });

  it("alla rivelazione tutto diventa pubblico: stato delle zone, secondi e punti", () => {
    const { s, ghost } = started();
    const n = gh.onTick(scan(s, ghost, CODE(0), 1_000), 100_000);
    expect(n.phase).toBe("reveal");
    const screen = gh.screenView(n) as { zones: { name: string; owner: string | null }[]; seconds: { ghost: number } };
    expect(screen.zones[0]).toEqual({ name: "Cantina", owner: "ghost" });
    expect(screen.zones[1]).toEqual({ name: "Giardino", owner: null });
    expect(screen.seconds.ghost).toBeGreaterThan(0);
    expect((gh.viewFor(n, ghost, null) as { points: number }).points).toBeGreaterThan(0);
  });

  it("la vista del telefono porta i valori delle regole (per la pagina «Regole»), uguali per tutti e senza segreti", () => {
    const { s, ghost, hunters } = started();
    const g = gh.viewFor(s, ghost, null) as { rules: Record<string, number> };
    const h = gh.viewFor(s, hunters[0]!, null) as { rules: Record<string, number> };
    expect(g.rules).toEqual(h.rules);
    expect(g.rules).toMatchObject({ zoneCount: 4, ghostCount: 1, durationSec: 100, headStartSec: 10, jailSec: 30, stunSec: 20, catchPoints: 100, wrongPenalty: 30, holdPointsPerSec: 2 });
    // anche in preparazione, prima del via
    expect((gh.viewFor(gh.init(config, ctx, 0), ghost, null) as { rules: { zoneCount: number } }).rules.zoneCount).toBe(4);
  });

  it("la regia vede sempre lo stato delle zone", () => {
    const { s, ghost } = started();
    const info = gh.hostView(scan(s, ghost, CODE(0), 1_000)).info as { Zone: string };
    expect(info.Zone).toContain("Cantina 👻");
    expect(info.Zone).toContain("Giardino libera");
  });

  it("dopo la cattura il fantasma diventa pubblico, e solo lui", () => {
    const { s, ghost, hunters } = started();
    const n = accuse(s, hunters[0]!, ghost, 12_000);
    const screen = gh.screenView(n) as { caught: { nickname: string }[] };
    expect(screen.caught.map((c) => c.nickname)).toEqual(["Nick-" + ghost]);
    const view = gh.viewFor(n, hunters[1]!, null) as { suspects: { id: string; jailedUntil: number }[] };
    expect(view.suspects.find((x) => x.id === ghost)!.jailedUntil).toBe(42_000);
    // un cacciatore bloccato per un'accusa sbagliata NON risulta «in prigione» agli altri
    const m = accuse(s, hunters[0]!, hunters[1]!, 12_000);
    const v2 = gh.viewFor(m, hunters[2]!, null) as { suspects: { id: string; jailedUntil: number }[] };
    expect(v2.suspects.find((x) => x.id === hunters[0])!.jailedUntil).toBe(0);
  });
});

describe("caccia-fantasmi: blocco delle zone e peso delle fazioni", () => {
  const locked = gh.configSchema.parse({ ...config, zoneLockSec: 30 });

  it("dopo una conquista la zona è bloccata: chi è lì lo vede ma non la riprende", () => {
    const { s, ghost, hunters } = started(locked);
    const taken = scan(s, ghost, CODE(0), 1_000);
    expect(taken.zones[0]!.lockUntil).toBe(31_000);
    const early = scan(taken, hunters[0]!, CODE(0), 12_000);
    expect(early.zones[0]).toMatchObject({ owner: "ghost", holder: ghost });
    expect(early.totals[hunters[0]!] ?? 0).toBe(0);
    expect(early.feedback[hunters[0]!]).toMatchObject({ kind: "zoneLocked", owner: "ghost", until: 31_000 });
    // ha comunque visto com'è la zona
    const seen = (gh.viewFor(early, hunters[0]!, null) as { zones: { seen: { owner: string; lockUntil: number } | null }[] }).zones[0]!.seen!;
    expect(seen).toMatchObject({ owner: "ghost", lockUntil: 31_000 });
    // non consuma la pausa tra scansioni
    expect(early.nextScanAt[hunters[0]!]).toBeUndefined();
    // a blocco finito la riconquista
    const later = scan(early, hunters[0]!, CODE(0), 31_000);
    expect(later.zones[0]).toMatchObject({ owner: "hunter", holder: hunters[0], lockUntil: 61_000 });
  });

  it("il blocco vale anche per la prima conquista di una zona libera, e controllare mostra fino a quando", () => {
    const { s, ghost, hunters } = started(locked);
    const taken = scan(s, ghost, CODE(1), 2_000);
    const looked = look(taken, hunters[0]!, CODE(1), 15_000);
    expect(looked.feedback[hunters[0]!]).toMatchObject({ kind: "look", owner: "ghost", until: 32_000 });
    const expired = look(taken, hunters[0]!, CODE(1), 40_000);
    expect(expired.feedback[hunters[0]!]!.until).toBeNull();
    // una zona mai conquistata non è bloccata
    expect(look(s, hunters[0]!, CODE(2), 15_000).feedback[hunters[0]!]!.until).toBeNull();
  });

  it("le zone liberate da una cattura non sono bloccate", () => {
    const { s, ghost, hunters } = started(locked);
    const taken = scan(s, ghost, CODE(0), 1_000);
    const caught = accuse(taken, hunters[0]!, ghost, 12_000);
    expect(caught.zones[0]).toMatchObject({ owner: null, holder: null, lockUntil: 0 });
    expect(scan(caught, hunters[1]!, CODE(0), 13_000).zones[0]!.owner).toBe("hunter");
  });

  it("senza blocco (0 s) una zona si riprende subito", () => {
    const { s, ghost, hunters } = started();
    const n = scan(scan(s, ghost, CODE(0), 1_000), hunters[0]!, CODE(0), 11_000);
    expect(n.zones[0]!.owner).toBe("hunter");
  });

  it("il peso automatico dei fantasmi cresce con meno fantasmi per zona e sta tra 1 e 3", () => {
    const w = (zones: number, ghosts: number) => ghostWeight({ ghostWeight: 0, zones: Array.from({ length: zones }) }, ghosts);
    expect(w(4, 6)).toBeCloseTo(1.37, 2);
    expect(w(3, 2)).toBeCloseTo(1.7, 2);
    expect(w(4, 4)).toBeCloseTo(1.5, 2);
    expect(w(8, 1)).toBe(3); // tetto
    expect(w(2, 20)).toBeGreaterThanOrEqual(1);
    expect(w(5, 0)).toBe(1); // senza fantasmi
    expect(ghostWeight({ ghostWeight: 2.5, zones: [1] }, 3)).toBe(2.5); // scelto a mano
  });

  it("i secondi dei fantasmi pesano di più e possono ribaltare il vincitore", () => {
    // Stessi fatti in due partite: il cacciatore tiene una zona dal secondo 11, il fantasma un'altra dal 40.
    const play = (cfg: typeof config) => {
      const { s, ghost, hunters } = started(cfg);
      let n = scan(s, hunters[0]!, CODE(1), 11_000);
      n = scan(n, ghost, CODE(0), 40_000);
      return gh.onTick(n, 100_000);
    };
    const plain = play(config); // peso 1: cacciatore 89 s, fantasma 60 s
    expect(plain.seconds).toEqual({ ghost: 60, hunter: 89 });
    expect(plain.winner).toBe("hunter");
    const weighted = play(gh.configSchema.parse({ ...config, ghostWeight: 2 })); // fantasma 60 × 2 = 120
    expect(weighted.seconds).toEqual({ ghost: 120, hunter: 89 });
    expect(weighted.winner).toBe("ghost");
  });

  it("alla rivelazione i secondi sono interi e il peso è pubblico; le regole per il telefono lo includono", () => {
    const { s, ghost } = started(gh.configSchema.parse({ ...config, ghostWeight: 1.5 }));
    const n = gh.onTick(scan(s, ghost, CODE(0), 1_000), 100_000);
    const screen = gh.screenView(n) as { seconds: { ghost: number } };
    expect(Number.isInteger(screen.seconds.ghost)).toBe(true);
    expect((screen as unknown as { weight: unknown }).weight).toBe(1.5); // un numero, non l'oggetto dei pesi
    const rules = (gh.viewFor(gh.onHostCommand(gh.init(config, ctx, 0), { type: "start" }, 0), ghost, null) as { rules: { zoneLockSec: number; ghostWeight: number } }).rules;
    expect(rules).toMatchObject({ zoneLockSec: 0, ghostWeight: 1 });
  });
});
