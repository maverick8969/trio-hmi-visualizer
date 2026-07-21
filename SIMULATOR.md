# Trio Simulator

A full software-in-the-loop simulator for the **Novex Line 2** Trio Motion controller,
built into the HMI visualizer. It **executes your actual TrioBASIC `.BAS` programs** against a
simulated controller and plant, so you can test and troubleshoot logic, sequencing, interlocks,
control loops, and safety behavior **before flashing any firmware** — and drive it all from your
**real operator HMI**.

## Running it

It's a self-contained browser app (HTML/JS/CSS, no build step, no dependencies) and runs the same on
**Windows, macOS, or Linux** in any modern browser (Chrome, Edge, Firefox, Safari).

Serve it over a tiny local web server, then click **◉ Simulator** in the toolbar:

- **macOS / Linux:** `./start.sh` (or `python3 -m http.server 8000`) → open `http://localhost:8000`.
- **Windows:** double-click `start.bat` (or run `python -m http.server 8000`) → open `http://localhost:8000`.

The local server is only needed so the simulator can fetch the bundled sample programs and the Live-HMI
screens — browsers block those fetches when you open the page directly as a `file://` URL. You *can*
still open `index.html` directly, but then use the **Load Folder** button to pick the `samples/line2`
folder (and `samples/line2-hmi` for the HMI) by hand.

The optional Node test suite (`node tests/<file>.js`) also runs cross-platform wherever Node is installed.

---

## What it does

The simulator boots your project exactly like the controller does — the autorun program
(`START_AND_SET_VARIABLES`) runs the data dictionary and launches `INIT_PARAMETERS`, which brings up
EtherCAT, enables the drives, and starts all the background processes. It runs the **real code** on a
cooperative multi-process scheduler that mirrors the Trio scan model (1 ms base tick, per-process
`TICKS`, `WA()` sleeps, `WAIT UNTIL` polling), settling `SYSTEMSTATUS` to `0x28` (40) just like the
real controller.

Because the engine is backed by the visualizer's live `vrStore`, your **real HMI screens** animate in
real time while the code runs, and operator writes from the HMI flow straight back into the running
program (see **Interactive HMI** below).

### Simulated

| Subsystem | What runs |
|-----------|-----------|
| **Boot / init** | Autorun → `INIT_PARAMETERS` → EtherCAT bring-up → drive enable → all 14 processes, settling to `0x28` |
| **Pumps / motion** | Pump A/B/C axes: `FORWARD`/`REVERSE`/`CANCEL`, `SPEED`/`ACCEL`/`DECEL` ramps, ratio-follow, manual/auto |
| **Pump PID** | `USER_PID` positional PID over the VR blocks — pump B flow-ratio control in auto + flow-meter mode (P/I/D, deadband, min/max clamp, manual/auto, anti-windup) |
| **Traverse** | `DATUM` homing (home-switch search), auto back-and-forth `MOVEABS` strokes with trapezoidal accel/decel, `MPOS` tracking, and per-zone speed changes on boundary crossings |
| **Nip roll** | Optidrive control/status words (VR 5010/5000) — run/stop, speed reference/feedback, and product-length + production-seconds integration |
| **Mixer** | VFD speed reference on `AOUT(6)` and feedback on `AIN(8)` (spindle spins up to command, reads back rpm), the lube shot-count state machine (init/run/prime), and `Out_MixerRun` interlocks |
| **Heating** | Overhead zones 1–3, mixer head, mixer ΔP A/B — deadband on/off with timers, thermocouple/RTD `DV_IN` feedback, Kevlar `AOUT` |
| **Watchdog / safety** | `WDOG`/STO, E-stop input, safety-relay reset pulse, `CANCEL`+`SERVO` shutdown, drive re-enable + settle-to-`0x28` recovery |
| **Recipes** | `RECIPES.BAS` load from TABLE memory — selecting a row copies the recipe column into the working setpoints (VR 100–115) and edit buffer (300–315). Sample recipes are seeded into TABLE (representing flash). Save is faithfully dead (see findings) |
| **Production / KPI** | `SHARE_DATA` publishes the full Modbus dashboard block (VR 4000–4058): bit-packed line state, product length, live speeds, mix ratio, soft totalizers, uptime, heartbeat, and the anti-misclick end-shift gate |
| **Comms** | EtherCAT state machine + Modbus flow meters stubbed "healthy" (with fault injection to drop them) |

### Plant physics (simple & tunable)

First-order models: servo motors ramp to commanded `SPEED` via `ACCEL`/`DECEL` (point moves use a
trapezoidal profile that stops on target); heater zones warm toward a ceiling when energized and cool
toward ambient when off; pump mass-flow tracks `MSPEED`; the nip Optidrive and mixer VFD are modeled
as analog/PDO drives whose speed the plant owns. Rate constants live in `js/sim/trio-plant.js`
(`heatRateCPerSec`, `coolK`, `flowGperSecPerRPM`, `ambientC`, …) and are meant to be tuned — they are
illustrative, **not** calibrated to the real machine.

---

## Interactive HMI

Click **🖥 Live HMI** in the simulator bar. This loads your actual operator screens
(`OPERATOR_MAIN`, `MIXER`, `HEATER_OFF_ON_CONTROL`, `RECIPE`, `PID_PARAMETERS`, `CALIBRATION`,
`SCHEDULE` — bundled under `samples/line2-hmi/`) and switches to the HMI view with the engine running.

It is a true closed loop on your real code: clicking an HMI button writes a VR → your running Trio
program reads it → the system responds → the code's outputs write VRs → the HMI animates. A floating
**SIM** control bar (bottom-right) lets you run/pause, change speed, and jump back to the engineering
dashboard while you interact with the screen. The VR panel on the right shows every bound register
updating live.

Because the machine and the HMI share one VR table, you can also drive the sim from the dashboard's
operator controls and watch the HMI reflect it, or vice-versa.

---

## Using the dashboard

- **Transport** — `Boot`, `Run`/`Pause`, `Step 100 ms`, `Fast-boot` (run the ~18 s boot instantly), speed 1×–100×.
- **Operator Controls** — **Recipe selector**, Pumps + setpoint, Purge, Auto mode, heater-zone enables/setpoints, **Nip Roll run + speed**, **Mixer run + speed**, and **Traverse home / auto-run / material window**. These write the same VRs the HMI buttons drive.
- **Fault Injection** — press/release E-stop, pulse the safety-relay reset, drop EtherCAT, or kill meter comms.
- **Motors & VFDs** — expected (commanded) vs actual RPM for every axis, plus the mixer VFD DAC command/feedback and the nip Optidrive control/status words.
- **Production / KPI** — the Modbus share block surfaced as line-state pills, product length, uptime, live speeds, mix ratio, totalizers, recipe #, heartbeat, and the end-shift gate.
- **Processes / Axes / Heaters / Flow** — live state: each process's current line and run/sleep state, axis `MTYPE`/`MSPEED`/`MPOS`, zone temperatures, pump rpm/flow.
- **Regression Scenarios** — one-click declarative test scenarios with pass/fail assertions (see below).
- **Digital & Analog I/O** — `OP`/`IN`/`AOUT`/`DV_IN` with real channel names; click an input to force it.
- **VR Watch** / **Event Log** — filter and watch any named global; every `RUN`/`STOP`, `PRINT`, and warning (undefined identifier, unimplemented command, …).

Load a different project any time with **Load .BAS…**.

---

## Regression scenarios

The **Regression Scenarios** card (and `tests/test-scenario-harness.js`) run declarative sequences that
boot, drive inputs, inject faults, advance time, and assert on state. Built-ins cover boot-to-`0x28`,
pump start + flow, the full E-stop → safe → recover cycle, heater deadband, and the mixer VFD loop.

Scenarios are plain data in `js/sim/sim-scenarios.js`, so you can add your own:

```js
{ name: 'My interlock check', steps: [
  { boot: true }, { fastforward: 18000 },
  { set: { hmi_pumps_run: 1, pumpa_rpm_setpoint: 50 } }, { run: 4000 },
  { expect: { what: 'axis:1:MSPEED', op: '~', value: 50, tol: 6 } },
  { estop: true }, { run: 600 },
  { expect: { what: 'wdog', op: '=', value: 0 } },
]}
```

`what` supports `wdog`, `VR:24`, `bit:24.0`, `axis:1:MSPEED`, `op:20`, `temp:overhead1`,
`flow:pumpA`, `nip:running`, `mixer:rpm`, or any global name; `op` is `=`, `!=`, `>`, `<`, `>=`,
`<=`, or `~` (approx within `tol`).

---

## Findings the simulator surfaced in the Line 2 code

Running the real programs immediately flagged several latent issues (all visible in the Event Log).
These are reproduced faithfully — the simulator does **not** silently "fix" them:

1. **`bdo_cart_pid_out_start_wd` is undefined** (`START_AND_SET_VARIABLES.BAS:887`; should be
   `MIXERHEAD_PID_OUT_start_wd` = 1920). As written the `MIXER_HEAD_*` PID-output globals resolve to
   **VR 0–6**, colliding with the control words at VR 1–6.
2. **Overhead-zone display temps read the wrong channel** — `analogin_overhead_heat_zone1/2/3_tc`
   are never defined, so `Overhead_Heater_Temp_Zone1/2/3` (VR 571–573) all read `DV_IN(0)` instead of
   channels 5/6/7. (Zone control still works — its PV arrives via the EtherCAT PDO map.)
3. **Recipe-save typo** — `RECIPES.BAS` uses `save_recipe`, but the declared global is `save_receipe`
   (VR97), so the save trigger is dead.
4. **`manual_btn_pump_a/b/c` are never declared**, so the manual pump buttons read local zeros.
5. **PID integral is dead** — `PUMP_PID.BAS` sets `..._reset_i_sum = TRUE` then clears a *different*,
   mistyped name (`..._pid__reset_i_sum`), so the integral resets every scan (P/D only).
6. **Proc-1 reuse** — the autorun holds process 1 until `INIT_PARAMETERS` finishes, yet
   `CONFIG_THERMOCOUPLES` is assigned that same process 1 and launched mid-init.

Treat these as leads to confirm on the bench, not as verdicts.

> **Interpreter note:** TrioBASIC `AND`/`OR` are bitwise (they agree with logical for 0/1
> operands); `SHARE_DATA.BAS` relies on this for `(share_line_state AND 15)` when gating the
> anti-misclick END SHIFT button. The engine implements them bitwise and `NOT` logically, matching
> how the code uses each. All engine language behavior is covered by `tests/`.

---

## Architecture

```
js/sim/
  trio-lexer.js       tokenizer (comments, _ continuation, $hex, TIME$ suffix, context-aware .bit)
  trio-parser.js      recursive-descent AST (permissive: unknown commands never break parsing)
  trio-runtime.js     AST -> flat instruction list; multi-process scheduler; symbol table
                      (GLOBAL aliases -> VR, CONSTANT, DIM arrays); WDOG/TICKS/WA; RUN/STOP/
                      PROC_STATUS; USER_PID
  trio-machine.js     VR table, servo axes + ramp/trapezoidal physics, VFD/analog axes, digital+
                      analog I/O, home switch, EtherCAT/Modbus/CoE stubs
  trio-plant.js       tunable thermal + flow models, nip Optidrive + mixer VFD models
  sim-controller.js   browser orchestration: build engine, load programs + HMI, rAF loop, boot/reset
  sim-scenarios.js    declarative scenario/assertion harness + built-ins
  sim-ui.js / sim.css dashboard, Motors panel, operator controls, faults, scenarios, live-HMI wiring
samples/line2/        bundled TrioBASIC programs (the executed project)
samples/line2-hmi/    bundled operator screens (TGM + TGDs + images) for the Live HMI
```

**Design choices:** the parser is permissive (recognised keywords parse into structured nodes;
everything else becomes a generic assign/command the runtime interprets), and the AST is lowered to a
flat instruction list so cooperative multitasking is a simple instruction-pointer advance — a
`GOTO label` loop yields one scan per slice while `FOR`/`WHILE`/`REPEAT` run to completion within a
scan. The machine is backed by the visualizer's `vrStore` (change-detecting) so the running code and
the HMI share one VR table.

---

## Not yet modeled

- **Recipe HMI datagrid (live rows)** — recipe *loading* works and TABLE memory is populated; the visualizer's `TVBDataGrid` renders placeholder rows (a pre-existing renderer limitation), so the recipe screen's grid doesn't yet show live TABLE data. The dashboard **Recipe selector** exercises the real load path.
- **Calibrated physics** — models are illustrative; tuning to logged line data is a future step (provide CSV/history and the plant constants in `trio-plant.js` can be fit to it).
- **Mixer lube pulse-timing detail** — the shot-count state machine runs; exact pulse-width/interval fidelity is simplified.
- **ADISRA SCADA link** — `ADISRA_DATA` runs and stages its VRs; the external SCADA side isn't modeled.

(Heater control in the real code is deadband on/off — there is no heater-PID code path — so nothing further to model there; the `USER_PID` engine exists and drives the pumps.)

---

## Testing

Engine tests live in `tests/` (Node): `test-parser` (all 22 programs parse), `test-scenarios`
(Phase-1 behavior), `test-fixes` (lexer/loop fixes), `test-pid`, `test-traverse`, `test-drives`
(nip/mixer/length), `test-recipes`, `test-share` (KPI block), and `test-scenario-harness` (the
declarative built-ins — 7 scenarios, 25 assertions). Run any with `node tests/<file>.js`. The
dashboard's **Regression Scenarios** card runs the same built-ins in the browser.
