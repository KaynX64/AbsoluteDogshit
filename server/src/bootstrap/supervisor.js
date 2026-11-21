// Runs the API as a child process and replaces it after an approved restart.

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let child;
let stopping = false;
let restartRequested = false;

// Fork an API child and monitor it for restart requests, exits, and launch errors.
function launch() {
  restartRequested = false;
  child = fork(fileURLToPath(new URL('../index.js', import.meta.url)), [], {
    env: { ...process.env, VALETUDO_SUPERVISED: '1' },
  });
  // Record the child's request to launch a replacement after it drains.
  child.on('message', message => {
    if (message === 'restart-after-drain') restartRequested = true;
  });
  // Start a replacement after an approved restart or propagate the child's exit.
  child.once('exit', code => {
    // An accepted restart must replace the old process even if its drain timed out.
    // launch resets the flag, so a replacement that fails startup exits normally.
    if (!stopping && restartRequested) launch();
    else process.exitCode = code ?? (stopping ? 0 : 1);
  });
  // Report a child process error and set the supervisor's exit status.
  child.once('error', error => {
    console.error('[Supervisor]', error.code ?? error.name);
    process.exitCode = 1;
  });
}

// Ask the child to shut down and handle an unavailable IPC channel.
function stop() {
  if (stopping) return;
  stopping = true;
  if (child?.connected) /* Fall back to a shutdown signal if the IPC message fails. */ child.send('shutdown', error => {
    if (error && child.exitCode === null && child.signalCode === null) child.kill();
  });
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
launch();
