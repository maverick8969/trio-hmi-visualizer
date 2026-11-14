---
name: trio-sim
description: Boot and drive the Trio Motion controller simulator headlessly against real TrioBASIC (.BAS) programs, then read and assert on VR registers, I/O, axes, heaters, flows and the Modbus KPI block. Use when changing or reviewing .BAS code for the Novex Line 2 (or any Trio) controller, to check VR outputs, run the regression scenarios, compare behavior before/after a change, or reproduce an interlock / E-stop / boot problem — without hardware.
---

# Trio simulator (headless)

`trio-sim` executes the actual `.BAS` programs on a simulated Trio controller + plant
(1 ms scan, multi-process scheduler, EtherCAT/WDOG/E-stop, pumps, PID, traverse, nip roll,
mixer VFD, heaters, recipes, `SHARE_DATA` KPI block) and prints JSON. No browser, no npm install —
only Node ≥ 16.

## Locate the tool

The simulator ships inside the `trio-hmi-visualizer` repo (this skill's plugin). Resolve `TRIO`
to that repo root, in this order, and use `node "$TRIO/tools/trio-sim.js"`:

1. `$TRIO_TOOLS` if set.
2. Two directories above this skill's base directory (shown when the skill loads:
   `<base>/../..` contains `tools/trio-sim.js`).
3. `find ~/.claude/plugins -name trio-sim.js -path '*tools*' 2>/dev/null | head -1` → strip `/tools/trio-sim.js`.
4. Clone it: `git clone --depth 1 https://github.com/maverick8969/trio-hmi-visualizer /tmp/trio-hmi-visualizer`.

Run `node "$TRIO/tools/trio-sim.js" --help` for the full option list.

## Point it at the code under test

Always pass `--bas <dir>` with the folder holding the `.BAS` files you are working on (e.g. `--bas .`
from the controller repo root; subfolders are searched). Without `--bas` it runs the bundled
`samples/line2` snapshot, which may be stale. Autorun is taken from `manifest.json`, else the
`.mpv3prj` `IsAutorun` entry, else `START_AND_SET_VARIABLES`; override with `--autorun NAME`.

## Core workflow

Steps run **left to right**. Boot takes ~18 s of sim time — always `--fast-boot` before driving inputs.

```bash
T="node $TRIO/tools/trio-sim.js --bas ."

# 1. Syntax check after editing any .BAS (exit 1 on parse errors)
$T --parse-only

# 2. Full regression suite (exit 1 if any assertion fails)
$T --scenario all --log warn

# 3. Boot healthy? WDOG=1 and SYSTEMSTATUS (VR 24) = 0x28 (40)
$T --fast-boot --expect "wdog = 1" --expect "VR:24 = 40"

# 4. Drive inputs, advance time, assert + dump VR outputs
$T --fast-boot --set hmi_pumps_run=1,pumpa_rpm_setpoint=50 --run 4000 \
   --expect "axis:1:MSPEED ~ 50 6" --dump axes,flows,kpi

# 5. Fault behavior
$T --fast-boot --set hmi_pumps_run=1 --run 3000 --estop on --run 600 \
   --expect "wdog = 0" --expect "hmi_pumps_run = 0" --estop off \
   --set safety_relay_reset=1 --run 5000 --expect "VR:24 = 40"
```

Useful flags: `--set-bit mixer_controlword_vr.4=1`, `--input 12=1` (force IN), `--fault ethercatDrop=on`,
`--list-globals pump` (name → VR index + value after boot), `--dump globals:zone`, `--dump VR:4000-4058`,
`--dump io|axes|procs|drives|heaters|flows|table:0-59`, `--log all` (include PRINT output).

`--expect` targets: `wdog`, `VR:n`, `bit:n.b`, `axis:n:PARAM` (MSPEED, SPEED, MPOS, MTYPE…), `op:n`,
`temp:overhead1|overhead2|overhead3|mixhead|deltapA|deltapB` (°F), `flow:pumpA|pumpB`,
`nip:running|speed`, `mixer:rpm|running`, or any global name. Ops: `= != > < >= <= ~` (`~` takes a tolerance).

## Before/after comparison of VR outputs (do this for every behavior change)

```bash
git stash            # or check out the base commit into a worktree
$T --fast-boot --set <inputs> --run 5000 --snapshot /tmp/before.json
git stash pop
$T --fast-boot --set <same inputs> --run 5000 --diff /tmp/before.json
```

`--diff` lists every global, KPI VR, output, axis, heater and flow that changed (exit 1 if any).
Explain each difference in your summary; unexpected ones are regressions.

## Custom scenarios

For repeatable checks, write a JSON file and run it with `--scenario path.json`:

```json
[{ "name": "Nip roll starts", "steps": [
  { "boot": true }, { "fastforward": 18000 },
  { "set": { "niproll_inch_per_min_hz": 1, "nip_speed_setpt": 30 } },
  { "setBit": { "name": "nip_roll_control_word", "bit": 0, "value": 1 } }, { "run": 3000 },
  { "expect": { "what": "nip:running", "op": "=", "value": 1 } },
  { "expect": { "what": "nip:speed", "op": "~", "value": 30, "tol": 1 } }
]}]
```

Step types: `boot`, `fastforward`, `run`, `set`, `setBit`, `estop`, `fault`, `expect`, `log`. Built-ins live in
`$TRIO/js/sim/sim-scenarios.js` (`--list-scenarios`). Suggest keeping project scenarios in the controller repo
(e.g. `sim/scenarios.json`) and running them on every change.

## Reading results

- Exit 0 = everything passed; 1 = an expectation, scenario or diff failed; 2 = usage / load error.
- `unknownGlobals` means a `--set` name doesn't exist in the code — check spelling with `--list-globals`.
- `log.entries` with level `warn` flag undefined identifiers or unimplemented commands the code hit;
  treat new warnings after your change as suspicious.
- Plant physics are illustrative, not calibrated. Trust logic/sequencing/interlocks/VR values;
  don't treat temperatures, flows or ramp times as real-machine predictions.

To see the operator screens, use the `trio-hmi` skill.
