# TrioBASIC Controller Simulator — Behavior Spec (Novex Line 2)

Implementation-oriented. Derived from `START_AND_SET_VARIABLES.BAS`, `INIT_PARAMETERS.BAS`,
`ERROR_CHECK_AND_RESET.BAS`, `Novex Line 2.mpv3prj`, `MC_CONFIG.MCC`, and the Architecture docs.
Line numbers cite the live source in `/root/sim-build/programs/`.

---

## 1. Process Table

Process constants defined in `START_AND_SET_VARIABLES.BAS:41–57` (`CONSTANT "Proc_*"`).
`RunOnProcess` = explicit attribute in the `.mpv3prj`; blank means the process is assigned by the
`RUN "PROG", proc_*` call in INIT_PARAMETERS.

| Proc # | Program | Proc constant | .mpv3prj RunOnProcess | Launched by |
|--------|---------|---------------|-----------------------|-------------|
| 1 | **START_AND_SET_VARIABLES** (AUTORUN) | Proc_Thermocouple_Config | `1`, `IsAutorun=True` | firmware |
| 1 | CONFIG_THERMOCOUPLES | Proc_Thermocouple_Config | — | INIT:332 (reuses proc 1) |
| 2 | INIT_PARAMETERS | Proc_Init_Parameters | `2` | START:1048 |
| 3 | HMI_ANIMATION | Proc_HMI_Animation | `3` | INIT:86 |
| 4 | ERROR_CHECK_AND_RESET | Proc_Error_Check | `4` | INIT:314 |
| 5 | RECIPES | Proc_Recipes | `5` | INIT:316 |
| 6 | NIP_ROLL | Proc_NIP_Roll | `6` | INIT:318 |
| 7 | TRAVERSE | Proc_Traverse | — | INIT:320 |
| 8 | (none — "MANUAL") | Proc_Manual | — | referenced in STOP only |
| 9 | (none) | Proc_Auto | — | unused |
| 10 | MIXER | Proc_Mixer | — | INIT:326 |
| 11 | CALIBRATION | Proc_Calibration | — | INIT:322 |
| 12 | PUMPS_RUN | proc_pumps_run | — | INIT:324 |
| 13 | READ_METERS | Proc_Read_Meters | — | INIT:351 (gated on have_meters) |
| 14 | PUMP_PID | Proc_Pumps_PID | — | INIT:354 (gated on have_meters) |
| 15 | HEATER_OFFON_CONTROL | Proc_Heater_OffOn | — | INIT:328 |
| 16 | ADISRA_DATA | Proc_ADISRA_data | — | INIT:330 |
| 17 | SHARE_DATA | Proc_Share_Data | `17` | INIT:360 |
| auto | SPEED_MINMAX | (none) | — | INIT:334 `RUN "SPEED_MINMAX"` no proc# |

**Autorun = START_AND_SET_VARIABLES.BAS** (`.mpv3prj` `Autorun="-1" IsAutorun="True" RunOnProcess="1"`).

**Sim note — proc-1 collision:** the autorun holds process 1 until INIT *finishes* (see §2, START:1050
waits for `=0`, not just `<>0`). CONFIG_THERMOCOUPLES is assigned that same process 1 and is launched by
INIT:332 *while START is still resident*. On real Trio this is a latent "process in use" conflict; the sim
should decide a policy (either let START exit after INIT starts, or serialize proc-1 reuse).

---

## 2. Boot / Init Order

### Autorun tail (`START_AND_SET_VARIABLES.BAS:1048–1050`)
```
RUN "INIT_PARAMETERS", proc_init_parameters      ' proc 2
WAIT UNTIL PROC_STATUS PROC(proc_init_parameters) <> 0   ' wait until it starts
WAIT UNTIL PROC_STATUS PROC(proc_init_parameters) =  0   ' wait until it finishes
```
Everything before line 1048 is Modbus TCP server config (`:22–25`, address-halving intentionally OFF) and
the CONSTANT/GLOBAL data dictionary. After INIT returns, START ends and proc 1 frees.

### INIT_PARAMETERS.BAS step-by-step
| Lines | Action |
|-------|--------|
| 1 | `have_meters = TRUE` (hard-coded) |
| 7–46 | `FLASHTABLE(3,1)`→`FLASHTABLE(2,1,0)`; sweep 20 recipe rows: clamp zone-enable to 0/1, seed zone defaults |
| 48–51 | `WDOG = 0`; `SERVO AXIS(0..3) = 0` |
| 54–70 | STOP every background proc if already running (incl. READ_METERS/PUMP_PID if have_meters) |
| 72–76 | `OP(0,15,FALSE)` (clears DO 0–14); `AOUT(0..7)=0`; `SET_BIT(nip_roll_status_running_bit,5000)` |
| 78–84 | zero `systemstatus`(VR24), `traverse_statusword_vr`, `traverse_controlword_vr`, all `running_pump*_calibration` |
| 86–87 | `RUN "HMI_ANIMATION", proc 3` + WAIT UNTIL up (operator sees boot) |
| 89 | `systemstatus.ethercatstarting = 1` |
| 91 | `IF AXISSTATUS > 0 THEN DATUM(0)` |
| 96–118 | **EtherCAT bring-up retry loop** (≤3 tries): `WA(5000)` drive-power settle → `ETHERCAT(0,0)` → `WA(2000)` → per-axis clear (`DATUM(0)` if AXISSTATUS>0) → `ETHERCAT($22,0,ethercat_status)`; state `=3` (Op) sets `ethercat_ok`, else retry |
| 119–122 | if never Op: `systemstatus.ethercatstopped=1`; `GOTO error_handler` (**only fatal init path**) |
| 124–128 | if nip in fault: pulse `nip_roll_cntrl_fault_reset_bit` 500 ms |
| 130–132 | `ethercaterror=0`, `ethercatstarting=0`, `ethercatstarted=1` |
| 137 | `IF IN(in_safety_estop)=0 THEN systemstatus.estop_active=1` (reflect real E-stop line) |
| 140–142 | `SERVO AXIS(0..3)=0` |
| 151 | `ON BASICERROR GOTO error_handler` (installed late) |
| 153–162 | clear all control words; `CANCEL(2) AXIS(0..3)` |
| 164–165 | `WA(500)`; `systemstatus.enablingdrives = 1` |
| 167–291 | per-axis config: traverse (UNITS, `FE_LIMIT=.5 FE_RANGE=.3`, `FS_LIMIT=100`, `RS_LIMIT=traverse_rslimit`, gains, INVERT_IN, ENCODER_RATIO); pumps A/B/C (`REP_OPTION=1 REP_DIST=360`, FE limits 10/5, 20/5, 5/3); mixer + nip (open-loop, BASE only) |
| 299–301 | `AOUT_CONFIG` mixer, `AIN_CONFIG` mixer ref (0–10 V) |
| 304–306 | `SERVO AXIS(0..3) = 1` |
| 309–312 | `WDOG = 1`; `enablingdrives=0`; `driveenabled=1`; `automode=0` (start **Manual**) |
| 314–334 | RUN background procs, each `WAIT UNTIL PROC_STATUS<>0` **except** CONFIG_THERMOCOUPLES (`WA(200)`) and SPEED_MINMAX (no proc, no wait) — order: **4,5,6,7,11,12,10,15,16, then 1(CONFIG_TC), SPEED_MINMAX** |
| 343 | `ETHERNET(1,-1,7,0)` (Modbus re-init) |
| 349–357 | if have_meters: `WA(5000)` → RUN READ_METERS(13)+WAIT → `WA(2000)` → RUN PUMP_PID(14)+WAIT → `meters_installed=TRUE` |
| 360–361 | RUN SHARE_DATA(17) **last** + WAIT |
| 364–371 | `error_handler:` logs + `STOP` — also reached by fall-through on success, ending INIT |

### Resulting order processes come alive
`1 START` → `2 INIT` → `3 HMI_ANIMATION` → *(EtherCAT Op, drives enabled)* →
`4 ERROR_CHECK` → `5 RECIPES` → `6 NIP_ROLL` → `7 TRAVERSE` → `11 CALIBRATION` → `12 PUMPS_RUN` →
`10 MIXER` → `15 HEATER` → `16 ADISRA` → `1 CONFIG_TC` → `SPEED_MINMAX` → `13 READ_METERS` →
`14 PUMP_PID` → `17 SHARE_DATA`. Then INIT STOPs and START exits.
Approx wall-clock: HMI immediate; EtherCAT Op ~5–6 s; drives ~7 s; loops ~8 s; meters ~13–15 s; first SHARE publish ~17 s.

---

## 3. Safety Interlocks

### E-stop input — `IN 0` / `In_Safety_EStop` (`START:59`)
Normally-closed. **`IN(in_safety_estop)=0` = pressed OR wire-break (fail-safe → active).**
**`=1` = released / circuit healthy.** INIT:137 seeds `estop_active` from this at boot.

### WDOG semantics
Trio software watchdog gating the hardware STO line.
- `WDOG = ON` → STO energized → drives *can* be enabled/servo'd.
- `WDOG = OFF` → STO drops → all servo drives disabled (safe torque off), regardless of SERVO state.
- Mirror output: `OP(out_watchdog, WDOG)` where `Out_WatchDog = OP 5` (`START:104`), written every scan at
  `ERROR_CHECK:158`. **ERROR_CHECK_AND_RESET is the sole writer of WDOG** (E-stop drops it, reset raises it).

### E-stop → shutdown sequence (`ERROR_CHECK_AND_RESET.BAS:63–94`)
Trigger: `IF IN(in_safety_estop)=0 AND WDOG=ON THEN`
| Ln | Write |
|----|-------|
| 64 | `triocontrolword_vr.autorunactive = 0` |
| 65 | `systemstatus.estop_active = 1` |
| 69 | `hmi_pumps_run = OFF` |
| 70–72 | `manual_btn_pump_a/b/c = 0` |
| 73 | `WDOG = OFF` (drops STO — *before* CANCEL/SERVO=0, non-canonical, H-NF-1) |
| 75–78 | per axis 0–3: `CANCEL(2) AXIS(n)` + `WAIT LOADED` |
| 79 | `SET_BIT(nip_roll_status_running_bit, 5000)` (Optidrive PDO bit) |
| 81–83 | per axis 0–3: `SERVO AXIS(n) = 0` |
| 85–86 | `traverse_statusword_vr.statusbithomed = 0`; `.axisstatushoming = 0` |
| 87 | `traverse_controlword_vr = 0` |
| 89–90 | `triocontrolword_vr.automode = 0`; `.autorunactive = 0` |
| 92 | `OP(0,16,FALSE)` (clears DO 0–15) |

**NOT cleared:** overhead heater DOs 20–22, Kevlar `AOUT(7)`, mixer `AOUT(6)`, stacklight DOs 16–19,
nip Optidrive PDO (VR 5000/5001). System is motion-safe but stays thermally hot (H-NF-2).

### Reset / recovery sequence (`ERROR_CHECK_AND_RESET.BAS:97–155`)
Operator two-step: (1) release E-stop (`IN=1`), (2) HMI "Reset Safety Relay" → `safety_relay_reset=1`.
`reset_safety_relay:` (`:188–198`) pulses `OP(out_estop_reset=OP 4, ON)`, `WA(3000)` (3 s > relay's 1.5 s
window), `OFF`, sets `manual_reset=1`. Next loop iteration, gated on `WDOG=0 AND IN(in_safety_estop)=1 AND
manual_reset=1`:
| Step | Ln | Action | Settle |
|------|----|--------|--------|
| 1 | 100 | `manual_reset = 0` | |
| 2 | 101 | `systemstatus.estop_active = 0` | |
| 3 | 103–107 | per axis 0–3: `CANCEL(2)` (**no** WAIT LOADED) | |
| 4 | 108 | `GOSUB read_ethercat_status` | |
| 5 | 111 | `IF ethercatstarted=0 THEN ETHERCAT(0,0)` (restart master) | |
| 6 | 112 | — | `WA(200)` |
| 7 | 114–119 | first axis with `AXISSTATUS>0`: `DATUM(0)` + `EXIT_LOOP` (only first — M-NF-7) | |
| 8 | 120 | — | `WA(200)` |
| 9 | 122–126 | per axis: `BASE(n)`; `ETHERCAT($64, n)` (CoE motor-error clear, all axes) | |
| 10 | 127 | — | `WA(200)` |
| 11 | 129–134 | if nip faulted: pulse `nip_cntrl_fault_reset_bit` | `WA(500)` |
| 12 | 137 | `systemstatus.enablingdrives = 1` | |
| 13 | 139–143 | per axis: `BASE(n)`; `AXIS_ENABLE = ON`; `WA(100)` each | `WA(100)`×4 |
| 14 | 145 | `WDOG = ON` (re-arm STO) | |
| 15 | 146 | — | `WA(100)` |
| 16 | 148–150 | per axis 0–3: `SERVO AXIS(n) = 1` | |
| 17 | 155 | `systemstatus.enablingdrives = 0` → settles to `0x28` (40) | |

After reset: **Manual mode, drives enabled, NOT homed, heaters NOT re-cleared.** Operator must re-home
traverse before Auto (TRAVERSE gates auto motion on `statusbithomed=1`).

---

## 4. Timing

- **SERVO_PERIOD = 1000 µs** (`MC_CONFIG.MCC:12`) → 1 ms EtherCAT / scheduler slice. Base sim tick.
- **TICKS** is the built-in Trio down-counter: it decrements by 1 every servo period (so ≈1 count per
  millisecond). Pattern: `TICKS = N` (ms) at loop top, then `IF TICKS < 1 THEN … : TICKS = N` reloads.
  Sim must decrement every VR-named `TICKS` context by 1 per 1 ms tick.
  - HEATER `TICKS = 1000` → 1 Hz thermostat pass (`HEATER_OFFON_CONTROL.BAS:45`).
  - NIP_ROLL `TICKS = 1000` → 1 Hz length integration (`NIP_ROLL.BAS:3,62,74`).
  - PUMP_PID `TICKS = flow_average_sample_rate*1000` (~1000 ms) → 1 Hz PID (`PUMP_PID.BAS:41,105`).
  - MIXER: fully event-driven; `TICKS = interval*1000` between lube pulses, `TICKS=0` to fire next pulse immediately.
- **Notable WA() durations:**
  | Where | WA | Purpose |
  |-------|----|---------|
  | INIT:100 / :102 | 5000 / 2000 | DX4 drive power settle + EtherCAT settle (×3 retries — **do not shorten**) |
  | INIT:164 | 500 | pre-config settle |
  | INIT:333 | 200 | after CONFIG_THERMOCOUPLES (fire-and-forget) |
  | INIT:350 / :353 | 5000 / 2000 | meter TCP settle before READ_METERS / PUMP_PID |
  | ERROR_CHECK:112/120/127 | 200 | between reset phases |
  | ERROR_CHECK:142/146 | 100 | per-axis enable + post-WDOG |
  | ERROR_CHECK:193 | 3000 | safety-relay reset pulse (relay window 1.5 s) |
  | ADISRA | 50 | SCADA refresh |
  | SHARE_DATA | 2000 (literal) | KPI publish heartbeat |
  | READ_METERS | 200 | per-meter poll (~2.5 Hz) |
  | TRAVERSE | 5 / 2 | zone-poll cadence / MTYPE race window (`WA(2)` — do not remove) |

- **Sim loop-rate guidance:** run one scheduler slice = 1 ms. "Tight"/unpaced loops (ERROR_CHECK,
  PUMPS_RUN, RECIPES, HMI_ANIMATION, NIP_ROLL, SPEED_MINMAX) execute once per 1 ms slice —
  **ERROR_CHECK must react to E-stop within one slice, so never coarsen its rate.** Paced loops sleep for
  their `WA`/`TICKS` interval: HEATER/NIP-length/PUMP_PID at 1 Hz, ADISRA at 20 Hz, SHARE_DATA at 0.5 Hz,
  READ_METERS ~2.5 Hz/meter, TRAVERSE zone-poll at 200 Hz. `WA(ms)` yields the slice without blocking peers.

---

## 5. SYSTEMSTATUS bitfield (VR 24)

`GLOBAL "SystemStatus", 24` — bit-packed status word (`START_AND_SET_VARIABLES.BAS:279–286`).
Mirrored to Modbus at VR 4017 (`Share_SystemStatus`).

| Bit | Value | Constant | Meaning |
|-----|-------|----------|---------|
| 0 | 0x01 | `Estop_Active` | E-stop pressed/active |
| 1 | 0x02 | `EtherCATStarting` | master in Pre-Op/Safe-Op |
| 2 | 0x04 | `EtherCATError` | EtherCAT error |
| 3 | 0x08 | `EtherCATStarted` | master Operational (state 3) |
| 4 | 0x10 | `EnablingDrives` | transient during enable sequence |
| 5 | 0x20 | `DriveEnabled` | mirrors WDOG (`ERROR_CHECK:16–20`) |
| 6 | 0x40 | `EtherCATStopped` | master Stopped/Init (state 0) |

**Settled value after a clean boot/reset = `0x28` = 40** = `EtherCATStarted (0x08) + DriveEnabled (0x20)`,
i.e. no E-stop, master Operational, drives enabled, transient `EnablingDrives` cleared
(`ERROR_CHECK:151–155`, `INIT:310–311`).
