import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { installFixtures, verifyWorkflows } from './workflows.mjs';

const executable = resolve(process.argv[2] ?? 'release/win-unpacked/Valetudo HealthLink.exe');
await access(executable);
const profile = await mkdtemp(join(tmpdir(), 'valetudo-packaged-smoke-'));
let app;
let socket;

async function until(probe, description) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app?.exitCode != null) throw Error('Electron exited with code ' + app.exitCode);
    const value = await probe();
    if (value) return value;
    await delay(100);
  }
  throw Error('Timed out waiting for ' + description);
}

try {
  const started = performance.now();
  const reservation = createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((success, fail) => reservation.close(error => error ? fail(error) : success()));
  app = spawn(executable, [
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--disable-background-networking',
    '--host-resolver-rules=MAP * ~NOTFOUND',
    '--proxy-server=http://127.0.0.1:9',
    '--proxy-bypass-list=<-loopback>',
  ], { env: { ...process.env, APPDATA: profile, LOCALAPPDATA: profile }, windowsHide: true, stdio: 'ignore' });
  await once(app, 'spawn');
  const target = await until(async () => {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(1000) });
      return (await response.json()).find(item => item.url.startsWith('file:') && item.type === 'page');
    } catch { return null; }
  }, 'the packaged renderer');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((success, fail) => {
    socket.addEventListener('open', success, { once: true });
    socket.addEventListener('error', fail, { once: true });
  });
  const pending = new Map();
  let id = 0;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    pending.get(message.id)?.(message);
  });
  async function send(method, params = {}) {
    const requestId = ++id;
    return new Promise((success, fail) => {
      const timeout = setTimeout(() => { pending.delete(requestId); fail(Error(method + ' timed out')); }, 12000);
      pending.set(requestId, message => {
        clearTimeout(timeout);
        pending.delete(requestId);
        if (message.error) fail(Error(message.error.message));
        else success(message.result);
      });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async function run(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  const wait = (expression, label) => until(() => run(`(async () => Boolean(await (${expression})))()`), label);
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] });
  await wait("document.querySelector('form input') && window.electronAPI", 'login form and preload');
  assert.match(await run('window.electronAPI.getAppVersion()'), /^\d+\.\d+\.\d+/);
  await wait('[...document.images].some(img => img.complete && img.naturalWidth > 0)', 'local logo');
  assert.equal(await run("document.fonts.load('18px Material Symbols Outlined').then(fonts => fonts.some(font => font.status === 'loaded'))"), true);
  await access(join(profile, 'valetudo_data', 'valetudo_offline.db'));
  const rendererMs = await run("performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint')?.startTime ?? null");
  console.log('Packaged login ready in ' + Math.round(performance.now() - started) + ' ms' +
    (rendererMs === null ? '' : ' (renderer first contentful paint ' + Math.round(rendererMs) + ' ms)'));
  await run('(' + installFixtures.toString() + ')()');
  await verifyWorkflows(run, wait);
  console.log('Packaged Electron smoke checks passed.');
} finally {
  socket?.close();
  if (app?.pid && app.exitCode === null && app.signalCode === null) {
    const exited = once(app, 'exit');
    app.kill();
    await exited;
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
