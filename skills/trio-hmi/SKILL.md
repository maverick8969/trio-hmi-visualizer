---
name: trio-hmi
description: Render the real Trio HMI operator screens (.TGM/.TGD) while the simulator runs the .BAS programs, and capture PNG screenshots plus every HMI-bound VR value per page. Use when checking what the operator would see after a .BAS or HMI change, verifying HMI bindings point at the right VRs, reviewing a TGD edit, or standing up the interactive simulator + HMI in a browser for a human.
---

# Trio HMI visualizer + simulator

Two ways to use it. Locate the repo root `TRIO` exactly as in the `trio-sim` skill
(`$TRIO_TOOLS`, else `<this skill's base dir>/../..`, else search `~/.claude/plugins`, else clone
`https://github.com/maverick8969/trio-hmi-visualizer`).

## 1. Headless screenshots + bound-VR report (for agents)

Needs Playwright with Chromium (`require('playwright')` must work; if not:
`npm i -D playwright && npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_PATH`).

```bash
node "$TRIO/tools/hmi-shot.js" --bas . --hmi <folder with .TGM/.TGD/images> \
  --set hmi_pumps_run=1,pumpa_rpm_setpoint=50 --run 4000 \
  --pages OPERATOR_MAIN,MIXER --out /tmp/hmi-shots
```

- Boots the controller (`--boot-ms`, default 18000), applies `--set`/`--run` in order, loads the screens,
  and writes `<PAGE>.png` + `report.json` into `--out`.
- The JSON lists, per page, every bound VR: index, global name from the `.BAS` dictionary (null if the code
  never names it — often a binding bug worth flagging), current value, and which component property uses it.
- `--pages all` (default) captures every page in the TGM. `--no-sim` renders with all VRs at 0.
- Exit 1 if a page is missing or the page threw JS errors (`consoleErrors`).
- **Look at the PNGs** (open them with your image-reading tool) — don't just report that they were written.
  Compare against expectations: indicators lit, numbers matching the VR values from `trio-sim`.

Without `--hmi` it uses the bundled demo screens (`samples/demo/hmi`), which only match the demo programs.

## 2. Interactive (for a human)

```bash
cd "$TRIO" && ./start.sh          # Windows: start.bat   (serves http://localhost:8000)
```

Click **◉ Simulator** → **Boot** / **Fast-boot**, then **🖥 Live HMI**. HMI buttons write VRs into the running
code and the screens animate from the code's outputs. Use **Load .BAS…** to load the controller repo's
programs (and its `sim/scenarios.json`) instead of the bundled demo. In a cloud session, tell the user the port (and report it if your
environment has a preview-port tool) rather than trying to open a browser.

## Editing screens

The visualizer can edit and export TGD files (Edit mode → Export TGD). For agent edits, change the TGD XML
directly, then re-run `hmi-shot` on that page to confirm it still parses and renders.
