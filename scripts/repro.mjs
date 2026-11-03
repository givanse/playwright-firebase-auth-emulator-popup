import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { projectId } from '../repro-config.mjs';
import { installPlaywright } from './install-playwright.mjs';

const reproRoot = path.resolve(import.meta.dirname, '..');

const versions = (process.env.PLAYWRIGHT_VERSIONS ?? '1.54.2,1.55.0').split(',').map((version) => {
  return version.trim();
}).filter((version) => {
  return version.length > 0;
});

console.log(`node ${process.version}`);
console.log(`os ${process.platform} ${os.release()}`);
console.log(`playwright versions ${versions.join(', ')}`);
console.log(`iterations ${process.env.ITERATIONS ?? '15'}`);
console.log(`headed ${process.env.HEADED === '1' ? 'yes' : 'no'}`);

for (const version of versions) {
  installPlaywright(version);
}

const firebaseBin = path.join(reproRoot, 'node_modules', '.bin', 'firebase');
execFileSync(
  firebaseBin,
  ['--project', projectId, 'emulators:exec', '--only', 'auth', 'node scripts/run-matrix.mjs'],
  {
    cwd: reproRoot,
    stdio: 'inherit',
  },
);
