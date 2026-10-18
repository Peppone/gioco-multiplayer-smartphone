import { defineConfig } from "@playwright/test";

/** Porta del primo server di prova: non interferisce con il server di sviluppo (3000). */
const BASE_PORT = 3100;

/**
 * Worker in parallelo, ognuno con il suo server di prova (porta e database propri, vedi e2e/server.mjs):
 * l'engine ha una sola partita in corso per server, quindi le partite di worker diversi non si toccano.
 */
const WORKERS = 6;

/**
 * Playwright rilegge questo file in ogni worker e gli passa il suo indice (da 0 a WORKERS - 1): così ogni worker
 * usa il suo server, anche i test che aprono contesti a mano (`browser.newContext` eredita `baseURL`).
 */
const workerPort = BASE_PORT + Number(process.env.TEST_PARALLEL_INDEX ?? 0);

/** Identifica questa esecuzione: i server aspettano il client compilato da questa, non da una vecchia. */
const RUN = process.env.E2E_RUN ?? String(Date.now());

/**
 * Test che usano solo pagine statiche (`/preview`, suoni, asset): non avviano partite, quindi anche i test di uno
 * stesso file possono girare in parallelo. Gli altri file restano in sequenza dentro il proprio worker.
 */
const STATIC_SPECS = /(-preview|themes)\.spec\.ts$/;

export default defineConfig({
  testDir: "e2e",
  workers: WORKERS,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${workerPort}`,
    // Usa Edge, già presente su Windows: nessun download di browser.
    channel: "msedge",
    headless: true,
    // Niente GPU: con decine di pagine insieme la GPU integrata si satura e i fotogrammi video arrivano in ritardo
    // (lo scanner QR di Caccia ai Fantasmi resta senza immagine: 5 fallimenti su 6 con la GPU, 0 senza). I test non
    // fanno screenshot, quindi il disegno in software basta. La GPU discreta (--force_high_performance_gpu) va peggio:
    // ogni fotogramma passa comunque dalla scheda integrata. E2E_GPU=on torna alla GPU predefinita, per confronto.
    ...(process.env.E2E_GPU !== "on" && { launchOptions: { args: ["--disable-gpu"] } }),
    trace: "retain-on-failure",
  },
  projects: [
    { name: "anteprime", testMatch: STATIC_SPECS, fullyParallel: true },
    { name: "partite", testIgnore: STATIC_SPECS },
  ],
  webServer: Array.from({ length: WORKERS }, (_, i) => ({
    command: "node e2e/server.mjs",
    url: `http://localhost:${BASE_PORT + i}/api/info`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore" as const,
    stderr: "pipe" as const,
    env: { E2E_PORT: String(BASE_PORT + i), E2E_INDEX: String(i), E2E_RUN: RUN },
  })),
});
