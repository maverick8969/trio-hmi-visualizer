// ============================================================
// trio-plant.js — Simple, tunable plant physics
// ------------------------------------------------------------
// First-order models coupling controller outputs to sensors:
//   * Heater zones: each heater OP drives a thermal mass (°C). ON =>
//     heat toward a ceiling; OFF => Newtonian cooling toward ambient.
//     The zone temperature is published where the control code reads it:
//       - mixer head / deltaP A/B  -> DV_IN(2/0/1)  (code derives °F PV)
//       - overhead zones 1/2/3     -> control PV VR 1140/1240/1340 in °F
//         (these arrive via EtherCAT PDO mapping on the real controller),
//         and also DV_IN(5/6/7) for completeness.
//   * Pump flow: mass-flow (g/sec) tracks pump-axis MSPEED via a cal
//     factor, published to the flow-meter VRs (602/632 + flow-ave).
//
// All rate constants live in `params` so the UI can tune them live.
// Reads/writes go through the machine (VRs, OP, DV_IN, axis MSPEED).
// ============================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TrioPlant = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const F = (c) => c * 1.8 + 32;        // °C -> °F
  const CtoCenti = (c) => c * 100;      // °C -> centi-°C (DV_IN raw units)

  // Heater zones: op = driving digital output, dvIn = sensor device channel,
  // pvVr = control-PV VR the code reads directly (null if via DV_IN only).
  const ZONES = [
    { key: 'overhead1', label: 'Overhead Zone 1', op: 20, dvIn: 5, pvVr: 1140 },
    { key: 'overhead2', label: 'Overhead Zone 2', op: 21, dvIn: 6, pvVr: 1240 },
    { key: 'overhead3', label: 'Overhead Zone 3', op: 22, dvIn: 7, pvVr: 1340 },
    { key: 'mixhead', label: 'Mixer Head', op: 9, dvIn: 2, pvVr: null },
    { key: 'deltapA', label: 'Mixer ΔP A', op: 7, dvIn: 0, pvVr: null },
    { key: 'deltapB', label: 'Mixer ΔP B', op: 8, dvIn: 1, pvVr: null },
  ];

  // Pump flow: axis -> flow-meter VRs.
  const PUMPS = [
    { key: 'pumpA', label: 'Pump A', axis: 1, flowVr: 602, aveVr: 610, calVr: 611 },
    { key: 'pumpB', label: 'Pump B', axis: 2, flowVr: 632, aveVr: 640, calVr: 641 },
  ];

  // Fixed VR / channel layout for the nip-roll Optidrive and mixer VFD.
  const NIP = {
    ctrlWord: 5010, statusWord: 5000, statusSpeed: 5001, speedRef: 5011,
    speedSetptVr: 71, inPerMinHzVr: 590, axis: 4,
    bitRun: 0, bitFastStop: 1, bitFaultReset: 2, bitCoastStop: 3, bitFault: 1, // status fault bit
  };
  const MIXER = {
    runOp: 0, speedSpVr: 550, refSpeedVr: 565, aoutSpeed: 6, ainFeedback: 8,
    dacMax: 2048, maxSpeed: 18000, axis: 5,
  };

  // Recipe TABLE layout (from START_AND_SET_VARIABLES): 20 rows x 16 items,
  // stored column-major so recipe row R item i lives at TABLE(R + 20*i).
  const RECIPE_ROWS = 20, RECIPE_ITEMS = 16;
  // Each recipe: [Recipe_No, pumpA_rpm, pumpB_ratio, pumpC_ratio, traverse_speed,
  //   accel, decel, pinchroll_speed, zone_ctrl, zone_end_pct, zone1_trav,
  //   zone_pump_ctrl, zone1_pump_pct, zone2_pump_pct, zone3_trav, zone3_pump_pct]
  const DEFAULT_RECIPES = [
    [1, 40, 0.8, 0, 25, 50, 50, 30, 0, 25, 8, 0, 120, 80, 8, 120],
    [2, 60, 1.0, 0, 35, 60, 60, 40, 1, 25, 10, 1, 120, 80, 10, 120],
    [3, 80, 1.2, 0, 45, 70, 70, 50, 0, 30, 12, 0, 110, 90, 12, 110],
  ];

  class TrioPlant {
    constructor(machine, opts) {
      this.m = machine;
      opts = opts || {};
      this.params = Object.assign({
        ambientC: 21,          // ~70 °F ambient
        heatRateCPerSec: 3.0,  // heater-on temperature rise (°C/s)
        coolK: 0.012,          // Newtonian cooling constant (per s)
        heatCeilingC: 260,     // max attainable zone temperature
        flowGperSecPerRPM: 0.5,// pump mass-flow cal (g/sec per rpm)
        flowNoise: 0.0,        // optional flow noise amplitude (g/sec)
      }, opts.params || {});
      // per-zone thermal state
      this.zones = ZONES.map(z => Object.assign({ tempC: this.params.ambientC }, z));
      this.pumps = PUMPS.map(pp => Object.assign({ flow: 0 }, pp));
      // nip-roll drive + mixer VFD state
      this.nip = { running: false, speed: 0, speedRef: 0, fault: false };
      this.mixer = { running: false, rpm: 0, cmdRpm: 0, feedbackDac: 0 };
      this.speedPerDac = MIXER.maxSpeed / MIXER.dacMax; // 18000/2048 rpm per DAC count
      this.dacPerSpeed = MIXER.dacMax / MIXER.maxSpeed;
      // seed sensor VRs so control "sensor present" gates pass at boot
      this.publishSensors();
      // seed pump flow cal factors so flow is non-zero without meter comms
      for (const pp of this.pumps) this.m.setVr(pp.calVr, this.params.flowGperSecPerRPM);
      // Seed TABLE recipe memory (represents the flash-stored recipes the real
      // controller loads via FLASHTABLE, which is a no-op stub here). RECIPES.BAS
      // reads column-major: recipe row R, item i -> TABLE(R + 20*i) -> VR(100+i).
      if (opts.seedRecipes !== false) TrioPlant.seedRecipes(this.m, opts.recipes || DEFAULT_RECIPES);
    }

    step(dtMs) {
      const dt = dtMs / 1000;
      const P = this.params;
      // Thermal zones
      for (const z of this.zones) {
        const on = this.m.readOp(z.op) === 1;
        if (on) {
          // approach ceiling (mild saturation) when energized
          const headroom = Math.max(0, (P.heatCeilingC - z.tempC) / P.heatCeilingC);
          z.tempC += P.heatRateCPerSec * dt * (0.15 + 0.85 * headroom);
        } else {
          z.tempC += -P.coolK * (z.tempC - P.ambientC) * dt;
        }
        if (z.tempC < -50) z.tempC = -50;
      }
      // Pump flow
      for (const pp of this.pumps) {
        const rpm = Math.abs(this.m.getAxisParam(pp.axis, 'MSPEED'));
        pp.flow = rpm * P.flowGperSecPerRPM;
      }
      this.stepNip(dt);
      this.stepMixer(dt);
      this.publishSensors();
    }

    // --- Nip-roll Optidrive VFD (EtherCAT PDO model) ---
    // Reads the control word (VR5010) + speed reference (VR5011), drives the
    // nip axis, and publishes the status word (VR5000 running/fault) and speed
    // feedback (VR5001) back as the drive would over its PDO.
    stepNip(dt) {
      const m = this.m;
      const ctrl = Math.floor(m.getVr(NIP.ctrlWord));
      const run = (ctrl & (1 << NIP.bitRun)) && !(ctrl & (1 << NIP.bitFastStop)) && !(ctrl & (1 << NIP.bitCoastStop)) && !this.nip.fault;
      const setpt = m.getVr(NIP.speedSetptVr);          // in/min
      const target = run ? setpt : 0;
      this.nip.speed += (target - this.nip.speed) * Math.min(1, dt * 3);
      this.nip.running = !!run;
      m.axes[NIP.axis].mspeed = this.nip.speed;
      let status = Math.floor(m.getVr(NIP.statusWord));
      if (run) status |= (1 << NIP.bitRun); else status &= ~(1 << NIP.bitRun);
      if (this.nip.fault) status |= (1 << NIP.bitFault); else if (!run) status &= ~(1 << NIP.bitFault);
      m.setVr(NIP.statusWord, status);
      this.nip.speedRef = m.getVr(NIP.speedRef);
      m.setVr(NIP.statusSpeed, run ? this.nip.speedRef : 0);
    }

    // --- Mixer VFD (analog) ---
    // AOUT(6) is the speed-reference DAC; when Out_MixerRun (OP0) is on the
    // spindle spins up to the commanded rpm, and AIN(8) is driven as the speed
    // feedback the code reads back into mixer_reference_speed.
    stepMixer(dt) {
      const m = this.m;
      this.mixer.running = m.readOp(MIXER.runOp) === 1;
      this.mixer.cmdRpm = m.getAout(MIXER.aoutSpeed) * this.speedPerDac;
      const target = this.mixer.running ? this.mixer.cmdRpm : 0;
      this.mixer.rpm += (target - this.mixer.rpm) * Math.min(1, dt * 2);
      m.axes[MIXER.axis].mspeed = this.mixer.rpm;
      this.mixer.feedbackDac = this.mixer.rpm * this.dacPerSpeed; // zero_offset baseline 0
      m.setAin(MIXER.ainFeedback, this.mixer.feedbackDac);
    }

    publishSensors() {
      for (const z of this.zones) {
        this.m.setDvIn(z.dvIn, CtoCenti(z.tempC));
        if (z.pvVr != null) this.m.setVr(z.pvVr, F(z.tempC)); // PDO-mapped control PV (°F)
      }
      for (const pp of this.pumps) {
        this.m.setVr(pp.flowVr, pp.flow);
        this.m.setVr(pp.aveVr, pp.flow);
      }
    }

    // ---- introspection / tuning for UI ----
    getZoneTemps() { return this.zones.map(z => ({ key: z.key, label: z.label, tempC: z.tempC, tempF: F(z.tempC), on: this.m.readOp(z.op) === 1 })); }
    getPumpFlows() { return this.pumps.map(pp => ({ key: pp.key, label: pp.label, rpm: Math.abs(this.m.getAxisParam(pp.axis, 'MSPEED')), flow: pp.flow })); }
    getDrives() {
      const m = this.m;
      return {
        nip: {
          running: this.nip.running, speed: this.nip.speed, speedRef: this.nip.speedRef,
          ctrl: Math.floor(m.getVr(NIP.ctrlWord)), status: Math.floor(m.getVr(NIP.statusWord)),
        },
        mixer: {
          running: this.mixer.running, rpm: this.mixer.rpm, cmdRpm: this.mixer.cmdRpm,
          aoutDac: m.getAout(MIXER.aoutSpeed), ainDac: this.mixer.feedbackDac,
        },
      };
    }
    setParam(k, v) { if (k in this.params) this.params[k] = v; }
  }

  // Write recipe rows into TABLE memory in the column-major layout RECIPES.BAS reads.
  TrioPlant.seedRecipes = function (machine, recipes) {
    for (let r = 0; r < recipes.length && r < RECIPE_ROWS; r++) {
      const rec = recipes[r];
      for (let i = 0; i < RECIPE_ITEMS; i++) machine.tableSet(r + RECIPE_ROWS * i, rec[i] || 0);
    }
  };

  TrioPlant.ZONES = ZONES;
  TrioPlant.PUMPS = PUMPS;
  TrioPlant.DEFAULT_RECIPES = DEFAULT_RECIPES;
  return TrioPlant;
});
