/**
 * Simulazione di bilanciamento di «Caccia ai Fantasmi». Si lancia con `pnpm balance:caccia`.
 *
 * Fa giocare il VERO codice del plugin (nessun server) a giocatori simulati e conta chi vince. Il gioco è fisico, quindi
 * il movimento è un modello con ipotesi che vanno ricordate leggendo i numeri:
 *  - spostarsi da una zona all'altra costa `travel` secondi; stare in una zona costa un'azione al secondo;
 *  - cacciatori «a guardia»: si dividono sulle zone e ricontrollano ogni `lookEvery` s, riconquistando appena possibile;
 *  - cacciatori «vagabondi»: girano a caso e controllano all'arrivo;
 *  - fantasmi «incursori»: infestano e scappano, senza sapere se la zona è bloccata;
 *  - fantasmi «furbi»: controllano, se la zona è già loro se ne vanno, se è bloccata aspettano lì la fine del blocco;
 *  - la parte da detective è un modello grossolano: ogni secondo, se un fantasma ha appena agito, c'è una probabilità
 *    (`CATCH_CHANCE`) che un cacciatore libero lo accusi giusto. Non misura la bravura nel dedurre davvero.
 * Quindi: i numeri dicono se le REGOLE favoriscono una fazione a parità di abilità, non quanto è divertente né come
 * giocheranno persone vere. Vanno rilanciati a ogni modifica a blocco, peso, pause, vantaggio o punteggio.
 *
 * Esito atteso (obiettivo): a pari abilità (guardia contro furbi, vagabondi contro incursori) vicino al 50%,
 * e vince chi gioca meglio (cacciatori organizzati contro fantasmi ingenui → vincono i cacciatori, e viceversa).
 */
import { ghostHunt as gh } from "../../../packages/minigames/src/caccia-fantasmi/index.js";
import { makeRng } from "../../../packages/minigames/src/knight-duel/rng.js";

type HunterStyle = "guard" | "wander";
type GhostStyle = "raid" | "smart";

interface Scenario {
  players: number;
  ghosts: number;
  zones: number;
  hunterStyle: HunterStyle;
  ghostStyle: GhostStyle;
  /** Secondi per spostarsi da una zona all'altra. */
  travel: number;
  /** Ogni quanti secondi un cacciatore a guardia ricontrolla la sua zona. */
  lookEvery: number;
  /** Sovrascrive la configurazione di esempio del gioco. */
  config: Record<string, unknown>;
}

const CATCH_CHANCE = 0.15;
const TRIALS = 300;

function playOne(seed: number, sc: Scenario): "ghost" | "hunter" | "draw" {
  const rng = makeRng(seed);
  const zones = Array.from({ length: sc.zones }, (_, i) => ({ name: `Z${i}`, code: `CODE${i}` }));
  const config = gh.configSchema.parse({ ...gh.sampleConfig, zones, ghostCount: sc.ghosts, ...sc.config });
  const players = Array.from({ length: sc.players }, (_, i) => ({ id: `p${i}`, nickname: `P${i}`, teamId: null }));
  let s = gh.onHostCommand(gh.init(config, { players, teams: [], seed }, 0), { type: "start" }, 0);
  const ghostIds = Object.keys(s.roles).filter((id) => s.roles[id] === "ghost");
  const hunterIds = Object.keys(s.roles).filter((id) => s.roles[id] === "hunter");
  const meta = (t: number) => ({ receivedAt: t, claimedTime: t, rtt: 0 });

  const at: Record<string, { zone: number; arrive: number; lastLook: number }> = {};
  const jitter = () => Math.floor(rng() * sc.travel * 1000);
  for (const id of ghostIds) at[id] = { zone: Math.floor(rng() * sc.zones), arrive: jitter(), lastLook: -1e9 };
  hunterIds.forEach((id, i) => {
    at[id] = { zone: sc.hunterStyle === "guard" ? i % sc.zones : Math.floor(rng() * sc.zones), arrive: config.headStartSec * 1000 + jitter(), lastLook: -1e9 };
  });
  const otherZone = (cur: number) => (cur + 1 + Math.floor(rng() * (sc.zones - 1))) % sc.zones;

  for (let t = 0; t <= config.durationSec * 1000; t += 1000) {
    s = gh.onTick(s, t);
    for (const id of [...ghostIds, ...hunterIds]) {
      const a = at[id]!;
      if (t < a.arrive) continue;
      const code = zones[a.zone]!.code;
      const zone = s.zones[a.zone]!;
      if (s.roles[id] === "ghost") {
        if (t < (s.lockedUntil[id] ?? 0)) continue; // in prigione
        if (sc.ghostStyle === "smart") {
          if (zone.owner === "ghost") {
            at[id] = { zone: otherZone(a.zone), arrive: t + sc.travel * 1000, lastLook: -1e9 };
            continue;
          }
          if (t < zone.lockUntil) {
            a.arrive = zone.lockUntil; // aspetta lì, tra la folla, la fine del blocco
            continue;
          }
        }
        s = gh.onInput(s, id, { type: "scan", code }, meta(t));
        at[id] = { zone: otherZone(a.zone), arrive: t + sc.travel * 1000, lastLook: -1e9 };
      } else if (sc.hunterStyle === "guard") {
        if (t - a.lastLook >= sc.lookEvery * 1000) {
          a.lastLook = t;
          if (zone.owner !== "hunter") s = gh.onInput(s, id, { type: "scan", code }, meta(t));
        }
      } else {
        if (zone.owner !== "hunter") s = gh.onInput(s, id, { type: "scan", code }, meta(t));
        at[id] = { zone: Math.floor(rng() * sc.zones), arrive: t + (sc.travel + 5 + Math.floor(rng() * 10)) * 1000, lastLook: -1e9 };
      }
    }
    for (const g of ghostIds) {
      if (t < (s.lockedUntil[g] ?? 0)) continue;
      const justActed = s.zones.some((z) => z.holder === g && t - z.changedAt < 2000);
      if (justActed && rng() < CATCH_CHANCE) {
        const h = hunterIds.find((x) => t >= (s.lockedUntil[x] ?? 0) && t >= (s.nextAccuseAt[x] ?? 0) && t >= s.huntersFrom);
        if (h) s = gh.onInput(s, h, { type: "accuse", target: g }, meta(t));
      }
    }
  }
  return gh.onTick(s, s.endsAt + 1).winner ?? "draw";
}

/** Percentuale di vittorie dei fantasmi. */
function ghostWinRate(sc: Scenario): number {
  let wins = 0;
  for (let i = 0; i < TRIALS; i++) if (playOne(1000 + i, sc) === "ghost") wins++;
  return Math.round((wins / TRIALS) * 100);
}

const MATCHUPS: { label: string; hunterStyle: HunterStyle; ghostStyle: GhostStyle }[] = [
  { label: "guardia vs incursori", hunterStyle: "guard", ghostStyle: "raid" },
  { label: "guardia vs furbi", hunterStyle: "guard", ghostStyle: "smart" },
  { label: "vagabondi vs incursori", hunterStyle: "wander", ghostStyle: "raid" },
  { label: "vagabondi vs furbi", hunterStyle: "wander", ghostStyle: "smart" },
];
/** [giocatori, fantasmi, zone]: i fantasmi sono quelli automatici (circa 1 ogni 5). */
const SIZES: [number, number, number][] = [[8, 2, 3], [12, 2, 3], [20, 4, 4], [30, 6, 4], [30, 6, 6], [40, 8, 6]];

function main() {
  const overrides = process.argv[2] ? (JSON.parse(process.argv[2]) as Record<string, unknown>) : {};
  console.log(`Vittorie dei FANTASMI (%) su ${TRIALS} partite per casella. Configurazione di esempio${Object.keys(overrides).length ? ` con ${JSON.stringify(overrides)}` : ""}.`);
  console.log("Pari abilità = guardia vs furbi e vagabondi vs incursori: dovrebbero stare vicino al 50.\n");
  console.log(["giocatori/fantasmi/zone".padEnd(24), ...MATCHUPS.map((m) => m.label.padStart(24))].join(""));
  for (const [players, ghosts, zones] of SIZES) {
    const row = MATCHUPS.map((m) =>
      String(ghostWinRate({ players, ghosts, zones, hunterStyle: m.hunterStyle, ghostStyle: m.ghostStyle, travel: 20, lookEvery: 4, config: overrides })).padStart(24),
    );
    console.log([`${players} / ${ghosts} / ${zones}`.padEnd(24), ...row].join(""));
  }
}

main();
