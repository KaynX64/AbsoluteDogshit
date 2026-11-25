import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifyAccountLayout(run, wait, resize, screenshot, checkScroll) {
  await wait("document.querySelector('[aria-label=\"Active account records\"] tbody tr')");
  for (const [view, region, controls] of [
    ['Active accounts', 'Active account records', '.admin-account-toolbar, .admin-user-filterbar, .admin-account-help summary'],
    ['Archived accounts', 'Archived account records', '[aria-label="Search archived accounts"]'],
  ]) {
    await run(`smoke.click('${view}', '[role=tab]')`);
    await wait(`document.querySelector('[aria-label="${region}"] tbody tr')`);
    for (const [width, height] of [[1917, 1020], [1366, 768], [1024, 700]]) {
      await resize(width, height);
      await delay(300);
      await checkScroll(region, controls);
      const geometry = await run(`(() => {
        const pane = document.querySelector('[aria-label="${region}"]');
        pane.scrollTop = 0; pane.scrollLeft = 0;
        const fraction = pane.clientHeight / document.querySelector('#desktop-workspace').clientHeight;
        pane.scrollLeft = pane.scrollWidth;
        const lastCell = pane.querySelector('tbody tr td:last-child').getBoundingClientRect();
        const reachable = lastCell.right <= pane.getBoundingClientRect().right + 1;
        pane.scrollLeft = 0;
        return { fraction, reachable, controlsFit: Array.from(document.querySelectorAll('.admin-user-filterbar input, .admin-user-filterbar select, .admin-user-filterbar button')).every(element => {
          const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth;
        }) };
      })()`);
      assert.ok(geometry.fraction >= (height >= 900 ? .65 : .4) && geometry.reachable && geometry.controlsFit,
        view + ' uses available space without cramping columns: ' + JSON.stringify(geometry));
      console.log(view + ' ' + width + 'x' + height + ' table uses ' + Math.round(geometry.fraction * 100) + '% of workspace height');
      await screenshot('accounts-' + (view === 'Active accounts' ? 'active-' : 'archived-') + width + '-' + height);
    }
  }
  await run("smoke.click('Active accounts', '[role=tab]')");
  await wait("document.querySelector('[aria-label=\"Filter accounts by role\"]')");
  for (const role of ['DOCTOR', 'DENTIST', 'NURSE', 'STUDENT', 'FACULTY', 'NON_TEACHING', 'EMERGENCY_RESPONDER', 'ADMIN']) {
    await run(`smoke.fill(document.querySelector('[aria-label="Filter accounts by role"]'), '${role}')`);
    await wait(`document.querySelector('.admin-accounts-table tbody tr') && Array.from(document.querySelectorAll('.admin-account-roles > span:first-child')).every(element => element.textContent === '${role}')`);
  }
  await run("smoke.fill(document.querySelector('[aria-label=\"Filter accounts by role\"]'), 'ALL'); smoke.fill(document.querySelector('[aria-label=\"Filter accounts by status\"]'), 'Suspended')");
  await wait("document.querySelector('.admin-accounts-table tbody tr') && Array.from(document.querySelectorAll('.admin-accounts-table tbody td:nth-child(5)')).every(element => element.textContent.includes('Suspended'))");
  await run("smoke.fill(document.querySelector('[aria-label=\"Filter accounts by status\"]'), 'ALL'); document.querySelector('.admin-qualified-filter').click()");
  await wait("document.querySelector('.admin-accounts-table tbody tr') && Array.from(document.querySelectorAll('.admin-account-roles')).every(element => element.textContent.includes('QUALIFIED RESPONDER'))");
  await run("document.querySelector('.admin-qualified-filter').click(); smoke.fill(document.querySelector('[aria-label=\"Sort accounts\"]'), 'id_desc')");
  await wait("document.querySelector('.admin-accounts-table tbody tr td').textContent.trim() === '30'");
  await run("smoke.fill(document.querySelector('[aria-label=\"Search active accounts\"]'), 'Fixture user 21')");
  await wait("document.querySelectorAll('.admin-accounts-table tbody tr').length === 1 && document.querySelector('.admin-accounts-table tbody tr td').textContent.trim() === '21'");
  await run("smoke.fill(document.querySelector('[aria-label=\"Search active accounts\"]'), ''); smoke.fill(document.querySelector('[aria-label=\"Sort accounts\"]'), 'id_asc'); document.querySelector('.admin-account-help summary').click()");
  await wait("document.querySelector('.admin-account-help[open]')");
  await checkScroll('Active account records', '.admin-account-help');
  await run("document.querySelector('.admin-account-help summary').click()");
  await resize(800, 600);
  await delay(300);
  assert.equal(await run(`(() => { const main = document.querySelector('.app-main'); main.scrollTop = main.scrollHeight;
    return getComputedStyle(main).overflowY === 'auto' && main.scrollTop > 0 && document.querySelector('.admin-account-help').getBoundingClientRect().bottom <= innerHeight + 1; })()`), true,
    'Small account windows retain the flowing layout and reachable help');
  await resize(1024, 720);
  await run("document.querySelector('.app-main').scrollTop = 0");
  console.log('Account layout checks passed: compact headings, filters, both lists, role/status/responder filtering, sorting, search, help and narrow fallback.');
}
