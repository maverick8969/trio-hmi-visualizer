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
      // seed sensor VRs so control "sensor present" gates pass at boot
      this.publishSensors();
      // seed pump flow cal factors so flow is non-zero without meter comms
      for (const pp of this.pumps) this.m.setVr(pp.calVr, this.params.flowGperSecPerRPM);
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
      this.publishSensors();
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
    setParam(k, v) { if (k in this.params) this.params[k] = v; }
  }

  TrioPlant.ZONES = ZONES;
  TrioPlant.PUMPS = PUMPS;
  return TrioPlant;
});
