import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { type ParoleMannareState as State, type Role, autoWerewolves, paroleMannare as pm, playerSummary, reserves, werewolfCount } from "./index.js";

const ids = ["p1", "p2", "p3", "p4", "p5"];
const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, nickname: `Nick-p${i + 1}`, teamId: null }));
const ctxOf = (n: number, seen?: string[]): MinigameContext => ({ players: make(n), teams: [], seed: 7, seen });

const config = pm.configSchema.parse({ ...pm.sampleConfig, closeTokens: 1, farTokens: 1 });
const meta = (at: number) => ({ receivedAt: at, claimedTime: at - 10, rtt: 20 });

const input = (s: State, id: string, i: Parameters<typeof pm.onInput>[2], at: number) => pm.onInput(s, id, i, meta(at));
const cmd = (s: State, c: Parameters<typeof pm.onHostCommand>[1], at: number) => pm.onHostCommand(s, c, at);
const give = (s: State, playerId: string, token: Parameters<typeof pm.onInput>[2] extends infer I ? (I extends { type: "give"; token: infer T } ? T : never) : never, at: number) =>
  input(s, s.mayorId, { type: "give", playerId, token }, at);

/** Partita a 5 giocatori portata alle domande a t=1000, con il Sindaco, un Lupo e il Veggente noti. */
function inQuestions(cfg = config, n = 5) {
  let s = pm.init(cfg, ctxOf(n), 0);
  s = cmd(s, { type: "deal" }, 0);
  s = input(s, s.mayorId, { type: "pick-word", index: 0 }, 100);
  for (const id of s.players) s = input(s, id, { type: "seen" }, 200);
  const roleOf = (r: Role) => s.players.filter((id) => s.roles[id] === r);
  const others = s.players.filter((id) => id !== s.mayorId);
  return { s: { ...s, phaseStartedAt: 1000, phaseEndsAt: 1000 + cfg.questionSeconds * 1000 } as State, wolves: roleOf("werewolf"), seer: roleOf("seer")[0]!, others };
}

describe("parole-mannare: configurazione e ruoli", () => {
  it("la configurazione di esempio è valida; servono abbastanza parole per la difficoltà", () => {
    expect(pm.configSchema.safeParse(pm.sampleConfig).success).toBe(true);
    const poche = { ...pm.sampleConfig, words: [{ text: "A", difficulty: "facile" }, { text: "B", difficulty: "facile" }, { text: "C", difficulty: "facile" }], difficulty: "media" };
    expect(pm.configSchema.safeParse(poche).success).toBe(false);
    expect(pm.configSchema.safeParse({ ...poche, difficulty: "mista" }).success).toBe(true);
  });

  it("numero di Lupi: 1 da 4 a 6, 2 da 7 a 11, 3 con 12; un numero fisso troppo alto viene ridotto", () => {
    for (const [players, wolves] of [[4, 1], [6, 1], [7, 2], [11, 2], [12, 3]] as const) {
      expect(autoWerewolves(players)).toBe(wolves);
      const s = pm.init(config, ctxOf(players), 0);
      expect(Object.values(s.roles).filter((r) => r === "werewolf")).toHaveLength(wolves);
      expect(Object.values(s.roles).filter((r) => r === "seer")).toHaveLength(1);
    }
    expect(werewolfCount("3", 5)).toBe(2);
    expect(werewolfCount("3", 4)).toBe(1);
    expect(werewolfCount("1", 12)).toBe(1);
  });

  it("ruoli e Sindaco sono deterministici; il Sindaco ha un ruolo e la regia lo può cambiare solo prima di distribuire", () => {
    const a = pm.init(config, ctxOf(5), 0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(pm.init(config, ctxOf(5), 0)));
    expect(a.roles[a.mayorId]).toBeDefined();
    const b = cmd(a, { type: "set-mayor" }, 1);
    expect(b.mayorId).not.toBe(a.mayorId);
    expect(cmd(a, { type: "set-mayor", playerId: "p3" }, 1).mayorId).toBe("p3");
    const dealt = cmd(a, { type: "deal" }, 2);
    expect(cmd(dealt, { type: "set-mayor", playerId: "p3" }, 3)).toBe(dealt);
  });

  it("le parole già viste non si riproporre; shownItems le dichiara", () => {
    const first = pm.init(config, ctxOf(5), 0);
    const second = pm.init(config, ctxOf(5, pm.shownItems!(first)), 0);
    expect(second.wordOptions.some((w) => first.wordOptions.includes(w))).toBe(false);
    expect(second.wordOptions).toHaveLength(3);
  });
});

describe("parole-mannare: scelta della parola e notte", () => {
  it("solo il Sindaco sceglie; allo scadere sceglie il server", () => {
    let s = cmd(pm.init(config, ctxOf(5), 0), { type: "deal" }, 0);
    const other = s.players.find((id) => id !== s.mayorId)!;
    expect(input(s, other, { type: "pick-word", index: 1 }, 10)).toBe(s);
    expect(input(s, s.mayorId, { type: "pick-word", index: 9 }, 10)).toBe(s);
    expect(pm.onTick(s, 1000)).toBe(s);
    const picked = pm.onTick(s, config.wordPickSeconds * 1000);
    expect(picked.phase).toBe("night");
    expect(picked.word).toBe(s.wordOptions[0]);
    s = input(s, s.mayorId, { type: "pick-word", index: 2 }, 10);
    expect(s.word).toBe(s.wordOptions[2]);
  });

  it("la notte finisce quando tutti hanno visto o allo scadere", () => {
    let s = cmd(pm.init(config, ctxOf(5), 0), { type: "deal" }, 0);
    s = input(s, s.mayorId, { type: "pick-word", index: 0 }, 10);
    for (const id of s.players.slice(0, 4)) s = input(s, id, { type: "seen" }, 20);
    expect(s.phase).toBe("night");
    expect(input(s, s.players[0]!, { type: "seen" }, 21)).toBe(s);
    expect(input(s, s.players[4]!, { type: "seen" }, 22).phase).toBe("questions");
    expect(pm.onTick(s, 10 + config.nightSeconds * 1000).phase).toBe("questions");
  });
});

describe("parole-mannare: gettoni, riserve e annulla", () => {
  it("dare, annullare e ridare riporta alle riserve iniziali", () => {
    const { s: s0, others } = inQuestions();
    const start = reserves(s0);
    let s = give(s0, others[0]!, "yes", 1100);
    s = give(s, others[1]!, "maybe", 1200);
    s = give(s, others[2]!, "close", 1300);
    expect(reserves(s)).toEqual({ ...start, yesNo: start.yesNo - 1, maybe: start.maybe! - 1, close: 0 });
    expect(playerSummary(s, others[0]!).yes).toBe(1);
    s = input(s, s.mayorId, { type: "undo" }, 1400);
    s = input(s, s.mayorId, { type: "undo" }, 1500);
    s = input(s, s.mayorId, { type: "undo" }, 1600);
    expect(reserves(s)).toEqual(start);
    expect(s.log).toHaveLength(3);
    expect(s.log.every((e) => e.undone)).toBe(true);
    expect(input(s, s.mayorId, { type: "undo" }, 1700)).toBe(s);
    // il numero d'ordine non si riusa: il gettone ridato ha un seq nuovo
    expect(give(s, others[0]!, "yes", 1800).log.at(-1)!.seq).toBe(4);
    expect(playerSummary(give(s, others[0]!, "yes", 1800), others[0]!).yes).toBe(1);
  });

  it("«Ci sei quasi» e «Lontanissimo» sono uno solo e non consumano la riserva; «Ci sei quasi» annullato torna libero", () => {
    const { s: s0, others } = inQuestions();
    let s = give(s0, others[0]!, "close", 1100);
    expect(give(s, others[1]!, "close", 1200)).toBe(s);
    s = give(s, others[1]!, "far", 1200);
    expect(reserves(s).yesNo).toBe(config.yesNoPool);
    s = input(s, s.mayorId, { type: "undo" }, 1300);
    s = input(s, s.mayorId, { type: "undo" }, 1400);
    expect(reserves(s).close).toBe(1);
    expect(give(s, others[1]!, "close", 1500)).not.toBe(s);
  });

  it("rifiuta: gettone al Sindaco, sconosciuti, da chi non è il Sindaco, fuori fase, in pausa", () => {
    const { s, others } = inQuestions();
    expect(give(s, s.mayorId, "yes", 1100)).toBe(s);
    expect(give(s, "estraneo", "yes", 1100)).toBe(s);
    expect(input(s, others[0]!, { type: "give", playerId: others[1]!, token: "yes" }, 1100)).toBe(s);
    expect(input(s, others[0]!, { type: "undo" }, 1100)).toBe(s);
    const night = cmd(pm.init(config, ctxOf(5), 0), { type: "deal" }, 0);
    expect(give(night, night.players.find((p) => p !== night.mayorId)!, "yes", 5)).toBe(night);
    const paused = cmd(s, { type: "pause" }, 2000);
    expect(give(paused, others[0]!, "yes", 2100)).toBe(paused);
  });

  it("i Sì/No esauriti chiudono le domande, i Forse esauriti no", () => {
    const cfg = pm.configSchema.parse({ ...pm.sampleConfig, yesNoPool: 2, maybePool: 1 });
    const { s: s0, others } = inQuestions(cfg);
    let s = give(s0, others[0]!, "maybe", 1100);
    expect(give(s, others[0]!, "maybe", 1200)).toBe(s);
    expect(s.phase).toBe("questions");
    s = give(s, others[0]!, "yes", 1300);
    expect(s.phase).toBe("questions");
    s = give(s, others[1]!, "no", 1400);
    expect(s.phase).toBe("werewolf-vote");
    expect(s.phaseEndsAt).toBe(1400 + cfg.voteSeconds * 1000);
  });

  it("Forse illimitati e disattivabili", () => {
    const unl = pm.configSchema.parse({ ...pm.sampleConfig, maybeUnlimited: true });
    const { s, others } = inQuestions(unl);
    expect(reserves(s).maybe).toBeNull();
    let t = s;
    for (let i = 0; i < 20; i++) t = give(t, others[0]!, "maybe", 1100 + i);
    expect(t.log).toHaveLength(20);
    const off = pm.configSchema.parse({ ...pm.sampleConfig, maybePool: 0 });
    const q = inQuestions(off);
    expect(give(q.s, q.others[0]!, "maybe", 1100)).toBe(q.s);
  });

  it("l'annulla non regala tempo e un tempo scaduto chiude le domande", () => {
    const { s: s0, others } = inQuestions();
    const s = input(give(s0, others[0]!, "yes", 1100), s0.mayorId, { type: "undo" }, 1200);
    expect(s.phaseEndsAt).toBe(s0.phaseEndsAt);
    expect(pm.onTick(s, s0.phaseEndsAt!).phase).toBe("werewolf-vote");
    expect(give(s, others[0]!, "yes", s0.phaseEndsAt! + 1)).toBe(s);
  });

  it("la pausa congela il tempo, la ripresa lo restituisce", () => {
    const { s: s0 } = inQuestions();
    const paused = cmd(s0, { type: "pause" }, 11_000);
    expect(paused.pausedRemainingMs).toBe(s0.phaseEndsAt! - 11_000);
    expect(pm.onTick(paused, 9_999_999)).toBe(paused);
    const resumed = cmd(paused, { type: "resume" }, 50_000);
    expect(resumed.phaseEndsAt).toBe(50_000 + paused.pausedRemainingMs!);
  });
});

describe("parole-mannare: «Esatto»", () => {
  it("annullato nella finestra riprende le domande col tempo residuo", () => {
    const { s: s0, others } = inQuestions();
    const s = give(s0, others[0]!, "correct", 61_000);
    expect(s.phase).toBe("correct-grace");
    expect(s.correctBy).toBe(others[0]);
    expect(s.phaseEndsAt).toBe(61_000 + config.correctGraceSeconds * 1000);
    const back = input(s, s.mayorId, { type: "undo" }, 62_000);
    expect(back.phase).toBe("questions");
    expect(back.phaseEndsAt).toBe(62_000 + (s0.phaseEndsAt! - 61_000));
    expect(back.correctBy).toBeNull();
    expect(reserves(back)).toEqual(reserves(s0));
  });

  it("dopo la finestra il Sindaco non può più annullarlo, la regia sì", () => {
    const { s: s0, others } = inQuestions();
    let s = give(s0, others[0]!, "correct", 61_000);
    s = pm.onTick(s, 61_000 + config.correctGraceSeconds * 1000);
    expect(s.phase).toBe("seer-hunt");
    expect(input(s, s.mayorId, { type: "undo" }, 70_000)).toBe(s);
    const fixed = cmd(s, { type: "undo" }, 70_000);
    expect(fixed.phase).toBe("questions");
    expect(fixed.phaseEndsAt).toBe(70_000 + (s0.phaseEndsAt! - 61_000));
  });
});

describe("parole-mannare: caccia al Veggente", () => {
  function hunt(n = 5) {
    const q = inQuestions(config, n);
    let s = give(q.s, q.others[0]!, "correct", 5000);
    s = pm.onTick(s, 5000 + config.correctGraceSeconds * 1000);
    return { ...q, s };
  }

  it("votano solo i Lupi, solo su non-Lupi; vale l'ultimo voto", () => {
    const { s, wolves, seer, others } = hunt();
    const villager = s.players.find((id) => s.roles[id] === "villager")!;
    expect(input(s, villager, { type: "vote", targetId: seer }, 9000)).toBe(s);
    expect(input(s, wolves[0]!, { type: "vote", targetId: wolves[0]! }, 9000)).toBe(s);
    expect(input(s, wolves[0]!, { type: "vote", targetId: "estraneo" }, 9000)).toBe(s);
    expect(others.length).toBe(4);
  });

  it("se i Lupi indicano il Veggente vincono i Lupi, altrimenti il villaggio", () => {
    const { s, wolves, seer } = hunt();
    const win = input(s, wolves[0]!, { type: "vote", targetId: seer }, 9000);
    expect(win.phase).toBe("reveal");
    expect(win.outcome!.winner).toBe("werewolves");
    const innocent = s.players.find((id) => s.roles[id] === "villager")!;
    const lose = input(s, wolves[0]!, { type: "vote", targetId: innocent }, 9000);
    expect(lose.outcome!.winner).toBe("village");
    const nobody = pm.onTick(s, s.phaseEndsAt!);
    expect(nobody.outcome!.winner).toBe("village");
  });

  it("con 2 Lupi in disaccordo: ballottaggio solo tra i pari, poi l'esito; ancora pari = villaggio", () => {
    const { s, wolves, seer } = hunt(7);
    expect(wolves).toHaveLength(2);
    const villager = s.players.find((id) => s.roles[id] === "villager")!;
    let t = input(s, wolves[0]!, { type: "vote", targetId: seer }, 9000);
    t = input(t, wolves[1]!, { type: "vote", targetId: villager }, 9100);
    expect(t.phase).toBe("seer-hunt");
    expect(t.runoff!.sort()).toEqual([seer, villager].sort());
    expect(t.votes).toEqual({});
    expect(t.phaseEndsAt).toBe(9100 + config.runoffSeconds * 1000);
    expect(input(t, wolves[0]!, { type: "vote", targetId: s.players.find((id) => ![seer, villager].includes(id) && s.roles[id] !== "werewolf")! }, 9200)).toBe(t);
    // secondo pareggio: i Lupi non hanno trovato il Veggente
    let tie = input(t, wolves[0]!, { type: "vote", targetId: seer }, 9200);
    tie = input(tie, wolves[1]!, { type: "vote", targetId: villager }, 9300);
    expect(tie.outcome!.winner).toBe("village");
    // ballottaggio deciso
    const ok = input(input(t, wolves[0]!, { type: "vote", targetId: seer }, 9200), wolves[1]!, { type: "vote", targetId: seer }, 9300);
    expect(ok.outcome!.winner).toBe("werewolves");
  });
});

describe("parole-mannare: voto sul Lupo", () => {
  function vote(n = 5) {
    const q = inQuestions(config, n);
    const s = cmd(q.s, { type: "end-questions" }, 5000);
    return { ...q, s };
  }

  it("chiunque vota (anche il Sindaco), non se stesso; il più votato Lupo = villaggio", () => {
    const { s, wolves } = vote();
    expect(s.phase).toBe("werewolf-vote");
    expect(input(s, "p1", { type: "vote", targetId: "p1" }, 6000)).toBe(s);
    let t = s;
    for (const id of s.players) t = input(t, id, { type: "vote", targetId: id === wolves[0] ? s.players.find((p) => p !== id)! : wolves[0]! }, 6000);
    expect(t.phase).toBe("reveal");
    expect(t.outcome!.winner).toBe("village");
  });

  it("se il più votato non è un Lupo vincono i Lupi; nessun voto = Lupi", () => {
    const { s, wolves } = vote();
    const innocent = s.players.find((id) => s.roles[id] === "villager")!;
    let t = s;
    for (const id of s.players) t = input(t, id, { type: "vote", targetId: id === innocent ? wolves[0]! : innocent }, 6000);
    expect(t.outcome!.winner).toBe("werewolves");
    expect(pm.onTick(s, s.phaseEndsAt!).outcome!.winner).toBe("werewolves");
  });

  it("pareggio: ballottaggio solo tra i pari con tutti i votanti; secondo pareggio = Lupi", () => {
    const { s } = vote(6);
    const [a, b, c, d, e, f] = s.players as [string, string, string, string, string, string];
    let t = s;
    // a e b ricevono 3 voti a testa
    for (const [voter, target] of [[a, b], [b, a], [c, a], [d, b], [e, a], [f, b]] as const) t = input(t, voter, { type: "vote", targetId: target }, 6000);
    expect(t.phase).toBe("werewolf-vote");
    expect(t.runoff!.sort()).toEqual([a, b].sort());
    expect(t.votes).toEqual({});
    expect(input(t, c, { type: "vote", targetId: d }, 6100)).toBe(t);
    let again = t;
    for (const [voter, target] of [[a, b], [b, a], [c, a], [d, b], [e, a], [f, b]] as const) again = input(again, voter, { type: "vote", targetId: target }, 6200);
    expect(again.phase).toBe("reveal");
    expect(again.outcome!.winner).toBe("werewolves");
    // ballottaggio risolto: tutti su a
    let done = t;
    for (const voter of [b, c, d, e, f]) done = input(done, voter, { type: "vote", targetId: a }, 6200);
    done = input(done, a, { type: "vote", targetId: b }, 6200);
    expect(done.outcome!.winner).toBe(s.roles[a] === "werewolf" ? "village" : "werewolves");
  });

  it("la regia può chiudere il voto prima", () => {
    const { s } = vote();
    expect(cmd(s, { type: "close-vote" }, 7000).phase).toBe("reveal");
  });
});

describe("parole-mannare: punti", () => {
  it("la fazione vincitrice prende i punti, il Sindaco anche il bonus", () => {
    const cfg = pm.configSchema.parse({ ...pm.sampleConfig, winPoints: 100, mayorBonus: 20 });
    const q = inQuestions(cfg);
    let s = cmd(q.s, { type: "close-vote" }, 3000);
    s = cmd(cmd(q.s, { type: "end-questions" }, 3000), { type: "close-vote" }, 3500);
    expect(s.outcome!.winner).toBe("werewolves");
    const scores = pm.scores(s);
    const wolves = s.players.filter((id) => s.roles[id] === "werewolf");
    expect(scores.map((d) => d.playerId).sort()).toEqual([...wolves].sort());
    for (const d of scores) expect(d.points).toBe(d.playerId === s.mayorId ? 120 : 100);
    expect(pm.result(s).ranking[0]!.rank).toBe(1);
    const done = cmd(s, { type: "next" }, 4000);
    expect(pm.isFinished(done)).toBe(true);
  });
});

describe("parole-mannare: anti-leak", () => {
  const WORD = "SEGRETISSIMA";
  const roleWord = (r: Role) => (r === "werewolf" ? "werewolf" : r === "seer" ? "seer" : "villager");

  /** Percorre l'intera partita e controlla a ogni passo cosa vedono TV e telefoni. */
  function check(label: string, s: State) {
    const json = (v: unknown) => JSON.stringify(v);
    const screen = json(pm.screenView(s));
    const revealed = s.phase === "reveal" || s.phase === "done";
    const wordOpen = s.phase === "werewolf-vote" || revealed;
    if (!wordOpen) expect(screen, `${label}: parola sulla TV`).not.toContain(WORD);
    for (const o of s.wordOptions) if (s.word !== o && s.phase !== "word") expect(screen, `${label}: opzione sulla TV`).not.toContain(o);
    if (!revealed) expect(screen, `${label}: ruoli sulla TV`).not.toMatch(/"role"|"roles"|"(werewolf|seer|villager)"/);
    // nessun voto in chiaro sulla TV
    expect(screen, `${label}: voti sulla TV`).not.toContain('"votes"');

    for (const id of s.players) {
      const view = pm.viewFor(s, id, null) as { me: { role: string | null; word: string | null; wordOptions: string[] | null; mates: string[]; teamVotes: unknown } };
      const text = json(view);
      const role = s.roles[id]!;
      const knows = id === s.mayorId || (role !== "villager" && !["deal", "word"].includes(s.phase));
      if (!knows && !wordOpen) expect(text, `${label}: ${id} vede la parola`).not.toContain(WORD);
      if (s.phase !== "word" || id !== s.mayorId) expect(view.me.wordOptions, `${label}: ${id} vede le proposte`).toBeNull();
      if (!revealed) {
        expect(text, `${label}: ${id} vede ruoli altrui`).not.toContain('"roles"');
        if (role !== "werewolf") expect(view.me.mates, `${label}: ${id} vede i Lupi`).toEqual([]);
        if (role !== "werewolf" || s.phase !== "seer-hunt") expect(view.me.teamVotes).toBeNull();
        // un giocatore non vede il ruolo prima della notte
        if (["deal", "word"].includes(s.phase)) expect(view.me.role).toBeNull();
        else expect(view.me.role).toBe(roleWord(role));
      }
      // i Paesani e il Veggente non conoscono i Lupi prima della loro rivelazione
      if (!revealed && s.phase !== "seer-hunt" && role !== "werewolf") {
        for (const w of s.players.filter((p) => s.roles[p] === "werewolf")) expect(text, `${label}: ${id} vede il Lupo ${w}`).not.toContain(`"wolves":["`);
      }
    }
  }

  it("a ogni fase la TV e i telefoni vedono solo ciò che spetta loro", () => {
    const cfg = pm.configSchema.parse({ ...pm.sampleConfig, words: [{ text: WORD, difficulty: "media" }, { text: "Altra1", difficulty: "media" }, { text: "Altra2", difficulty: "media" }] });
    let s = pm.init(cfg, ctxOf(7), 0);
    check("deal", s);
    s = cmd(s, { type: "deal" }, 1);
    check("word", s);
    s = input(s, s.mayorId, { type: "pick-word", index: s.wordOptions.indexOf(WORD) }, 2);
    check("night", s);
    for (const id of s.players) s = input(s, id, { type: "seen" }, 3);
    check("questions", s);
    const other = s.players.find((id) => id !== s.mayorId)!;
    s = give(s, other, "yes", 4);
    check("dopo un gettone", s);
    const hunted = give(s, other, "correct", 5);
    check("correct-grace", hunted);
    const seerHunt = pm.onTick(hunted, 5 + cfg.correctGraceSeconds * 1000);
    expect(seerHunt.phase).toBe("seer-hunt");
    check("seer-hunt", seerHunt);
    const wolf = seerHunt.players.find((id) => seerHunt.roles[id] === "werewolf")!;
    const target = seerHunt.players.find((id) => seerHunt.roles[id] !== "werewolf")!;
    const voted = input(seerHunt, wolf, { type: "vote", targetId: target }, 9);
    check("voto dei Lupi", voted);
    // un Paesano non vede il voto dei Lupi, né quanti ne mancano oltre al conteggio pubblico
    const villager = voted.players.find((id) => voted.roles[id] === "villager" && id !== voted.mayorId);
    if (villager) expect(JSON.stringify(pm.viewFor(voted, villager, null))).toMatch(/"teamVotes":null.*"myVote":null|"myVote":null.*"teamVotes":null/);
    let vote = cmd(s, { type: "end-questions" }, 10);
    check("werewolf-vote", vote);
    vote = input(vote, other, { type: "vote", targetId: vote.players.find((id) => id !== other)! }, 11);
    check("voto parziale", vote);
    expect(JSON.stringify(pm.screenView(vote))).not.toContain(`"${other}":"`);
    check("reveal", cmd(vote, { type: "close-vote" }, 12));
  });
});
