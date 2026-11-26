// Stream status from this Compose project's backup containers, including one-off runs.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const backupLine = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\] [\x20-\x7e]+$/;
const containerId = /^[a-f0-9]{64}$/;

function readLines(stream, onLine) {
  createInterface({ input: stream, crlfDelay: Infinity }).on('line', onLine);
}

export function followBackupStatus(project, since, runningBackups, options) {
  const { signal } = options;
  if (signal.aborted) return;

  const logsByContainer = new Map();
  function followLogs(id, manual, tail) {
    if (!containerId.test(id) || logsByContainer.has(id) || signal.aborted) return;

    const logs = spawn('docker', ['logs', '--follow', '--tail', tail, id], {
      ...options, stdio: ['ignore', 'pipe', 'pipe'],
    });
    logsByContainer.set(id, logs);
    const showLine = line => {
      if (backupLine.test(line)) console.info(`[backup] [${manual ? 'manual' : 'scheduled'}] ${line}`);
    };
    readLines(logs.stdout, showLine);
    readLines(logs.stderr, showLine);
    // A short-lived manual container can be removed before the log stream opens.
    logs.on('error', () => {});
    logs.once('close', () => {
      if (logsByContainer.get(id) === logs) logsByContainer.delete(id);
    });
  }

  // Compose's service log stream can omit one-off containers. Watch start and exit
  // events for the same project, including starts between the ps check and subscription.
  const events = spawn('docker', [
    'events', '--since', since, '--format', '{{json .}}',
    '--filter', 'type=container', '--filter', 'event=start', '--filter', 'event=die',
    '--filter', `label=com.docker.compose.project=${project}`,
    '--filter', 'label=com.docker.compose.service=backup',
  ], { ...options, stdio: ['ignore', 'pipe', 'ignore'] });
  readLines(events.stdout, line => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    const { ID: id, Attributes: labels } = event.Actor ?? {};
    if (labels?.['com.docker.compose.project'] !== project ||
        labels['com.docker.compose.service'] !== 'backup') return;

    const manual = labels['com.docker.compose.oneoff']?.toLowerCase() === 'true';
    if (event.Action === 'start') {
      followLogs(id, manual, '5');
    } else if (event.Action === 'die') {
      logsByContainer.delete(id);
      if (manual && /^\d+$/.test(labels.exitCode) && labels.exitCode !== '0') {
        console.warn(`[backup] Manual backup exited with code ${labels.exitCode}.`);
      }
    }
  });
  events.on('error', () => {});
  events.once('close', () => {
    if (!signal.aborted) console.warn('[backup] Docker backup status stream ended.');
  });

  for (const { id, manual } of runningBackups) followLogs(id, manual, manual ? '5' : '1');
}
