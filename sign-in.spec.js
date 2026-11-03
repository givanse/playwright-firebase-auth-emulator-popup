import fs from 'node:fs';
import { expect, test } from '@playwright/test';

// One sign-in attempt. Do not retry, sleep-and-reclick, or restart the popup.
// Those guards in the Crecer suite hide the stall this repro exists to show.

const readAuthRelayFrameState = async (openerPage) => {
  const relayFrame = openerPage.frames().find((frame) => {
    return frame.url().includes('/emulator/auth/iframe');
  });
  if (!relayFrame) {
    return { present: false, gapiReady: false, parkedEvents: [], gapiScriptPresent: false, gapiResources: [] };
  }

  try {
    const state = await relayFrame.evaluate(() => {
      const parkedEvents = Object.keys(sessionStorage).filter((key) => {
        return key.startsWith('firebase:redirectEvent:');
      });
      const gapiValue = globalThis.gapi;
      const script = document.querySelector('script[src*="apis.google.com/js/api.js"]');
      const gapiResources = performance.getEntriesByType('resource').filter((entry) => {
        return entry.name.includes('apis.google.com');
      }).map((entry) => {
        return entry.name;
      });
      return {
        present: true,
        gapiReady: typeof gapiValue !== 'undefined' && Boolean(gapiValue.iframes?.getContext),
        parkedEvents,
        gapiScriptPresent: Boolean(script),
        gapiResources,
        frameUrl: location.href.split('?')[0],
      };
    });
    return state;
  } catch (error) {
    return {
      present: true,
      gapiReady: false,
      parkedEvents: [],
      gapiScriptPresent: false,
      gapiResources: [],
      readError: error instanceof Error ? error.message : String(error),
    };
  }
};

const writeSnapshot = (snapshot) => {
  const line = JSON.stringify(snapshot);
  console.log(`GAPI_SNAPSHOT ${line}`);
  const file = process.env.REPRO_SNAPSHOT_FILE;
  if (!file) {
    return;
  }
  try {
    fs.appendFileSync(file, `${line}\n`);
  } catch (error) {
    console.log(`snapshot file write failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const popupText = async (popup) => {
  if (!popup || popup.isClosed()) {
    return '';
  }
  try {
    const text = await popup.locator('body').innerText();
    return text.slice(0, 300).replace(/\s+/g, ' ').trim();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const pinnedChromiumVersion = '139.0.7258.5';

test('signs in once through the auth emulator Google popup', async ({ page }) => {
  const email = process.env.REPRO_EMAIL ?? 'repro@example.com';
  const browserVersion = page.context().browser()?.version() ?? '';
  console.log(`BROWSER_VERSION ${browserVersion}`);
  if (browserVersion !== pinnedChromiumVersion) {
    throw new Error(`Launched browser ${browserVersion || 'unknown'} is not pinned Chromium ${pinnedChromiumVersion}`);
  }

  let popup = null;
  let beforeClick = null;
  try {
    const delayGapiMs = Number(process.env.REPRO_DELAY_GAPI_MS ?? '0');
    if (delayGapiMs > 0) {
      await page.route('https://apis.google.com/**', async (route) => {
        await new Promise((resolve) => {
          setTimeout(resolve, delayGapiMs);
        });
        await route.continue();
      });
    }

    await page.goto('/');
    const signInButton = page.locator('#sign-in');
    await expect(signInButton).toBeEnabled();

    const popupPromise = page.waitForEvent('popup', { timeout: 15000 });
    await signInButton.click();
    popup = await popupPromise;
    // Waiting for the widget load event makes Playwright 1.55+ pass. Leave it off
    // unless REPRO_WAIT_FOR_WIDGET=1. The missed click is the failure we are recording.
    if (process.env.REPRO_WAIT_FOR_WIDGET === '1') {
      await popup.waitForLoadState('domcontentloaded');
      await popup.bringToFront();
    }
    await popup.setViewportSize({ width: 480, height: 900 });

    // Auto-generate stays off: do not click "Auto-generate user information".
    // The listener is on the list item, and it is attached only after the widget script runs.
    const addAccount = popup.locator('#add-account-button');
    await addAccount.scrollIntoViewIfNeeded();
    await addAccount.click();
    const emailInput = popup.locator('#email-input');
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill(email);
    await popup.locator('#display-name-input').fill('Repro User');

    const submit = popup.getByRole('button', { name: 'Sign in with Google.com', exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeEnabled();
    beforeClick = await readAuthRelayFrameState(page);
    const closePromise = popup.waitForEvent('close', { timeout: 8000 });
    await submit.click();
    await closePromise;
    await expect(page.locator('#email')).toHaveText(email, { timeout: 8000 });

    const state = await readAuthRelayFrameState(page);
    writeSnapshot({
      result: 'pass',
      email,
      playwrightVersion: process.env.REPRO_PLAYWRIGHT_VERSION ?? '',
      iteration: Number(process.env.REPRO_ITERATION ?? '0'),
      browserVersion,
      gapiReadyBeforeClick: beforeClick.gapiReady,
      presentBeforeClick: beforeClick.present,
      present: state.present,
      gapiReady: state.gapiReady,
      parkedCount: state.parkedEvents.length,
      parkedEvents: state.parkedEvents,
      gapiScriptPresent: state.gapiScriptPresent,
      gapiResources: state.gapiResources,
    });
  } catch (error) {
    const state = await readAuthRelayFrameState(page);
    writeSnapshot({
      result: 'fail',
      email,
      playwrightVersion: process.env.REPRO_PLAYWRIGHT_VERSION ?? '',
      iteration: Number(process.env.REPRO_ITERATION ?? '0'),
      browserVersion,
      gapiReadyBeforeClick: beforeClick ? beforeClick.gapiReady : null,
      presentBeforeClick: beforeClick ? beforeClick.present : null,
      popupClosed: popup ? popup.isClosed() : false,
      present: state.present,
      gapiReady: state.gapiReady,
      parkedCount: state.parkedEvents.length,
      parkedEvents: state.parkedEvents,
      gapiScriptPresent: state.gapiScriptPresent,
      gapiResources: state.gapiResources,
      frameUrl: state.frameUrl ?? '',
      readError: state.readError ?? '',
      popupText: await popupText(popup),
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});
