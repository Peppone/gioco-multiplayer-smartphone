import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AnyMinigame, InstanceView, MinigameTypeView, RoundView } from "@gioco/shared";
import { type LibraryContentType, libraryContentTypes, minigames as defaultRegistry } from "@gioco/minigames";
import { type Db, type InstanceRow, matchRounds, matches, minigameInstances } from "./db.js";
import { type Result, fail, ok } from "./result.js";

const toInstance = (r: InstanceRow): InstanceView => ({
  id: r.id,
  typeId: r.typeId,
  title: r.title,
  theme: r.theme as InstanceView["theme"],
  config: JSON.parse(r.configJson) as unknown,
});

/** Libreria delle istanze di minigioco e composizione dei round nelle partite. */
export class LibraryService {
  constructor(
    private readonly db: Db,
    private readonly registry: Record<string, AnyMinigame> = defaultRegistry,
    private readonly content: Record<string, LibraryContentType> = libraryContentTypes,
  ) {}

  listTypes(): MinigameTypeView[] {
    const schema = (s: z.ZodType) => z.toJSONSchema(s, { io: "input", reused: "inline", unrepresentable: "any" });
    const plugins = Object.values(this.registry).map((t): MinigameTypeView => ({
      id: t.id,
      kind: "minigame",
      title: t.title,
      defaultTheme: t.defaultTheme,
      // Un plugin con `libraryConfigSchema` (es. il duello) si compila con quello schema, non con la configurazione completa.
      sampleConfig: t.libraryConfigSchema ? t.draftLibraryConfig : t.sampleConfig,
      draftConfig: t.libraryConfigSchema ? t.draftLibraryConfig : t.draftConfig,
      configJsonSchema: schema(t.libraryConfigSchema ?? t.configSchema),
    }));
    const content = Object.values(this.content).map((t): MinigameTypeView => ({
      id: t.id,
      kind: "content",
      title: t.title,
      defaultTheme: t.defaultTheme,
      sampleConfig: t.sampleConfig,
      configJsonSchema: schema(t.configSchema),
    }));
    return [...plugins, ...content];
  }

  listInstances(): InstanceView[] {
    return this.db.select().from(minigameInstances).orderBy(asc(minigameInstances.title)).all().map(toInstance);
  }

  getInstance(id: string): InstanceRow | undefined {
    return this.db.select().from(minigameInstances).where(eq(minigameInstances.id, id)).get();
  }

  /** Valida la configurazione con lo schema del tipo; restituisce la config normalizzata (con i default). */
  private validate(typeId: string, config: unknown): Result<unknown> {
    const type = this.registry[typeId] ?? this.content[typeId];
    if (!type) return fail("not_found", "Tipo di minigioco sconosciuto");
    const schema = "libraryConfigSchema" in type && type.libraryConfigSchema ? type.libraryConfigSchema : type.configSchema;
    const parsed = schema.safeParse(config);
    if (parsed.success) return ok(parsed.data);
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ");
    return fail("invalid", detail);
  }

  createInstance(input: { typeId: string; title: string; theme?: InstanceView["theme"]; config: unknown }): Result<InstanceView> {
    const config = this.validate(input.typeId, input.config);
    if (!config.ok) return config;
    const row: InstanceRow = {
      id: randomUUID(),
      typeId: input.typeId,
      title: input.title,
      theme: input.theme ?? (this.registry[input.typeId] ?? this.content[input.typeId])!.defaultTheme,
      configJson: JSON.stringify(config.value),
    };
    this.db.insert(minigameInstances).values(row).run();
    return ok(toInstance(row));
  }

  updateInstance(id: string, input: { title: string; theme?: InstanceView["theme"]; config: unknown }): Result<InstanceView> {
    const current = this.getInstance(id);
    if (!current) return fail("not_found");
    const config = this.validate(current.typeId, input.config);
    if (!config.ok) return config;
    const next: InstanceRow = {
      ...current,
      title: input.title,
      theme: input.theme ?? current.theme,
      configJson: JSON.stringify(config.value),
    };
    this.db.update(minigameInstances).set(next).where(eq(minigameInstances.id, id)).run();
    return ok(toInstance(next));
  }

  private roundInstance(roundId: string): InstanceRow | undefined {
    const round = this.db.select({ instanceId: matchRounds.instanceId }).from(matchRounds).where(eq(matchRounds.id, roundId)).get();
    return round && this.getInstance(round.instanceId);
  }

  /**
   * Salva la configurazione indicata per un round: senza `asTitle` sostituisce l'istanza del round, con `asTitle`
   * ne crea una nuova con quel nome (stesso tipo e tema). Validata come ogni modifica.
   */
  saveRoundConfig(roundId: string, config: unknown, asTitle?: string): Result<InstanceView> {
    const current = this.roundInstance(roundId);
    if (!current) return fail("not_found", "Istanza del round non trovata");
    if (asTitle) return this.createInstance({ typeId: current.typeId, title: asTitle, theme: current.theme as InstanceView["theme"], config });
    return this.updateInstance(current.id, { title: current.title, config });
  }

  /** La configurazione indicata nella forma di un'istanza (per l'esportazione in JSON). */
  describeRoundConfig(roundId: string, config: unknown): Result<Pick<InstanceView, "typeId" | "title" | "theme" | "config">> {
    const current = this.roundInstance(roundId);
    if (!current) return fail("not_found", "Istanza del round non trovata");
    return ok({ typeId: current.typeId, title: current.title, theme: current.theme as InstanceView["theme"], config });
  }

  /** Un'istanza già usata in una partita non si elimina (la partita perderebbe il round). */
  deleteInstance(id: string): Result<null> {
    if (!this.getInstance(id)) return fail("not_found");
    const used = this.db.select({ id: matchRounds.id }).from(matchRounds).where(eq(matchRounds.instanceId, id)).get();
    if (used) return fail("conflict", "Istanza usata in una partita");
    this.db.delete(minigameInstances).where(eq(minigameInstances.id, id)).run();
    return ok(null);
  }

  // ---- Round delle partite ----

  rounds(matchId: string): RoundView[] {
    return this.db
      .select({
        id: matchRounds.id,
        order: matchRounds.order,
        instanceId: matchRounds.instanceId,
        title: minigameInstances.title,
        typeId: minigameInstances.typeId,
      })
      .from(matchRounds)
      .innerJoin(minigameInstances, eq(minigameInstances.id, matchRounds.instanceId))
      .where(eq(matchRounds.matchId, matchId))
      .orderBy(asc(matchRounds.order))
      .all();
  }

  /** I round si modificano solo finché la partita non è avviata. */
  private matchState(matchId: string): "missing" | "locked" | "pending" {
    const m = this.db.select().from(matches).where(eq(matches.id, matchId)).get();
    if (!m) return "missing";
    return m.status === "pending" ? "pending" : "locked";
  }

  addRound(matchId: string, instanceId: string): Result<RoundView[]> {
    const state = this.matchState(matchId);
    if (state === "missing") return fail("not_found");
    if (state === "locked") return fail("conflict", "La partita è già avviata: i round non si modificano");
    if (!this.getInstance(instanceId)) return fail("not_found");
    const last = this.db
      .select({ max: sql<number | null>`max(${matchRounds.order})` })
      .from(matchRounds)
      .where(eq(matchRounds.matchId, matchId))
      .get();
    this.db.insert(matchRounds).values({ id: randomUUID(), matchId, order: (last?.max ?? 0) + 1, instanceId }).run();
    return ok(this.rounds(matchId));
  }

  deleteRound(roundId: string): Result<RoundView[]> {
    const r = this.db.select().from(matchRounds).where(eq(matchRounds.id, roundId)).get();
    if (!r) return fail("not_found");
    if (this.matchState(r.matchId) === "locked") {
      return fail("conflict", "La partita è già avviata: i round non si modificano");
    }
    this.db.transaction((tx) => {
      tx.delete(matchRounds).where(eq(matchRounds.id, roundId)).run();
      tx.update(matchRounds)
        .set({ order: sql`${matchRounds.order} - 1` })
        .where(and(eq(matchRounds.matchId, r.matchId), sql`${matchRounds.order} > ${r.order}`))
        .run();
    });
    return ok(this.rounds(r.matchId));
  }

  /** Riordina i round: `roundIds` deve essere una permutazione esatta dei round della partita. */
  reorderRounds(matchId: string, roundIds: string[]): Result<RoundView[]> {
    const state = this.matchState(matchId);
    if (state === "missing") return fail("not_found");
    if (state === "locked") return fail("conflict", "La partita è già avviata: i round non si modificano");
    const current = this.rounds(matchId).map((r) => r.id);
    const same = roundIds.length === current.length && new Set(roundIds).size === roundIds.length && roundIds.every((id) => current.includes(id));
    if (!same) return fail("invalid", "L'elenco dei round non corrisponde a quelli della partita");
    this.db.transaction((tx) => {
      roundIds.forEach((id, i) => tx.update(matchRounds).set({ order: i + 1 }).where(eq(matchRounds.id, id)).run());
    });
    return ok(this.rounds(matchId));
  }
}
