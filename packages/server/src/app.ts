import { existsSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import type { ServerInfo, TunnelInfo } from "@gioco/shared";
import type { AdminAuth } from "./admin-auth.js";
import { registerMediaRoutes } from "./media-routes.js";
import { registerAdminRoutes } from "./admin-routes.js";
import type { AdminService } from "./admin-service.js";

export interface AppOptions {
  port: number;
  lanAddress: string | null;
  getTunnel: () => TunnelInfo;
  /** Cartella del client buildato; se assente il server espone solo le API. */
  clientDir?: string;
  admin?: { auth: AdminAuth; service: AdminService };
  /** Cartella dei brani caricati dalla regia (richiede `admin` per il login). */
  mediaDir?: string;
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/info", async (): Promise<ServerInfo> => ({
    lanUrl: opts.lanAddress ? `http://${opts.lanAddress}:${opts.port}` : null,
    tunnel: opts.getTunnel(),
  }));

  if (opts.admin) registerAdminRoutes(app, opts.admin.auth, opts.admin.service);

  if (opts.admin && opts.mediaDir) registerMediaRoutes(app, opts.admin.auth, opts.mediaDir);

  if (opts.clientDir && existsSync(opts.clientDir)) {
    app.register(fastifyStatic, { root: opts.clientDir });
    // SPA: /screen, /play, /admin tornano tutti a index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api/") || req.raw.url?.startsWith("/media/")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
