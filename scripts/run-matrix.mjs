import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pageUrl } from '../repro-config.mjs';
import { installPlaywright, latestMatchingVersion, versionDir } from './install-playwright.mjs';

const reproRoot = path.resolve(import.meta.dirname, '..');
const iterations = Number(process.env.ITERATIONS ?? '15');
const snapshotFile = path.join(reproRoot, 'repro-snapshots.jsonl');
const resultsFile = path.join(reproRoot, 'repro-results.json');

const parseVersions = (value) => {
  if (!value) {
    return [];
  }
  return value.split(',').map((version) => {
    return version.trim();
  }).filter((version) => {
    return version.length > 0;
  });
};

const initialVersions = parseVersions(process.env.PLAYWRIGHT_VERSIONS);
const versions = initialVersions.length > 0 ? initialVersions : ['1.54.2', '1.55.0'];
const allowFollowUp = process.env.PLAYWRIGHT_FOLLOW_UP !== '0' && initialVersions.length === 0;

const configSource = `import { defineConfig } from '@playwright/test';
import { pageUrl, pinnedChromiumExecutable } from '../../repro-config.mjs';

const headed = process.env.HEADED === '1';

const useOptions = {
  baseURL: pageUrl,
  headless: !headed,
  viewport: { width: 900, height: 700 },
  actionTimeout: 10000,
  launchOptions: {
    executablePath: pinnedChromiumExecutable,
  },
};

export default defineConfig({
  testMatch: 'sign-in.spec.js',
  retries: 0,
  workers: 1,
  timeout: 30000,
  reporter: [['line']],
  use: useOptions,
});
`;

const prepareVersion = (version) => {
  const dir = installPlaywright(version);
  fs.copyFileSync(path.join(reproRoot, 'sign-in.spec.js'), path.join(dir, 'sign-in.spec.js'));
  fs.writeFileSync(path.join(dir, 'playwright.config.mjs'), configSource);
  return dir;
};

const waitForPage = async () => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(pageUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // The page server is not listening yet.
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }
  throw new Error(`Page server did not start at ${pageUrl}`);
};

const startPageServer = async () => {
  const server = spawn(process.execPath, ['serve.mjs'], {
    cwd: reproRoot,
    stdio: 'inherit',
  });
  await waitForPage();
  return server;
};

const runOnce = (version, iteration) => {
  const dir = versionDir(version);
  const cli = path.join(dir, 'node_modules', '@playwright', 'test', 'cli.js');
  const email = `repro-${version.replaceAll('.', '-')}-${iteration}@example.com`;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'test', '--config', 'playwright.config.mjs', '--retries=0', '--workers=1'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        REPRO_EMAIL: email,
        REPRO_ITERATION: String(iteration),
        REPRO_PLAYWRIGHT_VERSION: version,
        REPRO_SNAPSHOT_FILE: snapshotFile,
        REPRO_BASE_URL: pageUrl,
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('close', (code) => {
      const match = output.match(/GAPI_SNAPSHOT (\{.*\})/);
      const browserMatch = output.match(/BROWSER_VERSION (\S+)/);
      let snapshot = null;
      if (match) {
        try {
          snapshot = JSON.parse(match[1]);
        } catch {
          snapshot = null;
        }
      }
      resolve({
        version,
        iteration,
        exitCode: code,
        passed: code === 0,
        browserVersion: browserMatch ? browserMatch[1] : '',
        snapshot,
        output,
      });
    });
  });
};

const summarize = (results) => {
  const byVersion = new Map();
  for (const result of results) {
    if (!byVersion.has(result.version)) {
      byVersion.set(result.version, []);
    }
    byVersion.get(result.version).push(result);
  }

  const summary = [];
  for (const [version, runs] of byVersion) {
    const passed = runs.filter((run) => {
      return run.passed;
    }).length;
    const failed = runs.length - passed;
    const browserVersion = runs.find((run) => {
      return run.browserVersion;
    })?.browserVersion ?? '';
    const failures = runs.filter((run) => {
      return !run.passed;
    }).map((run) => {
      return {
        iteration: run.iteration,
        exitCode: run.exitCode,
        snapshot: run.snapshot,
      };
    });
    summary.push({ version, browserVersion, iterations: runs.length, passed, failed, failures });
  }
  return summary;
};

const printSummary = (summary) => {
  console.log('REPRO_SUMMARY');
  for (const row of summary) {
    console.log(`node ${process.version} playwright ${row.version} chromium ${row.browserVersion || 'unknown'}: ${row.passed} pass, ${row.failed} fail (${row.iterations} iterations)`);
    for (const failure of row.failures) {
      if (!failure.snapshot) {
        console.log(`  fail #${failure.iteration} exit ${failure.exitCode} no gapi snapshot`);
        continue;
      }
      const snapshot = failure.snapshot;
      console.log(
        `  fail #${failure.iteration} present=${snapshot.present} gapiReady=${snapshot.gapiReady} before=${snapshot.gapiReadyBeforeClick} parkedCount=${snapshot.parkedCount} popupClosed=${snapshot.popupClosed} script=${snapshot.gapiScriptPresent} message=${snapshot.message}`,
      );
    }
  }
};

fs.writeFileSync(snapshotFile, '');
const server = await startPageServer();
const results = [];

try {
  for (const version of versions) {
    prepareVersion(version);
    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      const result = await runOnce(version, iteration);
      results.push(result);
      const snapshot = result.snapshot;
      if (result.passed) {
        console.log(`[${version}] ${iteration}/${iterations} pass gapiReady=${snapshot ? snapshot.gapiReady : 'n/a'} before=${snapshot ? snapshot.gapiReadyBeforeClick : 'n/a'}`);
        continue;
      }
      console.log(`[${version}] ${iteration}/${iterations} fail gapiReady=${snapshot ? snapshot.gapiReady : 'n/a'} before=${snapshot ? snapshot.gapiReadyBeforeClick : 'n/a'} parkedCount=${snapshot ? snapshot.parkedCount : 'n/a'}`);
    }
  }

  let summary = summarize(results);
  const broken = summary.find((row) => {
    return row.version === '1.55.0';
  });
  const baseline = summary.find((row) => {
    return row.version === '1.54.2';
  });
  if (allowFollowUp && broken && broken.failed === 0 && baseline) {
    const followUp = latestMatchingVersion('1.64') || latestMatchingVersion('1');
    if (followUp && !versions.includes(followUp)) {
      console.log(`1.55.0 did not fail; running ${followUp}`);
      prepareVersion(followUp);
      for (let iteration = 1; iteration <= iterations; iteration += 1) {
        const result = await runOnce(followUp, iteration);
        results.push(result);
        console.log(`[${followUp}] ${iteration}/${iterations} ${result.passed ? 'pass' : 'fail'}`);
      }
      summary = summarize(results);
    }
  }

  fs.writeFileSync(resultsFile, `${JSON.stringify({ summary, results }, null, 2)}\n`);
  printSummary(summary);
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM');
  }
}
