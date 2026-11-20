import { defineConfig } from "vitest/config";

// This configuration runs only the tests that call the real public service (see .github/workflows/integration.yml).
export default defineConfig({
  test: {
    include: ["integration/**/*.integration.ts"],
  },
});
