import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // I test e2e (e2e/*.spec.ts) sono di Playwright: si lanciano con `pnpm test:e2e`.
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"],
  },
});
