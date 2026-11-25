import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifyQualificationStability(run, wait, resize, screenshot, setReducedMotion) {
  const field = "Array.from(document.querySelectorAll('.qualification-detail label')).find(label=>label.textContent.startsWith('Training history')).querySelector('textarea')";
  await run("smoke.qualification.actor={userId:1,admin:true,reviewer:true}; smoke.click('Refresh','.qualification-heading button')");
  await wait("document.querySelector('.qualification-navigation').textContent.includes('Nominations and reviewers')");
  await run("smoke.click('My qualification','[role=tab]')");
  await wait(`Boolean(${field.replace(".querySelector('textarea')", "?.querySelector('textarea')")})`);
  await run(`smoke.fill(${field}, 'Unsaved qualification training fixture'); smoke.qualification.detailElement=document.querySelector('.qualification-detail-body'); smoke.qualification.holdMe=true; smoke.qualification.meCalls=smoke.qualification.calls.filter(call=>call.path.endsWith('/me')).length;
    smoke.click('Refresh','.qualification-heading button'); smoke.click('Refresh','.qualification-heading button');`);
  await wait('typeof smoke.qualification.releaseMe === "function"');
  assert.equal(await run(`${field}.value`), 'Unsaved qualification training fixture', 'Refresh retains unsaved application text');
  assert.equal(await run("document.querySelector('.qualification-detail-body')===smoke.qualification.detailElement"), true, 'Refresh retains the mounted form');
  assert.equal(await run("smoke.qualification.calls.filter(call=>call.path.endsWith('/me')).length-smoke.qualification.meCalls"), 1, 'Repeated refresh clicks share one request');
  await run('smoke.qualification.releaseMe()');
  await wait("!document.querySelector('.qualification-heading button').disabled");
  await delay(300);
  await run("smoke.qualification.focusReads=smoke.qualification.calls.filter(call=>call.path.endsWith('/me')).length; window.dispatchEvent(new Event('focus'))");
  await wait("smoke.qualification.calls.filter(call=>call.path.endsWith('/me')).length>smoke.qualification.focusReads");
  await wait("!document.querySelector('.qualification-heading button').disabled");
  assert.equal(await run(`${field}.value`), 'Unsaved qualification training fixture', 'Focus refresh preserves draft text');
  assert.equal(await run("document.querySelector('.qualification-detail').getAnimations({subtree:true}).length"), 0, 'Background refresh does not restart selection motion');
  if(setReducedMotion) await setReducedMotion(true);
  await run("smoke.click('Applications and oversight','[role=tab]')");
  await wait("document.querySelector('.qualification-list').textContent.includes('Rachelle Demo')");
  await run("smoke.click('My qualification','[role=tab]')");
  await wait(`Boolean(${field.replace(".querySelector('textarea')", "?.querySelector('textarea')")})`);
  assert.equal(await run(`${field}.value`), 'Unsaved qualification training fixture', 'Switching qualification tabs restores the draft');
  if(setReducedMotion) {
    assert.equal(await run("document.querySelector('.qualification-columns').getAnimations({subtree:true}).length"), 0, 'Reduced motion disables view/selection animations');
    await setReducedMotion(false);
  }
  await run("smoke.qualification.failMe=true; smoke.click('Refresh','.qualification-heading button')");
  await wait("document.querySelector('.qualification-feedback').textContent.includes('Synthetic refresh unavailable')");
  assert.equal(await run(`${field}.value`), 'Unsaved qualification training fixture', 'Failed refresh retains draft and visible content');
  await run("smoke.qualification.failMe=false; smoke.click('Retry','.qualification-feedback button')");
  await wait("!document.querySelector('.qualification-feedback').textContent.includes('Synthetic refresh unavailable')");
  await run("smoke.qualification.failSave=true; smoke.click('Save draft','.qualification-detail button')");
  await wait("document.querySelector('.qualification-feedback').textContent.includes('Synthetic save failure')");
  assert.equal(await run(`${field}.value`), 'Unsaved qualification training fixture', 'Save failure retains local text');
  await run("smoke.qualification.failSave=false; smoke.click('Save draft','.qualification-detail button')");
  await wait("document.querySelector('.qualification-feedback').textContent.includes('Draft saved')");
  assert.equal(await run('smoke.qualification.ownRows[0].form.trainingHistory'), 'Unsaved qualification training fixture');
  await run(`smoke.fill(${field}, 'Local text retained after a revision conflict'); smoke.qualification.ownRows[0].revision++; smoke.click('Refresh','.qualification-heading button')`);
  await wait("document.querySelector('.qualification-detail').textContent.includes('This record has changed')");
  assert.equal(await run(`${field}.value`), 'Local text retained after a revision conflict');
  await run("smoke.click('Save draft','.qualification-detail button')");
  await wait("document.querySelector('.qualification-feedback').textContent.includes('Revision conflict')");
  await wait("!document.querySelector('.qualification-detail-actions button').disabled");
  assert.equal(await run(`${field}.value`), 'Local text retained after a revision conflict');
  await run("smoke.click('Reload latest version','.qualification-detail button')");
  await wait("document.querySelector('dialog[open]')");
  await run("smoke.click('Reload latest version','.dialog-footer button')");
  await wait("!document.querySelector('dialog[open]')");
  assert.equal(await run(`${field}.value`), 'Unsaved qualification training fixture', 'Discarding a conflict requires explicit confirmation');
  await run("smoke.qualification.holdDetail=100; smoke.click('Initial application #100','.qualification-list button')");
  await wait('typeof smoke.qualification.releaseDetail === "function"');
  await run("smoke.click('Initial application #103','.qualification-list button'); smoke.qualification.releaseDetail()");
  await wait(`Boolean(${field.replace(".querySelector('textarea')", "?.querySelector('textarea')")})`);
  assert.equal(await run("document.querySelector('.qualification-detail-heading').textContent.includes('#103')"), true, 'Late detail responses cannot replace a newer selection');
  await run("smoke.click('Applications and oversight','[role=tab]')");
  await wait("document.querySelector('.qualification-list').textContent.includes('Rachelle Demo')");
  await run("smoke.qualification.beforeCached=smoke.qualification.calls.length; smoke.click('Daniella Demo','.qualification-list button')");
  await wait("document.querySelector('.qualification-detail-heading').textContent.includes('#101')");
  await run("smoke.click('Rachelle Demo','.qualification-list button')");
  await wait("document.querySelector('.qualification-detail-heading').textContent.includes('#102')");
  await run("smoke.click('Daniella Demo','.qualification-list button')");
  await wait("document.querySelector('.qualification-detail-heading').textContent.includes('#101')");
  assert.ok(await run('smoke.qualification.calls.length-smoke.qualification.beforeCached<=2'), 'Recent application reads use the bounded cache');
  await run("smoke.qualification.paneBeforeManagement=document.querySelector('.qualification-columns').getBoundingClientRect().toJSON(); smoke.click('Nominations and reviewers','.qualification-navigation button')");
  await wait("document.querySelector('dialog[open] .qualification-management')");
  assert.deepEqual(await run("document.querySelector('.qualification-columns').getBoundingClientRect().toJSON()"), await run('smoke.qualification.paneBeforeManagement'), 'Management tools do not resize the application workspace');
  await screenshot('qualifications-management');
  await run("smoke.click('Done','.dialog-footer button')");
  await wait("!document.querySelector('dialog[open]')");
  for (const role of ['DOCTOR', 'DENTIST', 'NURSE', 'ADMIN', 'EMERGENCY_RESPONDER']) {
    await resize(1366, 768);
    await run(`smoke.qualification.actor={userId:1,admin:${role === 'ADMIN'},reviewer:${['DOCTOR','NURSE'].includes(role)}}; smoke.role('${role}')`);
    await wait(`document.querySelector('.tb-role-select').value==='${role}'`);
    await run("document.querySelector('.sb-item').click()");
    await wait("!document.querySelector('.qualification-workspace')");
    const before = await run("(()=>{const button=Array.from(document.querySelectorAll('.sb-item')).find(row=>row.textContent.includes('Responder qualifications'));return {height:button.getBoundingClientRect().height,label:button.querySelector('.sb-qualification-label').getBoundingClientRect().height};})()");
    await run("smoke.click('Responder qualifications','.sb-item')");
    await wait("document.querySelector('.qualification-detail textarea')");
    const after = await run("(()=>{const button=document.querySelector('.sb-item.is-active');return {height:button.getBoundingClientRect().height,label:button.querySelector('.sb-qualification-label').getBoundingClientRect().height};})()");
    assert.deepEqual(after, before, role + ' qualification label keeps its dimensions when selected');
    for (const [width, height] of [[1917, 1020], [1366, 768], [1024, 700], [620, 900]]) {
      await resize(width, height); await delay(300);
      const result = await run(`(()=>{
        const workspace=document.querySelector('.qualification-workspace'), body=workspace.querySelector('.qualification-detail-body');
        const footer=workspace.querySelector('.qualification-detail-actions');
        const heading=workspace.querySelector('.qualification-heading').getBoundingClientRect();
        const bounded=${width>=1024 && height>=700};
        const main=document.querySelector('.app-main'); main.scrollTop=0; body.scrollTop=body.scrollHeight;
        return {pageFits:document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1,
          headingVisible:heading.top>=document.querySelector('.tb').getBoundingClientRect().bottom-1,
          actionsVisible:!bounded || (footer.getBoundingClientRect().bottom<=innerHeight && footer.getBoundingClientRect().top>=heading.bottom),
          independent:!bounded || (main.scrollHeight<=main.clientHeight+1 && body.clientHeight>120)};
      })()`);
      assert.ok(Object.values(result).every(Boolean), role+' qualifications fit '+width+'x'+height+': '+JSON.stringify(result));
      if(role==='DOCTOR' && width>=1024){
        await run("document.querySelector('.qualification-detail-body').scrollTop=0");
        await screenshot('qualifications-own-'+width+'-'+height);
      }
    }
  }
  await resize(1366, 768);
  await run("smoke.qualification.denyMe=true; smoke.click('Refresh','.qualification-heading button')");
  await wait("document.querySelector('.qualification-feedback').textContent.includes('Qualification access removed') && !document.querySelector('.qualification-detail-heading')");
  await run("smoke.qualification.denyMe=false; smoke.click('Retry','.qualification-feedback button')");
  await wait("document.querySelector('.qualification-detail textarea')");
  console.log('Qualification stability passed: sidebar wrapping, preserved drafts, stable refresh/failure/retry, shared reads, stale responses, caching and five role layouts.');
}
