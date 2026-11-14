// ============================================================
// vr-store.js — Reactive VR register simulation store
// ============================================================

class VRStore {
  constructor() {
    this._vr = {};           // VR index -> numeric value
    this._tables = {};       // TABLE index -> array of values
    this._programs = {};     // "varname:page" -> value
    this._readOps = {};      // index -> value
    this._custom = {};       // raw mcsource key -> value (for unsupported bindings)
    this._listeners = {};    // source key -> Set<callback>
    this._vrMeta = {};       // VR index -> { desc, pages }
  }

  // --- VR registers ---
  getVR(index) {
    return this._vr[index] !== undefined ? this._vr[index] : 0;
  }

  setVR(index, value, silent) {
    this._vr[index] = value;
    if (!silent) this._notify('VR:' + index);
  }

  getVRBit(index, bit) {
    return (Math.floor(this.getVR(index)) >> bit) & 1;
  }

  setVRBit(index, bit, val) {
    let v = Math.floor(this.getVR(index));
    if (val) {
      v |= (1 << bit);
    } else {
      v &= ~(1 << bit);
    }
    this.setVR(index, v);
  }

  toggleVRBit(index, bit) {
    this.setVRBit(index, bit, this.getVRBit(index, bit) ? 0 : 1);
  }

  // --- TABLE data ---
  getTable(index) {
    return this._tables[index] || [];
  }

  setTable(index, data) {
    this._tables[index] = data;
    this._notify('TABLE:' + index);
  }

  // --- PROGRAM variables ---
  getProgram(varname, page) {
    const key = varname + ':' + page;
    return this._programs[key] !== undefined ? this._programs[key] : 0;
  }

  setProgram(varname, page, value) {
    const key = varname + ':' + page;
    this._programs[key] = value;
    this._notify('PROGRAM:' + key);
  }

  // --- READ_OP ---
  getReadOp(index) {
    return this._readOps[index] !== undefined ? this._readOps[index] : 0;
  }

  setReadOp(index, value) {
    this._readOps[index] = value;
    this._notify('READ_OP:' + index);
  }

  // --- Custom (fallback for unsupported expressions) ---
  getCustom(key) {
    return this._custom[key] !== undefined ? this._custom[key] : 0;
  }

  setCustom(key, value) {
    this._custom[key] = value;
    this._notify('CUSTOM:' + key);
  }

  // --- Observer pattern ---
  subscribe(sourceKey, callback) {
    if (!this._listeners[sourceKey]) this._listeners[sourceKey] = new Set();
    this._listeners[sourceKey].add(callback);
    return () => this._listeners[sourceKey].delete(callback);
  }

  // Subscribe to all changes
  subscribeAll(callback) {
    if (!this._listeners['*']) this._listeners['*'] = new Set();
    this._listeners['*'].add(callback);
    return () => this._listeners['*'].delete(callback);
  }

  _notify(sourceKey) {
    const listeners = this._listeners[sourceKey];
    if (listeners) listeners.forEach(fn => fn(sourceKey));
    const all = this._listeners['*'];
    if (all) all.forEach(fn => fn(sourceKey));
  }

  // --- Metadata for VR panel ---
  registerVRUsage(index, desc, page) {
    if (!this._vrMeta[index]) {
      this._vrMeta[index] = { desc: desc, pages: new Set() };
    }
    this._vrMeta[index].pages.add(page);
    if (desc && !this._vrMeta[index].desc) {
      this._vrMeta[index].desc = desc;
    }
  }

  getVRMeta() {
    return this._vrMeta;
  }

  getAllVRIndices() {
    const indices = new Set([
      ...Object.keys(this._vr).map(Number),
      ...Object.keys(this._vrMeta).map(Number)
    ]);
    return [...indices].sort((a, b) => a - b);
  }

  // Notify all VR listeners (for bulk refresh)
  notifyAll() {
    for (const key of Object.keys(this._listeners)) {
      const listeners = this._listeners[key];
      if (listeners) listeners.forEach(fn => fn(key));
    }
  }
}

// Global singleton
const vrStore = new VRStore();
