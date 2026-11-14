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
    if (path.endsWith('/signature/me/status')) return Response.json({ enrolled: true });
    if (path.endsWith('/appointments/today')) return Response.json([patient]);
    if (path.endsWith('/appointments/patient/5/history')) return Response.json({ records: [], nextCursor: null });
    if (path.endsWith('/appointments/10/complete')) return Response.json({ emrId: 10 });
    if (path.endsWith('/admin/users')) return Response.json([{
      id: 3, name: 'Fixture Nurse', first_name: 'Fixture', last_name: 'Nurse',
      email: 'nurse@example.invalid', role: 'NURSE', status: 'Active',
    }]);
    if (path.endsWith('/admin/my-permissions')) return Response.json({ user_id: 1, is_super: true, permissions: ['SUPER_ADMIN'] });
    if (path.endsWith('/admin/users/3/health-profile')) return Response.json({ health_profile: { height: 160, weight: 55 } });
    if (path.endsWith('/admin/users/3') && method === 'PUT') return Response.json({ message: 'Saved' });
    if (path.endsWith('/admin/users/3/analytics-permissions')) {
      if (method === 'PUT') override = JSON.parse(options.body).scopes;
      return Response.json({ override, defaults: ['ANALYTICS_OPERATIONS'], permissions });
    }
    if (path.endsWith('/analytics/summary')) return Response.json({
      scopes: ['ANALYTICS_HEADCOUNT', 'ANALYTICS_EXPORT'], operations: null, clinical: null, pharmacy: null,
      headcount: { roleDistribution: [{ role_code: 'STUDENT', role_name: 'Fixture headcount', count: 3 }] },
    });
    if (path.endsWith('/analytics/report-access')) return Response.json({ scopes: ['ANALYTICS_HEADCOUNT', 'ANALYTICS_EXPORT'] });
    if (path.endsWith('/sync/replay')) return Response.json({ results: JSON.parse(options.body).mutations.map(row => ({
      client_mutation_id: row.client_mutation_id, status: 'synced', serverRecordId: 4,
    })) });
    return Response.json([]);
  };
  window.alert = () => {};
  window.smoke = {
    calls,
    click(text, selector = 'button') {
      const button = [...document.querySelectorAll(selector)]
        .find(element => element.getClientRects().length && element.textContent.toLowerCase().includes(text.toLowerCase()));
      if (!button) throw Error('Missing control: ' + text);
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

export async function verifyWorkflows(run, wait) {
  await run(`(async () => {
    const queued = await window.electronAPI.offlineQueueMutation({
      client_mutation_id: 'fixture-replay', record_uuid: 'fixture-record', user_id: 1,
      table_name: 'EMR_RECORDS', action: 'CREATE',
      payload: { patient_user_id: 5, chief_complaint: 'Fixture complaint', diagnosis: 'Fixture diagnosis' },
    });
    if (!queued.success) throw Error(queued.error);
    const queue = await window.electronAPI.offlineGetPendingMutations();
    localStorage.setItem('valetudo_offline_mutations_queue', JSON.stringify(queue));
    window.dispatchEvent(new Event('offline-queue-changed'));
    smoke.login();
  })()`);
  await wait("document.querySelector('.tb-role-select')?.value === 'DOCTOR' && document.body.innerText.includes('Synthetic Patient')", 'Doctor console');
  assert.equal(await run("JSON.parse(localStorage.getItem('valetudo_theme')).mode"), 'dark');
  await run("document.querySelector('.tb-replay').click()");
  await wait("smoke.calls.some(([path]) => path.endsWith('/sync/replay'))", 'replay request');
  await wait("window.electronAPI.offlineGetPendingMutations().then(rows => rows.length === 0)", 'SQLite replay completion');

  await run("smoke.click('Synthetic Patient'); smoke.click('Encounter')");
  await wait("document.querySelector('#encounter-diagnosis')?.getClientRects().length", 'encounter editor');
  await run("smoke.fill(document.querySelector('#encounter-diagnosis'), 'Updated fixture diagnosis')");
  assert.equal(await run("document.querySelector('#encounter-diagnosis').value"), 'Updated fixture diagnosis');
  await run("smoke.click('Finish consultation')");
  await wait("document.body.innerText.includes('Review encounter')", 'encounter review');
  await run("smoke.click('Confirm and finalize')");
  await wait("smoke.calls.some(([path, method, body]) => path.endsWith('/10/complete') && method === 'POST' && JSON.parse(body).diagnosis === 'Updated fixture diagnosis')", 'encounter payload');
  for (const [role, selector] of [
    ['DENTIST', '.doctor-console'], ['NURSE', '.nc-root'], ['EMERGENCY_RESPONDER', '.app-content .vd-page-head-title'],
    ['ADMIN', '.app-content table'],
  ]) {
    const started = performance.now();
    await run(`smoke.role('${role}')`);
    await wait(`document.querySelector('.tb-role-select').value === '${role}' && document.querySelector('${selector}')`, role + ' console');
    console.log(role + ' workspace ready in ' + Math.round(performance.now() - started) + ' ms');
  }
  await wait("document.body.innerText.includes('Fixture Nurse')", 'Admin account list');
  await run("smoke.click('Edit')");
  await wait("document.body.innerText.includes('Use role defaults')", 'staff analytics editor');
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
  await run("if (document.querySelector('.admin-profile-editor-backdrop')) smoke.click('Close', '.admin-profile-editor-backdrop button'); smoke.click('Health analytics', '.sb-item')");
  await wait("document.body.innerText.includes('Fixture headcount')", 'scoped analytics');
  await run("window.print = () => { window.printFixture = document.querySelector('.an-print')?.textContent }; smoke.click('Print dashboard')");
  await wait("window.printFixture?.includes('Fixture headcount')", 'authorized print');
  assert.doesNotMatch(await run('printFixture'), /Top clinical diagnoses|Formulary dispensing/i);
}
