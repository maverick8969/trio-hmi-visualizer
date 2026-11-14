#!/usr/bin/env node
// ============================================================
// hmi-shot — render the real HMI screens driven by the simulator, headlessly
// ------------------------------------------------------------
// Serves the visualizer on an ephemeral local port, opens it in headless
// Chromium (Playwright), loads the .BAS programs + TGM/TGD screens, boots the
// controller, applies any --set / --run steps, then for every requested page
// writes a PNG and reports each HMI-bound VR (index, global name, value, and
// which component properties use it).
//
// Requires Playwright (`npm i -D playwright` or a global install). Run --help.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { ROOT, DEFAULT_BAS_DIR, DEFAULT_HMI_DIR, findFiles, loadProject } = require('./lib/sim-node.js');

const HELP = `hmi-shot — screenshot the live HMI driven by the Trio simulator

Usage: node tools/hmi-shot.js [options]

  --bas <dir>          .BAS programs (default samples/demo, a synthetic demo). Searched recursively.
  --hmi <dir>          Folder with the .TGM + .TGD screens + images (default samples/demo/hmi).
  --tgm <file.TGM>     Which TGM to load if the folder has several.
  --autorun <NAME>     Override autorun program.
  --pages <a,b|all>    Pages to capture (default: all pages in the TGM).
  --boot-ms <ms>       Boot time to fast-forward (default 18000).
  --set k=v[,k=v]      Write globals / VR:n before capture (repeatable, applied in order).
  --run <ms>           Advance sim time (repeatable, applied in order with --set).
  --out <dir>          Where to write PNGs + report.json (default ./hmi-shots).
  --scale <n>          Device scale factor for PNGs (default 1).
  --no-sim             Don't run the simulator: render screens with all VRs = 0.
  -h, --help

Example
  node tools/hmi-shot.js --bas ../line2 --hmi ../line2/hmi --set hmi_pumps_run=1 --run 4000 --pages OPERATOR_MAIN
`;

function die(m) { process.stderr.write(`hmi-shot: ${m}\n`); process.exit(2); }

function parseArgs(argv) {
  const o = { bas: null, hmi: null, tgm: null, autorun: null, pages: 'all', bootMs: 18000, steps: [], out: 'hmi-shots', scale: 1, sim: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    const need = () => { if (v === undefined) die(`${a} needs a value`); i++; return v; };
    switch (a) {
      case '-h': case '--help': process.stdout.write(HELP); process.exit(0); break;
      case '--bas': o.bas = need(); break;
      case '--hmi': o.hmi = need(); break;
      case '--tgm': o.tgm = need(); break;
      case '--autorun': o.autorun = need(); break;
      case '--pages': o.pages = need(); break;
      case '--boot-ms': o.bootMs = +need(); break;
      case '--set': {
        const set = {};
        for (const kv of need().split(',')) { const m = /^\s*([^=]+?)\s*=\s*(.+)$/.exec(kv); if (!m) die(`bad --set ${kv}`); set[m[1]] = Number(m[2]); }
        o.steps.push({ set }); break;
      }
      case '--run': o.steps.push({ run: +need() }); break;
      case '--out': o.out = need(); break;
      case '--scale': o.scale = +need(); break;
      case '--no-sim': o.sim = false; break;
      default: die(`unknown argument: ${a}`);
    }
  }
  return o;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.tgd': 'text/xml', '.tgm': 'text/xml', '.bas': 'text/plain' };

// Static server: visualizer at /, the BAS project at /_bas/ (flattened by basename,
// with a synthesized manifest.json), and the HMI folder at /_hmi/.
function startServer(project, hmiDir) {
  const basByName = {};
  for (const rel of project.files) basByName[path.basename(rel).toUpperCase()] = path.join(project.dir, rel);
  const manifest = JSON.stringify({
    autorun: project.autorun.name + '.BAS', autorunProc: project.autorun.proc,
    programs: Object.keys(basByName).map(n => path.basename(basByName[n])),
  });
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = null;
    if (url === '/_bas/manifest.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(manifest); }
    if (url.startsWith('/_bas/')) file = basByName[path.basename(url).toUpperCase()];
    else if (url.startsWith('/_hmi/')) file = path.join(hmiDir, url.slice(6));
    else file = path.join(ROOT, url === '/' ? 'index.html' : url);
    const base = url.startsWith('/_hmi/') ? hmiDir : ROOT;
    if (!file || (!url.startsWith('/_bas/') && !path.resolve(file).startsWith(path.resolve(base))) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { die('Playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`, or use tools/trio-sim.js for headless (no-screenshot) checks.'); }

  let project;
  try { project = loadProject(o.bas || DEFAULT_BAS_DIR, { autorun: o.autorun }); } catch (e) { die(e.message); }
  const hmiDir = path.resolve(o.hmi || DEFAULT_HMI_DIR);
  if (!fs.existsSync(hmiDir)) die(`HMI folder not found: ${hmiDir}`);
  const tgms = findFiles(hmiDir, /\.TGM$/i, 0).map(f => path.basename(f));
  const tgm = o.tgm ? path.basename(o.tgm) : tgms[0];
  if (!tgm) die(`no .TGM found in ${hmiDir} (use --tgm)`);
  fs.mkdirSync(o.out, { recursive: true });

  const server = await startServer(project, hmiDir);
  const port = server.address().port;
  const launchOpts = {};
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const browser = await chromium.launch(launchOpts);
  const report = { ok: true, project: { dir: project.dir, programs: project.files.length, autorun: project.autorun }, hmi: { dir: hmiDir, tgm }, pages: [], consoleErrors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: o.scale });
    page.on('pageerror', e => report.consoleErrors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    await page.waitForFunction(() => window.simController && typeof app !== 'undefined');

    const state = await page.evaluate(async ({ steps, bootMs, sim, tgm }) => {
      const s = window.simController;
      if (sim) {
        await s.loadSample('_bas/');
        s.boot();
        s.fastForward(bootMs);
        for (const st of steps) {
          if (st.set) for (const k in st.set) { const m = /^VR:(\d+)$/i.exec(k); if (m) s.machine.setVr(+m[1], st.set[k]); else if (!s.setG(k, st.set[k])) throw new Error('unknown global: ' + k); }
          if (st.run) s.fastForward(st.run);
        }
      }
      await s.loadHmiScreens('_hmi/', tgm);
      s.running = false;
      app._zoomLevel = 1; app.updateCanvasScale();
      return { simTimeMs: sim ? s.rt.simTime : 0, wdog: sim ? s.machine.getWdog() : null, systemStatus: sim ? s.machine.getVr(24) : null, pages: Object.keys(app.pages), parseErrors: s.parseErrors };
    }, { steps: o.steps, bootMs: o.bootMs, sim: o.sim, tgm });
    Object.assign(report, { simTimeMs: state.simTimeMs, wdog: state.wdog, systemStatus: state.systemStatus, availablePages: state.pages });
    if (Object.keys(state.parseErrors || {}).length) report.parseErrors = state.parseErrors;

    const want = o.pages === 'all' ? state.pages : o.pages.split(',').map(s => s.trim());
    for (const name of want) {
      if (!state.pages.includes(name)) { report.pages.push({ page: name, error: 'page not found' }); report.ok = false; continue; }
      const info = await page.evaluate((name) => {
        app.navigateToPage(name);
        const names = new Map();
        const s = window.simController;
        if (s && s.rt) for (const [n, i] of s.rt.globals) if (!names.has(i)) names.set(i, n);
        const meta = vrStore.getVRMeta(), vrs = {};
        for (const idx of vrStore.getAllVRIndices()) {
          const m = meta[idx]; if (!m || !m.pages || ![...m.pages].includes(name)) continue;
          vrs[idx] = { name: names.get(idx) || null, value: vrStore.getVR(idx), usedBy: m.desc || '' };
        }
        return { components: app.currentPage.components.length, boundVRs: vrs };
      }, name);
      await page.waitForTimeout(150);
      const file = path.join(o.out, `${name}.png`);
      await page.locator('#hmi-canvas').screenshot({ path: file });
      report.pages.push({ page: name, screenshot: path.resolve(file), ...info });
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (report.consoleErrors.length) report.ok = false;
  fs.writeFileSync(path.join(o.out, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return report.ok ? 0 : 1;
}

main().then(c => process.exit(c)).catch(e => { process.stderr.write(`hmi-shot: ${e.stack || e}\n`); process.exit(2); });
