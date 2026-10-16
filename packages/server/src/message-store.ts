import { asc, eq, inArray } from "drizzle-orm";
import type { ArchivedMessage, RoundMessage } from "@gioco/shared";
import { type Db, matchRounds, matches, minigameInstances, players, roundEventReceipts, roundMessages } from "./db.js";

export interface RoundRef {
  eventId: string;
  matchId: string;
  roundId: string;
}

const signature = (m: RoundMessage) => `${m.readAt ?? ""}|${m.cancelled ? 1 : 0}|${m.accepted ? JSON.stringify(m.accepted) : ""}`;

/**
 * Salva nel database i messaggi e gli eventi dei round con Game Master. Idempotente: la chiave unica
 * (round, messaggio) evita i duplicati dopo un riavvio o la ripresa da snapshot. Lo stato del plugin tiene solo
 * gli ultimi messaggi, il database li tiene tutti. Il testo non si scrive mai nei log.
 */
export class MessageStore {
  /** Ultima versione salvata per round e messaggio: evita scritture inutili a ogni cambio di stato. */
  private seen = new Map<string, Map<number, string>>();

  constructor(private readonly db: Db) {}

  persist(ref: RoundRef, msgs: RoundMessage[]): void {
    const cache = this.seen.get(ref.roundId) ?? new Map<number, string>();
    this.seen.set(ref.roundId, cache);
    const changed = msgs.filter((m) => cache.get(m.id) !== signature(m));
    if (changed.length === 0) return;
    this.db.transaction((tx) => {
      for (const m of changed) {
        const row = {
          eventId: ref.eventId,
          matchId: ref.matchId,
          roundId: ref.roundId,
          messageId: m.id,
          kind: m.kind,
          fromKind: m.fromKind,
          fromPlayerId: m.fromPlayerId,
          toKind: m.toKind,
          toPlayerId: m.toPlayerId,
          toCell: m.toCell,
          recipientsJson: m.recipients ? JSON.stringify(m.recipients) : null,
          text: m.text,
          ts: m.ts,
          readAt: m.readAt,
          cancelled: m.cancelled ? 1 : 0,
        };
        tx.insert(roundMessages)
          .values(row)
          .onConflictDoUpdate({ target: [roundMessages.roundId, roundMessages.messageId], set: { readAt: row.readAt, cancelled: row.cancelled } })
          .run();
        for (const [playerId, acceptedAt] of Object.entries(m.accepted ?? {})) {
          tx.insert(roundEventReceipts)
            .values({ roundId: ref.roundId, messageId: m.id, playerId, acceptedAt })
            .onConflictDoUpdate({ target: [roundEventReceipts.roundId, roundEventReceipts.messageId, roundEventReceipts.playerId], set: { acceptedAt } })
            .run();
        }
      }
    });
    for (const m of changed) cache.set(m.id, signature(m));
  }

  /** Archivio di una serata, in ordine di invio. */
  list(eventId: string): ArchivedMessage[] {
    const rows = this.db
      .select()
      .from(roundMessages)
      .where(eq(roundMessages.eventId, eventId))
      .orderBy(asc(roundMessages.ts), asc(roundMessages.messageId))
      .all();
    if (rows.length === 0) return [];
    const nicks = new Map(this.db.select({ id: players.id, nickname: players.nickname }).from(players).all().map((p) => [p.id, p.nickname]));
    const matchNames = new Map(this.db.select({ id: matches.id, name: matches.name }).from(matches).where(eq(matches.eventId, eventId)).all().map((m) => [m.id, m.name]));
    const roundIds = [...new Set(rows.map((r) => r.roundId))];
    const titles = new Map(
      this.db
        .select({ id: matchRounds.id, title: minigameInstances.title })
        .from(matchRounds)
        .innerJoin(minigameInstances, eq(minigameInstances.id, matchRounds.instanceId))
        .where(inArray(matchRounds.id, roundIds))
        .all()
        .map((r) => [r.id, r.title]),
    );
    const receipts = this.db.select().from(roundEventReceipts).where(inArray(roundEventReceipts.roundId, roundIds)).all();
    return rows.map((r) => ({
      roundId: r.roundId,
      roundTitle: titles.get(r.roundId) ?? "",
      matchId: r.matchId,
      matchName: matchNames.get(r.matchId) ?? "",
      messageId: r.messageId,
      kind: r.kind as "message" | "event",
      fromKind: r.fromKind as "master" | "player",
      fromNickname: r.fromPlayerId ? (nicks.get(r.fromPlayerId) ?? "?") : null,
      toKind: r.toKind as ArchivedMessage["toKind"],
      toNickname: r.toPlayerId ? (nicks.get(r.toPlayerId) ?? "?") : null,
      toCell: r.toCell,
      recipients:
        r.kind === "event"
          ? receipts
              .filter((x) => x.roundId === r.roundId && x.messageId === r.messageId)
              .map((x) => ({ playerId: x.playerId, nickname: nicks.get(x.playerId) ?? "?", acceptedAt: x.acceptedAt }))
          : [],
      text: r.text,
      ts: r.ts,
      readAt: r.readAt,
      cancelled: r.cancelled === 1,
    }));
  }

  /** «Elimina messaggi ed eventi di questa serata». Restituisce quanti ne ha tolti. */
  deleteForEvent(eventId: string): number {
    const roundIds = [...new Set(this.db.select({ roundId: roundMessages.roundId }).from(roundMessages).where(eq(roundMessages.eventId, eventId)).all().map((r) => r.roundId))];
    const removed = this.db.transaction((tx) => {
      if (roundIds.length > 0) tx.delete(roundEventReceipts).where(inArray(roundEventReceipts.roundId, roundIds)).run();
      return tx.delete(roundMessages).where(eq(roundMessages.eventId, eventId)).run().changes;
    });
    for (const id of roundIds) this.seen.delete(id);
    return removed;
  }
}
