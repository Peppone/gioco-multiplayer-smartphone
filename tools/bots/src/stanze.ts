import { type Socket, io } from "socket.io-client";
import { ClientEvent, type GameMasterState, type HostAck, ServerEvent } from "@gioco/shared";
import type { AdminApi } from "./api.js";
import type { AutoHost, MatchRun } from "./host.js";

/** Il Game Master simulato: entra col link limitato, conduce la sessione e approva ogni richiesta. */
export class AutoMaster {
  state: GameMasterState | null = null;
  private socket!: Socket;
  readonly rejected: string[] = [];
  commands = 0;

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async connect(): Promise<void> {
    this.socket = io(this.url, { auth: { role: "master", token: this.token }, transports: ["websocket"], forceNew: true });
    this.socket.on(ServerEvent.GameMaster, (s: GameMasterState) => (this.state = s));
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("GM: connessione scaduta")), 10_000);
      this.socket.once("connect", () => (clearTimeout(t), resolve()));
    });
    for (let i = 0; i < 50 && !this.state; i++) await new Promise((r) => setTimeout(r, 100));
  }

  close(): void {
    this.socket?.disconnect();
  }

  async run(command: Record<string, unknown>): Promise<HostAck> {
    this.commands++;
    const ack = await new Promise<HostAck>((resolve) =>
      this.socket.timeout(10_000).emit(ClientEvent.MasterCommand, { type: "plugin", command }, (err: unknown, a: HostAck) => resolve(err ? { ok: false, error: "nessuna risposta" } : a)),
    );
    if (!ack.ok) this.rejected.push(`${String(command.type)}: ${ack.error}`);
    return ack;
  }

  get info(): Record<string, any> {
    return (this.state?.host?.info ?? {}) as Record<string, any>;
  }
}

export interface StanzeRun extends MatchRun {
  moves: number;
  eventsSent: number;
  messagesSent: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Una sessione di Stanze Segrete con il GM simulato: distribuisce i giocatori, accende le capacità a tutti,
 * approva gli spostamenti, manda messaggi ed eventi mentre i bot chiedono di muoversi e scrivono a raffica,
 * poi rivela la mappa, assegna gli esiti e conclude.
 */
export async function playStanze(host: AutoHost, api: AdminApi, url: string, matchId: string, playSeconds: number): Promise<StanzeRun> {
  const t0 = Date.now();
  const run: StanzeRun = { matchId, reachedEnd: false, durationMs: 0, commands: [], warnings: [], finalState: null, moves: 0, eventsSent: 0, messagesSent: 0 };
  const start = await host.send({ type: "start", matchId });
  if (!start.ok) return { ...run, warnings: [`avvio rifiutato: ${start.error}`] };
  const next = await host.send({ type: "engine", action: "next" });
  if (!next.ok) {
    // Es. più di 10 giocatori: la regia riceve il motivo e la partita resta pronta.
    run.warnings.push(`round non avviato: ${next.error}`);
    await host.send({ type: "engine", action: "end-match" });
    await host.send({ type: "engine", action: "close" });
    run.durationMs = Date.now() - t0;
    return run;
  }

  const link = await api.post<{ token: string }>("/master-link", {});
  const gm = new AutoMaster(url, link.token);
  try {
    await gm.connect();
    const ids = (gm.state?.players ?? []).map((p) => p.id);
    await gm.run({ type: "place-spread" });
    for (const action of ["move", "sight", "message"]) await gm.run({ type: "grant", target: "all", action, ...(action === "sight" && { uses: 3 }) });
    await gm.run({ type: "start" });

    const until = Date.now() + playSeconds * 1000;
    let lastEvent = 0;
    let i = 0;
    while (Date.now() < until) {
      const info = gm.info;
      const requests = (info.requests ?? []) as { id: number; kind: string }[];
      // Come una regia vera: gli spostamenti si approvano in blocco, le altre richieste una alla volta.
      const moves = requests.filter((r) => r.kind === "move").length;
      if (moves > 0 && (await gm.run({ type: "resolve-all-moves", approve: true })).ok) run.moves += moves;
      for (const r of requests.filter((x) => x.kind !== "move").slice(0, 3)) await gm.run({ type: "resolve", requestId: r.id, approve: true, ...(r.kind === "peek" && { showLetterSec: 3 }) });
      // Posta e eventi: un messaggio a un giocatore a caso ogni giro, un evento a tutti ogni 4 secondi.
      if (ids.length > 0) {
        if ((await gm.run({ type: "message", to: { player: ids[i % ids.length] }, text: `Messaggio ${i}` })).ok) run.messagesSent++;
      }
      if (Date.now() - lastEvent > 4_000) {
        lastEvent = Date.now();
        if ((await gm.run({ type: "event", to: "all", text: `Evento ${run.eventsSent + 1}` })).ok) run.eventsSent++;
      }
      i++;
      await sleep(400);
    }

    // Esiti e fine: metà dei giocatori fuggono, così i punti si registrano.
    for (const [n, id] of ids.entries()) if (n % 2 === 0) await gm.run({ type: "set-outcome", playerId: id, outcome: "fuggito" });
    await gm.run({ type: "public-reveal" });
    await sleep(500);
    await gm.run({ type: "end" });
    await sleep(500);
    run.warnings.push(...gm.rejected.map((r) => `comando del GM rifiutato (${r})`));

    // Si chiude la partita come farebbe la regia.
    await host.send({ type: "engine", action: "next" });
    await host.waitState(500);
    run.finalState = host.state;
    run.reachedEnd = host.state?.phase === "ended";
    run.commands.push(`gm:${gm.commands}`);
    await host.send({ type: "engine", action: "close" });
  } finally {
    gm.close();
  }
  run.durationMs = Date.now() - t0;
  return run;
}
