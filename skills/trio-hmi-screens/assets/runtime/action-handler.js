// ============================================================
// action-handler.js — Handle HMI event actions
// ============================================================

/**
 * Parse and execute an action string from a TGD event.
 * Actions: GotoPage, Exec, VS, OpenKeyPad, LOOKUP
 */
function executeAction(actionStr, comp, appRef) {
  if (!actionStr) return;
  const parts = actionStr.split(';');
  const type = parts[0];

  switch (type) {
    case 'GotoPage':
      if (appRef && parts[1]) {
        appRef.navigateToPage(parts[1]);
      }
      break;

    case 'Exec':
      if (parts[1]) {
        executeExec(parts[1]);
      }
      break;

    case 'VS':
      if (parts[1]) {
        executeVS(parts[1], parts[2]);
      }
      break;

    case 'OpenKeyPad':
      if (appRef && parts[1] && parts[2]) {
        appRef.showKeypad(parts[1], parts[2], comp);
      }
      break;

    default:
      // LOOKUP and other unsupported actions — log
      console.log('Unsupported action:', actionStr);
  }
}

/**
 * Execute an Exec action expression.
 * Examples:
 *   "VR(5010).2=1"            — set bit 2 of VR 5010 to 1
 *   "VR(5010).2=0"            — set bit 2 of VR 5010 to 0
 *   "VR(192).0=(VR(192).0 = 0)"  — toggle bit 0 of VR 192
 *   "VR(549).0=(VR(549).0 = 0)"  — toggle
 *   "VR(2).0=1"               — set bit 0 of VR 2 to 1
 */
function executeExec(expr) {
  // Toggle pattern: VR(N).B=(VR(N).B = 0)
  let m = expr.match(/^VR\((\d+)\)\.(\d+)=\(VR\(\d+\)\.\d+ = 0\)$/);
  if (m) {
    vrStore.toggleVRBit(parseInt(m[1]), parseInt(m[2]));
    return;
  }

  // Set bit pattern: VR(N).B=V
  m = expr.match(/^VR\((\d+)\)\.(\d+)=(\d+)$/);
  if (m) {
    vrStore.setVRBit(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
    return;
  }

  // Set VR value: VR(N)=V
  m = expr.match(/^VR\((\d+)\)=([\d.]+)$/);
  if (m) {
    vrStore.setVR(parseInt(m[1]), parseFloat(m[2]));
    return;
  }

  // General assignment: VR(N)=<expr> or VR(N).B=<expr>
  // e.g. "VR(20)=VR(20)+1", "VR(30)=VR(31)*2"
  m = expr.match(/^\s*VR\((\d+)\)(?:\.(\d+))?\s*=(.+)$/);
  if (m) {
    try {
      const val = compileExpression(m[3])(vrStore);
      if (m[2] !== undefined) vrStore.setVRBit(parseInt(m[1]), parseInt(m[2]), val ? 1 : 0);
      else vrStore.setVR(parseInt(m[1]), val);
      return;
    } catch (e) { /* fall through */ }
  }

  // OP pattern: OP(N,READ_OP(N)=V) — log as unsupported
  console.log('Unsupported Exec:', expr);
}

/**
 * Execute a VS (Variable/Signal) action.
 * Examples:
 *   VS;PROGRAM:save_recipe:RECIPES:-1;1
 *   VS;VR:543;1
 */
function executeVS(target, value) {
  const val = value !== undefined ? parseFloat(value) : 1;

  // VR target
  let m = target.match(/^VR[:(](\d+)\)?$/);
  if (m) {
    vrStore.setVR(parseInt(m[1]), val);
    return;
  }

  // PROGRAM target
  m = target.match(/^PROGRAM:([^:]+):([^:]+):-?\d+$/);
  if (m) {
    vrStore.setProgram(m[1], m[2], val);
    return;
  }

  console.log('Unsupported VS target:', target, value);
}
