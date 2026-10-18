import { type Socket, io } from "socket.io-client";
import { ClientEvent, type GameAdminState, type HostAck, type HostCommand, ServerEvent } from "@gioco/shared";
import type { Bot } from "./bot.js";

export interface MatchRun {
  matchId: string;
  reachedEnd: boolean;
  durationMs: number;
  /** Comandi della regia usati, in ordine. */
  commands: string[];
  warnings: string[];
  finalState: GameAdminState | null;
}

/** Quanto ci mette lo stato nuovo ad arrivare a tutti i telefoni dopo un comando della regia (ms). */
export const fanout: number[] = [];

const PRIORITY = ["correct", "open", "start", "deal", "resume", "next", "continue", "end", "pick:0"];

/** Una regia automatica: conduce una partita intera cliccando i pulsanti giusti al momento giusto. */
export class AutoHost {
  state: GameAdminState | null = null;
  private socket!: Socket;
  private version = 0;
  private waiters: (() => void)[] = [];

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly bots: Bot[],
  ) {}

  async connect(): Promise<void> {
    this.socket = io(this.url, { auth: { role: "admin", token: this.token }, transports: ["websocket"], forceNew: true });
    this.socket.on(ServerEvent.GameAdmin, (s: GameAdminState) => {
      this.state = s;
      this.version++;
      this.waiters.splice(0).forEach((w) => w());
    });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("regia: connessione scaduta")), 10_000);
      this.socket.once("connect", () => (clearTimeout(t), resolve()));
    });
    await this.waitState(5_000);
  }

  close(): void {
    this.socket?.disconnect();
  }

  waitState(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      this.waiters.push(() => (clearTimeout(t), resolve()));
    });
  }

  /** Invia un comando della regia e, se serve, misura quanto ci mette lo stato nuovo ad arrivare a tutti i telefoni. */
  async send(cmd: HostCommand): Promise<HostAck> {
    const t0 = Date.now();
    const ack = await new Promise<HostAck>((resolve) => this.socket.timeout(10_000).emit(ClientEvent.HostCommand, cmd, (err: unknown, a: HostAck) => resolve(err ? { ok: false, error: "nessuna risposta" } : a)));
    if (ack.ok && this.bots.length > 0 && (cmd.type === "engine" || cmd.type === "plugin")) {
      // Tempo perché lo stato nuovo arrivi a tutti i telefoni (se il comando non cambia nulla per i giocatori non si misura).
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline && !this.bots.every((b) => b.lastRawAt >= t0)) await new Promise((r) => setTimeout(r, 5));
      if (this.bots.every((b) => b.lastRawAt >= t0)) fanout.push(Math.max(...this.bots.map((b) => b.lastRawAt)) - t0);
    }
    return ack;
  }

  /** Decide il prossimo comando in base allo stato; null = bisogna aspettare i giocatori o il tempo. */
  private choose(s: GameAdminState, sinceChangeMs: number, warnings: string[]): HostCommand | null {
    if (s.phase === "ready" || s.phase === "results") {
      return s.engineActions.some((a) => a.id === "next" && a.enabled) ? { type: "engine", action: "next" } : null;
    }
    if (s.phase !== "round" || !s.host) return null;

    // Se i giocatori non hanno ancora tutti agito, si aspetta (un po'): poi si procede comunque.
    const info = (s.host.info ?? {}) as Record<string, any>;
    const inner = info.minigame && typeof info.minigame === "object" ? info.minigame : info;
    const answered: number | undefined = inner.answered ?? inner.voted;
    const total: number | undefined = inner.playerCount;
    const waiting = answered !== undefined && total !== undefined && answered < total && sinceChangeMs < 6_000;
    if (waiting) return null;

    const enabled = s.host.actions.filter((a) => a.enabled);
    const base = (id: string) => id.replace(/^child:/, "");
    for (const wanted of PRIORITY) {
      const a = enabled.find((x) => !x.danger && (base(x.id) === wanted || x.id === wanted));
      if (a) return { type: "plugin", command: { type: a.id } };
    }
    // Nessun pulsante «normale»: dopo un po' si usa quello di emergenza (es. nessuno prenota il buzzer).
    const danger = enabled.find((x) => x.danger && /skip/.test(x.id));
    if (danger && sinceChangeMs > 8_000) {
      warnings.push(`azione di emergenza usata: ${danger.label}`);
      return { type: "plugin", command: { type: danger.id } };
    }
    return null;
  }

  /** Conduce la partita dall'avvio alla fine, poi torna alla lobby. */
  async runMatch(matchId: string, timeoutMs = 240_000): Promise<MatchRun> {
    const started = Date.now();
    const run: MatchRun = { matchId, reachedEnd: false, durationMs: 0, commands: [], warnings: [], finalState: null };
    const start = await this.send({ type: "start", matchId });
    if (!start.ok) {
      run.warnings.push(`avvio rifiutato: ${start.error}`);
      return run;
    }
    run.commands.push("start");

    let changedAt = Date.now();
    let seen = this.version;
    while (Date.now() - started < timeoutMs) {
      if (this.version !== seen) {
        seen = this.version;
        changedAt = Date.now();
      }
      const s = this.state!;
      if (s.phase === "ended") {
        run.reachedEnd = true;
        run.finalState = s;
        break;
      }
      const dwell = Date.now() - changedAt;
      const cmd = dwell > 250 ? this.choose(s, dwell, run.warnings) : null; // un attimo di pausa: come una regia vera
      if (cmd) {
        const ack = await this.send(cmd);
        run.commands.push(cmd.type === "engine" ? `engine:${cmd.action}` : cmd.type === "plugin" ? `plugin:${String(cmd.command.type)}` : cmd.type);
        if (!ack.ok) run.warnings.push(`comando rifiutato (${run.commands.at(-1)}): ${ack.error}`);
        // Troppi giocatori per il round: riprovare non serve, la regia vera si fermerebbe qui.
        if (!ack.ok && /massimo \d+ giocatori/.test(String(ack.error))) break;
        changedAt = Date.now();
        await this.waitState(300);
      } else {
        await this.waitState(150);
      }
    }
    if (!run.reachedEnd) run.warnings.push(`partita non conclusa entro ${timeoutMs / 1000}s (fase: ${this.state?.phase})`);
    run.durationMs = Date.now() - started;
    // Si torna alla lobby: la prossima partita può partire.
    if (run.reachedEnd) {
      await this.send({ type: "engine", action: "close" });
      await this.waitState(300);
    }
    return run;
  }
}
