import assert from 'node:assert/strict';

export function installFixtures() {
  const roles = ['DOCTOR', 'DENTIST', 'NURSE', 'ADMIN', 'EMERGENCY_RESPONDER'];
  const patient = {
    appointment_id: 10, patient_id: 5, first_name: 'Synthetic', last_name: 'Patient',
    student_no: 'FIXTURE-1', course: 'Fixture program', appointment_type: 'Medical',
    date_time: new Date().toISOString(), time_slot: '09:00 AM', status: 'serving',
    queue_status: 'in-consultation', past_chief_complaint: 'Fixture complaint', past_diagnosis: 'Fixture diagnosis',
  };
  const calls = [];
  let override = null;
  const headcountOnly = {
    scopes: ['ANALYTICS_HEADCOUNT', 'ANALYTICS_EXPORT'], operations: null, clinical: null, pharmacy: null,
    headcount: { roleDistribution: [{ role_code: 'STUDENT', role_name: 'Fixture headcount', count: 3 }] },
  };
  const state = {
    analytics: headcountOnly,
    restrictedAnalytics: headcountOnly,
    failEncounter: true,
    finishEncounter: null,
    activeSos: [],
    holdSos: false,
    showIncidentRecords: true,
    terminalGrant: false,
  };
  const permissions = [{ code: 'ANALYTICS_OPERATIONS', label: 'Clinic operations', description: 'Fixture grant' }];
  window.fetch = async (input, options = {}) => {
    const url = new URL(input.url || input, location.href);
    const path = url.pathname;
    const method = options.method || 'GET';
    calls.push([path, method, options.body]);
    if (path.endsWith('/auth/login')) return Response.json({
      token: 'fixture.token.local',
      user: { user_id: 1, first_name: 'Fixture', last_name: 'Staff', email: 'staff@example.invalid', roles, theme_mode: 'dark' },
    });
    if (path.endsWith('/emergency/active')) {
      if (state.holdSos) {
        return new Promise(resolve => {
          state.releaseSos = () => resolve(Response.json(state.activeSos));
        });
      }
      return Response.json(state.activeSos);
    }
    if (path.endsWith('/inventory/batches')) return Response.json(Array.from({ length: 24 }, (_, i) => ({
      batch_id: i + 1, name: `Fixture medicine ${i + 1}`, strength: '10mg', batch_no: `LOT-${i + 1}`,
      expiry_date: '2099-11-10', quantity_on_hand: 20,
    })));
    if (path.endsWith('/signature/me/status')) return Response.json({ enrolled: true });
    if (path.endsWith('/appointments/today')) return Response.json([patient]);
    if (path.endsWith('/appointments/patient/5/history')) return Response.json({
      records: Array.from({ length: 12 }, (_, index) => ({
        emr_id: index + 1, created_at: '2026-11-10', diagnosis: 'Fixture diagnosis',
        chief_complaint: 'LongFixtureNote'.repeat(70),
      })),
      nextCursor: null,
    });
    if (path.endsWith('/appointments/10/complete')) {
      if (state.failEncounter) {
        return new Promise(resolve => {
          state.finishEncounter = () => resolve(Response.json({ error: 'Fixture save failed' }, { status: 503 }));
        });
      }
      return Response.json({ emrId: 10 });
    }
    if (path.endsWith('/admin/users')) return Response.json([{
      id: 3, name: 'Fixture Nurse', first_name: 'Fixture', last_name: 'Nurse',
      email: 'nurse@example.invalid', role: 'NURSE', status: 'Active',
    }]);
    if (path.endsWith('/admin/db/tables/USERS')) return Response.json({
      tableName: 'USERS', columns: [], rows: [], totalRows: 0, totalPages: 1, page: 1,
    });
    if (path.endsWith('/admin/server-policy')) return Response.json({ version: 1, values: {}, defaults: {}, overrides: {}, fields: [] });
    if (path.endsWith('/admin/operations')) return Response.json({
      instanceId: 'fixture-server', restartAuthorized: state.showIncidentRecords, restartAvailable: false, events: [],
    });
    if (path.endsWith('/admin/operations/command')) return Response.json({
      output: { rssMiB: 32 },
    });
    if (path.endsWith('/admin/my-permissions')) return Response.json({
      user_id: 1, is_super: state.showIncidentRecords, permissions: state.showIncidentRecords ? ['SUPER_ADMIN'] : state.terminalGrant ? ['TERMINAL_VIEW'] : ['USERS_MANAGE'],
    });
    if (path.endsWith('/admin/users/3/health-profile')) return Response.json({ health_profile: { height: 160, weight: 55 } });
    if (path.endsWith('/admin/users/3') && method === 'PUT') return Response.json({ message: 'Saved' });
    if (path.endsWith('/admin/users/3/analytics-permissions')) {
      if (method === 'PUT') override = JSON.parse(options.body).scopes;
      return Response.json({ override, defaults: ['ANALYTICS_OPERATIONS'], permissions });
    }
    if (path.endsWith('/analytics/summary')) return Response.json(state.analytics);
    if (path.endsWith('/analytics/report-access')) return Response.json({ scopes: state.restrictedAnalytics.scopes });
    if (path.endsWith('/sync/legacy-ownership')) {
      const { appointmentIds } = JSON.parse(options.body);
      return Response.json({ appointmentIds: appointmentIds.filter(id => id === 10) });
    }
    if (path.endsWith('/sync/replay')) {
      const { mutations } = JSON.parse(options.body);
      state.replayed = mutations;
      return Response.json({ results: mutations.map(row => ({
        client_mutation_id: row.client_mutation_id, status: 'synced', serverRecordId: 4,
      })) });
    }
    return Response.json([]);
  };
  window.smoke = {
    calls,
    state,
    click(text, selector = 'button') {
      const button = [...document.querySelectorAll(selector)]
        .find(element => element.getClientRects().length && element.textContent.toLowerCase().includes(text.toLowerCase()));
      if (!button) throw Error('Missing control: ' + text);
      button.focus();
      button.click();
    },
    fill(element, value) {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    },
    role(role) { this.fill(document.querySelector('.tb-role-select'), role); },
    login() {
      const [email, password] = document.querySelectorAll('form input');
      this.fill(email, 'staff@example.invalid');
      this.fill(password, 'fixture-password');
      email.form.requestSubmit();
    },
  };
}

export async function verifyWorkflows(run, wait, press, send, { offlineOnly = false } = {}) {
  await run(`(async () => {
    await window.electronAPI.offlineSetAccount(1);
    const queued = await window.electronAPI.offlineQueueMutation({
      client_mutation_id: 'fixture-replay', record_uuid: 'fixture-record', user_id: 1,
      table_name: 'EMR_RECORDS', action: 'CREATE',
      payload: { patient_user_id: 5, chief_complaint: 'Fixture complaint', diagnosis: 'Fixture diagnosis' },
    });
    if (!queued.success) throw Error(queued.error);
    const [legacy] = await window.electronAPI.offlineGetPendingMutations();
    localStorage.setItem('valetudo_offline_mutations_queue', JSON.stringify([
      legacy,
      { ...legacy, client_mutation_id: 'fixture-mirror-only', record_uuid: 'fixture-mirror-record' },
    ]));
    smoke.loginStarted = performance.now();
    smoke.login();
  })()`);
  await wait("document.querySelector('.tb-role-select')?.value === 'DOCTOR' && document.body.innerText.includes('Synthetic Patient')", 'Doctor console');
  console.log('Sign-in to Doctor workspace: ' + await run('Math.round(performance.now() - smoke.loginStarted)') + ' ms');
  assert.equal(await run("JSON.parse(localStorage.getItem('valetudo_theme')).mode"), 'dark');
  await wait("smoke.state.replayed?.length === 3", 'automatic replay includes assigned legacy SQLite and mirror-only changes without duplication');
  assert.deepEqual((await run("smoke.state.replayed.map(row => row.client_mutation_id).sort()")), [
    'fixture-disk-only', 'fixture-mirror-only', 'fixture-replay',
  ]);
  await wait("window.electronAPI.offlineGetPendingMutations().then(rows => rows.length === 0)", 'SQLite replay completion');
  assert.equal(await run("localStorage.getItem('valetudo_offline_mutations_queue')"), null);
  if (offlineOnly) return;

  const queue = await run(`(() => {
    const control = document.querySelector('.sb-item[aria-current=page]');
    const rect = control.getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...queue });
  await wait("getComputedStyle(document.querySelector('.sb-item[aria-current=page]')).translate === '0px -1px'", 'sidebar hover lift');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...queue });
  await wait("getComputedStyle(document.querySelector('.sb-item[aria-current=page]')).translate === '0px 1px'", 'sidebar press reaction');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...queue });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  await wait("getComputedStyle(document.querySelector('.sb-item[aria-current=page]')).translate === '0px'", 'sidebar release settles');

  await run(`
    smoke.tabMotion = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      const animation = animate.call(this, frames, options);
      smoke.tabMotion.push({ id: this.id, target: this, from: frames[0].translate ?? null, duration: options.duration, animation });
      return animation;
    };
    smoke.click('Synthetic Patient');
    document.getElementById('doctor-tab-documents').focus();
  `);
  await run("smoke.fill(document.getElementById('rx-frequency'), 'Fixture frequency'); smoke.click('Clearance', '[role=tab]')");
  await wait("!document.getElementById('doctor-document-clearance').hidden", 'clearance tab');
  await run("smoke.click('Prescription', '[role=tab]')");
  await wait("!document.getElementById('doctor-document-rx').hidden && document.getElementById('rx-frequency').value === 'Fixture frequency'", 'prescription draft survives document tabs');
  assert.deepEqual(await run("smoke.tabMotion.filter(event => event.id.startsWith('doctor-document-')).map(event => [event.from, event.duration])"),
    [['4px 0', 220], ['-4px 0', 220]], 'document transition direction and timing');
  assert.equal(await run("smoke.tabMotion.find(event => event.id === 'doctor-document-clearance').animation.playState"), 'idle');
  await run("document.getElementById('doctor-tab-documents').focus()");
  await press('ArrowRight');
  await wait("document.activeElement.id === 'doctor-tab-encounter' && !document.getElementById('doctor-encounter-panel').hidden", 'automatic encounter tab');
  assert.equal(await run("smoke.tabMotion.at(-1).from"), '4px 0');
  assert.equal(await run("getComputedStyle(document.activeElement).outlineStyle"), 'solid', 'keyboard focus outline');
  await press('Home');
  assert.equal(await run("document.activeElement.id"), 'doctor-tab-documents');
  await press('End');
  await wait("document.querySelector('#encounter-diagnosis')?.getClientRects().length", 'encounter editor');
  await run("document.querySelectorAll('.doctor-console details').forEach(item => item.open = true); smoke.click('Past EMR history')");
  await wait("document.querySelector('dialog[open]')?.innerText.includes('LongFixtureNote')", 'long EMR history');
  assert.equal(await run("document.activeElement.id"), 'past-emr-history-title');
  assert.equal(await run("document.querySelector('dialog[open] .modal-card').scrollHeight > document.querySelector('dialog[open] .modal-card').clientHeight"), true, 'history scrolls inside its dialog');
  await press('Escape');
  await wait("!document.querySelector('dialog[open]') && document.activeElement.textContent.includes('Past EMR history')", 'history restores trigger focus');
  await run("smoke.fill(document.querySelector('#encounter-diagnosis'), 'Updated fixture diagnosis')");
  assert.equal(await run("document.querySelector('#encounter-diagnosis').value"), 'Updated fixture diagnosis');
  await press('Home');
  await press('End');
  await run("smoke.click('Finish consultation')");
  await wait("document.querySelector('dialog[open]')?.innerText.includes('Updated fixture diagnosis')", 'encounter draft retained');
  assert.equal(await run("document.activeElement.textContent"), 'Review encounter');
  await press('Tab', 8);
  assert.match(await run("document.activeElement.textContent"), /Confirm and finalize/);
  await press('Tab');
  assert.equal(await run("document.activeElement.closest('dialog')?.open"), true, 'Tab stays in modal');
  await run("smoke.click('Confirm and finalize')");
  await wait("smoke.state.finishEncounter && document.querySelector('dialog[open][aria-busy=true]')", 'pending encounter');
  await press('Escape');
  assert.equal(await run("document.querySelector('dialog[open][aria-busy=true]') !== null"), true, 'Escape cannot dismiss a pending save');
  await run("smoke.state.finishEncounter()");
  await wait("document.querySelector('dialog[open] [role=alert]')?.textContent.includes('Fixture save failed')", 'failed encounter retains review');
  await run("document.querySelector('dialog[open] [aria-label=\"Edit Diagnosis\"]').click()");
  await wait("document.activeElement.id === 'encounter-diagnosis' && document.activeElement.value === 'Updated fixture diagnosis'", 'review edit returns to field');
  await run("smoke.state.failEncounter = false; smoke.click('Finish consultation')");
  await wait("document.querySelector('dialog[open]')?.innerText.includes('Confirm and finalize')", 'retry review');
  await run("smoke.click('Confirm and finalize')");
  await wait("smoke.calls.some(([path, method, body]) => path.endsWith('/10/complete') && method === 'POST' && JSON.parse(body).diagnosis === 'Updated fixture diagnosis')", 'encounter payload');
  async function sidebarView(label, from, selector, activateWithKeyboard = false) {
    await run("smoke.workspaceStart = smoke.tabMotion.length");
    const labelJson = JSON.stringify(label);
    if (activateWithKeyboard) {
      await run(`[...document.querySelectorAll('.sb-item')].find(button => button.querySelector('span:not(.material-symbols-outlined)').textContent === ${labelJson}).focus()`);
      await press('Enter');
      assert.equal(await run("getComputedStyle(document.activeElement).outlineStyle"), 'solid');
    } else {
      await run(`smoke.click(${labelJson}, '.sb-item')`);
    }
    await wait(`document.querySelector('.sb-item[aria-current=page]')?.innerText.includes(${labelJson}) &&
      smoke.tabMotion.slice(smoke.workspaceStart).some(entry => entry.duration === 240 &&
        entry.from === ${JSON.stringify(from)} && entry.target.matches(${JSON.stringify(selector)}))`, label + ' workspace transition');
  }

  const consultationViews = async () => {
    await sidebarView('Bookings', '8px 0', '.doctor-roster');
    await sidebarView('History', '8px 0', '.doctor-roster');
    await sidebarView('EMR', '8px 0', '.doctor-directory');
    await sidebarView('Analytics', '8px 0', '.an-dashboard');
    await sidebarView('Queue', '-8px 0', '.doctor-roster');
  };
  await consultationViews();

  for (const [role, selector] of [
    ['DENTIST', '.doctor-console'], ['NURSE', '.nc-root'], ['EMERGENCY_RESPONDER', '.app-content .vd-page-head-title'],
    ['ADMIN', '.app-content table'],
  ]) {
    const started = performance.now();
    await run(`smoke.role('${role}')`);
    await wait(`document.querySelector('.tb-role-select').value === '${role}' && document.querySelector('${selector}')`, role + ' console');
    console.log(role + ' workspace ready in ' + Math.round(performance.now() - started) + ' ms');
    if (role === 'DENTIST') await consultationViews();
    if (role === 'EMERGENCY_RESPONDER') {
      await wait("smoke.tabMotion.some(entry => entry.target.matches('.vd-page-head') && entry.target.textContent.includes('Campus emergency dispatch') && entry.duration === 240 && entry.from === null)", 'Dispatch role fade');
    }
    if (role === 'NURSE') {
      await run(`
        const media = navigator.mediaDevices;
        smoke.originalCamera = media.getUserMedia;
        smoke.stoppedTracks = 0;
        media.getUserMedia = () => new Promise(resolve => {
          smoke.resolveCamera = () => resolve({ getTracks: () => [{ stop: () => smoke.stoppedTracks++ }] });
        });
        smoke.click('Turn on camera');
      `);
      await wait("typeof smoke.resolveCamera === 'function'", 'pending camera acquisition');
      await run("smoke.click('Search ID'); smoke.resolveCamera()");
      await wait("smoke.stoppedTracks === 1", 'late camera stream is released');
      await run(`
        navigator.mediaDevices.getUserMedia = smoke.originalCamera;
        smoke.click('Scan', '.nc-scanner button');
      `);
      await wait("document.querySelector('.nc-scanner input[type=file]')", 'QR file control after camera tab returns');
      await run(`
        const revoke = URL.revokeObjectURL;
        smoke.revokedImage = false;
        URL.revokeObjectURL = function(url) { smoke.revokedImage = true; return revoke.call(this, url); };
        const upload = document.querySelector('.nc-scanner input[type=file]');
        const transfer = new DataTransfer();
        transfer.items.add(new File(['invalid'], 'broken.png', { type: 'image/png' }));
        upload.files = transfer.files;
        upload.dispatchEvent(new Event('change', { bubbles: true }));
        smoke.restoreRevoke = () => { URL.revokeObjectURL = revoke; };
      `);
      await wait("smoke.revokedImage && document.body.innerText.includes('Could not read the uploaded QR image')", 'invalid image releases its blob URL');
      await run("smoke.restoreRevoke(); smoke.state.holdSos = true");
      await sidebarView('Expected', '8px 0', '.nc-root > section', true);
      await wait('typeof smoke.state.releaseSos === "function"', 'SOS request during workspace switch');
      await run(`
        smoke.expectedAnimation = smoke.tabMotion.at(-1).animation;
        smoke.expectedAnimation.pause();
        smoke.expectedAnimation.currentTime = 80;
        smoke.state.activeSos = [{ alert_id: 21, first_name: 'Fixture', last_name: 'SOS', status: 'pending', created_at: new Date().toISOString() }];
        smoke.state.holdSos = false;
        smoke.state.releaseSos();
      `);
      await wait("document.body.innerText.includes('Fixture SOS')", 'SOS visible during Expected animation');
      assert.equal(await run("document.getElementById('nc-sos').closest('[data-workspace-view]') === null"), true);
      await sidebarView('Triage', '-8px 0', '[data-workspace-view]:has(.nc-main)');
      assert.equal(await run("smoke.expectedAnimation.playState"), 'idle', 'rapid route change cancels outgoing motion');
      await sidebarView('Expected', '8px 0', '.nc-root > section');
      await sidebarView('Inventory', '8px 0', '.inventory-workspace');
      await wait("document.getElementById('inventory-tab-catalog')", 'Inventory tabs');
      await wait("document.querySelector('[aria-label=\"Dispensable batches\"]')?.scrollHeight > 420", 'scrollable inventory batches');
      await run(`document.querySelector('[aria-label="Dispensable batches"]').scrollTop = 120`);
      await run("document.getElementById('inventory-tab-catalog').focus()");
      await press('End');
      assert.equal(await run("document.activeElement.id"), 'inventory-tab-addmed');
      assert.equal(await run("document.getElementById('inventory-tab-catalog').getAttribute('aria-selected')"), 'true');
      await press('Enter');
      await wait("!document.getElementById('inventory-panel-addmed').hidden", 'manual Inventory tab activation');
      assert.equal(await run("smoke.tabMotion.at(-1).id"), 'inventory-panel-addmed');
      await press('Home');
      await press('Enter');
      await wait(`document.querySelector('[aria-label="Dispensable batches"]')?.scrollTop === 120`, 'inventory scroll position survives tabs');
      assert.equal(await run("document.querySelector('.app-content [role=alert]').textContent.includes('Fixture SOS')"), true);
      assert.equal(await run("document.querySelector('.app-content [role=alert]').getAnimations().length"), 0);
      assert.equal(await run("getComputedStyle(document.querySelector('.app-content [role=alert]')).animationName"), 'none');
      await sidebarView('Analytics', '8px 0', '.an-dashboard');
      await run("smoke.workspaceStart = smoke.tabMotion.length; smoke.click('Open triage board')");
      await wait("smoke.tabMotion.slice(smoke.workspaceStart).some(entry => entry.from === '-8px 0' && entry.target.querySelector('.nc-main'))", 'triage shortcut uses the route transition');

      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await run("smoke.workspaceStart = smoke.tabMotion.length; smoke.click('Expected', '.sb-item')");
      await wait("document.querySelector('.sb-item[aria-current=page]')?.innerText.includes('Expected')", 'reduced-motion sidebar switch');
      assert.equal(await run("smoke.tabMotion.length"), await run("smoke.workspaceStart"));
      await send('Emulation.setEmulatedMedia', { features: [] });
      await run("smoke.click('Expected', '.sb-item')");
      assert.equal(await run("smoke.tabMotion.length"), await run("smoke.workspaceStart"), 'active destination does not replay');
      await send('Emulation.setEmulatedMedia', { media: 'print' });
      await run("[...document.querySelectorAll('.sb-item')].find(button => button.textContent.includes('Triage')).click()");
      await wait("document.querySelector('.sb-item[aria-current=page]')?.textContent.includes('Triage')", 'route change during print');
      assert.equal(await run("smoke.tabMotion.length"), await run("smoke.workspaceStart"), 'print suppresses workspace motion');
      await send('Emulation.setEmulatedMedia', { media: '' });
    }
  }
  await wait("[...document.querySelectorAll('.sb-item')].some(button => button.innerText.includes('Incident Records'))", 'Admin incident navigation is authorized');
  const auditRequests = "smoke.calls.filter(([path]) => ['/api/admin/phi-access-logs', '/api/admin/audit-logs', '/api/admin/telemetry'].includes(path)).length";
  assert.equal(await run(auditRequests), 0, 'Admin landing skips audit and telemetry');
  for (const label of ['Privacy & audit', 'System health', 'Server Policy', 'Health analytics', 'Incident Records', 'Database Studio']) {
    await sidebarView(label, '8px 0', '[data-workspace-view]:has(.vd-page-head, .an-dashboard)');
  }
  assert.equal(await run(auditRequests), 3, 'audit and telemetry load once on entry');
  await sidebarView('Incident Records', '-8px 0', '[data-workspace-view]:has(.vd-page-head)');
  await run("smoke.workspaceStart = smoke.tabMotion.length; smoke.state.showIncidentRecords = false; window.dispatchEvent(new Event('focus'))");
  await wait("![...document.querySelectorAll('.sb-item')].some(button => button.innerText.includes('Incident Records'))", 'revoked Admin destination');
  assert.equal(await run("smoke.tabMotion.length"), await run("smoke.workspaceStart"), 'permission change does not trigger a workspace slide');
  await run("smoke.state.showIncidentRecords = true; window.dispatchEvent(new Event('focus'))");
  await wait("[...document.querySelectorAll('.sb-item')].some(button => button.innerText.includes('Incident Records'))", 'restored incident access');
  await sidebarView('Users & roles', '-8px 0', '[data-workspace-view]:has(.vd-page-head)');
  await sidebarView('Terminal', '8px 0', '[data-workspace-view]:has(.server-console)');
  await wait("document.activeElement.getAttribute('aria-label') === 'Diagnostic command'", 'Terminal prompt is focused on entry');
  await wait("document.querySelector('.server-console-toolbar [data-online=true]')", 'Terminal is connected');
  await run("smoke.fill(document.activeElement, 'memory')");
  await press('Enter');
  await wait("document.querySelector('.server-console pre').textContent.includes('rssMiB')", 'Terminal command output');
  assert.equal(await run("document.activeElement.getAttribute('aria-label')"), 'Diagnostic command');
  await run("smoke.fill(document.activeElement, 'clear')");
  await press('Enter');
  await wait("!document.querySelector('.server-console pre').textContent.includes('rssMiB')", 'Terminal clears without leaving the prompt');
  await run("smoke.state.showIncidentRecords = false; smoke.state.terminalGrant = true; window.dispatchEvent(new Event('focus'))");
  await wait("document.querySelector('.server-console-toolbar [data-online=true]') && ![...document.querySelectorAll('.sb-item')].some(button => button.innerText.includes('Incident Records'))", 'Limited Admin retains Terminal access');
  await run("smoke.state.terminalGrant = false; window.dispatchEvent(new Event('focus'))");
  await wait("!document.querySelector('.server-console') && ![...document.querySelectorAll('.sb-item')].some(button => button.innerText.includes('Terminal'))", 'revoking Terminal clears its view and destination');
  await run("smoke.state.showIncidentRecords = true; window.dispatchEvent(new Event('focus'))");
  await wait("[...document.querySelectorAll('.sb-item')].some(button => button.innerText.includes('Terminal'))", 'Super Admin Terminal navigation is restored');
  await wait("document.body.innerText.includes('Fixture Nurse') && document.querySelector('.sb-item[aria-current=page]')?.innerText.includes('Users & roles')", 'Terminal revocation returns to the account list');
  await run("smoke.click('Add account')");
  await wait("document.querySelector('dialog[open] #create-user-sex')", 'Student profile inputs');
  for (const role of ['FACULTY', 'NON_TEACHING', 'ADMIN']) {
    await run("(() => { const select = document.querySelector('dialog[open] select'); select.value = " + JSON.stringify(role) + "; select.dispatchEvent(new Event('change', { bubbles: true })); })()");
    assert.equal(await run("Boolean(document.querySelector('dialog[open] #create-user-dob'))"), role !== 'ADMIN');
  }
  await run("smoke.click('Limited Admin', 'dialog[open] button')");
  await wait("[...document.querySelectorAll('dialog[open] label')].some(label => label.innerText.includes('Use server Terminal') && !label.querySelector('input').checked)", 'Terminal grant is available and unselected');
  await press('Escape');
  await wait("!document.querySelector('dialog[open]')", 'close create account form');
  await run("smoke.click('Archive', 'button[title^=Archive]')");
  await wait("document.querySelector('dialog[open]')?.innerText.includes('Fixture Nurse (#3)')", 'archive confirmation identifies account');
  assert.equal(await run("document.activeElement.textContent"), 'Cancel');
  await press('Escape');
  await wait("!document.querySelector('dialog[open]') && document.activeElement.textContent.includes('Archive')", 'archive cancel restores focus');
  await run("smoke.click('Settings', '.sb-link')");
  await wait("document.querySelector('.settings-pop')?.getClientRects().length", 'nonmodal settings');
  await run("smoke.click('Light', '.settings-pop [role=radio]')");
  await wait("document.documentElement.dataset.themeMode === 'light'", 'light theme');
  await press('Escape');
  await wait("document.activeElement.textContent.includes('Settings')", 'settings focus return');
  await run("smoke.click('Edit')");
  await wait("document.body.innerText.includes('Use role defaults')", 'staff analytics editor');
  await run(`smoke.fill(document.getElementById('admin-temporary-password'), 'fixture-temporary-password'); smoke.click('Force reset')`);
  await wait("document.querySelectorAll('dialog[open]').length === 2 && document.activeElement.textContent === 'Cancel'", 'nested password confirmation');
  await press('Escape');
  await wait("document.querySelectorAll('dialog[open]').length === 1 && document.activeElement.textContent.includes('Force reset')", 'nested dialog restores focus to the editor');
  await run("smoke.fill(document.getElementById('admin-temporary-password'), '')");
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await run("getComputedStyle(document.querySelector('dialog[open]')).animationName"), 'none');
  await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 400, deviceScaleFactor: 2, mobile: false });
  await wait("window.innerWidth === 600 && window.devicePixelRatio === 2", 'narrow high-density viewport');
  assert.equal(await run(`(() => {
    const { left, right, top, bottom } = document.querySelector('dialog[open]').getBoundingClientRect();
    return left >= 0 && top >= 0 && right <= innerWidth && bottom <= innerHeight;
  })()`), true, 'dialog fits narrow viewport');
  assert.equal(await run(`(() => {
    const actions = document.querySelector('dialog[open] .dialog-footer').getBoundingClientRect();
    return actions.top >= 0 && actions.bottom <= innerHeight;
  })()`), true, 'actions are visible in the narrow 2x-density viewport');
  // Halve the available CSS viewport to test layout reflow at 200% of a 1200 × 800 workspace.
  assert.equal(await run("innerWidth === 1200 / 2 && innerHeight === 800 / 2"), true);
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await run(`
    const defaultsLabel = [...document.querySelectorAll('label')].find(label => label.textContent.includes('Use role defaults'));
    defaultsLabel.querySelector('input').click();
    smoke.click('Save analytics permissions');
  `);
  await wait("smoke.calls.some(([path, method]) => path.endsWith('/analytics-permissions') && method === 'PUT')", 'analytics grant save');
  await run("smoke.click('Advanced')");
  await wait(`document.querySelector('input[placeholder="170"]')?.value === '160'`, 'advanced health profile');
  await run(`smoke.fill(document.querySelector('input[placeholder="170"]'), '165'); smoke.click('Save profile changes')`);
  await wait("smoke.calls.some(([path, method, body]) => path.endsWith('/admin/users/3') && method === 'PUT' && JSON.parse(body).health_profile?.height === 165)", 'advanced profile save');
  await run(`
    if (document.querySelector('.admin-profile-editor-backdrop')) smoke.click('Close', '.admin-profile-editor-backdrop button');
    smoke.state.analytics = {
      ...smoke.state.restrictedAnalytics,
      scopes: [...smoke.state.restrictedAnalytics.scopes, 'ANALYTICS_CLINICAL'],
      clinical: { topDiagnoses: [{ diagnosis: 'Revocable fixture diagnosis', count: 3 }], surveillance: null },
    };
    smoke.click('Health analytics', '.sb-item');
  `);
  await wait("document.body.innerText.includes('Fixture headcount')", 'scoped analytics');
  await run("document.querySelector('.an-tabs [role=tab]').focus()");
  await press('End');
  await wait("document.body.innerText.includes('Revocable fixture diagnosis')", 'clinical analytics tab');
  await run(`
    smoke.motionBeforeRefresh = smoke.tabMotion.length;
    smoke.callsBeforeRefresh = smoke.calls.length;
    window.dispatchEvent(new Event('focus'));
  `);
  await wait("smoke.calls.slice(smoke.callsBeforeRefresh).some(([path]) => path.endsWith('/analytics/summary')) && document.querySelector('.an-controls button').getAttribute('aria-disabled') === 'false'", 'analytics refresh settles');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await press('Home');
  await wait("document.querySelector('.an-tabs [aria-selected=true]').textContent === 'Overview'", 'reduced-motion tab still activates');
  await press('End');
  await wait("document.querySelector('.an-tabs [aria-selected=true]').textContent === 'Clinical Activity'", 'reduced-motion selection restores clinical tab');
  assert.equal(await run("smoke.tabMotion.length === smoke.motionBeforeRefresh"), true, 'reduced motion suppresses tab transitions');
  await send('Emulation.setEmulatedMedia', { features: [] });
  assert.equal(await run("smoke.tabMotion.length === smoke.motionBeforeRefresh"), true, 'refresh does not animate the current tab');
  await run("window.print = () => { window.printFixture = document.querySelector('.an-print')?.textContent }; smoke.click('Print dashboard')");
  await wait("window.printFixture?.includes('Fixture headcount')", 'print revalidates the displayed snapshot');
  assert.doesNotMatch(await run('printFixture'), /Revocable fixture diagnosis/);
  await run(`
    [...document.querySelectorAll('.an-tabs [role=tab]')].at(-1).focus();
    smoke.state.analytics = smoke.state.restrictedAnalytics;
    window.dispatchEvent(new Event('focus'));
  `);
  await wait("document.querySelectorAll('.an-tabs [role=tab]').length === 1 && document.activeElement.textContent === 'Overview'", 'revoked analytics panel and focus');
  assert.equal(await run("document.body.textContent.includes('Revocable fixture diagnosis')"), false);
  assert.equal(await run("smoke.tabMotion.length === smoke.motionBeforeRefresh"), true, 'revocation removes content without motion');
  await run("window.print = () => { window.printFixture = document.querySelector('.an-print')?.textContent }; smoke.click('Print dashboard')");
  await wait("window.printFixture?.includes('Fixture headcount')", 'authorized print');
  assert.doesNotMatch(await run('printFixture'), /Top clinical diagnoses|Formulary dispensing/i);
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(await run("getComputedStyle(document.querySelector('.app-content')).animationName"), 'none');
  assert.equal(await run("getComputedStyle(document.querySelector('.an-print')).display"), 'block');
  await send('Emulation.setEmulatedMedia', { media: '' });
}
