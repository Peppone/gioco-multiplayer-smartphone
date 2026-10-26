import type { FastifyInstance, FastifyReply } from "fastify";
import { type ZodType, z } from "zod";
import {
  type AdminError,
  assignPlayerSchema,
  captainSchema,
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
  testSessionInputSchema,
} from "@gioco/shared";
import type { AdminAuth, AuthResult } from "./admin-auth.js";
import type { Result } from "./result.js";
import type { AdminService } from "./admin-service.js";
import type { Engine } from "./engine.js";
import type { MasterAuth } from "./master-auth.js";
import type { TestSession } from "./test-session.js";

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

/** Rifiuta l'eliminazione di ciò che sta usando la partita live. */
const busy = (reply: FastifyReply, detail: string) => reply.code(STATUS.conflict).send({ error: "conflict" satisfies AdminError, detail });

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

/** Salvataggio della configurazione del round in corso: con `title` come nuova istanza, senza nell'istanza del round. */
const saveAsBody = z.object({ title: z.string().trim().min(1).max(80).optional() });

export function registerAdminRoutes(app: FastifyInstance, auth: AdminAuth, service: AdminService, master?: MasterDeps, testSession?: TestSession): void {
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

    api.delete<{ Params: IdParams }>("/api/admin/players/:id", async (req, reply) => {
      if (master?.engine.rosterIds().includes(req.params.id)) return busy(reply, "Il giocatore è nella partita in corso: concludila prima.");
      return send(reply, service.deletePlayer(req.params.id));
    });

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
    api.delete<{ Params: IdParams }>("/api/admin/events/:id", async (req, reply) => {
      if (master?.engine.currentEventId === req.params.id) return busy(reply, "La serata ha una partita in corso: concludila prima.");
      return send(reply, service.deleteEvent(req.params.id));
    });
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
    api.put<{ Params: IdParams & { playerId: string } }>(
      "/api/admin/events/:id/players/:playerId/captain",
      async (req, reply) => {
        const body = parse(captainSchema, req.body, reply);
        if (body) return send(reply, service.setCaptain(req.params.id, req.params.playerId, body.captain));
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
    api.delete<{ Params: IdParams }>("/api/admin/matches/:id", async (req, reply) => {
      if (master?.engine.currentMatchId === req.params.id) return busy(reply, "La partita è in corso: concludila prima.");
      return send(reply, service.deleteMatch(req.params.id));
    });

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

    // ---- Prova rapida di un minigioco: giocatori finti, nessuna serata da allestire ----
    if (testSession) {
      api.get("/api/admin/test-session", async () => ({ session: testSession.get() }));
      api.post("/api/admin/test-session", async (req, reply) => {
        const body = parse(testSessionInputSchema, req.body, reply);
        if (body) return send(reply, testSession.start(body), 201);
      });
      api.delete("/api/admin/test-session", async (_req, reply) => {
        testSession.stop();
        return reply.code(204).send();
      });
    }

    // ---- Libreria minigiochi e round ----
    const lib = service.library;
    // Salva nell'istanza in libreria ciò che il round in corso ha scritto o modificato (solo la regia, mai il Game Master da link).
    if (master) {
      const notSavable = (reply: FastifyReply) =>
        reply.code(409).send({ error: "conflict" satisfies AdminError, detail: "Il round in corso non può essere salvato nell'istanza." });
      // Senza titolo sostituisce l'istanza del round; con un titolo ne crea una nuova con quel nome.
      api.post("/api/admin/live/save-to-instance", async (req, reply) => {
        const body = parse(saveAsBody, req.body ?? {}, reply);
        if (!body) return;
        const out = master.engine.exportRoundConfig();
        if (!out) return notSavable(reply);
        return send(reply, lib.saveRoundConfig(out.roundId, out.config, body.title), body.title ? 201 : 200);
      });
      // La configurazione attuale nella forma di un'istanza, per esportarla in JSON.
      api.get("/api/admin/live/config", async (_req, reply) => {
        const out = master.engine.exportRoundConfig();
        if (!out) return notSavable(reply);
        return send(reply, lib.describeRoundConfig(out.roundId, out.config));
      });
    }
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
