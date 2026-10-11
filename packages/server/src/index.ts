import { exec } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT } from "@gioco/shared";
import { minigames } from "@gioco/minigames";
import { AdminAuth } from "./admin-auth.js";
import { AdminService } from "./admin-service.js";
import { buildApp } from "./app.js";
import { backupDatabase } from "./backup.js";
import { openDb } from "./db.js";
import { Engine } from "./engine.js";
import { pickLanAddress } from "./network.js";
import { PlayerService } from "./players.js";
import { Presence } from "./presence.js";
import { attachRealtime } from "./realtime.js";
import { ScoreService } from "./scores.js";
import { SnapshotStore } from "./snapshots.js";
import { TunnelManager, findCloudflared } from "./tunnel.js";

// GIOCO_ROOT: cartella dell'app (nel pacchetto portabile è quella dell'eseguibile; in sviluppo la radice del repository).
const rootDir = process.env.GIOCO_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.env.PORT ?? DEFAULT_PORT);
const lanAddress = pickLanAddress();

// DB_FILE permette ai test e2e di usare un database usa-e-getta, separato da quello vero.
const dbFile = process.env.DB_FILE ?? resolve(rootDir, "data/gioco.sqlite");
const { sqlite, db } = openDb(dbFile);

// Copia di sicurezza a ogni avvio (restano le ultime): se il database si rovina o viene cancellato per errore si recupera da `backup/`.
backupDatabase(sqlite, dbFile).then(
  (file) => file && console.log(`Copia di sicurezza dei dati: ${file}`),
  (err) => console.error("Copia di sicurezza non riuscita:", err),
);

// Il PID di cloudflared si annota accanto al database: se il server muore di colpo, al riavvio il tunnel rimasto si spegne.
// Password della regia dimenticata: `--reset-admin` la azzera (senza toccare i dati) ed esce.
if (process.argv.includes("--reset-admin")) {
  new AdminAuth(db).reset();
  console.log("La password della regia è stata rimossa. Al prossimo avvio, aprendo /admin potrai sceglierne una nuova.");
  sqlite.close();
  process.exit(0);
}

const tunnel = new TunnelManager(findCloudflared(rootDir), { pidFile: resolve(dirname(dbFile), "cloudflared.pid") });
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

// Se il PC si è riavviato a metà partita, si riprende da dove era (i giocatori rientrano da soli col token).
const snapshots = new SnapshotStore(db, engine);
const recovery = snapshots.restoreOnStart();
if (recovery.restored) console.log("Partita in corso ripresa dopo il riavvio.");
if (recovery.abandoned.length > 0) console.log(`${recovery.abandoned.length} partite interrotte senza salvataggio sono state chiuse.`);
const snapshotTimer = setInterval(() => snapshots.sync(), 1000);

const app = buildApp({
  port,
  lanAddress,
  getTunnel: () => tunnel.current,
  clientDir: resolve(rootDir, process.env.CLIENT_DIR ?? "packages/client/dist"),
  admin: { auth: adminAuth, service: new AdminService(db) },
  mediaDir: resolve(dirname(dbFile), "media"),
});
const realtime = attachRealtime(app.server, { service: new PlayerService(db), presence, engine, adminAuth });
const ticker = setInterval(realtime.tick, 100);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`\nLa porta ${port} è già in uso: probabilmente il gioco è già aperto in un'altra finestra.`);
    console.error("Chiudi l'altra copia, oppure avvia questa su un'altra porta (variabile PORT).\n");
  } else {
    console.error(err);
  }
  tunnel.stop();
  process.exit(1);
}

const base = `http://localhost:${port}`;
console.log(`\nGioco avviato.`);
console.log(`  Schermo (TV/proiettore): ${base}/screen`);
console.log(`  Regia (admin):           ${base}/admin`);
if (lanAddress) console.log(`  Rete locale:             http://${lanAddress}:${port}/play`);

// Il tunnel impiega qualche secondo: l'indirizzo pubblico si scrive appena è pronto.
const tunnelWatch = setInterval(() => {
  if (tunnel.current.status === "ready") {
    console.log(`  Internet (4G/5G):        ${tunnel.current.url}/play`);
    clearInterval(tunnelWatch);
  } else if (tunnel.current.status === "error") {
    console.log(`  Internet: non disponibile (${tunnel.current.error}). Si può giocare in rete locale.`);
    clearInterval(tunnelWatch);
  }
}, 1000);

// OPEN_BROWSER=1 (lo imposta il lanciatore di Windows): apre schermo e regia nel browser predefinito.
if (process.env.OPEN_BROWSER === "1" && process.platform === "win32") {
  exec(`start "" "${base}/admin"`);
  setTimeout(() => exec(`start "" "${base}/screen"`), 800);
}

const shutdown = () => {
  clearInterval(ticker);
  clearInterval(snapshotTimer);
  clearInterval(tunnelWatch);
  snapshots.sync(); // ultimo salvataggio prima di spegnere
  tunnel.stop();
  sqlite.close();
  void app.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// Windows: chiudere la finestra della console equivale a SIGHUP; Ctrl+Pausa a SIGBREAK. Così il tunnel non resta acceso.
process.on("SIGHUP", shutdown);
process.on("SIGBREAK", shutdown);
