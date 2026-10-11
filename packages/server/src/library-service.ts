import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { AnyMinigame, InstanceView, MinigameTypeView, RoundView } from "@gioco/shared";
import { minigames as defaultRegistry } from "@gioco/minigames";
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
  ) {}

  listTypes(): MinigameTypeView[] {
    return Object.values(this.registry).map((t) => ({
      id: t.id,
      title: t.title,
      defaultTheme: t.defaultTheme,
      sampleConfig: t.sampleConfig,
    }));
  }

  listInstances(): InstanceView[] {
    return this.db.select().from(minigameInstances).orderBy(asc(minigameInstances.title)).all().map(toInstance);
  }

  getInstance(id: string): InstanceRow | undefined {
    return this.db.select().from(minigameInstances).where(eq(minigameInstances.id, id)).get();
  }

  /** Valida la configurazione con lo schema del tipo; restituisce la config normalizzata (con i default). */
  private validate(typeId: string, config: unknown): Result<unknown> {
    const type = this.registry[typeId];
    if (!type) return fail("not_found", "Tipo di minigioco sconosciuto");
    const parsed = type.configSchema.safeParse(config);
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
      theme: input.theme ?? this.registry[input.typeId]!.defaultTheme,
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

  addRound(matchId: string, instanceId: string): Result<RoundView[]> {
    if (!this.db.select().from(matches).where(eq(matches.id, matchId)).get()) return fail("not_found");
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
    this.db.transaction((tx) => {
      tx.delete(matchRounds).where(eq(matchRounds.id, roundId)).run();
      tx.update(matchRounds)
        .set({ order: sql`${matchRounds.order} - 1` })
        .where(and(eq(matchRounds.matchId, r.matchId), sql`${matchRounds.order} > ${r.order}`))
        .run();
    });
    return ok(this.rounds(r.matchId));
  }

  deleteRoundsOfMatch(matchId: string): void {
    this.db.delete(matchRounds).where(eq(matchRounds.matchId, matchId)).run();
  }
}
