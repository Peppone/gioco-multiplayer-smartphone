import { existsSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import type { ServerInfo, TunnelInfo } from "@gioco/shared";

export interface AppOptions {
  port: number;
  lanAddress: string | null;
  getTunnel: () => TunnelInfo;
  /** Cartella del client buildato; se assente il server espone solo le API. */
  clientDir?: string;
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/info", async (): Promise<ServerInfo> => ({
    lanUrl: opts.lanAddress ? `http://${opts.lanAddress}:${opts.port}` : null,
    tunnel: opts.getTunnel(),
  }));

  if (opts.clientDir && existsSync(opts.clientDir)) {
    app.register(fastifyStatic, { root: opts.clientDir });
    // SPA: /screen, /play, /admin tornano tutti a index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
