import { type Socket, io } from "socket.io-client";
import { ClientEvent, ClockSync, type GamePlayerState, type JoinResult, ServerEvent, makeSample } from "@gioco/shared";
import { decide, makeRnd, privacyProblem } from "./strategy.js";

export interface BotOptions {
  url: string;
  nickname: string;
  /** Latenza di rete di andata, in ms (min, max): ogni messaggio in uscita e in arrivo è ritardato. */
  latencyMs: [number, number];
  /** Tempo di «riflessione» prima di rispondere, in ms (min, max). */
  thinkMs: [number, number];
  /** Sfasamento dell'orologio del telefono rispetto al server, in ms (il bot lo compensa come fa il client vero). */
  skewMs: number;
  seed: number;
}

export interface BotStats {
  states: number;
  inputs: number;
  errors: string[];
  disconnects: number;
  /** Viste che contenevano ciò che questo telefono non dovrebbe vedere (vedi `privacyProblem`). */
  leaks: string[];
}

const between = (r: () => number, [lo, hi]: [number, number]) => lo + r() * (hi - lo);

/** Un telefono simulato: entra con un profilo, sincronizza l'orologio, e gioca seguendo le viste che riceve. */
export class Bot {
  readonly stats: BotStats = { states: 0, inputs: 0, errors: [], disconnects: 0, leaks: [] };
  playerId = "";
  token = "";
  state: GamePlayerState | null = null;
  /** Istante (Date.now) dell'ultimo stato di gioco ricevuto dopo la latenza simulata. */
  lastStateAt = 0;
  /** Istante in cui l'ultimo stato è arrivato sul socket, prima della latenza simulata: misura il solo costo del server. */
  lastRawAt = 0;
  /** Ultima vista ricevuta per ogni tipo di minigioco: serve ai controlli finali, quando lo stato del round non c'è più. */
  readonly lastViews = new Map<string, unknown>();
  private socket!: Socket;
  private readonly rnd: () => number;
  private readonly clock = new ClockSync();
  private lastKey: string | null = null;
  /** Istante (Date.now) in cui è prevista la consegna dell'ultimo stato in arrivo: i successivi non possono sorpassarlo. */
  private lastDeliveryAt = 0;
  private timers = new Set<NodeJS.Timeout>();

  constructor(private readonly opts: BotOptions) {
    this.rnd = makeRnd(opts.seed);
  }

  /** Nome con cui il bot è registrato (per confrontarlo con le classifiche). */
  get nickname(): string {
    return this.opts.nickname;
  }

  /** Ora locale del telefono simulato (sfasata). */
  private localNow = () => Date.now() + this.opts.skewMs;

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private oneWay = () => between(this.rnd, this.opts.latencyMs);

  async join(): Promise<void> {
    this.socket = io(this.opts.url, { auth: { role: "play" }, transports: ["websocket"], forceNew: true });
    this.socket.on("disconnect", () => this.stats.disconnects++);
    this.socket.on("connect_error", (e) => this.stats.errors.push(`connessione: ${e.message}`));
    // Anche i messaggi in arrivo subiscono la latenza simulata, ma restano in ordine: un collegamento vero non li scambia.
    this.socket.on(ServerEvent.GamePlayer, (s: GamePlayerState) => {
      this.lastRawAt = Date.now();
      const at = Math.max(Date.now() + this.oneWay(), this.lastDeliveryAt + 1);
      this.lastDeliveryAt = at;
      this.later(() => this.onState(s), at - Date.now());
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.opts.nickname}: connessione scaduta`)), 10_000);
      this.socket.once("connect", () => (clearTimeout(t), resolve()));
    });
    const res = await new Promise<JoinResult>((resolve) =>
      this.socket.emit(ClientEvent.Create, { nickname: this.opts.nickname, avatar: "🤖", color: "#6b7280" }, resolve),
    );
    if (!res.ok) throw new Error(`${this.opts.nickname}: profilo rifiutato (${res.error})`);
    this.playerId = res.player.id;
    this.token = res.token;

    // Sincronizzazione dell'orologio come nel client vero: più campioni, si tiene quello con RTT minimo.
    for (let i = 0; i < 4; i++) this.later(() => this.syncOnce(), i * 150);
    const loop = setInterval(() => this.syncOnce(), 5_000);
    this.timers.add(loop as unknown as NodeJS.Timeout);
  }

  private syncOnce(): void {
    const sentAt = this.localNow();
    this.later(() => {
      this.socket.timeout(5_000).emit(ClientEvent.TimeSync, {}, (err: unknown, serverNow: number) => {
        if (err) return;
        this.later(() => {
          this.clock.add(makeSample(sentAt, serverNow, this.localNow()));
          const rtt = this.clock.rtt;
          if (rtt !== null) this.socket.emit(ClientEvent.RttReport, { rtt });
        }, this.oneWay());
      });
    }, this.oneWay());
  }

  private onState(s: GamePlayerState): void {
    this.state = s;
    this.lastStateAt = Date.now();
    this.stats.states++;
    if (!s.frame || !s.inRoster) return;
    this.lastViews.set(s.frame.typeId, s.frame.view);
    const leak = privacyProblem(s.frame.typeId, s.frame.view);
    if (leak) this.stats.leaks.push(leak);
    const d = decide(s.frame.typeId, s.frame.view, this.rnd);
    if (!d || d.key === this.lastKey) return;
    this.lastKey = d.key;
    const thinkMs = between(this.rnd, this.opts.thinkMs);
    // L'ora della pressione è quella in cui il giocatore decide, convertita in ora server con l'orologio sincronizzato.
    this.later(() => {
      const claimedTime = this.clock.toServerTime(this.localNow());
      // Sullo stesso collegamento i messaggi arrivano nell'ordine in cui partono: i ritardi si sommano.
      let delay = 0;
      for (const input of d.inputs) {
        delay += this.oneWay();
        this.later(() => {
          this.socket.emit(ClientEvent.GameInput, { input, clientTime: claimedTime });
          this.stats.inputs++;
        }, delay);
      }
    }, thinkMs);
  }

  close(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.socket?.disconnect();
  }
}
