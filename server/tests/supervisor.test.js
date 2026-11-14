import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('an accepted restart replaces a failed drain once and reports a failed replacement', { timeout: 10_000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'valetudo-supervisor-'));
  try {
    const bootstrap = join(folder, 'bootstrap');
    await mkdir(bootstrap);
    await writeFile(join(folder, 'package.json'), '{"type":"module"}');
    const markerPath = join(folder, 'launched');
    await copyFile(new URL('../src/bootstrap/supervisor.js', import.meta.url), join(bootstrap, 'supervisor.js'));
    await writeFile(join(folder, 'index.js'), `
      import { existsSync, writeFileSync } from 'node:fs';
      const marker = ${JSON.stringify(markerPath)};
      if (existsSync(marker)) {
        console.log('replacement launched');
        process.exit(2);
      }
      writeFileSync(marker, '');
      console.log('first child launched');
      process.send('restart-after-drain', () => process.exit(1));
    `);
    const supervisor = spawn(process.execPath, [join(bootstrap, 'supervisor.js')], {
      stdio: ['ignore', 'pipe', 'inherit'], signal: AbortSignal.timeout(7000),
    });
    let output = '';
    supervisor.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    const [exit] = await once(supervisor, 'close');
    assert.equal(exit, 2);
    assert.deepEqual(output.trim().split(/\r?\n/), ['first child launched', 'replacement launched']);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
