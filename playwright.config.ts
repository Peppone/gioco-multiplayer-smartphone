import { defineConfig } from "@playwright/test";

/** Porta dedicata ai test: non interferisce con il server di sviluppo (3000). */
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  // Un solo worker: i test condividono un server e un database di prova.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Usa Edge, già presente su Windows: nessun download di browser.
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/server.mjs",
    url: `http://localhost:${PORT}/api/info`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { E2E_PORT: String(PORT) },
  },
});
