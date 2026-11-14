#!/usr/bin/env node
/*
 * check_preview.cjs — exercise a generated preview.html in headless Chromium.
 *
 *   node check_preview.cjs path/to/preview.html [--shots DIR]
 *
 * For every page it:
 *   - screenshots the page (DIR/<PAGE>.png)
 *   - presses every button (hold for ButtonDown/ButtonUp) with the simulated
 *     controller paused, and records which VRs it wrote or which page it opened
 *   - opens every editable text box, types a value on the keypad, presses OK
 *     and checks the bound VR and the displayed text both changed
 * Then it reports JS errors, dead buttons and broken inputs, and exits 1 if any.
 *
 * Needs Playwright (`require('playwright')`). If it is not installed, run
 * `npm i -D playwright && npx playwright install chromium` or skip this check.
 */
const path = require('path');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('playwright is not available: ' + e.message);
  process.exit(2);
}

const args = process.argv.slice(2);
if (!args[0]) { console.error('usage: node check_preview.cjs preview.html [--shots DIR]'); process.exit(2); }
const file = path.resolve(args[0]);
const shotsIdx = args.indexOf('--shots');
const shots = shotsIdx >= 0 ? path.resolve(args[shotsIdx + 1]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') jsErrors.push(m.text()); });
  await page.goto('file://' + file);
  await page.waitForFunction(() => window.hmi && window.hmi.app.currentPage);

  const pageNames = await page.evaluate(() => Object.keys(window.hmi.app.pages));
  const results = { pages: {}, problems: [] };

  const snapshot = () => page.evaluate(() => ({
    vr: Object.assign({}, window.hmi.vrStore._vr),
    page: window.hmi.app.currentPage.pageName
  }));
  const diff = (a, b) => {
    const keys = new Set([...Object.keys(a.vr), ...Object.keys(b.vr)]);
    const out = [];
    keys.forEach(k => { if ((a.vr[k] || 0) !== (b.vr[k] || 0)) out.push(`VR(${k}): ${a.vr[k] || 0} -> ${b.vr[k] || 0}`); });
    return out;
  };

  for (const name of pageNames) {
    const r = { buttons: [], inputs: [] };
    results.pages[name] = r;
    const goto = async () => {
      await page.evaluate(n => { window.hmi.app.simEnabled = false; window.hmi.app.applyInit(); window.hmi.app.navigateToPage(n); }, name);
    };
    await goto();
    await page.waitForTimeout(150);
    if (shots) await page.screenshot({ path: path.join(shots, name + '.png') });

    const comps = await page.evaluate(() => [...document.querySelectorAll('#hmi-canvas .hmi-component')]
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        name: el.dataset.compName, type: el.dataset.compType,
        events: (el._comp.events || []).map(e => e.name),
        rw: !!(el._comp.properties.Text && el._comp.properties.Text.binding && el._comp.properties.Text.binding.mode === 'ReadWrite')
      })));

    for (const c of comps.filter(c => c.type === 'TVBButton')) {
      await goto();
      const sel = `#hmi-canvas [data-comp-name="${c.name}"]`;
      const before = await snapshot();
      let during = null;
      if (c.events.includes('ButtonDown')) {
        await page.hover(sel);
        await page.mouse.down();
        await page.waitForTimeout(80);
        during = await snapshot();
        await page.mouse.up();
      } else {
        await page.click(sel);
      }
      await page.waitForTimeout(80);
      const after = await snapshot();
      const changes = during ? diff(before, during).map(s => 'while held: ' + s).concat(diff(during, after).map(s => 'on release: ' + s)) : diff(before, after);
      const nav = after.page !== before.page ? after.page : null;
      r.buttons.push({ name: c.name, events: c.events, changes, navigatesTo: nav });
      if (!changes.length && !nav && c.events.length) {
        // Navigation buttons for the current page are intentionally inert
        r.buttons[r.buttons.length - 1].note = 'no visible effect';
        results.problems.push(`${name}/${c.name}: pressing it changed nothing (events: ${c.events.join(', ')})`);
      }
    }

    for (const c of comps.filter(c => c.type === 'TVBTextBox' && c.rw)) {
      await goto();
      const sel = `#hmi-canvas [data-comp-name="${c.name}"]`;
      const before = await snapshot();
      await page.click(sel);
      const open = await page.isVisible('#keypad-overlay.visible');
      if (!open) { results.problems.push(`${name}/${c.name}: keypad did not open`); r.inputs.push({ name: c.name, ok: false }); continue; }
      await page.click('.kp-btn[data-key="clear"]');
      for (const k of ['4', '2']) await page.click(`.kp-btn[data-key="${k}"]`);
      await page.click('.kp-btn[data-key="enter"]');
      await page.waitForTimeout(50);
      const after = await snapshot();
      const text = await page.textContent(sel);
      const changes = diff(before, after);
      const ok = changes.length > 0 && /42/.test(text);
      r.inputs.push({ name: c.name, changes, displayed: text.trim(), ok });
      if (!ok) results.problems.push(`${name}/${c.name}: entering 42 did not update the VR and display (shows "${text.trim()}")`);
    }
  }

  results.jsErrors = jsErrors;
  jsErrors.forEach(e => results.problems.push('JS error: ' + e));
  console.log(JSON.stringify(results, null, 2));
  if (shots) console.error('Screenshots in ' + shots);
  console.error(results.problems.length ? `${results.problems.length} problem(s)` : 'All buttons and inputs respond.');
  await browser.close();
  process.exit(results.problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
