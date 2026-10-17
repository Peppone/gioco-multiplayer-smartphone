import { useMemo, useState } from "react";
import { ClockSync, type Leaderboards, REACTIONS, type ThemeId } from "@gioco/shared";
import { type SoundName, audio } from "../audio/audio";
import { minigameViews } from "../minigames/registry";
import { SHADOW_SCENES, type ShadowSceneId, shadowScene } from "../minigames/shadow-tournament/previewData";
import { Leaderboard } from "../ui/Leaderboard";
import { MuteButton } from "../ui/MuteButton";
import { Stage } from "../ui/Stage";

const THEMES: { id: ThemeId; label: string }[] = [
  { id: "gameshow", label: "Game show" },
  { id: "pixel", label: "Pixel" },
  { id: "manga", label: "Manga" },
  { id: "retro80", label: "Retro 80" },
];

const SOUNDS: SoundName[] = ["start", "tick", "buzz", "correct", "wrong", "reveal", "fanfare"];

const BOARDS: Leaderboards = {
  teams: [
    { id: "t1", name: "Rossi", avatar: "🔥", color: "#ef4444", points: 2350, rank: 1 },
    { id: "t2", name: "Blu", avatar: "🌊", color: "#3b82f6", points: 1980, rank: 2 },
  ],
  players: [
    { id: "p1", name: "Gina", avatar: "🦊", color: "#ef4444", points: 1200, rank: 1 },
    { id: "p2", name: "Marco", avatar: "🐻", color: "#3b82f6", points: 1120, rank: 2 },
    { id: "p3", name: "Sofia", avatar: "🐼", color: "#3b82f6", points: 860, rank: 3 },
    { id: "p4", name: "Luca", avatar: "🐸", color: "#ef4444", points: 860, rank: 3 },
  ],
};
const BOARDS_BEFORE: Leaderboards = {
  teams: [
    { ...BOARDS.teams[1]!, points: 1500, rank: 1 },
    { ...BOARDS.teams[0]!, points: 1350, rank: 2 },
  ],
  players: BOARDS.players.map((p, i) => ({ ...p, points: p.points - 300 + i * 40 })),
};

type Scene =
  | "quiz-question"
  | "quiz-reveal"
  | "buzzer-open"
  | "buzzer-answering"
  | "vf-question"
  | "vf-reveal"
  | "stima-question"
  | "stima-reveal"
  | "poll-voting"
  | "poll-reveal"
  | "duel-draft"
  | "duel-battle"
  | "duel-replay"
  | "duel-ended"
  | "stanze-dark"
  | "stanze-items"
  | "stanze-setup"
  | "stanze-compass"
  | "stanze-pending"
  | "stanze-sight"
  | "stanze-mail"
  | "stanze-event"
  | "stanze-history"
  | "stanze-reveal"
  | ShadowSceneId
  | "results";

const SCENES: { id: Scene; label: string }[] = [
  { id: "quiz-question", label: "Quiz: domanda" },
  { id: "quiz-reveal", label: "Quiz: rivelazione" },
  { id: "buzzer-open", label: "Buzzer: aperto" },
  { id: "buzzer-answering", label: "Buzzer: risponde" },
  { id: "vf-question", label: "Vero/Falso: domanda" },
  { id: "vf-reveal", label: "Vero/Falso: rivelazione" },
  { id: "stima-question", label: "Stima: domanda" },
  { id: "stima-reveal", label: "Stima: rivelazione" },
  { id: "poll-voting", label: "Sondaggio: voto" },
  { id: "poll-reveal", label: "Sondaggio: risultati" },
  { id: "duel-draft", label: "Duello: draft" },
  { id: "duel-battle", label: "Duello: battaglia" },
  { id: "duel-replay", label: "Duello: scontro" },
  { id: "duel-ended", label: "Duello: fine" },
  { id: "stanze-dark", label: "Stanze: mappa nascosta" },
  { id: "stanze-items", label: "Stanze: oggetti" },
  { id: "stanze-setup", label: "Stanze: preparazione" },
  { id: "stanze-compass", label: "Stanze: croce" },
  { id: "stanze-pending", label: "Stanze: in attesa" },
  { id: "stanze-sight", label: "Stanze: lettera" },
  { id: "stanze-mail", label: "Stanze: messaggio" },
  { id: "stanze-event", label: "Stanze: evento" },
  { id: "stanze-history", label: "Stanze: cronologia" },
  { id: "stanze-reveal", label: "Stanze: rivelazione" },
  ...SHADOW_SCENES,
  { id: "results", label: "Classifica" },
];

function sceneViews(scene: Scene, now: number) {
  const q = {
    index: 2,
    total: 10,
    question: "Quale pianeta è chiamato «il pianeta rosso»?",
    options: ["Venere", "Marte", "Giove", "Saturno"],
    openedAt: now,
    deadline: now + 15_000,
  };
  switch (scene) {
    case "quiz-question":
      return {
        typeId: "quiz-multipla",
        screen: { phase: "question", ...q, answered: 7, playerCount: 12 },
        phone: { phase: "question", ...q, myChoice: null },
      };
    case "quiz-reveal":
      return {
        typeId: "quiz-multipla",
        screen: { phase: "reveal", ...q, answered: 12, playerCount: 12, reveal: { correctIndex: 1, counts: [1, 8, 2, 1] } },
        phone: { phase: "reveal", ...q, myChoice: 1, reveal: { correctIndex: 1, earned: 820 } },
      };
    case "buzzer-open":
      return {
        typeId: "buzzer",
        screen: { phase: "open", index: 1, total: 8, question: "Chi ha dipinto la Gioconda?", answering: null, queue: [], current: 0, winner: null },
        phone: { phase: "open", question: "Chi ha dipinto la Gioconda?", canBuzz: true, buzzed: false, isAnswering: false, position: null, won: false },
      };
    case "buzzer-answering":
      return {
        typeId: "buzzer",
        screen: {
          phase: "answering",
          index: 1,
          total: 8,
          question: "Chi ha dipinto la Gioconda?",
          answering: { playerId: "p1", nickname: "Gina" },
          queue: [
            { playerId: "p1", nickname: "Gina" },
            { playerId: "p2", nickname: "Marco" },
            { playerId: "p3", nickname: "Sofia" },
          ],
          current: 0,
          winner: null,
        },
        phone: { phase: "answering", question: "Chi ha dipinto la Gioconda?", canBuzz: false, buzzed: true, isAnswering: true, position: 0, won: false },
      };
    case "vf-question":
    case "vf-reveal": {
      const st = { index: 3, total: 12, text: "Il pomodoro è un frutto.", openedAt: now, deadline: now + 8_000 };
      return scene === "vf-question"
        ? { typeId: "vero-falso", screen: { phase: "statement", ...st, answered: 5, playerCount: 12 }, phone: { phase: "statement", ...st, myAnswer: null } }
        : {
            typeId: "vero-falso",
            screen: { phase: "reveal", ...st, answered: 12, playerCount: 12, reveal: { answer: true, counts: { true: 9, false: 3 } } },
            phone: { phase: "reveal", ...st, myAnswer: true, reveal: { answer: true, correct: true, earned: 118, streak: 3 } },
          };
    }
    case "stima-question":
    case "stima-reveal": {
      const q = { index: 0, total: 3, question: "Quanti chilometri è lunga la costa italiana?", unit: "km", min: 0, max: 20000, openedAt: now, deadline: now + 20_000 };
      return scene === "stima-question"
        ? { typeId: "stima", screen: { phase: "question", ...q, answered: 4, playerCount: 12 }, phone: { phase: "question", ...q, myGuess: 7000 } }
        : {
            typeId: "stima",
            screen: {
              phase: "reveal",
              ...q,
              answered: 12,
              playerCount: 12,
              reveal: {
                answer: 7500,
                results: [
                  { nickname: "Gina", value: 7450, distance: 50, rank: 1, points: 1000 },
                  { nickname: "Marco", value: 8000, distance: 500, rank: 2, points: 600 },
                  { nickname: "Sofia", value: 5000, distance: 2500, rank: 3, points: 300 },
                ],
              },
            },
            phone: { phase: "reveal", ...q, myGuess: 7450, reveal: { answer: 7500, distance: 50, rank: 1, points: 1000 } },
          };
    }
    case "poll-voting":
    case "poll-reveal": {
      const p = { index: 0, total: 4, question: "Pizza con l'ananas?", kind: "options", options: ["Sì, la adoro", "Mai e poi mai", "Dipende"], openedAt: now, deadline: now + 20_000 };
      return scene === "poll-voting"
        ? { typeId: "sondaggio", screen: { phase: "voting", ...p, voted: 7, playerCount: 12 }, phone: { phase: "voting", ...p, candidates: [], myVote: 1 } }
        : {
            typeId: "sondaggio",
            screen: {
              phase: "reveal",
              ...p,
              voted: 12,
              playerCount: 12,
              reveal: { bars: [{ label: "Sì, la adoro", count: 3, top: false }, { label: "Mai e poi mai", count: 8, top: true }, { label: "Dipende", count: 1, top: false }] },
            },
            phone: { phase: "reveal", ...p, candidates: [], myVote: 1, reveal: { earned: 50 } },
          };
    }
    case "duel-draft":
    case "duel-battle":
    case "duel-replay":
    case "duel-ended":
      return { typeId: "knight-duel", ...duelScene(scene, now) };
    case "stanze-dark":
    case "stanze-items":
    case "stanze-setup":
    case "stanze-compass":
    case "stanze-pending":
    case "stanze-sight":
    case "stanze-mail":
    case "stanze-event":
    case "stanze-history":
    case "stanze-reveal":
      return { typeId: "stanze-segrete", ...stanzeScene(scene, now) };
    case "shadow-choose":
    case "shadow-react":
    case "shadow-reward":
    case "shadow-out":
    case "shadow-bye":
    case "shadow-podium":
      return shadowScene(scene, now);
    case "results":
      return { typeId: null, screen: null, phone: null };
  }
}

// ---- Stanze Segrete: dati d'esempio ----
const SS_PLAYERS = [
  { id: "p1", nickname: "Gina" },
  { id: "p2", nickname: "Marco" },
  { id: "p3", nickname: "Sofia" },
];
function stanzeScene(scene: Scene, now: number) {
  const reveal = scene === "stanze-reveal";
  const screen = scene === "stanze-dark" ? { phase: "play", mapShown: false } : {
    mapShown: true,
    phase: reveal ? "reveal" : scene === "stanze-setup" ? "setup" : "play",
    rows: 3,
    cols: 3,
    players: SS_PLAYERS,
    positions: scene === "stanze-setup" ? { p1: 0, p2: null, p3: null } : { p1: 4, p2: 4, p3: 8 },
    ...(reveal && {
      letters: ["A", "C", "S", "T", "I", "U", "R", "O", "M"],
      paths: [
        { word: "MORTA", cells: [8, 7, 6, 3, 0] },
        { word: "USCITA", cells: [5, 2, 1, 4, 3, 0] },
      ],
      outcomes: [
        { id: "p1", nickname: "Gina", outcome: "fuggito", solved: true },
        { id: "p2", nickname: "Marco", outcome: "eliminato", solved: false },
        { id: "p3", nickname: "Sofia", outcome: "in-gioco", solved: false },
      ],
    }),
  };
  const phone: Record<string, unknown> = {
    phase: "play",
    member: true,
    mapShown: scene !== "stanze-dark",
    ...(scene !== "stanze-dark" && { rows: 3, cols: 3 }),
    cell: scene === "stanze-setup" ? 0 : 4,
    outcome: "in-gioco",
    solved: false,
    others: [{ id: "p2", nickname: "Marco", cell: 4 }],
    abilities: [],
    compass: {},
    pending: [],
    sighting: null,
    feedback: null,
    messages: [],
    pendingEvents: [],
    history: [],
    rules: { ...(scene !== "stanze-dark" && { rows: 3, cols: 3 }), sightSec: 8, messageMaxLength: 280, positionsPublic: true },
  };
  if (scene === "stanze-compass") {
    phone.abilities = [{ id: "g1", action: "move", label: null, usesLeft: null, expiresAt: null }, { id: "g2", action: "sight", label: null, usesLeft: 1, expiresAt: now + 30_000 }];
    phone.compass = { move: { up: "open", down: "blocked", left: "open", right: "open" } };
  }
  if (scene === "stanze-pending") {
    phone.abilities = [{ id: "g1", action: "move", label: null, usesLeft: null, expiresAt: null }];
    phone.compass = { move: { up: "open", down: "blocked", left: "open", right: "open" } };
    phone.pending = [{ id: 1, kind: "move", direction: "left", actionId: null, word: null }];
  }
  if (scene === "stanze-items") {
    phone.items = [
      { ref: 1, known: true, name: "Una lettera", icon: "✉️", text: "Chi legge questo foglio non è il primo a cercare l'uscita." },
      { ref: 0, known: false },
    ];
  }
  if (scene === "stanze-sight") phone.sighting = { cell: 4, letter: "I", until: now + 8_000 };
  if (scene === "stanze-mail") phone.messages = [{ id: 1, mine: false, text: "Senti un rumore sopra la tua testa.", at: now, readAt: null, replyTo: null, canReply: true }];
  if (scene === "stanze-event") {
    phone.messages = [];
    phone.pendingEvents = [{ id: 2, text: "Crolla il soffitto della Stanza 5.", at: now, acceptedAt: null, cancelled: false }];
  }
  if (scene === "stanze-history") {
    phone.history = [
      { id: 4, text: "Si spengono le luci.", at: now - 60_000, acceptedAt: now - 55_000, cancelled: false },
      { id: 2, text: "Crolla il soffitto della Stanza 5.", at: now - 600_000, acceptedAt: now - 590_000, cancelled: false },
    ];
  }
  return { screen, phone };
}

// ---- Duello dei Cavalieri: dati d'esempio ----
const DC = (id: string, name: string, icon: string, rarity: "common" | "rare" | "epic", initiative: number, text: string) => ({ id, name, icon, rarity, initiative, text });
const CARDS = {
  fendente: DC("fendente", "Fendente", "sword", "common", 6, "Attacco 5"),
  scudo: DC("scudo", "Scudo di quercia", "shield", "common", 8, "Scudo 6"),
  martello: DC("martello", "Colpo di martello", "hammer", "common", 3, "Colpo pesante 8"),
  pozione: DC("pozione", "Pozione curativa", "potion-red", "common", 5, "Cura 7"),
  carica: DC("carica", "Carica eroica", "sword", "epic", 7, "Attacco 5 · Scudo 3"),
  veleno: DC("veleno", "Veleno del ragno", "potion-green", "common", 4, "Veleno 3 per 2 battaglie"),
};
const hc = (c: (typeof CARDS)[keyof typeof CARDS], n: number) => ({ uid: `${c.id}#${n}`, ...c });

function duelSides(hp: [number, number] = [20, 14]) {
  return [
    { name: "Rossi", color: "#ef4444", hp: hp[0], maxHp: 20, handCount: 3, poison: 0, members: 3 },
    { name: "Blu", color: "#3b82f6", hp: hp[1], maxHp: 20, handCount: 4, poison: 3, members: 3 },
  ];
}
function duelCommon(phase: string, now: number, hp?: [number, number]) {
  return { phase, battleNo: 1, maxBattles: 6, minigamesLeft: 1, suddenDeath: false, sides: duelSides(hp), minigame: null, minigameWinner: phase === "draft" ? 0 : null, outcome: null };
}
function duelScene(scene: Scene, now: number) {
  const team = [{ id: "m1", nickname: "Marco" }, { id: "m2", nickname: "Sofia" }, { id: "me", nickname: "Tu" }];
  const progress = { members: 3, decided: 1, deadline: now + 15_000 };
  const hand = [hc(CARDS.fendente, 1), hc(CARDS.scudo, 1), hc(CARDS.martello, 1), hc(CARDS.pozione, 1)];
  switch (scene) {
    case "duel-draft":
      return {
        screen: { ...duelCommon("draft", now), draft: { phase: "picking", picker: 0, offeredCount: 3, progress }, battle: null, result: null },
        phone: {
          ...duelCommon("draft", now), side: 0, team, hand: hand.slice(0, 2), spied: hc(CARDS.carica, 1), result: null, battle: null,
          draft: { phase: "picking", role: "picker", first: true, picksLeft: 2, cards: [hc(CARDS.carica, 1), hc(CARDS.veleno, 1), hc(CARDS.scudo, 2)], vote: { options: [], max: 1, deadline: now + 15_000, mine: ["veleno#1"], confirmed: false, mates: [{ playerId: "m1", picks: ["carica#1"], confirmed: true }, { playerId: "m2", picks: [], confirmed: false }] } },
        },
      };
    case "duel-battle":
      return {
        screen: { ...duelCommon("battle", now), draft: null, battle: { progress: [progress, { ...progress, decided: 2 }], deadline: now + 20_000 }, result: null },
        phone: {
          ...duelCommon("battle", now), side: 0, team, hand, spied: null, draft: null, result: null,
          battle: { vote: { options: hand.map((c) => c.uid), max: 2, deadline: now + 20_000, mine: ["fendente#1", "scudo#1"], confirmed: false, mates: [{ playerId: "m1", picks: ["fendente#1"], confirmed: true }, { playerId: "m2", picks: ["martello#1"], confirmed: false }] }, opponent: progress, deadline: now + 20_000 },
        },
      };
    case "duel-replay": {
      const result = {
        winner: null,
        shownUntil: now + 20_000,
        cards: { fendente: CARDS.fendente, scudo: CARDS.scudo, pozione: CARDS.pozione, martello: CARDS.martello },
        events: [
          { type: "play", side: 0, uid: "fendente#1", cardId: "fendente" },
          { type: "play", side: 0, uid: "martello#1", cardId: "martello" },
          { type: "play", side: 1, uid: "scudo#1", cardId: "scudo" },
          { type: "play", side: 1, uid: "pozione#1", cardId: "pozione" },
          { type: "shield", side: 1, amount: 6 },
          { type: "heal", side: 1, amount: 0 },
          { type: "damage", source: 0, target: 1, kind: "attack", amount: 0, blocked: 5 },
          { type: "damage", source: 0, target: 1, kind: "heavy", amount: 2, blocked: 6 },
        ],
      };
      const common = { ...duelCommon("battle-result", now, [20, 12]) };
      return {
        screen: { ...common, draft: null, battle: null, result },
        phone: { ...common, side: 0, team, hand: hand.slice(0, 2), spied: null, draft: null, battle: null, result },
      };
    }
    case "duel-ended": {
      const common = { ...duelCommon("ended", now, [9, 0]), outcome: { winner: 0, reason: "ko" } };
      return { screen: { ...common, draft: null, battle: null, result: null }, phone: { ...common, side: 0, team, hand: [], spied: null, draft: null, battle: null, result: null } };
    }
    default:
      return { screen: null, phone: null };
  }
}

/** Anteprima dei theme pack con viste d'esempio: per scegliere il look senza giocare una partita. */
export function Preview() {
  // Si può aprire direttamente su un tema/scena: /preview?theme=manga&scene=quiz-reveal
  const params = new URLSearchParams(window.location.search);
  const [theme, setTheme] = useState<ThemeId>(THEMES.find((t) => t.id === params.get("theme"))?.id ?? "gameshow");
  const [scene, setScene] = useState<Scene>(SCENES.find((x) => x.id === params.get("scene"))?.id ?? "quiz-question");
  const [run, setRun] = useState(0); // cambia per riavviare countdown e animazioni
  const clock = useMemo(() => new ClockSync(), []);
  const now = useMemo(() => Date.now(), [run, scene]);
  const data = sceneViews(scene, now);
  const views = data.typeId ? minigameViews[data.typeId] : undefined;

  return (
    <div className="preview">
      <header className="preview-bar">
        <h1>Anteprima temi</h1>
        <div className="row">
          {THEMES.map((t) => (
            <button key={t.id} className={t.id === theme ? "primary" : ""} onClick={() => setTheme(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="row">
          {SCENES.map((s) => (
            <button key={s.id} className={s.id === scene ? "primary" : ""} onClick={() => { setScene(s.id); setRun((r) => r + 1); }}>{s.label}</button>
          ))}
          <button onClick={() => setRun((r) => r + 1)}>↻ Riavvia</button>
        </div>
        <div className="row">
          <span className="muted">Suoni:</span>
          {SOUNDS.map((s) => <button key={s} onClick={() => audio.play(theme, s)}>{s}</button>)}
          <MuteButton />
        </div>
      </header>

      <div className="preview-grid">
        <section>
          <h3>Schermo condiviso</h3>
          <div className="preview-frame screen-frame">
            <main className="screen" data-theme={theme}>
              <Stage theme={theme} id={`${scene}-${run}-${theme}`}>
                {views && data.screen ? (
                  <views.Screen view={data.screen} clock={clock} theme={theme} title="Anteprima" />
                ) : (
                  <>
                    <h2>Classifica dopo il round 3</h2>
                    <Leaderboard key={run} data={BOARDS} previous={BOARDS_BEFORE} />
                  </>
                )}
              </Stage>
            </main>
          </div>
        </section>

        <section>
          <h3>Telefono</h3>
          <div className="preview-frame phone-frame">
            <main className="controller" data-theme={theme}>
              <Stage theme={theme} id={`${scene}-${run}-${theme}`}>
                {views && data.phone ? (
                  <views.Controller view={data.phone} clock={clock} theme={theme} title="Anteprima" send={() => undefined} />
                ) : (
                  <p className="big">1200 punti · 1° posto</p>
                )}
              </Stage>
              <div className="reaction-bar static">
                {REACTIONS.map((e) => <button key={e} type="button">{e}</button>)}
              </div>
            </main>
          </div>
        </section>
      </div>
    </div>
  );
}
