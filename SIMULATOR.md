# Trio Simulator

A full software-in-the-loop simulator for the **Novex Line 2** Trio Motion controller,
built into the HMI visualizer. It **executes your actual TrioBASIC `.BAS` programs** against a
simulated controller and plant, so you can test and troubleshoot logic, sequencing, interlocks,
and safety behavior **before flashing any firmware**.

Open `index.html` (or run `./start.sh`) and click **◉ Simulator** in the toolbar.

---

## What it does

The simulator boots your project exactly like the controller does — the autorun program
(`START_AND_SET_VARIABLES`) runs the data dictionary and launches `INIT_PARAMETERS`, which brings up
EtherCAT, enables the drives, and starts all the background processes. It runs the **real code**:
`PUMPS_RUN`, `HEATER_OFFON_CONTROL`, `ERROR_CHECK_AND_RESET`, `TRAVERSE`, `MIXER`, `NIP_ROLL`,
`RECIPES`, `SHARE_DATA`, and the rest, on a cooperative multi-process scheduler that mirrors the
Trio scan model (1 ms base tick, per-process `TICKS`, `WA()` sleeps, `WAIT UNTIL` polling).

Because the engine is backed by the visualizer's live `vrStore`, any HMI screens you load in **View**
mode animate in real time while the code runs, and operator writes from the HMI flow straight back
into the running program.

### Simulated in this build (Phase 1)

| Subsystem | What runs |
|-----------|-----------|
| **Boot / init** | Autorun → `INIT_PARAMETERS` → EtherCAT bring-up → drive enable → all processes, settling `SYSTEMSTATUS` to `0x28` (40) just like the real controller |
| **Pumps / motion** | Pump A/B/C + traverse axes: `FORWARD`/`REVERSE`/`CANCEL`, `SPEED`/`ACCEL`/`DECEL` ramps, `MTYPE`/`MSPEED`/`MPOS`, ratio-follow and manual control |
| **Heating** | Overhead zones 1–3, mixer head, mixer ΔP A/B — deadband on/off with `OP`/`READ_OP`, timers, thermocouple/RTD `DV_IN` feedback, Kevlar `AOUT` |
| **Watchdog / safety** | `WDOG`/STO, E-stop input, safety-relay reset pulse, `CANCEL`+`SERVO` shutdown, drive re-enable + settle-to-`0x28` recovery |
| **Comms** | EtherCAT state machine + Modbus flow meters stubbed "healthy" (with fault injection to drop them) |

### Plant physics (simple & tunable)

First-order models: motors ramp to commanded `SPEED` via `ACCEL`/`DECEL`; heater zones warm toward a
ceiling when energized and cool toward ambient when off; pump mass-flow tracks `MSPEED`. Rate constants
live in `js/sim/trio-plant.js` (`heatRateCPerSec`, `coolK`, `flowGperSecPerRPM`, `ambientC`, …) and are
meant to be tuned — they are illustrative, **not** calibrated to the real machine.

---

## Using the dashboard

- **Transport** — `Boot` (re-link + restart), `Run`/`Pause`, `Step 100 ms`, `Fast-boot` (run the ~18 s
  boot instantly), and a speed selector (1× real-time up to 100×).
- **Operator Controls** — Pumps RUN, Pump A setpoint, mix ratio, Purge, Auto mode, and heater-zone
  enables with setpoints. These write the same VRs the HMI buttons drive.
- **Fault Injection** — press/release E-stop, pulse the safety-relay reset, drop EtherCAT, or kill meter
  comms, to rehearse fault reactions and recovery.
- **Processes / Axes / Heaters / Flow** — live state: each process's current line and run/sleep state,
  axis `MTYPE`/`MSPEED`/`MPOS`, zone temperatures with heat indicators, pump rpm/flow.
- **Digital & Analog I/O** — `OP`/`IN`/`AOUT`/`DV_IN` with the real channel names; click an input to force it.
- **VR Watch** — filter and watch any named global live.
- **Event Log** — every `RUN`/`STOP`, `PRINT`, and — importantly — every **warning** the engine raises
  when your code reads an undefined identifier, calls an unimplemented command, etc.

Load a different project any time with **Load .BAS…** (pick the `.BAS` files and optionally the
`.mpv3prj` so the autorun is detected).

---

## Findings the simulator already surfaced in the Line 2 code

Running the real programs immediately flagged several latent issues (all visible in the Event Log). These
are reproduced faithfully — the simulator does **not** silently "fix" them:

1. **`bdo_cart_pid_out_start_wd` is undefined** (`START_AND_SET_VARIABLES.BAS:887`). It should be
   `MIXERHEAD_PID_OUT_start_wd` (1920). As written, the `MIXER_HEAD_xout` / `_error` / `_last_*` /
   `_at_*_limit` globals resolve to **VR 0–6**, colliding with `TrioControlWord` (VR1) and the axis
   control words (VR2–6). The mixer-head PID output block is effectively mis-mapped.
2. **Overhead-zone display temps read the wrong channel.** `HEATER_OFFON_CONTROL.BAS:27–29` read
   `DV_IN(analogin_overhead_heat_zone1/2/3_tc)`, but those constants are **never defined**; they resolve to
   0, so `Overhead_Heater_Temp_Zone1/2/3` (VR 571–573) all read `DV_IN(0)` (the mixer ΔP-A RTD) instead of
   channels 5/6/7. Zone control still works (its PV arrives via the EtherCAT PDO map), but the HMI display
   temps are wrong.
3. **Recipe-save typo.** `RECIPES.BAS` reads/writes `save_recipe`, but the declared global is
   `save_receipe` (VR97). The two never meet, so the save trigger is dead.
4. **`manual_btn_pump_a/b/c` are never declared** as globals, so the manual pump buttons in `PUMPS_RUN`
   read process-local zeros and never fire.
5. **Proc-1 reuse.** The autorun holds process 1 until `INIT_PARAMETERS` finishes, yet
   `CONFIG_THERMOCOUPLES` is assigned that same process 1 and launched mid-init — a latent "process in
   use" overlap.

These are exactly the class of problem the simulator exists to catch pre-flash. Treat them as leads to
confirm on the bench, not as verdicts.

---

## Architecture

```
js/sim/
  trio-lexer.js       tokenizer (comments, _ continuation, $hex, TIME$ suffix, labels)
  trio-parser.js      recursive-descent AST (permissive: unknown commands never break parsing)
  trio-runtime.js     AST -> flat instruction list; multi-process scheduler; symbol table
                      (GLOBAL aliases -> VR, CONSTANT, DIM arrays); WDOG/TICKS/WA; RUN/STOP/PROC_STATUS
  trio-machine.js     VR table, axes + ramp physics, digital/analog I/O, EtherCAT/Modbus/CoE stubs
  trio-plant.js       tunable thermal + flow models coupling outputs -> sensors
  sim-controller.js   browser orchestration: build engine, load programs, rAF loop, boot/reset
  sim-ui.js / sim.css dashboard
```

**Design choice:** the parser is deliberately permissive — recognised keywords parse into structured
nodes, and anything else (axis params, motion, I/O verbs) becomes a generic assign/command node the
runtime interprets. So an unrecognised command is reported as "unimplemented," never a parse failure.
The AST is lowered to a flat instruction list so cooperative multitasking is a simple instruction-pointer
advance: a `GOTO label` loop yields one scan per slice, while `FOR`/`WHILE`/`REPEAT` run to completion
within a scan.

---

## Not yet modeled (Phase 2 roadmap)

- **PID loops** (`PUMP_PID` `USER_PID`, heater PID) — currently the deadband on/off heat control runs; the
  `USER_PID` function is a no-op, so PID-mode pump/heat control is inert.
- **Traverse / nip-roll / mixer motion detail** — axes exist and move, but homing/zone traversing,
  nip-roll Optidrive PDO, and mixer lube shot-counting are simplified.
- **Recipes / TABLE datagrid & zone control** — TABLE memory works; the recipe grid and zone-speed logic
  aren't yet exercised end-to-end.
- **Full Modbus/ADISRA/SHARE_DATA dashboards** — comms are stubbed healthy; the KPI/Modbus register block
  isn't fully synthesized.
- **Calibrated physics** — models are illustrative; tuning to logged line data is a future step.
- A **scripted-scenario / assertion harness** for regression testing sequences.

---

## Testing

Engine tests live in `tests/` (Node): `test-parser.js` (all 22 programs parse with 0 errors),
`test-scenarios.js` (16 behavioral assertions — boot, pump start, heater on/off, E-stop, reset), and a
headless Playwright page test. Run any with `node tests/<file>.js`.
