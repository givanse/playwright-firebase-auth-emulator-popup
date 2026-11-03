import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const reproRoot = path.resolve(import.meta.dirname, '..');

export const versionDir = (version) => {
  return path.join(reproRoot, '.playwright-versions', version);
};

const installedVersion = (dir) => {
  const marker = path.join(dir, 'node_modules', 'playwright', 'package.json');
  if (!fs.existsSync(marker)) {
    return '';
  }
  return JSON.parse(fs.readFileSync(marker, 'utf8')).version;
};

export const installPlaywright = (version) => {
  const dir = versionDir(version);
  fs.mkdirSync(dir, { recursive: true });
  if (installedVersion(dir) !== version) {
    const pkg = {
      private: true,
      type: 'module',
      dependencies: {
        '@playwright/test': version,
        playwright: version,
      },
    };
    fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    execFileSync('npm', ['install', '--no-fund', '--no-audit', '--loglevel=error'], {
      cwd: dir,
      stdio: 'inherit',
    });
  }

execFileSync('npx', ['--no-install', 'playwright', 'install', 'chromium'], {
      cwd: dir,
      stdio: 'inherit',
      env: {
        ...process.env,
        // Several Playwright versions share one browser cache. Without this, installing
        // 1.54.2 deletes the 1.55 browser directory as an unused installation.
        PLAYWRIGHT_SKIP_BROWSER_GC: '1',
      },
    });
  return dir;
};

export const latestMatchingVersion = (range) => {
  const output = execFileSync('npm', ['view', `playwright@${range}`, 'version'], {
    encoding: 'utf8',
  });
  const lines = output.trim().split('\n').filter((line) => {
    return line.length > 0;
  });
  const last = lines.at(-1) ?? '';
  const quoted = last.match(/'([^']+)'/);
  if (quoted) {
    return quoted[1];
  }
  return last;
};
