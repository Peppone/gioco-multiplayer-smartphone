import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodType } from "zod";
import {
  type AdminError,
  assignPlayerSchema,
  eventInputSchema,
  eventPatchSchema,
  instanceInputSchema,
  roundInputSchema,
  roundOrderSchema,
  eventTeamsSchema,
  matchInputSchema,
  matchPatchSchema,
  passwordBody,
  teamInputSchema,
} from "@gioco/shared";
import type { AdminAuth, AuthResult } from "./admin-auth.js";
import type { Result } from "./result.js";
import type { AdminService } from "./admin-service.js";
import type { Engine } from "./engine.js";
import type { MasterAuth } from "./master-auth.js";

/** Funzioni legate al Game Master: link limitato e archivio dei messaggi. */
export interface MasterDeps {
  auth: MasterAuth;
  engine: Engine;
}

const STATUS: Record<AdminError, number> = {
  invalid: 400,
  unauthorized: 401,
  bad_credentials: 401,
  too_many_attempts: 429,
  already_configured: 409,
  conflict: 409,
  not_found: 404,
};

function send<T>(reply: FastifyReply, result: Result<T>, successCode = 200) {
  if (result.ok) return reply.code(successCode).send(result.value);
  return reply.code(STATUS[result.error]).send({ error: result.error, detail: result.detail });
}

function sendAuth(reply: FastifyReply, result: AuthResult) {
  if (result.ok) return reply.send({ token: result.token });
  return reply.code(STATUS[result.error]).send({ error: result.error });
}

function parse<T>(schema: ZodType<T>, body: unknown, reply: FastifyReply): T | undefined {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  void reply.code(400).send({ error: "invalid" satisfies AdminError });
  return undefined;
}

type IdParams = { id: string };

export function registerAdminRoutes(app: FastifyInstance, auth: AdminAuth, service: AdminService, master?: MasterDeps): void {
  // ---- Pubbliche: stato, prima configurazione, login ----
  app.get("/api/admin/status", async () => ({ configured: auth.isConfigured() }));

  app.post("/api/admin/setup", async (req, reply) => {
    const body = parse(passwordBody, req.body, reply);
    if (body) return sendAuth(reply, auth.setup(body.password));
  });

  app.post("/api/admin/login", async (req, reply) => {
    const body = parse(passwordBody, req.body, reply);
    if (body) return sendAuth(reply, auth.login(body.password));
  });

  // ---- Protette: richiedono `Authorization: Bearer <token>` ----
  app.register(async (api) => {
    api.addHook("onRequest", async (req, reply) => {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (!auth.verify(token)) return reply.code(401).send({ error: "unauthorized" satisfies AdminError });
    });

    api.get("/api/admin/players", async () => service.listPlayers());
    // Con i PIN: solo la regia autenticata li legge, per ricordarli a chi li dimentica.
    api.get("/api/admin/players/details", async () => service.listPlayerDetails());
    api.post<{ Params: IdParams }>("/api/admin/players/:id/reset-pin", async (req, reply) =>
      send(reply, service.resetPlayerPin(req.params.id)),
    );

    api.get("/api/admin/teams", async () => service.listTeams());
    api.post("/api/admin/teams", async (req, reply) => {
      const body = parse(teamInputSchema, req.body, reply);
      if (body) return send(reply, service.createTeam(body), 201);
    });
    api.put<{ Params: IdParams }>("/api/admin/teams/:id", async (req, reply) => {
      const body = parse(teamInputSchema, req.body, reply);
      if (body) return send(reply, service.updateTeam(req.params.id, body));
    });
    api.delete<{ Params: IdParams }>("/api/admin/teams/:id", async (req, reply) =>
      send(reply, service.deleteTeam(req.params.id)),
    );

    api.get("/api/admin/events", async () => service.listEvents());
    api.post("/api/admin/events", async (req, reply) => {
      const body = parse(eventInputSchema, req.body, reply);
      if (body) return reply.code(201).send(service.createEvent(body));
    });
    api.get<{ Params: IdParams }>("/api/admin/events/:id", async (req, reply) =>
      send(reply, service.getEvent(req.params.id)),
    );
    api.patch<{ Params: IdParams }>("/api/admin/events/:id", async (req, reply) => {
      const body = parse(eventPatchSchema, req.body, reply);
      if (body) return send(reply, service.patchEvent(req.params.id, body));
    });
    api.delete<{ Params: IdParams }>("/api/admin/events/:id", async (req, reply) =>
      send(reply, service.deleteEvent(req.params.id)),
    );
    api.put<{ Params: IdParams }>("/api/admin/events/:id/teams", async (req, reply) => {
      const body = parse(eventTeamsSchema, req.body, reply);
      if (body) return send(reply, service.setEventTeams(req.params.id, body.teamIds));
    });
    api.put<{ Params: IdParams & { playerId: string } }>(
      "/api/admin/events/:id/players/:playerId",
      async (req, reply) => {
        const body = parse(assignPlayerSchema, req.body, reply);
        if (body) return send(reply, service.assignPlayer(req.params.id, req.params.playerId, body.teamId));
      },
    );
    api.delete<{ Params: IdParams & { playerId: string } }>(
      "/api/admin/events/:id/players/:playerId",
      async (req, reply) => send(reply, service.removePlayer(req.params.id, req.params.playerId)),
    );

    api.post<{ Params: IdParams }>("/api/admin/events/:id/matches", async (req, reply) => {
      const body = parse(matchInputSchema, req.body, reply);
      if (body) return send(reply, service.createMatch(req.params.id, body), 201);
    });
    api.patch<{ Params: IdParams }>("/api/admin/matches/:id", async (req, reply) => {
      const body = parse(matchPatchSchema, req.body, reply);
      if (body) return send(reply, service.patchMatch(req.params.id, body));
    });
    api.delete<{ Params: IdParams }>("/api/admin/matches/:id", async (req, reply) =>
      send(reply, service.deleteMatch(req.params.id)),
    );

    // ---- Game Master: link limitato e archivio dei messaggi ed eventi ----
    if (master) {
      api.post("/api/admin/master-link", async (_req, reply) => {
        const matchId = master.engine.activeMatchId;
        if (!matchId || !master.engine.masterAvailable) {
          return reply.code(409).send({ error: "conflict" satisfies AdminError, detail: "Il round in corso non prevede un Game Master." });
        }
        return master.auth.issue(matchId);
      });
      api.delete("/api/admin/master-link", async (_req, reply) => {
        master.auth.revoke();
        return reply.code(204).send();
      });
      api.get<{ Params: IdParams }>("/api/admin/events/:id/messages", async (req) => master.engine.messageStore.list(req.params.id));
      api.delete<{ Params: IdParams }>("/api/admin/events/:id/messages", async (req) => ({ removed: master.engine.messageStore.deleteForEvent(req.params.id) }));
    }

    // ---- Libreria minigiochi e round ----
    const lib = service.library;
    api.get("/api/admin/minigame-types", async () => lib.listTypes());
    api.get("/api/admin/instances", async () => lib.listInstances());
    api.post("/api/admin/instances", async (req, reply) => {
      const body = parse(instanceInputSchema, req.body, reply);
      if (body) return send(reply, lib.createInstance(body), 201);
    });
    api.put<{ Params: IdParams }>("/api/admin/instances/:id", async (req, reply) => {
      const body = parse(instanceInputSchema, req.body, reply);
      if (body) return send(reply, lib.updateInstance(req.params.id, body));
    });
    api.delete<{ Params: IdParams }>("/api/admin/instances/:id", async (req, reply) =>
      send(reply, lib.deleteInstance(req.params.id)),
    );
    api.post<{ Params: IdParams }>("/api/admin/matches/:id/rounds", async (req, reply) => {
      const body = parse(roundInputSchema, req.body, reply);
      if (body) return send(reply, lib.addRound(req.params.id, body.instanceId), 201);
    });
    api.put<{ Params: IdParams }>("/api/admin/matches/:id/rounds/order", async (req, reply) => {
      const body = parse(roundOrderSchema, req.body, reply);
      if (body) return send(reply, lib.reorderRounds(req.params.id, body.roundIds));
    });
    api.delete<{ Params: IdParams }>("/api/admin/rounds/:id", async (req, reply) =>
      send(reply, lib.deleteRound(req.params.id)),
    );
  });
}
