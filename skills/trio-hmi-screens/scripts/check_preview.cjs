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
  console.error('Playwright is not installed. Install it in this repo, then re-run:\n' +
    '  npm i -D playwright && npx playwright install chromium\n' +
    '(Linux without browser system libraries: npx playwright install --with-deps chromium)');
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
  page.setDefaultTimeout(4000);
  const press = async (fn, where) => {
    try { await fn(); return true; } catch (e) {
      results.problems.push(`${where}: could not be pressed (${String(e.message).split('\n').find(l => /intercepts|not visible|Timeout/.test(l)) || e.message.split('\n')[0]})`.replace(/\x1b\[\d+m/g, ''));
      return false;
    }
  };
  const jsErrors = [];
  const results = { pages: {}, problems: [] };
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') jsErrors.push(m.text()); });
  await page.goto('file://' + file);
  await page.waitForFunction(() => window.hmi && window.hmi.app.currentPage);

  const pageNames = await page.evaluate(() => Object.keys(window.hmi.app.pages));

  const snapshot = () => page.evaluate(() => ({
    vr: Object.assign({}, window.hmi.vrStore._vr,
      ...Object.entries(window.hmi.vrStore._programs).map(([k, v]) => ({ ['PROGRAM:' + k]: v }))),
    page: window.hmi.app.currentPage.pageName
  }));
  const diff = (a, b) => {
    const keys = new Set([...Object.keys(a.vr), ...Object.keys(b.vr)]);
    const out = [];
    keys.forEach(k => {
      if ((a.vr[k] || 0) !== (b.vr[k] || 0)) out.push(`${/^\d+$/.test(k) ? 'VR(' + k + ')' : k}: ${a.vr[k] || 0} -> ${b.vr[k] || 0}`);
    });
    return out;
  };

  for (const name of pageNames) {
    const r = { buttons: [], inputs: [] };
    results.pages[name] = r;
    const goto = async () => {
      await page.evaluate(n => { window.hmi.app.hideKeypad(); window.hmi.app.simEnabled = false; window.hmi.app.applyInit(); window.hmi.app.navigateToPage(n); }, name);
    };
    await goto();
    await page.waitForTimeout(150);
    if (shots) await page.screenshot({ path: path.join(shots, name + '.png') });

    const comps = await page.evaluate(() => [...document.querySelectorAll('#hmi-canvas .hmi-component')]
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        name: el.dataset.compName, type: el.dataset.compType,
        events: (el._comp.events || []).map(e => e.name),
        actions: [].concat(...(el._comp.events || []).map(e => e.actions)),
        rw: !!(el._comp.properties.Text && el._comp.properties.Text.binding && el._comp.properties.Text.binding.mode === 'ReadWrite'),
        writable: (() => {
          const b = el._comp.properties.Text && el._comp.properties.Text.binding;
          const ev = b ? parseBinding(b.mcsource) : null;
          return !!(ev && ev.write);
        })(),
        min: getProp(el._comp, 'MinVal', null),
        max: getProp(el._comp, 'MaxVal', null),
        integer: getProp(el._comp, 'FormatType', '') === 'FORMAT_INTEGER'
      })));

    for (const c of comps.filter(c => c.type === 'TVBButton')) {
      await goto();
      const sel = `#hmi-canvas [data-comp-name="${c.name}"]`;
      const before = await snapshot();
      let during = null;
      if (c.events.includes('ButtonDown')) {
        if (!await press(() => page.hover(sel), `${name}/${c.name}`)) continue;
        await page.mouse.down();
        await page.waitForTimeout(80);
        during = await snapshot();
        await page.mouse.up();
      } else if (!await press(() => page.click(sel), `${name}/${c.name}`)) {
        continue;
      }
      await page.waitForTimeout(80);
      const after = await snapshot();
      const changes = during ? diff(before, during).map(s => 'while held: ' + s).concat(diff(during, after).map(s => 'on release: ' + s)) : diff(before, after);
      const nav = after.page !== before.page ? after.page : null;
      r.buttons.push({ name: c.name, events: c.events, changes, navigatesTo: nav });
      // Actions the preview can't execute (OP(), LOOKUP(), other BASIC) are reported by the validator
      const simulated = c.actions.some(a => /^(GotoPage|OpenKeyPad|VS);/.test(a) || /^Exec;\s*VR\(\d+\)(\.\d+)?\s*=/.test(a));
      if (!changes.length && !nav && c.events.length) {
        if (!simulated) {
          r.buttons[r.buttons.length - 1].note = 'actions not simulated: ' + c.actions.join(' | ');
        } else {
          r.buttons[r.buttons.length - 1].note = 'no visible effect';
          results.problems.push(`${name}/${c.name}: pressing it changed nothing (actions: ${c.actions.join(' | ')})`);
        }
      }
    }

    for (const c of comps.filter(c => c.type === 'TVBTextBox' && c.rw)) {
      if (!c.writable) { r.inputs.push({ name: c.name, ok: null, note: 'bound to an expression; preview cannot write it' }); continue; }
      // pick a test value inside MinVal..MaxVal
      let val = 42;
      if ((c.min !== null && val < c.min) || (c.max !== null && val > c.max)) {
        const lo = c.min !== null ? c.min : c.max - 10, hi = c.max !== null ? c.max : c.min + 10;
        val = c.integer || Number.isInteger(lo) && Number.isInteger(hi) ? Math.round((lo + hi) / 2) : +(((lo + hi) / 2).toFixed(1));
      }
      await goto();
      const sel = `#hmi-canvas [data-comp-name="${c.name}"]`;
      const before = await snapshot();
      if (!await press(() => page.click(sel), `${name}/${c.name}`)) continue;
      const open = await page.isVisible('#keypad-overlay.visible');
      if (!open) { results.problems.push(`${name}/${c.name}: keypad did not open`); r.inputs.push({ name: c.name, ok: false }); continue; }
      await page.click('.kp-btn[data-key="clear"]');
      for (const k of String(Math.abs(val))) await page.click(`.kp-btn[data-key="${k}"]`);
      if (val < 0) await page.click('.kp-btn[data-key="sign"]');
      await page.click('.kp-btn[data-key="enter"]');
      await page.waitForTimeout(50);
      const after = await snapshot();
      const text = await page.textContent(sel);
      const changes = diff(before, after);
      const before_v = before.vr;
      const ok = (changes.length > 0 || Object.values(before_v).includes(val)) && text.includes(String(Math.trunc(val)));
      r.inputs.push({ name: c.name, changes, displayed: text.trim(), ok });
      const kp = c.actions.map(a => a.match(/^OpenKeyPad;[^;]*;(.+)$/)).find(Boolean);
      if (!ok && kp && kp[1] !== c.name) {
        results.problems.push(`${name}/${c.name}: tapping it opens the keypad for ${kp[1]}, so the entry went to that box's binding instead`);
      } else if (!ok) {
        results.problems.push(`${name}/${c.name}: entering ${val} did not update the VR and display (shows "${text.trim()}")`);
      }
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
