import os from 'node:os';
import path from 'node:path';

// Chromium that ships with Playwright 1.54.2 (browser build 1181).
// Every Playwright version under test launches this full binary, not its own browser
// and not chromium_headless_shell. Headless runs pass --headless to this same executable.
export const pinnedChromiumVersion = '139.0.7258.5';

export const pinnedChromiumExecutable = path.join(
  os.homedir(),
  'Library',
  'Caches',
  'ms-playwright',
  'chromium-1181',
  'chrome-mac',
  'Chromium.app',
  'Contents',
  'MacOS',
  'Chromium',
);

// Keep the Auth emulator port in sync with firebase.json.
export const projectId = 'demo-auth-popup';

export const apiKey = 'demo-api-key';

export const authDomain = 'demo-auth-popup.firebaseapp.com';

export const authEmulatorHost = '127.0.0.1';

export const authEmulatorPort = 19099;

export const defaultAuthEmulatorUrl = `http://${authEmulatorHost}:${authEmulatorPort}`;

export const pageHost = '127.0.0.1';

export const pagePort = 4173;

export const pageUrl = `http://${pageHost}:${pagePort}`;

export const authEmulatorUrlFromEnv = () => {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!host) {
    return defaultAuthEmulatorUrl;
  }
  if (host.startsWith('http://') || host.startsWith('https://')) {
    return host;
  }
  return `http://${host}`;
};
