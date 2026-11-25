import assert from 'node:assert/strict';

export async function verifyRoundedSelects(run, wait, send, screenshot) {
  assert.equal(await run("CSS.supports('appearance', 'base-select')"), true, 'Bundled Electron supports customizable native selects');
  await wait("document.querySelector('[aria-label=\"Filter accounts by role\"]')");
  const menu = '[aria-label="Filter accounts by role"]';
  const key = async (key, code, windowsVirtualKeyCode) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
  };
  const open = async selector => {
    const result = await send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)}).showPicker()`, userGesture: true,
    });
    assert.equal(result.exceptionDetails, undefined, 'Native picker opens');
    await wait(`document.querySelector(${JSON.stringify(selector)}).matches(':open')`);
  };
  const checkStyles = async () => {
    const styles = await run(`Array.from(document.querySelectorAll('select:not([multiple]):not([size])'))
      .filter(select => select.getClientRects().length).map(select => {
        const menu = getComputedStyle(select, '::picker(select)');
        return { appearance: getComputedStyle(select).appearance, radius: parseFloat(menu.borderTopLeftRadius),
          fill: menu.backgroundColor, optionRadius: parseFloat(getComputedStyle(select.options[0]).borderTopLeftRadius) };
      })`);
    assert.ok(styles.length >= 4 && styles.every(style => style.appearance === 'base-select' && style.radius >= 12 &&
      style.optionRadius >= 9 && style.fill !== 'rgba(0, 0, 0, 0)'), 'Visible dropdowns use rounded, opaque themed menus: ' + JSON.stringify(styles));
  };
  await checkStyles();
  await open(menu);
  await screenshot('rounded-account-role-menu');
  await key('ArrowDown', 'ArrowDown', 40);
  await key('Enter', 'Enter', 13);
  await wait(`document.querySelector('${menu}').value === 'DOCTOR'`);
  await wait("Array.from(document.querySelectorAll('.admin-account-roles > span:first-child')).every(element => element.textContent === 'DOCTOR')");
  await open(menu);
  await key('Escape', 'Escape', 27);
  assert.equal(await run(`document.querySelector('${menu}').value`), 'DOCTOR', 'Escape preserves the selection');
  assert.equal(await run(`document.activeElement === document.querySelector('${menu}')`), true, 'Focus returns to the dropdown');
  await run(`smoke.fill(document.querySelector('${menu}'), 'ALL')`);
  await open('.tb-role-select');
  await screenshot('rounded-role-switcher-menu');
  await key('Escape', 'Escape', 27);
  const previousPreset = await run('document.documentElement.dataset.themePreset');
  await run("smoke.click('Settings','.sb-link')");
  await wait("document.querySelector('.settings-pop')");
  await run("smoke.click('Blossom','.settings-preset'); document.querySelector('[aria-label=\"Close settings\"]').click()");
  await run("smoke.click('Add account', '.admin-account-counts button')");
  await wait("document.querySelector('dialog[open] select')");
  await open('dialog[open] select');
  await screenshot('rounded-dialog-menu');
  await key('Escape', 'Escape', 27);
  assert.equal(await run("Boolean(document.querySelector('dialog[open]'))"), true, 'Escape closes only the dropdown before the dialog');
  await run("smoke.fill(document.querySelector('dialog[open] select'), 'ADMIN')");
  await wait("document.querySelector('.admin-permissions-section')");
  await run("smoke.click('Limited Admin', '.admin-permissions-section button'); document.querySelector('.admin-permissions-section').scrollIntoView({ block: 'start' })");
  await wait("document.querySelector('.admin-permission-card')");
  const originalSize = await run('({width:innerWidth,height:innerHeight})');
  for (const [width,height] of [[1366,768],[1024,720],[620,900],[800,520]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const layout = await run(`(()=>{
      const dialog=document.querySelector('.admin-create-user-dialog'),card=dialog.querySelector('.admin-create-user-card');
      const header=dialog.querySelector('.dialog-header'),body=dialog.querySelector('.admin-create-user__body'),footer=dialog.querySelector('.admin-create-user__footer');
      const original=footer.getBoundingClientRect();
      const staysFixed=[0,body.scrollHeight/2,body.scrollHeight].every(top=>{
        body.scrollTop=top;const bounds=footer.getBoundingClientRect();
        return Math.abs(bounds.top-original.top)<1 && Math.abs(bounds.bottom-original.bottom)<1;
      });
      const bottom=footer.getBoundingClientRect(),fields=body.getBoundingClientRect(),title=header.getBoundingClientRect();
      const last=body.querySelector('.admin-permission-card:last-child').getBoundingClientRect();
      return {staysFixed,bodyScrolls:body.scrollTop>0,fieldsSeparate:fields.bottom<=bottom.top+1 && fields.top>=title.bottom-1,
        footerAtBottom:Math.abs(bottom.bottom-card.getBoundingClientRect().bottom)<=2,
        footerVisible:bottom.bottom<=innerHeight && bottom.top>=0,
        lastCardReachable:last.bottom<=fields.bottom+1,
        noOuterScroll:dialog.scrollHeight<=dialog.clientHeight+1 && card.scrollHeight<=card.clientHeight+1};
    })()`);
    assert.ok(Object.values(layout).every(Boolean),'Add account keeps its footer below the form at '+width+'x'+height+': '+JSON.stringify(layout));
  }
  await screenshot('create-admin-footer-bottom');
  await send('Emulation.setDeviceMetricsOverride',{...originalSize,deviceScaleFactor:1,mobile:false});
  await run("document.querySelector('.admin-permissions-section').scrollIntoView({block:'start'})");
  await screenshot('create-admin-permissions');
  await run("document.querySelector('.admin-permission-card input[type=checkbox]').click()");
  await screenshot('create-admin-permissions-selected');
  await run("smoke.click('Super Admin', '.admin-permissions-section button')");
  await screenshot('create-admin-super');
  await key('Escape', 'Escape', 27);
  await wait("!document.querySelector('dialog[open]')");
  await run("Array.from(document.querySelectorAll('.admin-accounts-table tbody tr')).find(row=>row.querySelector('.admin-account-roles')?.textContent.includes('ADMIN')).querySelector('button').click()");
  await wait("document.querySelector('dialog[open] .admin-permissions-section')");
  await run("smoke.click('Limited Admin', '.admin-permissions-section button'); document.querySelector('.admin-permissions-section').scrollIntoView({ block: 'start' })");
  await wait("document.querySelector('.admin-permission-card')");
  await screenshot('edit-admin-permissions');
  await key('Escape', 'Escape', 27);
  await wait("!document.querySelector('dialog[open]')");
  await run("smoke.click('Settings','.sb-link')");
  await wait("document.querySelector('.settings-pop')");
  await run(`smoke.click('${{brand:'LeoVital',blossom:'Blossom',sunrise:'Sunrise'}[previousPreset]}','.settings-preset'); document.querySelector('[aria-label="Close settings"]').click()`);
  console.log('Rounded native select checks passed: global styling, open menus, keyboard selection, Escape, focus, role switcher and modal layering.');
}
