# Novex Line 2 — TrioBASIC I/O + Sensor/Actuator Map

Definitive plant-model mapping derived from `/root/sim-build/programs/`.
Master definitions: `START_AND_SET_VARIABLES.BAS` (all CONSTANT/GLOBAL).
Source of truth only — do not edit `.BAS`/`.MCC`.

Conventions: OP = digital output bit, IN = digital input bit, AIN/AOUT = analog
channels, DV_IN/DV_OUT = EtherCAT thermocouple/RTD "device" I/O. Raw temperature
`DV_IN` is **centidegrees C** (degC*100); code converts `degF = (DV_IN/100)*1.8 + 32`.

---

## A. DIGITAL OUTPUTS (`OP` / `READ_OP`)

| OP | CONSTANT | Physical device | Plant effect when ON | Written by |
|----|----------|-----------------|----------------------|-----------|
| 0  | Out_MixerRun | Mixer motor relay (EtherCAT VFD enable) | Energize mixer drive; motor spins to `mixer_head_speed_sp` | MIXER.BAS |
| 4  | Out_EStop_Reset | Safety-relay reset relay | 3 s pulse closes safety-relay reset terminals, then drops; also sets `manual_reset=1` (relay dial ~1.5 s) | ERROR_CHECK reset_safety_relay |
| 5  | Out_WatchDog | Servo-drive STO enable / WDOG mirror | Mirrors internal `WDOG`; enables drive STO circuit | ERROR_CHECK `OP(out_watchdog,WDOG)` |
| 6  | Out_NipRollDown | (future) nip roll down | Inert — declared, never written | none |
| 7  | Out_MIXER_DELTAP_A_TC | Mixer delta-P A cartridge heater relay | Energize delta-P zone A heater (temp DV_IN 0 rises) | HEATER_OFFON_CONTROL |
| 8  | Out_Mixer_DeltaP_B_TC | Mixer delta-P B cartridge heater relay | Energize delta-P zone B heater (temp DV_IN 1 rises) | HEATER_OFFON_CONTROL |
| 9  | Out_Mixer_Head_TC | Mixer head cartridge heater relay | Energize mixer-head heater (temp DV_IN 2 rises) | HEATER_OFFON_CONTROL |
| 10 | Out_Mixer_Lube | Air-pulse luber solenoid | Fire one lube shot (meters by shot count, not pulse width) | MIXER.BAS |
| 11 | Out_PumpsPurgeSol1 | Purge solenoid 1 | Open pump purge line 1 | PUMPS_RUN purge |
| 12 | Out_PumpsPurgeSol2 | Purge solenoid 2 | Open pump purge line 2 | PUMPS_RUN purge |
| 16 | Out_StackLight_Red | Stack light — red | Fault/alarm indicator | HMI_ANIMATION |
| 17 | Out_StackLight_Yellow | Stack light — yellow | Warning indicator | HMI_ANIMATION |
| 18 | Out_StackLight_Green | Stack light — green | Run/OK indicator (declared; not driven in current code) | — |
| 19 | Out_StackLight_Horn | Stack light — horn | Sounds when mixer speed error >1000 rpm while running | MIXER.BAS |
| 20 | out_preoverhead_zone1_tc | Overhead heater zone 1 relay | Energize overhead zone-1 heater (temp DV_IN 5 rises) | HEATER_OFFON_CONTROL |
| 21 | out_preoverhead_zone2_hose_tc | Overhead zone-2 hose heater relay | Energize zone-2 hose heater (temp DV_IN 6 rises) | HEATER_OFFON_CONTROL |
| 22 | out_preoverhead_zone3_hose_tc | Overhead zone-3 hose heater relay | Energize zone-3 hose heater (temp DV_IN 7 rises) | HEATER_OFFON_CONTROL |

Bulk clears at boot/fault: `OP(0,15,FALSE)` (INIT_PARAMETERS), `OP(0,16,FALSE)` (ERROR_CHECK) zero OP 0..N.

---

## B. DIGITAL INPUTS (`IN`)

| IN | CONSTANT | Meaning / polarity | Notes |
|----|----------|--------------------|-------|
| 0 | In_Safety_EStop | Safety E-Stop healthy. `IN=1` = circuit OK; `IN=0` = E-Stop active | `systemstatus.estop_active=1` when 0 (INIT, ERROR_CHECK, HEATER) |
| 1 | In_TraverseHome | Traverse home switch | `INVERT_IN(in_traversehome,ON)` in INIT; TRAVERSE `WAIT UNTIL IN`, HMI |
| 2 | In_Traverse_RSLimit | Traverse reverse soft/hard limit | HMI_ANIMATION status |
| 3 | In_Mixer_Running | Mixer running feedback | Declared/wired; code currently derives run state from `READ_OP(out_mixerrun)` |

(Legacy nip-roll/OS inputs 3–20 are commented out in the master; `in_pumpsrun_os1`
appears only in disabled PID_TEST/PUMP_PID lines.)

---

## C. ANALOG OUTPUTS (`AOUT`) — range `Analog_Range = 2048`

| AOUT | CONSTANT | Device | Scaling | Written by |
|------|----------|--------|---------|-----------|
| 6 | AnalogOut_Mixer_Head_Speed | Mixer VFD speed reference | `AOUT(6)=mixer_head_speed_sp * dac_per_speed`, `dac_per_speed=mixer_dac_max/mixer_max_speed=2048/18000`. So full-scale 2048 counts = 18000 rpm | MIXER set_mixer_speed |
| 7 | AnalogOut_Kevlar_Heater | Kevlar heater analog drive (0–100 %) | `AOUT(7)=INT((analog_range/100)*kevlar_heat_percent)` → 100 % = 2048; OFF (`kevlar_heat_offon=0`) → 0 | HEATER_OFFON_CONTROL kevlar_heater |

`INIT_PARAMETERS` zeroes all AOUT at boot (`AOUT(indx)=0`). Mixer VFD feedback is
read back on **AIN(8)** = `AnalogIn_Mixer_Speed_Ref` (`AIN_CONFIG(8)=1`), scaled by
`speed_per_dac = 18000/2048`, offset-zeroed while mixer stopped.

---

## D. ANALOG INPUTS (`DV_IN` thermocouple/RTD) + `DV_OUT`

Card layout: DeltaP A/B and Head are **RTDs** (RTD module, slot 0 addr 1003, CONFIG_THERMOCOUPLES);
overhead zones are **thermocouples**. All read via `DV_IN(idx)` = degC*100.

| DV_IN idx | CONSTANT | Sensor / zone | Engineering conversion | Control PV var |
|-----------|----------|---------------|------------------------|----------------|
| 0 | AnalogIn_Mixhead_DeltaP_A_RTD | Mixer delta-P block A RTD | `(DV_IN/100)*1.8+32` °F | mixer_deltapa_offon_pv (VR 1740) |
| 1 | AnalogIn_Mixhead_DeltaP_B_RTD | Mixer delta-P block B RTD | same | mixer_deltapb_offon_pv (VR 1840) |
| 2 | AnalogIn_Mixhead_RTD | Mixer head RTD | same | mixer_head_offon_pv (VR 1940) |
| 4 | (spare) | Not configured | — | — |
| 5 | AnalogIn_Overhead_Heater_1 | Overhead heater zone 1 TC | same | overhead_zone1_offon_pv (VR 1140) |
| 6 | AnalogIn_Overhead_Heater_2 | Overhead zone 2 hose TC | same | overhead_zone2_offon_pv (VR 1240) |
| 7 | AnalogIn_Overhead_Heater_3 | Overhead zone 3 hose TC | same | overhead_zone3_offon_pv (VR 1340) |
| 8 | AnalogIn_Mixer_Speed_Ref | Mixer VFD speed feedback (read via `AIN`, not DV_IN) | `(AIN-zero_offset)*18000/2048` rpm | mixer_reference_speed |

> **DISCREPANCY (flag for build):** HEATER_OFFON_CONTROL.BAS reads the overhead
> sensors via the names `analogin_overhead_heat_zone1_tc / _zone2_tc / _zone3_tc`,
> which are **not defined anywhere** in the source. The only defined overhead-TC
> constants are `AnalogIn_Overhead_Heater_1/2/3 = 5/6/7`. The simulator must treat
> the three aliases as **5/6/7** respectively (zone1→5, zone2→6, zone3→7).

### DV_OUT (heat on/off status mirrors, for HMI)

| DV_OUT idx | CONSTANT | Represents |
|------------|----------|-----------|
| 0 | OVERHEAD_ZONE1_DV_OUT | Zone-1 heat-ON status (1 when OP20 ON) → `overhead_zone1_stat` |
| 1 | OVERHEAD_ZONE2_DV_OUT | Zone-2 heat-ON status (mirrors OP21) → `overhead_zone2_stat` |
| 2 | OVERHEAD_ZONE3_DV_OUT | Zone-3 heat-ON status (mirrors OP22) → `overhead_zone3_stat` |

`DV_OUT(n)` is set to 1/0 in lock-step with the physical overhead heater `OP`; it is
a display/status flag, not a physical actuator. Loop `FOR indx=0 TO 5: DV_OUT=OFF`
clears them at start.

---

## E. AXES (MC_CONFIG.MCC + master)

`SERVO_PERIOD = 1000` µs (1 ms). Axes 0–3 = TRIO DX4, `DRIVE_MODE=1` (Position, mode 65).
Nip-roll (axis 4) analog-controlled (own E-Stop, not EtherCAT-shutdown); mixer axis 5
runs Infranor Xtrapuls open-speed (mode 68, commented) — controlled via AOUT/EtherCAT DAC.

| Axis | CONSTANT | Device | DRIVE_PROFILE | EncoderCount | GearRatio | Default speed |
|------|----------|--------|---------------|--------------|-----------|---------------|
| 0 | AXIS_TRAVERSE | Traverse | 1003 | 8388607 | 5 (pulley dia 2.631496) | 4 in/sec |
| 1 | AXIS_PUMP_A | Pump A | 1001 | 1048576 | 10 | 10 rpm |
| 2 | AXIS_PUMP_B | Pump B | 1004 | 8388607 | 10 | 10 rpm |
| 3 | AXIS_PUMP_C | Pump C (kicker) | 1002 | 8388607 | 1 | 10 rpm |
| 4 | AXIS_NIPROLL | Nip roll (analog/VFD) | — (mode commented) | 2048 ppr (8192 quad) | 244.7 (dia 15.71655) | 1 in/min |
| 5 | AXIS_MIXER | Mixer (open speed loop) | — | 8388607 (unused) | 1 | 8000 rpm |

Pump max = `PumpMaxRPM 200`. Mixer: `mixer_dac_max 2048`, `mixer_max_speed 18000`.
Following-error ranges/limits per axis: Traverse .1/.2 (RSLimit −10), Pumps A/B/C .1/.2, Mixer .1/.1, NipRoll .1/.2.

---

## F. SENSOR → VR

### Temperatures
| Sensor | Display VR (°F) | Control PV VR | From DV_IN |
|--------|-----------------|---------------|-----------|
| Overhead zone 1 | 571 Overhead_Heater_Temp_Zone1 | 1140 overhead_zone1_offon_pv | 5 |
| Overhead zone 2 | 572 Overhead_Heater_Temp_Zone2 | 1240 overhead_zone2_offon_pv | 6 |
| Overhead zone 3 | 573 Overhead_Heater_Temp_Zone3 | 1340 overhead_zone3_offon_pv | 7 |
| Mixer head | 2003 Mixer_Head_Temp | 1940 mixer_head_offon_pv | 2 |
| Mixer delta-P A | 2001 Mixer_DeltaP_A_Temp | 1740 mixer_deltapa_offon_pv | 0 |
| Mixer delta-P B | 2002 Mixer_DeltaP_B_Temp | 1840 mixer_deltapb_offon_pv | 1 |

### Flow-meter VR blocks (Modbus TCP; meter reg = Trio VR − 1)
Pump A start `PumpA_Meter_Start_Word=601` (handle 600); Pump B `=631` (handle 630).
Offsets identical for both blocks:

| Offset | A / B VR | Field |
|--------|----------|-------|
| +0 | 601 / 631 | Meter_Error |
| +1 | 602 / 632 | Mass_Flow_GperSec (no implied decimal, post-2025 meter) |
| +2 | 603 / 633 | Density (x.xx) |
| +3 | 604 / 634 | Temperature (x.x) |
| +4 | 605 / 635 | Mass_Flow_GalperHr (x.xx) |
| +5 | 606 / 636 | Viscosity (x.xx) |
| +6 | 607 / 637 | (legacy Mass_Total; new meter reads reg 10 kg → VR 620/650 instead) |
| +7 | 608 / 638 | Modbus_Open_Error |
| +8 | 609 / 639 | Modbus_Read_Error |
| +9 | 610 / 640 | Flow_Ave |
| +10 | 611 / 641 | Calibrated_grPerSecPerRPM |
| +11 | 612 / 642 | Calibrated_galPerHrPerRPM |
| +12 | 613 / 643 | Flow_Short_Ave |
| +13 | 614 / 644 | Meter_Error_Count |

Lifetime totals: `PumpA_Meter_Total_VR=620`, `PumpB_Meter_Total_VR=650` (kg, meter reg 10).
Pump C has no flow meter (kicker pump).

---

## G. PLANT COUPLING (Phase-1 simulator — most important)

### Heater OP → temperature sensor DV_IN
When the OP is **ON**, drive the paired `DV_IN` up (heating); when **OFF**, let it decay
(cooling). `DV_IN` units = degC*100; deadband control acts on the °F PV.

| Heater OP | Output CONSTANT | Sensor DV_IN idx | Sensor CONSTANT | Temp display VR | Control PV VR |
|-----------|-----------------|------------------|-----------------|-----------------|---------------|
| 20 | out_preoverhead_zone1_tc | **5** | AnalogIn_Overhead_Heater_1 (alias `analogin_overhead_heat_zone1_tc`) | 571 | 1140 |
| 21 | out_preoverhead_zone2_hose_tc | **6** | AnalogIn_Overhead_Heater_2 (alias `..._zone2_tc`) | 572 | 1240 |
| 22 | out_preoverhead_zone3_hose_tc | **7** | AnalogIn_Overhead_Heater_3 (alias `..._zone3_tc`) | 573 | 1340 |
| 9  | out_mixer_head_tc | **2** | AnalogIn_Mixhead_RTD | 2003 | 1940 |
| 7  | out_mixer_deltap_a_tc | **0** | AnalogIn_Mixhead_DeltaP_A_RTD | 2001 | 1740 |
| 8  | out_mixer_deltap_b_tc | **1** | AnalogIn_Mixhead_DeltaP_B_RTD | 2002 | 1840 |

Kevlar heater has **no on/off OP and no sensor** — open-loop analog only via AOUT(7)
(0–100 % → 0–2048).

### Pump axis MSPEED → flow-meter VR
Flow rises with pump `MSPEED` (rpm): `g/sec ≈ MSPEED * Calibrated_grPerSecPerRPM`;
`gal/hr = MSPEED * pumpX_gallons_per_rev` (PUMPS_RUN pump_status).

| Pump axis | MSPEED source | Mass-flow VR (g/sec) | Gal/hr VR | Cal factor VR |
|-----------|---------------|----------------------|-----------|---------------|
| 1 (Pump A) | MSPEED AXIS(1) | 602 PumpA_Meter_Mass_Flow_GperSec (+ Flow_Ave 610) | 61 PumpA_Actual_GPH_VR | 611 grPerSecPerRPM |
| 2 (Pump B) | MSPEED AXIS(2) | 632 PumpB_Meter_Mass_Flow_GperSec (+ Flow_Ave 640) | 62 PumpB_Actual_GPH_VR | 641 grPerSecPerRPM |
| 3 (Pump C) | MSPEED AXIS(3) | — (no meter) | 63 PumpC_Actual_GPH_VR | — |

Pump B/C speeds ratio-follow Pump A (`b_to_a_pumping_ratio * pumpb_mix_ratio`, etc.)
when flow meters are off; with `use_flow_meters=1` Pump B is PID-driven from its meter.
