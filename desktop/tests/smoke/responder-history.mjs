import assert from 'node:assert/strict';

export async function verifyResponderHistory(run, wait, screenshot) {
  await run(`(() => {
    smoke.beforeHistoryFetch = window.fetch;
    smoke.previousFrequency = document.querySelector('#rx-frequency').value;
    smoke.fill(document.querySelector('#rx-frequency'), 'Unfinished consultation draft fixture');
    const at = new Date(Date.now() - 2 * 86400000).toISOString();
    smoke.historyState = { draft: null, filed: false, failSave: false, holdSave: false, saveCalls: 0, fileCalls: 0, pdfCalls: 0, canViewFiled: true };
    const base = { alertId: 91, patient: { userId: 5, name: 'Synthetic Campus Member', identifier: 'FIX-91', phone: '0000000000' },
      status: 'resolved', createdAt: at, resolvedAt: at, acknowledgedAt: at, location: 'Campus main gate', latitude: 16, longitude: 120,
      needsReport: true, reportId: null, hasDraft: false, deferredAt: null, documentedByName: null };
    smoke.historyBase = base;
    window.fetch = async (input, options = {}) => {
      const url = new URL(input.url || input, location.href), path = url.pathname, state = smoke.historyState;
      if (path.endsWith('/emergency/report-summary')) return Response.json({ pending: state.filed ? 0 : 1, overdue: state.filed ? 0 : 1, drafts: state.draft && !state.filed ? 1 : 0, canViewFiled: state.canViewFiled });
      const row = { ...base, hasDraft: !!state.draft, deferredAt: state.deferredAt || null, needsReport: !state.filed, reportId: state.filed ? 17 : null, filedAt: state.filed ? at : null, documentedByName: state.filed ? 'Synthetic Response Staff' : null };
      if (['history', 'report-worklist', 'reports'].some(name => path.endsWith('/emergency/' + name))) {
        const empty = url.searchParams.get('search') === 'nomatch' || (path.endsWith('/reports') && !state.filed) || (path.endsWith('/report-worklist') && state.filed);
        return Response.json({ records: empty ? [] : [row], nextCursor: null });
      }
      if (path.endsWith('/emergency/history/91')) return Response.json({ ...row, timeline: [{ status: 'triggered', at }, { status: 'resolved', at, actor: 'Synthetic Response Staff' }] });
      if (path.endsWith('/emergency/91/incident-report-draft')) {
        if (options.method === 'PUT') {
          state.saveCalls++;
          const body = JSON.parse(options.body);
          if (state.failSave) return Response.json({ error: 'Synthetic save failure' }, { status: 503 });
          if (body.revision !== (state.draft?.revision || 0)) return Response.json({ error: 'Draft changed in another desktop session', code: 'DRAFT_REVISION_CONFLICT' }, { status: 409 });
          if (state.holdSave) await new Promise(resolve => { state.releaseSave = () => { state.holdSave = false; resolve(); }; });
          state.draft = { ...body, revision: body.revision + 1 };
          if (body.defer) state.deferredAt = new Date().toISOString();
          return Response.json({ revision: state.draft.revision });
        }
        return Response.json(state.draft || { revision: 0, incidentDetails: '', treatmentNotes: '', resolvedAt: null });
      }
      if (path.endsWith('/emergency/91/incident-report')) {
        if (options.method === 'POST') { state.fileCalls++; state.filed = true; state.draft = null; return Response.json({ reportId: 17 }, { status: 201 }); }
        return Response.json({ patient: { name: base.patient.name, studentNo: base.patient.identifier, roleLabel: 'Campus member', phone: '0000000000' }, alert: { createdAt: at, resolvedAt: at }, report: state.filed ? { reportId: 17 } : null });
      }
      if (path.endsWith('/emergency/reports/17')) return Response.json({ reportId: 17, alertId: 91, patientName: base.patient.name, incidentDetails: 'Final synthetic narrative', treatmentNotes: 'Synthetic handover', resolvedAt: at, filedAt: at, documentedByName: 'Synthetic Response Staff', pdfAvailable: true });
      if (path.endsWith('/emergency/reports/17/pdf')) { state.pdfCalls++; return new Response('%PDF-1.4 synthetic fixture', { headers: { 'Content-Type': 'application/pdf' } }); }
      return smoke.beforeHistoryFetch(input, options);
    };
    window.dispatchEvent(new Event('focus'));
    smoke.click('Incident reports', '.sb-item');
  })()`);
  await wait("document.querySelector('#responder-record-panel')?.textContent.includes('Synthetic Campus Member')");
  assert.equal(await run("document.querySelector('.rh-workspace').textContent.includes('Over 24 hours')"), true);
  await run("smoke.click('Write report', '#responder-record-panel button')");
  await wait("document.querySelector('.rh-editor textarea') && !document.querySelector('.rh-editor textarea').readOnly");
  assert.notEqual(await run("getComputedStyle(document.querySelector('.rh-modal')).backgroundColor"), 'rgba(0, 0, 0, 0)', 'Report dialogs have an opaque themed surface');
  assert.equal(await run('smoke.historyState.saveCalls'), 0, 'Opening a new form does not write an empty draft');
  await run("smoke.historyState.holdSave = true; smoke.fill(document.querySelector('.rh-editor textarea'), 'First synthetic draft')");
  await wait('typeof smoke.historyState.releaseSave === "function"');
  await run("smoke.fill(document.querySelector('.rh-editor textarea'), 'Latest synthetic draft typed during save'); smoke.historyState.releaseSave()");
  await wait("smoke.historyState.draft?.incidentDetails === 'Latest synthetic draft typed during save'");
  await wait("document.querySelector('.rh-save-state').textContent.startsWith('Saved')");
  await screenshot?.('responder-report-editor');
  await run("smoke.click('Save and return', 'dialog button')");
  await wait("!document.querySelector('dialog[open]') && document.querySelector('#responder-record-panel').textContent.includes('My draft saved')");
  assert.equal(await run('Boolean(smoke.historyState.deferredAt)'), true);
  await run("smoke.click('Resume draft', '#responder-record-panel button')");
  await wait("document.querySelector('.rh-editor textarea')?.value === 'Latest synthetic draft typed during save'");
  await run("smoke.historyState.failSave = true; smoke.fill(document.querySelector('.rh-editor textarea'), 'Retained after failed save')");
  await wait("document.querySelector('dialog')?.textContent.includes('Synthetic save failure')");
  assert.equal(await run("document.querySelector('.rh-editor textarea').value"), 'Retained after failed save');
  await run("smoke.historyState.failSave = false; smoke.click('Retry', 'dialog button')");
  await wait("smoke.historyState.draft.incidentDetails === 'Retained after failed save' && document.querySelector('.rh-save-state').textContent.startsWith('Saved')");
  await run("smoke.historyState.draft = { ...smoke.historyState.draft, revision: smoke.historyState.draft.revision + 1, incidentDetails: 'Saved in another desktop session' }; smoke.fill(document.querySelector('.rh-editor textarea'), 'Conflicting local changes')");
  await wait("document.querySelector('dialog').textContent.includes('Draft changed in another desktop session')");
  assert.equal(await run('smoke.historyState.draft.incidentDetails'), 'Saved in another desktop session');
  await run("smoke.click('Reload saved draft', 'dialog button')");
  await wait("Array.from(document.querySelectorAll('dialog button')).some(button => button.textContent.includes('Replace with saved draft'))");
  await run("smoke.click('Replace with saved draft', 'dialog button')");
  await wait("document.querySelector('.rh-editor textarea')?.value === 'Saved in another desktop session'");
  await run("smoke.click('File report', 'dialog button')");
  await wait("!document.querySelector('dialog[open]') && smoke.historyState.filed");
  assert.equal(await run('smoke.historyState.fileCalls'), 1);
  assert.equal(await run('smoke.historyState.draft'), null);
  await run("smoke.click('Filed', '.rh-tabs button')");
  await wait("document.querySelector('#responder-record-panel').textContent.includes('IR-17')");
  assert.equal(await run('smoke.historyState.pdfCalls'), 0);
  await run("smoke.click('View', '#responder-record-panel button')");
  await wait("document.querySelector('dialog')?.textContent.includes('Final synthetic narrative')");
  assert.equal(await run("document.querySelectorAll('dialog textarea').length"), 0);
  await run("smoke.click('Preview PDF', 'dialog button')");
  await wait("document.querySelector('iframe[title=\"Official incident report PDF\"]')");
  assert.equal(await run('smoke.historyState.pdfCalls'), 1);
  await run("document.querySelector('button[aria-label=\"Close incident details\"]').click(); smoke.historyState.canViewFiled = false; window.dispatchEvent(new Event('focus'))");
  await wait("!document.querySelector('#report-tab-filed')");
  await run("smoke.click('Alert history', '.sb-item')");
  await wait("document.querySelector('#responder-record-panel')?.textContent.includes('Synthetic Campus Member')");
  await run("smoke.fill(document.querySelector('input[aria-label=\"Search responder records\"]'), 'nomatch')");
  await wait("document.querySelector('#responder-record-panel').textContent.includes('No matching records')");
  await run("smoke.click('Clear filters', '.rh-toolbar button')");
  await wait("document.querySelector('#responder-record-panel').textContent.includes('Synthetic Campus Member')");
  await screenshot?.('responder-alert-history');
  await run("window.fetch = smoke.beforeHistoryFetch; smoke.click('Queue', '.sb-item'); window.dispatchEvent(new Event('focus'))");
  await wait("document.querySelector('#rx-frequency')?.getClientRects().length");
  assert.equal(await run("document.querySelector('#rx-frequency').value"), 'Unfinished consultation draft fixture', 'History navigation preserves unfinished clinical work');
  await run("smoke.fill(document.querySelector('#rx-frequency'), smoke.previousFrequency)");
  console.log('Responder history checks passed: private desktop drafts, autosave serialization, deferral, failed save, conflict, single filing, read-only archive, lazy PDF, search and live archive revocation.');
}
