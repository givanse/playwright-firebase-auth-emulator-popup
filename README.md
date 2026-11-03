# Auth emulator Google popup repro

Standalone page and Playwright test for the Firebase Auth emulator Google popup. It does not use the Crecer app, Vite, Mongo, or the retry helpers in `tests/common/playwrightHelpers.js`.

The page calls `signInWithPopup` with `GoogleAuthProvider` against the Auth emulator (`connectAuthEmulator`) for demo project `demo-auth-popup`. The test opens that page, clicks Sign in once, adds one account in the emulator popup (auto-generate left off), and clicks "Sign in with Google.com" once. It does not retry, reclick, or restart the popup.

## Versions used for the runs below

- OS: macOS 15.6.1 (darwin 24.6.0), arm64
- Node: 26.12.1
- Firebase JS SDK: 12.14.0
- firebase-tools: 15.22.3
- Playwright 1.54.2, 1.55.0, and 1.64.1, all launching the same Chromium 139.0.7258.5

The comparison holds the browser fixed. Every Playwright version launches the full Chromium executable that ships with Playwright 1.54.2, revision 1181:

`~/Library/Caches/ms-playwright/chromium-1181/chrome-mac/Chromium.app/Contents/MacOS/Chromium`

That build is 139.0.7258.5. It is the last Playwright release whose Auth emulator sign-in was reliable, and this copy was already in the macOS Playwright cache (`INSTALLATION_COMPLETE` dated 2026-11-01). The configs set `launchOptions.executablePath` to that binary. They do not use each Playwright version's bundled browser, and they do not use `chromium_headless_shell`, because that binary also changes per Playwright version. Headless runs pass `--headless` to this same full binary. An iteration fails if `browser.version()` is not 139.0.7258.5, so a fallback browser is not recorded as a sign-in result.

## Steps

From this directory:

```sh
pnpm install
pnpm run repro
```

`pnpm run repro` installs Playwright 1.54.2 and 1.55.0 under `.playwright-versions/` (so the repo lockfile is unchanged), runs `playwright install chromium` for each, starts the Auth emulator with `firebase emulators:exec --project demo-auth-popup --only auth`, and runs the test 15 times per version. Each iteration is a new browser context and a new email. One emulator is shared for the whole run, so accounts accumulate. The emulator exits when the script exits.

Useful environment variables:

- `ITERATIONS` (default 15)
- `PLAYWRIGHT_VERSIONS` (default `1.54.2,1.55.0`). If this is unset and 1.55.0 has zero failures, the runner also tries the latest 1.64.x.
- `HEADED=1`
- `REPRO_WAIT_FOR_WIDGET=1` waits for the popup `DOMContentLoaded` and brings the popup to the front before clicking Add new account.
- `REPRO_DELAY_GAPI_MS=4000` holds `https://apis.google.com/**` for that many milliseconds, then lets it load.

`pnpm test` runs the single test once with the Playwright version pinned in this directory's `package.json` (1.54.2).

## What passed and what failed

Default test (no widget-load wait, headless, fresh emulator, 15 iterations, one click). Every row launched the pinned Chromium 139.0.7258.5. `browser.version()` was 139.0.7258.5 on all 45 iterations.

| Playwright | Node | Chromium | Result |
| --- | --- | --- | --- |
| 1.54.2 | 26.12.1 | 139.0.7258.5 | 15 pass, 0 fail |
| 1.55.0 | 26.12.1 | 139.0.7258.5 | 10 pass, 5 fail |
| 1.64.1 | 26.12.1 | 139.0.7258.5 | 13 pass, 2 fail |

1.55.0 failures were iterations 1, 3, 5, 7, and 11. 1.64.1 failures were iterations 2 and 4.

Every failure looked the same. The popup stayed open on the account list. `#email-input` stayed hidden, so the single "Add new account" click did not open the form, and "Sign in with Google.com" was never reached. Snapshot on those failures:

- relay iframe present: true (`/emulator/auth/iframe`)
- gapi ready (`typeof gapi !== 'undefined' && Boolean(gapi.iframes?.getContext)`): true
- `firebase:redirectEvent:` keys: 0
- script tag for `https://apis.google.com/js/api.js`: present
- resource entries included `https://apis.google.com/js/api.js` and the `gapi_iframes` script

So these failures are not the parked-credential stall. gapi had loaded, and nothing was waiting in `sessionStorage`.

Before the browser pin, with each Playwright version launching its own browser, `REPRO_WAIT_FOR_WIDGET=1` on Node 26.12.1 passed 15/15 on 1.54.2, 1.55.0, and 1.64.1, both headless and headed. On every pass, gapi was already ready before the "Sign in with Google.com" click.

Before the browser pin, `REPRO_DELAY_GAPI_MS=4000` on Node 26.12.1 (5 iterations, headless, widget-load wait left on) ran the sign-in click while gapi was not ready. 1.54.2 and 1.64.1 both passed 5/5. After the delayed script arrived, gapi was ready and the opener showed the email. The parked event was replayed. This run did not produce a case where `api.js` never arrived.

## Chromium install and Node

Playwright 1.54.2 cannot install Chrome on Node 24 or Node 26. The install hangs ([playwright#40724](https://github.com/microsoft/playwright/issues/40724)). The hang starts at Node 24.16. Node 24.15 is expected to still install. The install fix shipped in Playwright 1.60.0 ([playwright#40747](https://github.com/microsoft/playwright/pull/40747)). Versions 1.54.2 through 1.59 are not installable on Node >= 24.16, including the Node 26.12.1 these runs used. Playwright 1.60.0 and later can install.

The sign-in numbers in the table were collected on Node 26.12.1, which is inside the hang range. Every row launched the Chromium 139.0.7258.5 binary that was already in the Playwright cache, so those rows are sign-in results on that pinned browser, not a claim that `playwright install` downloaded a browser on this Node. On this Mac, 1.54.2's Chromium 139 was already in the cache (`INSTALLATION_COMPLETE` dated 2026-11-01); `playwright install` did not download it. 1.55.0's `playwright install chromium` on Node 26.12.1 downloaded the archive and hung while extracting, so Chromium 140 and its headless shell were unpacked with `ditto`. 1.64.1's Chrome 156 was a manual Chrome-for-Testing download unpacked with `ditto`, and `playwright install` after that only fetched FFmpeg. This comparison did not launch the 140 or 156 binaries.

## gapi observation

The Auth emulator iframe at `/emulator/auth/iframe` loads `https://apis.google.com/js/api.js` and only then calls `gapi.iframes.getContext()`. Until that returns, a credential posted into the iframe is stored under `sessionStorage['firebase:redirectEvent:' + apiKey + ':' + appName]` and is sent to the opener only from `gapi_onload`. That code path is in firebase-tools `lib/emulator/auth/handlers.js`.

On this machine, on Node 26.12.1, that path worked when gapi was late: delaying `api.js` by 4 seconds still signed in on both 1.54.2 and 1.64.1 (that check used each version's own browser). The version split we actually hit is earlier. From Playwright 1.55.0 on, one click on "Add new account" sometimes does nothing even though gapi is already ready. Holding the browser at Chromium 139.0.7258.5 did not remove that miss: 1.55.0 failed 5 of 15 and 1.64.1 failed 2 of 15. Waiting for the popup document to finish loading, in the earlier per-browser runs, removed that miss for all 15 iterations of 1.55.0 and 1.64.1.
