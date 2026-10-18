import { describe, expect, it } from "vitest";
import { runStress } from "./run.js";

// Test di carico: 30 giocatori simulati, con latenza e orologi sfasati, giocano una partita classica
// (un round per ogni minigioco) e un duello su un server vero. Dura più di un minuto: `pnpm test:stress`.
describe("stress test con 30 giocatori", () => {
  it("regge una serata completa senza errori, con aggiornamenti rapidi e punteggi coerenti", async () => {
    const report = await runStress({ players: 30, scenario: "all", latencyMs: [50, 300], thinkMs: [200, 2000], seed: 7 });
    const failed = report.checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`);
    expect(failed, `controlli falliti:\n${failed.join("\n")}`).toEqual([]);
    expect(report.matches).toHaveLength(2);
    expect(report.fanoutMs.p95).toBeLessThan(1_500);
  }, 280_000);
});

// Stanze Segrete: 10 giocatori scrivono e chiedono di muoversi a raffica, un GM simulato approva e manda posta ed eventi.
describe("stress test di Stanze Segrete con il Game Master", () => {
  it("10 giocatori: nessun errore, aggiornamenti rapidi, messaggi ed eventi tutti nel database", async () => {
    const report = await runStress({ players: 10, scenario: "stanze", latencyMs: [50, 200], thinkMs: [200, 1200], seed: 3, stanzeSeconds: 15 });
    const failed = report.checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`);
    expect(failed, `controlli falliti:\n${failed.join("\n")}`).toEqual([]);
  }, 120_000);

  it("con 11 giocatori l'avvio del round viene rifiutato con un messaggio chiaro", async () => {
    const report = await runStress({ players: 11, scenario: "stanze", latencyMs: [20, 80], thinkMs: [100, 300], seed: 4 });
    const warnings = report.matches.flatMap((m) => m.run.warnings);
    expect(warnings.some((w) => w.includes("massimo 10 giocatori, in serata ce ne sono 11"))).toBe(true);
    expect(report.matches[0]!.run.reachedEnd).toBe(false);
  }, 120_000);
});

// Parole Mannare: un Sindaco simulato assegna gettoni a raffica (anche annulla), gli altri votano; massimo 12 giocatori.
describe("stress test di Parole Mannare", () => {
  it("12 giocatori con latenza: nessun errore, conteggi coerenti con il registro", async () => {
    const report = await runStress({ players: 12, scenario: "parole", latencyMs: [50, 250], thinkMs: [200, 1200], seed: 5 });
    const failed = report.checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`);
    expect(failed, `controlli falliti:\n${failed.join("\n")}`).toEqual([]);
  }, 200_000);

  it("con 13 giocatori l'avvio del round viene rifiutato con un messaggio chiaro", async () => {
    const report = await runStress({ players: 13, scenario: "parole", latencyMs: [20, 80], thinkMs: [100, 300], seed: 6 });
    const warnings = report.matches.flatMap((m) => m.run.warnings);
    expect(warnings.some((w) => w.includes("massimo 12 giocatori, in serata ce ne sono 13"))).toBe(true);
    expect(report.matches[0]!.run.reachedEnd).toBe(false);
  }, 120_000);
});

// Stanze col botto: due stanze, voto del leader, mostra e scambia, ostaggi; da 6 a 30 giocatori.
describe("stress test di Stanze col botto", () => {
  it("30 giocatori con latenza e orologi sfasati: nessun errore, stesso esito su tutti i telefoni", async () => {
    const report = await runStress({ players: 30, scenario: "botto", latencyMs: [50, 250], thinkMs: [200, 1200], seed: 8 });
    const failed = report.checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`);
    expect(failed, `controlli falliti:\n${failed.join("\n")}`).toEqual([]);
    expect(report.fanoutMs.p95).toBeLessThan(1_500);
  }, 200_000);

  it("con 5 giocatori l'avvio del round viene rifiutato con un messaggio chiaro", async () => {
    const report = await runStress({ players: 5, scenario: "botto", latencyMs: [20, 80], thinkMs: [100, 300], seed: 9 });
    const warnings = report.matches.flatMap((m) => m.run.warnings);
    expect(warnings.some((w) => w.includes("servono almeno 6 giocatori, in serata ce ne sono 5"))).toBe(true);
    expect(report.matches[0]!.run.reachedEnd).toBe(false);
  }, 120_000);
});

// Agenti Segreti: due squadre con un Capo-spia ciascuna, indizi (anche rifiutati) e voti di squadra; da 4 a 30 giocatori.
describe("stress test di Agenti Segreti", () => {
  it("30 giocatori con latenza e orologi sfasati: nessun errore, stessa griglia su tutti i telefoni, mappa solo ai Capi-spia", async () => {
    const report = await runStress({ players: 30, scenario: "agenti", latencyMs: [50, 250], thinkMs: [200, 1200], seed: 10 });
    const failed = report.checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`);
    expect(failed, `controlli falliti:\n${failed.join("\n")}`).toEqual([]);
    expect(report.fanoutMs.p95).toBeLessThan(1_500);
  }, 200_000);

  it("con 3 giocatori l'avvio del round viene rifiutato con un messaggio chiaro", async () => {
    const report = await runStress({ players: 3, scenario: "agenti", latencyMs: [20, 80], thinkMs: [100, 300], seed: 11 });
    const warnings = report.matches.flatMap((m) => m.run.warnings);
    expect(warnings.some((w) => w.includes("servono almeno 4 giocatori, in serata ce ne sono 3"))).toBe(true);
    expect(report.matches[0]!.run.reachedEnd).toBe(false);
  }, 120_000);
});
