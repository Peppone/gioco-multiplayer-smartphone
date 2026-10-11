import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT } from "@gioco/shared";
import { buildApp } from "./app.js";
import { pickLanAddress } from "./network.js";
import { TunnelManager, findCloudflared } from "./tunnel.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.env.PORT ?? DEFAULT_PORT);
const lanAddress = pickLanAddress();

const tunnel = new TunnelManager(findCloudflared(rootDir));
if (process.env.NO_TUNNEL !== "1") tunnel.start(port);

const app = buildApp({
  port,
  lanAddress,
  getTunnel: () => tunnel.current,
  clientDir: resolve(rootDir, "packages/client/dist"),
});

await app.listen({ port, host: "0.0.0.0" });
console.log(`Server avviato su http://localhost:${port}`);
if (lanAddress) console.log(`LAN: http://${lanAddress}:${port}`);

const shutdown = () => {
  tunnel.stop();
  void app.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
