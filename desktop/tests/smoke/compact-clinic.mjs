import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { installFixtures } from './workflows.mjs';
import { verifyResponderActions } from './responder-actions.mjs';
import { verifyResponderHistory } from './responder-history.mjs';

// Renderer-only layout regression: hidden Electron window, synthetic data,
// isolated profile and blocked network. No clinic account or database is used.
const temporary = await mkdtemp(join(tmpdir(), 'valetudo-compact-'));
const screenshots = resolve('dist/compact-clinic-checks');
await mkdir(screenshots, { recursive: true });
const entry = join(temporary, 'main.cjs');
await writeFile(entry, `
  const { app, BrowserWindow } = require('electron');
  app.disableHardwareAcceleration();
  app.whenReady().then(() => {
    const window = new BrowserWindow({ show: false, width: 1366, height: 768,
      webPreferences: { contextIsolation: true, nodeIntegration: false } });
    window.loadURL('about:blank');
  });
`);
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const app = spawn(resolve('node_modules/electron/dist/electron.exe'), [entry,
  '--remote-debugging-port=0', '--user-data-dir=' + join(temporary, 'profile'),
  '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND',
], { env: environment, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const browserSocket = await new Promise((success, fail) => {
    let output = '';
    const timer = setTimeout(() => fail(Error('Electron debugging endpoint timed out: ' + output)), 15000);
    app.once('error', fail);
    app.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); success(match[1]); }
    });
  });
  const { host } = new URL(browserSocket);
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    target = (await (await fetch(`http://${host}/json/list`)).json()).find(item => item.type === 'page');
    if (!target) await delay(100);
  }
  assert.ok(target, 'Electron renderer exists');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await once(socket, 'open');
  const pending = new Map();
  let id = 0;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    pending.get(message.id)?.(message);
  });
  const send = (method, params = {}) => new Promise((success, fail) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); fail(Error(method + ' timed out')); }, 15000);
    pending.set(requestId, message => {
      clearTimeout(timer); pending.delete(requestId);
      if (message.error) fail(Error(message.error.message)); else success(message.result);
    });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const run = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await run(`Boolean(${expression})`)) return;
      await delay(100);
    }
    throw Error('Timed out: ' + expression);
  };
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFixtures.toString()})({ themeMode: ${JSON.stringify(process.argv.includes('--dark') ? 'dark' : 'light')} });
    const fixtureFetch = window.fetch;
    window.fetch = async (input, options) => {
      const path = new URL(input.url || input, location.href).pathname;
      if (path.endsWith('/prescriptions/review')) {
        smoke.state.rxReviews = (smoke.state.rxReviews || 0) + 1;
        return Response.json({ draft: JSON.parse(options.body), review_token: 'synthetic-review-token', safety: {
          coverage: 'not_checked', known_item_count: 0, unverified_item_keys: [], duplicate_groups: [], findings: [],
          scope: 'Synthetic local-rule coverage fixture. Allergies and current medicines require manual review.' } });
      }
      if (path.endsWith('/prescriptions') && options?.method === 'POST') {
        (smoke.state.rxSubmissions ||= []).push(options.body);
        if (smoke.state.rxSubmissions.length === 1) throw TypeError('Fixture lost response');
        return Response.json({prescriptionId: 423, emrId: 23, qrToken: 'fixture', pdfAvailable: false, replayed: true});
      }
      if (path.endsWith('/inventory/medicines')) return Response.json([{medicine_id: 1,
        name: 'Layout medicine', generic_name: 'Paracetamol', form: 'Tablet', strength: '500 mg', available_stock: 100, unit: 'pcs'}]);
      if (path.endsWith('/interactions/check')) return Response.json({blocking: false, hasInteractions: false, interactions: []});
      return fixtureFetch(input, options);
    };` });
  await send('Page.navigate', { url: pathToFileURL(resolve('dist/index.html')).href });
  await wait("document.querySelector('form input')");
  await run('smoke.login()');
  await wait("document.querySelector('#rx-frequency')");
  await verifyResponderActions(run, wait);
  await verifyResponderHistory(run, wait, async name => {
    const capture = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(screenshots, name + (process.argv.includes('--dark') ? '-dark' : '') + '.png'), Buffer.from(capture.data, 'base64'));
  });
  assert.equal(await run("document.querySelector('.doctor-queue-ticket')?.textContent"), 'Q-01', 'active consultations retain their queue ticket');
  await run(`document.documentElement.dataset.titlebar = 'overlay';
    const title = document.createElement('header'); title.className = 'app-titlebar';
    title.textContent = 'Synthetic clinic layout check'; document.querySelector('#root').prepend(title);`);
  const sizeFilter = process.argv.find(value => value.startsWith('--size='))?.slice(7);
  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 720]]
    .filter(([width, height]) => !sizeFilter || sizeFilter === `${width}x${height}`)) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const panel of ['rx', 'stocked', 'outside', 'prn', 'custom', 'multi', 'clearance', 'other', 'encounter']) {
      if (panel === 'encounter') await run("smoke.click('Encounter', '[role=tab]')");
      else {
        await run("smoke.click('Documents', '[role=tab]')");
        await wait("!document.querySelector('#doctor-document-panel').hidden");
        const prescription = ['rx', 'stocked', 'outside', 'prn', 'custom', 'multi'].includes(panel);
        await run(`smoke.click('${prescription ? 'Prescription' : 'Clearance'}', '[role=tab]')`);
        await wait(`!document.querySelector('#doctor-document-${prescription ? 'rx' : 'clearance'}').hidden`);
        if (prescription) {
          await run(`smoke.fill(document.querySelector('#rx-fulfillment'), '${panel === 'stocked' ? 'clinic' : 'external'}')`);
          await run(`smoke.fill(document.querySelector('#rx-catalog'), '${panel === 'stocked' ? '1' : ''}')`);
          await run(`smoke.fill(document.querySelector('#rx-schedule'), '${panel === 'prn' ? 'prn' : panel === 'custom' ? 'custom' : 'fixed'}')`);
          await run(`smoke.fill(document.querySelector('#rx-quantity-unit'), '${panel === 'prn' || panel === 'custom' ? 'bottle' : panel === 'stocked' ? 'pcs' : 'tablet'}')`);
          if (panel === 'multi') {
            for (let index = await run("document.querySelectorAll('.rx-v2-item-strip button').length"); index < 20; index++) await run("document.querySelector('[aria-label=\"Add medicine\"]').click()");
          }
        }
        else await run(`smoke.fill(document.querySelector('#clearance-purpose'), '${panel === 'other' ? 'Other' : ''}')`);
      }
      await delay(300);
      const measurement = await run(`(() => {
        const workspace = document.querySelector('#desktop-workspace');
        const section = document.querySelector('${panel === 'encounter' ? '#doctor-encounter-panel' : '#doctor-document-' + (['rx', 'stocked', 'outside', 'prn', 'custom', 'multi'].includes(panel) ? 'rx' : 'clearance')}');
        const controls = [...section.querySelectorAll('input:not([hidden]), select, textarea, button')]
          .filter(element => element.getClientRects().length && !element.closest('.rx-v2-item-strip'));
        return {
          pageFits: document.documentElement.scrollHeight <= innerHeight + 1,
          workspaceFits: workspace.scrollHeight <= workspace.clientHeight + 1,
          panelFits: section.scrollHeight <= section.clientHeight + 1,
          fieldStyle: (() => { const field = section.querySelector('.rx-v2-field'); if (!field) return null;
            const style = getComputedStyle(field); return [style.fontSize, style.lineHeight, getComputedStyle(field.firstElementChild).fontSize, getComputedStyle(field.firstElementChild).lineHeight]; })(),
          controlsVisible: controls.every(element => {
            const bounds = element.getBoundingClientRect();
            return bounds.top >= 0 && bounds.bottom <= innerHeight + 1 && bounds.right <= innerWidth + 1;
          }),
          bounds: controls.map(element => ({ id: element.id || element.textContent.trim().slice(0, 28),
            bottom: Math.round(element.getBoundingClientRect().bottom) })),
        };
      })()`);
      console.log(width + 'x' + height + ' ' + panel + ': ' +
        (measurement.pageFits && measurement.workspaceFits && measurement.panelFits && measurement.controlsVisible ? 'fits' : JSON.stringify(measurement)));
      if (!process.argv.includes('--inspect')) {
        assert.equal(measurement.pageFits, true, 'document fits');
        assert.equal(measurement.workspaceFits, true, 'workspace fits without scrolling');
        assert.equal(measurement.panelFits, true, 'section contents fit their panel');
        assert.equal(measurement.controlsVisible, true, panel + ' controls and action are immediately visible');
      }
      const image = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(screenshots, `${width}-${height}-${panel}.png`), Buffer.from(image.data, 'base64'));
    }
  }
  await run("smoke.click('Documents', '[role=tab]')");
  await wait("!document.querySelector('#doctor-document-panel').hidden");
  await run("smoke.click('Prescription', '[role=tab]')");
  for (let count = await run("document.querySelectorAll('.rx-v2-item-strip button').length"); count > 1; count--) {
    await run("document.querySelector('[aria-label=\"Remove medicine\"]').click()");
  }
  for (const [field, value] of Object.entries({ 'rx-fulfillment': 'external', 'rx-catalog': '', 'rx-generic': 'Synthetic manual generic',
    'rx-strength': '10 mg', 'rx-form': 'Tablet', 'rx-dose': '1/2', 'rx-dose-unit': 'tablet', 'rx-route': 'Oral',
    'rx-schedule': 'fixed', 'rx-frequency': 'Fixture frequency', 'rx-duration': '3', 'rx-quantity': '1.5', 'rx-quantity-unit': 'tablet',
    'rx-instructions': 'Synthetic patient directions', 'rx-notes': 'Synthetic patient advice.\n'.repeat(60),
    'rx-validity': new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) })) {
    await run(`smoke.fill(document.getElementById(${JSON.stringify(field)}), ${JSON.stringify(value)})`);
  }
  await run("document.querySelector('.rx-v2-confirm input').click()");
  await run("smoke.click('Review prescription')");
  await wait("document.querySelector('dialog[open] .rx-v2-review')");
  await delay(300);
  assert.equal(await run("document.querySelector('.rx-v2-review').innerText.includes('1/2 tablet')"), true);
  const reviewGeometry = await run(`(() => {const body = document.querySelector('.rx-v2-review .dialog-body');
    const action = document.querySelector('.rx-v2-review .dialog-footer').getBoundingClientRect();
    return { height: body.clientHeight, content: body.scrollHeight, footer: action.bottom, viewport: innerHeight }; })()`);
  assert.equal(reviewGeometry.content > reviewGeometry.height && reviewGeometry.footer <= reviewGeometry.viewport, true,
    'review list scrolls with actions visible: ' + JSON.stringify(reviewGeometry));
  await run("smoke.click('Return to form')");
  assert.equal(await run("document.querySelector('#rx-dose').value"), '1/2');
  await run("smoke.click('Review prescription')");
  await wait("document.querySelector('dialog[open] .rx-v2-review')");
  assert.equal(await run("[...document.querySelectorAll('.rx-v2-review input[type=checkbox]')].every(field => !field.checked)"), true);
  for (let index = 0; index < 2; index++) await run(`document.querySelectorAll('.rx-v2-review input[type=checkbox]')[${index}].click()`);
  await run("smoke.click('Confirm and issue prescription')");
  await wait("document.querySelector('.rx-v2-review')?.innerText.includes('Retry issuance')");
  assert.equal(await run("[...document.querySelectorAll('.rx-v2-review button')].find(button => button.textContent.includes('Return to form')).disabled"), true);
  await run("smoke.click('Retry issuance')");
  await wait("document.querySelector('.rx-v2-feedback')?.innerText.includes('#423')");
  assert.equal(await run("smoke.state.rxSubmissions[0] === smoke.state.rxSubmissions[1]"), true, 'uncertain issuance retries the exact body and UUID');
  console.log('Review, draft preservation, acknowledgements and idempotent retry UI checks passed.');
  await run(`smoke.click('Encounter', '[role=tab]');
    smoke.fill(document.querySelector('#encounter-notes'), 'Long synthetic clinical note.\\n'.repeat(100));`);
  assert.equal(await run(`(() => { const field = document.querySelector('#encounter-notes');
    field.scrollTop = 100; return field.scrollHeight > field.clientHeight && field.scrollTop > 0; })()`), true,
  'long clinical notes scroll inside their field');
  await run(`smoke.role('DENTIST')`);
  await wait("document.querySelector('#doctor-tab-dental')");
  await run("smoke.click('Dental chart', '[role=tab]')");
  await wait("!document.querySelector('#doctor-dental-panel').hidden");
  await delay(300);
  assert.equal(await run(`(() => {
    const workspace = document.querySelector('#desktop-workspace');
    const dental = document.querySelector('#doctor-dental-panel');
    const bounds = dental.getBoundingClientRect();
    return workspace.scrollHeight <= workspace.clientHeight + 1 && bounds.bottom <= innerHeight + 1
      && bounds.height > workspace.clientHeight * 0.65;
  })()`), true, 'Dentist chart stays within the fixed workspace');
  const dentalImage = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(screenshots, 'dentist-chart.png'), Buffer.from(dentalImage.data, 'base64'));
  await run(`const list = document.querySelector('.doctor-queue-grid');
    for (let i = 0; i < 30; i++) list.append(list.firstElementChild.cloneNode(true));
    list.scrollTop = 150;`);
  const scrollState = await run(`(() => {
    const list = document.querySelector('.doctor-queue-grid');
    list.scrollTop = 150;
    return { listTop: list.scrollTop, listHeight: list.clientHeight, listContent: list.scrollHeight,
      workspaceTop: document.querySelector('#desktop-workspace').scrollTop,
      rosterHeight: document.querySelector('.doctor-roster').clientHeight,
      patientHeight: document.querySelector('.doctor-patient-card').clientHeight };
  })()`);
  assert.equal(scrollState.listTop > 0 && scrollState.workspaceTop === 0, true,
    'patient list scrolls without moving the workspace: ' + JSON.stringify(scrollState));
  // Read-only History uses the existing issuer endpoints, with explicit visit links.
  await run(`smoke.historyCalls = []; smoke.historyFail = false; smoke.historyHold = false;
    const originalFetch = window.fetch;
    window.fetch = async (input, options = {}) => {
      const url = new URL(input.url || input, location.href);
      if (url.pathname.endsWith('/appointments/today') && url.searchParams.get('filter') === 'history') {
        return Response.json([10, 11, 12].map(appointment_id => ({ appointment_id, patient_id: 5,
          first_name: 'Synthetic', last_name: 'History ' + appointment_id, status: 'completed', queue_ticket: 'Q-01',
          appointment_type: 'Medical', date_time: new Date().toISOString(), time_slot: '09:00 AM' })));
      }
      if (url.pathname.endsWith('/prescriptions/patient/5') || url.pathname.endsWith('/clearances/patient/5')) {
        smoke.historyCalls.push([url.pathname, options.method || 'GET']);
        if (smoke.historyHold) return new Promise(resolve => { smoke.releaseHistory = resolve; });
        if (smoke.historyFail) return Response.json({ error: 'Fixture history unavailable' }, { status: 503 });
        if (url.pathname.includes('/prescriptions/')) return Response.json([
          { prescription_id: 501, appointment_id: 10, issued_at: '2026-11-10', status: 'active',
            notes: 'Selected visit advice', pdfAvailable: false, items: [{ item_id: 1, medicine_name: 'Selected visit medicine',
              instructions: 'Selected visit directions' }] },
          { prescription_id: 502, appointment_id: 11, issued_at: '2026-11-11', status: 'cancelled',
            notes: 'Different visit advice', items: [] },
          { prescription_id: 503, appointment_id: null, issued_at: '2026-11-09', status: 'expired',
            notes: 'Unlinked legacy advice', items: [] },
        ]);
        return Response.json([{ clearance_id: 601, appointment_id: 10, issued_at: '2026-11-10',
          expires_at: '2099-11-10', status: 'approved', purpose: 'Selected visit clearance', remarks: 'Selected fitness statement' }]);
      }
      return originalFetch(input, options);
    };
    smoke.click('History', '.sb-item');`);
  await wait("document.querySelector('#doctor-document-rx')?.innerText.includes('Selected visit directions')");
  assert.equal(await run("document.querySelector('#doctor-document-title').textContent.trim()"), 'Issued documents');
  assert.equal(await run("document.querySelectorAll('.doctor-roster .doctor-queue-ticket').length"), 0, 'completed History records hide retained queue tickets');
  assert.equal(await run("smoke.historyCalls.some(([path]) => path.includes('/clearances/'))"), false, 'hidden clearance tab is lazy');
  assert.equal(await run("!!document.querySelector('#rx-instructions, #clearance-purpose')"), false, 'archived visits mount no issuance fields');
  assert.equal(await run("document.querySelector('#doctor-document-rx').innerText.includes('Different visit advice')"), false, 'another visit is excluded');
  await run("document.querySelector('#doctor-document-rx details').open = true");
  assert.equal(await run("document.querySelector('#doctor-document-rx').innerText.includes('Unlinked legacy advice')"), true);
  await run("smoke.click('View / print PDF')");
  // The fixture returns JSON rather than a PDF, but exercises the authenticated preview path.
  await wait("document.querySelector('dialog[open] iframe[title=\"prescription-501.pdf\"]')");
  await run("smoke.click('Close', 'dialog[open] button')");
  await run("smoke.click('Clearance', '[role=tab]')");
  await wait("document.querySelector('#doctor-document-clearance')?.innerText.includes('Selected fitness statement')");
  await run("smoke.click('History 12', '.doctor-queue-item')");
  await wait("document.querySelector('#doctor-document-clearance')?.innerText.includes('No clearance issued for this consultation.')");
  await run("smoke.historyFail = true; smoke.click('Prescription', '[role=tab]')");
  await wait("document.querySelector('#doctor-document-rx')?.innerText.includes('Fixture history unavailable')");
  assert.equal(await run("document.querySelector('#doctor-document-rx').innerText.includes('No prescription issued')"), false, 'failed reads do not claim an empty visit');
  await run("smoke.historyFail = false; smoke.click('Retry loading documents')");
  await wait("document.querySelector('#doctor-document-rx')?.innerText.includes('No prescription issued for this consultation.')");
  await run("smoke.historyHold = true; smoke.click('History 10', '.doctor-queue-item')");
  await wait("typeof smoke.releaseHistory === 'function'");
  await run("smoke.historyHold = false; smoke.click('History 11', '.doctor-queue-item')");
  await wait("document.querySelector('#doctor-document-rx')?.innerText.includes('Different visit advice')");
  await run("smoke.releaseHistory(Response.json([{ prescription_id: 999, appointment_id: 10, notes: 'Stale visit response', items: [] }]))");
  await delay(100);
  assert.equal(await run("document.querySelector('#doctor-document-rx').innerText.includes('Stale visit response')"), false, 'stale responses cannot replace the selected visit');
  assert.equal(await run("smoke.historyCalls.every(([, method]) => method === 'GET')"), true);
  const historyImage = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(screenshots, 'consultation-documents.png'), Buffer.from(historyImage.data, 'base64'));
  console.log('Consultation document scoping, legacy access, preview, lazy reads, empty/error/retry and stale-response checks passed.');
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
  await delay(300);
  assert.equal(await run("getComputedStyle(document.querySelector('.app-main')).overflowY === 'auto'"), true,
    'narrow or zoomed windows retain an accessible scrolling fallback');
  console.log((process.argv.includes('--inspect') ? 'Compact clinic inspection completed. Screenshots: ' : 'Compact clinic layout checks passed. Screenshots: ') + screenshots);
} finally {
  socket?.close();
  if (app.exitCode === null) { const exited = once(app, 'exit'); app.kill(); await exited; }
  // Only the isolated directory returned by mkdtemp is removed.
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + '\\'));
  await rm(temporary, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
