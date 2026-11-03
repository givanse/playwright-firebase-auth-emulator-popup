import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { apiKey, authDomain, authEmulatorUrlFromEnv, pageHost, pagePort, projectId } from './repro-config.mjs';

const root = import.meta.dirname;
const firebasePackagePath = path.join(root, 'node_modules', 'firebase', 'package.json');
const firebaseAppPath = path.join(root, 'node_modules', 'firebase', 'firebase-app.js');
const firebaseAuthPath = path.join(root, 'node_modules', 'firebase', 'firebase-auth.js');

const firebaseVersion = JSON.parse(fs.readFileSync(firebasePackagePath, 'utf8')).version;
const gstaticAppUrl = `https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app.js`;
const firebaseAuthSource = fs.readFileSync(firebaseAuthPath, 'utf8');
if (!firebaseAuthSource.includes(gstaticAppUrl)) {
  throw new Error(`firebase-auth.js does not import ${gstaticAppUrl}`);
}
const firebaseAuthBundle = firebaseAuthSource.replaceAll(gstaticAppUrl, '/vendor/firebase-app.js');

const files = {
  '/': path.join(root, 'public', 'index.html'),
  '/index.html': path.join(root, 'public', 'index.html'),
  '/main.js': path.join(root, 'public', 'main.js'),
  '/vendor/firebase-app.js': firebaseAppPath,
};

const contentTypeFor = (filePath) => {
  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }
  if (filePath.endsWith('.js')) {
    return 'text/javascript; charset=utf-8';
  }
  return 'application/octet-stream';
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${pageHost}:${pagePort}`);
  if (url.pathname === '/config.json') {
    const body = JSON.stringify({
      apiKey,
      authDomain,
      projectId,
      authEmulatorUrl: authEmulatorUrlFromEnv(),
      firebaseVersion,
    });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
    return;
  }

  if (url.pathname === '/vendor/firebase-auth.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    res.end(firebaseAuthBundle);
    return;
  }

  const filePath = files[url.pathname];
  if (!filePath) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }

  res.writeHead(200, { 'content-type': contentTypeFor(filePath), 'cache-control': 'no-store' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(pagePort, pageHost, () => {
  console.log(`page ${`http://${pageHost}:${pagePort}`} firebase ${firebaseVersion} auth emulator ${authEmulatorUrlFromEnv()}`);
});
