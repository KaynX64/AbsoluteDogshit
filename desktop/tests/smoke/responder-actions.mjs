import assert from 'node:assert/strict';

// Runs inside the existing hidden Electron fixture, with no live server or account.
export async function verifyResponderActions(run, wait) {
  await run(`(() => {
    smoke.originalResponderFetch = window.fetch;
    smoke.responderChanges = [];
    smoke.responderAlert = {
      alert_id: 91, user_id: 5, first_name: 'Fixture', last_name: 'Responder SOS',
      status: 'triggered', created_at: new Date().toISOString(), phone: '0000000000',
      latitude: 16, longitude: 120, formattedAddress: 'Synthetic campus gate',
      blood_type: 'O+', allergies: 'Synthetic allergy', medicalDetailsRedacted: false,
    };
    window.fetch = async (input, options = {}) => {
      const path = new URL(input.url || input, location.href).pathname;
      if (path.endsWith('/emergency/active')) {
        if (!smoke.state.responderTier) return Response.json({}, { status: 403 });
        const alert = { ...smoke.responderAlert };
        if (smoke.state.responderTier === 'community') {
          delete alert.blood_type; delete alert.allergies; alert.medicalDetailsRedacted = true;
        }
        return Response.json([alert]);
      }
      if (path.endsWith('/emergency/91/status')) {
        const { status } = JSON.parse(options.body);
        smoke.responderChanges.push(status);
        if (smoke.denyResponderAction ||
            (smoke.state.responderTier !== 'clinical' && status !== 'acknowledged')) {
          smoke.denyResponderAction = false;
          smoke.state.responderTier = 'community';
          return Response.json({ code: 'RESPONDER_ACTION_FORBIDDEN', error: 'Staff action restricted' }, { status: 403 });
        }
        smoke.responderAlert.status = status;
        return Response.json({});
      }
      return smoke.originalResponderFetch(input, options);
    };
    smoke.state.responderTier = 'community';
    window.dispatchEvent(new Event('focus'));
  })()`);

  const buttons = scope => run(`Array.from(document.querySelectorAll(${JSON.stringify(scope)} + ' button')).map(b => b.textContent.trim())`);
  const changeTier = async tier => {
    await run(`smoke.state.responderTier = ${JSON.stringify(tier)}; window.dispatchEvent(new Event('focus'))`);
  };
  const click = (scope, text) => run(`smoke.click(${JSON.stringify(text)}, ${JSON.stringify(scope + ' button')})`);
  await wait("document.querySelector('.ea-alert')?.textContent.includes('Fixture Responder SOS')");
  assert.deepEqual(await buttons('.ea-actions'), ['Acknowledge Alert']);
  assert.equal(await run("Boolean(document.querySelector('.ea-alert a[href*=maps]'))"), true);
  await click('.ea-actions', 'Acknowledge');
  await wait("document.querySelector('.ea-status-pill')?.textContent.includes('acknowledged')");
  assert.equal(await run("Boolean(document.querySelector('.ea-alert'))"), true, 'Acknowledgment keeps the banner active');
  await changeTier('clinical');
  await wait("document.querySelector('.ea-action-dispatch')");
  await click('.ea-actions', 'Dispatch');
  await wait("document.querySelector('.ea-status-pill')?.textContent.includes('dispatched')");
  await run('smoke.denyResponderAction = true');
  await click('.ea-actions', 'Mark Resolved');
  await wait("!document.querySelector('.ea-action-resolve') && document.querySelector('.ea-alert')");
  assert.equal(await run('smoke.responderAlert.status'), 'dispatched', 'Denied closure leaves the incident open');
  await changeTier(null);
  await wait("!document.querySelector('.ea-alert')");

  await run("smoke.responderAlert.status = 'triggered'; smoke.role('EMERGENCY_RESPONDER')");
  await changeTier('community');
  await wait("document.querySelector('.app-content')?.textContent.includes('Fixture Responder SOS')");
  assert.deepEqual((await buttons('.app-content')).filter(text => /Acknowledge|Dispatch team|^Resolve$|False alarm/.test(text)), ['Acknowledge']);
  await click('.app-content', 'Acknowledge');
  await wait("document.querySelector('.app-content')?.textContent.includes('ACKNOWLEDGED')");
  assert.equal(await run("document.querySelector('.app-content').textContent.includes('Fixture Responder SOS')"), true);
  await changeTier('clinical');
  await wait("Array.from(document.querySelectorAll('.app-content button')).some(b => b.textContent.trim() === 'Resolve')");
  await run('smoke.denyResponderAction = true');
  await click('.app-content', 'Resolve');
  await wait("!Array.from(document.querySelectorAll('.app-content button')).some(b => b.textContent.trim() === 'Resolve')");
  assert.equal(await run('smoke.responderAlert.status'), 'acknowledged');

  await run("smoke.responderAlert.status = 'triggered'; smoke.role('NURSE')");
  await wait("document.querySelector('#nc-sos')?.textContent.includes('Fixture Responder SOS')");
  const incidentButtons = await buttons('#nc-sos');
  assert.equal(incidentButtons.some(text => /Dispatch|Resolve|False alarm/.test(text)), false);
  assert.equal(incidentButtons.some(text => text.includes('Acknowledge')), true);
  await changeTier('clinical');
  await wait("Array.from(document.querySelectorAll('#nc-sos button')).some(b => b.textContent.includes('Resolve'))");
  await click('#nc-sos', 'Resolve');
  await wait("document.querySelector('dialog[open]')?.textContent.includes('Close this SOS as resolved?')");
  await changeTier('community');
  await wait("!document.querySelector('dialog[open]')");

  await run(`window.fetch = smoke.originalResponderFetch;
    smoke.state.responderTier = 'clinical';
    smoke.state.activeSos = [];
    window.dispatchEvent(new Event('focus'));
    smoke.role('DOCTOR');`);
  await wait("document.querySelector('#rx-frequency') && !document.querySelector('.ea-alert')");
  console.log('Responder action checks passed: banner, dispatch console, nurse confirmation, live downgrade, acknowledgment and denied closure.');
}
