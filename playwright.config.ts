import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Some sandboxes ship a Chromium build that predates the installed @playwright/test and
 * forbid downloading another. Point at whatever is already on disk when that is the case;
 * fall back to Playwright's own resolution (CI installs its matching build) otherwise.
 */
function preinstalledChromium(): string | undefined {
  const fromEnv = process.env['CHROMIUM_PATH'];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const root = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  if (!root || !existsSync(root)) return undefined;

  for (const entry of readdirSync(root)) {
    if (!entry.startsWith('chromium-')) continue;
    const candidate = join(root, entry, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const executablePath = preinstalledChromium();

/**
 * Custom elements, shadow DOM, and audio playback are only real in a real browser, so the
 * component-level tests run here rather than in the jsdom-style unit suite.
 */
export default defineConfig({
  testDir: 'test/browser',
  fullyParallel: true,
  reporter: process.env['CI'] ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:8080',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      // Lets the audio element "play" without a sound device present.
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    },
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://localhost:8080/test/fixtures/element.html',
    reuseExistingServer: !process.env['CI'],
  },
});
