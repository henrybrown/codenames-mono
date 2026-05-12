import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 90_000, // some flows wait for the 8s NextTurn countdown
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  workers: process.env.CI ? 1 : 4,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8000",
    headless: true,
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
      },
    },
    /** Mobile-specific layout testing happens inline within the desktop
     *  project via page.setViewportSize() — see `03-turn-transitions.spec.ts`
     *  for the mobile-drawer test. A dedicated mobile project is omitted in
     *  this pass: the compact-dashboard drawer layout has off-viewport
     *  controls and overlay interception that need helper rework to handle
     *  cleanly. Re-add when those are polished. */
  ],
});
