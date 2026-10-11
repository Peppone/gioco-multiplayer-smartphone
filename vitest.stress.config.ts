import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tools/bots/src/stress.test.ts"], testTimeout: 280_000 } });
