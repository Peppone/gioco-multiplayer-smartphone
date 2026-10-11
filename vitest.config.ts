import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // I test e2e (e2e/*.spec.ts) sono di Playwright (`pnpm test:e2e`); lo stress test dura oltre un minuto
    // e ha il suo comando (`pnpm test:stress`).
    exclude: ["e2e/**", "tools/bots/src/stress.test.ts", "**/node_modules/**", "**/dist/**"],
  },
});
