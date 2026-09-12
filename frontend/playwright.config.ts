import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Two servers: the backend gives `catalog`'s E2E suite real, deterministic
  // recipe content (browse-catalog.spec.ts) and lets the offline test
  // exercise Serwist's actual cross-origin runtime caching against a real
  // response — a Playwright-level route mock would never touch the service
  // worker's own cache. Not a production launcher (see
  // `backend/scripts/e2e_recipes_server.py`'s own header comment) — E2E-only
  // infrastructure. `NEXT_PUBLIC_BACKEND_URL` must be set for the frontend's
  // *build* step specifically: Next.js inlines `NEXT_PUBLIC_*` vars at build
  // time everywhere (server and client code alike), not read at runtime —
  // discovered the hard way during Task 6 of this same module.
  webServer: [
    {
      command: "cd ../backend && uv run --with 'uvicorn[standard]' python scripts/e2e_recipes_server.py",
      url: "http://localhost:8000/recipes",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "bun run build && bun run start",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_PUBLIC_BACKEND_URL: "http://localhost:8000" },
    },
  ],
});
