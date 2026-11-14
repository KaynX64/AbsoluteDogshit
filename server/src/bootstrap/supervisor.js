// Runs the API as a child process and replaces it after an approved restart.

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let child;
let stopping = false;
let restartRequested = false;

function launch() {
  restartRequested = false;
  child = fork(fileURLToPath(new URL('../index.js', import.meta.url)), [], {
    env: { ...process.env, VALETUDO_SUPERVISED: '1' },
  });
  child.on('message', message => {
    if (message === 'restart-after-drain') restartRequested = true;
  });
  child.once('exit', code => {
    // An accepted restart must replace the old process even if its drain timed out.
    // launch resets the flag, so a replacement that fails startup exits normally.
    if (!stopping && restartRequested) launch();
    else process.exitCode = code ?? (stopping ? 0 : 1);
  });
  child.once('error', error => {
    console.error('[Supervisor]', error.code ?? error.name);
    process.exitCode = 1;
  });
}

function stop() {
  if (stopping) return;
  stopping = true;
  if (child?.connected) child.send('shutdown', error => {
    if (error && child.exitCode === null && child.signalCode === null) child.kill();
  });
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
launch();
