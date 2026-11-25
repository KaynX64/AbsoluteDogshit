import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifyDocumentationSpacing(run) {
  const spacing = await run(`Array.from(document.querySelectorAll('.rh-documentation')).map(stack => {
    const items = Array.from(stack.children).map(element => element.getBoundingClientRect());
    return items.slice(1).map((rect, index) => ({ gap: rect.top - items[index].bottom, left: rect.left - items[0].left }));
  }).flat()`);
  assert.ok(spacing.length > 0);
  assert.ok(spacing.every(({ gap, left }) => Math.abs(gap - 8) <= 1 && Math.abs(left) <= 1),
    'Documentation states have consistent 8px spacing and left alignment: ' + JSON.stringify(spacing));
}

export async function verifyReportLayout(run, wait, resize, screenshot) {
  const original = await run('({ width: innerWidth, height: innerHeight, mode: document.documentElement.dataset.themeMode, preset: document.documentElement.dataset.themePreset })');
  await wait("document.querySelector('.sb-item.is-active .sb-badge')");
  // Use actual appearance controls so all six combinations exercise live tokens.
  for (const mode of ['light', 'dark']) {
    for (const [preset, label] of [['brand', 'LeoVital'], ['blossom', 'Blossom'], ['sunrise', 'Sunrise']]) {
      await run("smoke.click('Settings', '.sb-link')");
      await wait("document.querySelector('.settings-pop')");
      await run(`smoke.click('${mode}', '.settings-seg-btn'); smoke.click('${label}', '.settings-preset')`);
      await wait(`document.documentElement.dataset.themeMode === '${mode}' && document.documentElement.dataset.themePreset === '${preset}'`);
      await run("document.querySelector('[aria-label=\"Close settings\"]').click()");
      const badges = await run(`(() => {
        const badge = document.querySelector('.sb-item.is-active .sb-badge');
        const luminance = color => {
          const channels = color.match(/[\\d.]+/g).slice(0, 3).map(Number).map(value => {
            const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
          });
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const results = [];
        for (const active of [true, false]) {
          badge.parentElement.classList.toggle('is-active', active);
          for (const text of ['1', '11', '99+']) {
            badge.textContent = text;
            const style = getComputedStyle(badge), bounds = badge.getBoundingClientRect();
            const a = luminance(style.color), b = luminance(style.backgroundColor);
            results.push({ contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), fits: badge.scrollWidth <= badge.clientWidth && bounds.width > 0 });
          }
        }
        badge.textContent = '1'; badge.parentElement.classList.add('is-active');
        return results;
      })()`);
      assert.ok(badges.every(result => result.contrast >= 4.5 && result.fits), preset + ' ' + mode + ' sidebar count contrast: ' + JSON.stringify(badges));
      await screenshot?.('report-badges-' + preset + '-' + mode);
    }
  }
  await run("smoke.click('Settings', '.sb-link')");
  await wait("document.querySelector('.settings-pop')");
  await run(`smoke.click('${original.mode}', '.settings-seg-btn'); smoke.click('${{ brand: 'LeoVital', blossom: 'Blossom', sunrise: 'Sunrise' }[original.preset]}', '.settings-preset'); document.querySelector('[aria-label="Close settings"]').click()`);
  await run('smoke.historyState.manyRows = true; window.dispatchEvent(new Event("focus"))');
  await wait("document.querySelectorAll('.rh-table tbody tr').length === 25 && document.querySelector('#responder-record-panel').getAttribute('aria-busy') === 'false'");
  await run(`(() => { document.documentElement.dataset.titlebar = 'overlay';
    const title = document.createElement('header'); title.className = 'app-titlebar'; title.id = 'report-layout-title';
    document.querySelector('#root').prepend(title); })()`);
  for (const role of ['DOCTOR', 'DENTIST', 'NURSE', 'EMERGENCY_RESPONDER']) {
    await run(`smoke.role('${role}')`);
    await wait(`document.querySelector('.tb-role-select').value === '${role}'`);
    await run("document.querySelector('.sb-item').click()");
    await wait("!document.querySelector('.rh-workspace')");
    for (const view of ['Incident reports', 'Alert history']) {
      console.log('Checking ' + role + ' ' + view + ' scrolling');
      await run(`smoke.click('${view}', '.sb-item')`);
      await wait("document.querySelectorAll('.rh-table tbody tr').length === 25");
      const sizes = role === 'DOCTOR' ? [[1920, 1080], [1917, 1020], [1366, 768], [1280, 720], [1024, 700], [900, 650]] : [[1024, 700], [900, 650]];
      for (const [width, height] of sizes) {
        await resize(width, height);
        await delay(300);
        const bounded = width >= 1024 && height >= 700;
        const geometry = await run(`(() => {
          const table = document.querySelector('.rh-table-wrap'), main = document.querySelector('.app-main');
          const scroller = ${bounded} ? table : main;
          scroller.scrollTop = 0;
          const headingTop = document.querySelector('.rh-heading').getBoundingClientRect().top;
          scroller.scrollTop = scroller.scrollHeight;
          const last = document.querySelector('.rh-table tbody tr:last-child').getBoundingClientRect();
          const load = Array.from(document.querySelectorAll('#responder-record-panel button')).find(button => button.textContent.includes('Load more'))?.getBoundingClientRect();
          const bounds = scroller.getBoundingClientRect();
          return { scrolls: scroller.scrollTop > 0, lastReachable: last.bottom <= Math.min(bounds.bottom, innerHeight) + 1,
            contentShare: table.clientHeight / document.querySelector('.app-content').clientHeight,
            footerVisible: load && load.bottom <= innerHeight && load.top >= 0,
            headingFixed: Math.abs(document.querySelector('.rh-heading').getBoundingClientRect().top - headingTop) < 1,
            workspaceFits: document.querySelector('.app-content').scrollHeight <= document.querySelector('.app-content').clientHeight + 1,
            horizontalReachable: (() => { table.scrollLeft = table.scrollWidth; return table.scrollWidth <= table.clientWidth || table.scrollLeft > 0; })(),
            pageFits: document.documentElement.scrollHeight <= innerHeight + 1 };
        })()`);
        assert.ok(geometry.scrolls && geometry.lastReachable && geometry.footerVisible && geometry.horizontalReachable && geometry.pageFits,
          role + ' ' + view + ' ' + width + 'x' + height + ': ' + JSON.stringify(geometry));
        if (bounded) {
          assert.ok(geometry.headingFixed && geometry.workspaceFits, 'Records scroll independently of headings');
          assert.ok(geometry.contentShare >= (height >= 900 ? .65 : .4), 'Records receive the available space: ' + JSON.stringify(geometry));
        }
        await verifyDocumentationSpacing(run);
        if (role === 'DOCTOR') {
          console.log(view + ' ' + width + 'x' + height + ' table uses ' + Math.round(geometry.contentShare * 100) + '% of workspace height');
          await run("document.querySelector('.rh-table-wrap').scrollTop = 0; document.querySelector('.app-main').scrollTop = 0");
          await screenshot?.('reports-' + (view === 'Alert history' ? 'history-' : '') + width + '-' + height);
        }
      }
      await resize(1366, 768);
      console.log('Verified ' + role + ' ' + view + ' scrolling');
    }
    if (role !== 'EMERGENCY_RESPONDER') {
      await run("document.querySelector('.sb-item').click()");
      await wait("!document.querySelector('.rh-workspace')");
    }
  }
  await run("smoke.click('Load more records', '#responder-record-panel button')");
  await wait("document.querySelectorAll('.rh-table tbody tr').length === 26");
  assert.equal(await run("document.querySelector('.rh-table tbody tr:last-child').textContent.includes('SOS-116')"), true);
  await run("document.querySelector('.sb-item').click()");
  await wait("!document.querySelector('.rh-workspace')");
  await run("smoke.role('DOCTOR')");
  await wait("document.querySelector('.tb-role-select').value === 'DOCTOR'");
  await run("document.querySelector('.sb-item').click()");
  await wait("!document.querySelector('.rh-workspace')");
  await run('smoke.historyState.manyRows = false');
  await run("smoke.click('Incident reports', '.sb-item')");
  await wait("document.querySelectorAll('.rh-table tbody tr').length === 1");
  await run("document.querySelector('#report-layout-title').remove(); delete document.documentElement.dataset.titlebar");
  await resize(original.width, original.height);
  console.log('Report layout checks passed: six theme combinations, count contrast, four staff roles, both record views, desktop and flowing scrolling, pagination and status spacing.');
}
