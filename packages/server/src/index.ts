import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT } from "@gioco/shared";
import { minigames } from "@gioco/minigames";
import { AdminAuth } from "./admin-auth.js";
import { AdminService } from "./admin-service.js";
import { buildApp } from "./app.js";
import { openDb } from "./db.js";
import { Engine } from "./engine.js";
import { pickLanAddress } from "./network.js";
import { PlayerService } from "./players.js";
import { Presence } from "./presence.js";
import { attachRealtime } from "./realtime.js";
import { ScoreService } from "./scores.js";
import { TunnelManager, findCloudflared } from "./tunnel.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.env.PORT ?? DEFAULT_PORT);
const lanAddress = pickLanAddress();

const { sqlite, db } = openDb(resolve(rootDir, "data/gioco.sqlite"));

const tunnel = new TunnelManager(findCloudflared(rootDir));
if (process.env.NO_TUNNEL !== "1") tunnel.start(port);

const adminAuth = new AdminAuth(db);
const presence = new Presence();
const engine = new Engine({
  db,
  registry: minigames,
  scores: new ScoreService(db),
  now: Date.now,
  rttOf: (playerId) => presence.getRtt(playerId),
});

const app = buildApp({
  port,
  lanAddress,
  getTunnel: () => tunnel.current,
  clientDir: resolve(rootDir, "packages/client/dist"),
  admin: { auth: adminAuth, service: new AdminService(db) },
});
const realtime = attachRealtime(app.server, { service: new PlayerService(db), presence, engine, adminAuth });
const ticker = setInterval(realtime.tick, 100);

await app.listen({ port, host: "0.0.0.0" });
console.log(`Server avviato su http://localhost:${port}`);
if (lanAddress) console.log(`LAN: http://${lanAddress}:${port}`);

const shutdown = () => {
  clearInterval(ticker);
  tunnel.stop();
  sqlite.close();
  void app.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
