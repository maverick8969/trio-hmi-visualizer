// ============================================================
// binding-engine.js — Parse and evaluate mcsource expressions
// ============================================================

/**
 * Parse a binding mcsource expression and return an evaluator object:
 * { evaluate(store) -> value, dependencies: string[], write(store, value) }
 */
function parseBinding(mcsource) {
  if (!mcsource) return null;
  const src = mcsource.trim();

  // Pattern: Simple VR — "VR:591" or "VR(591)"
  let m = src.match(/^VR[:(](\d+)\)?$/);
  if (m) {
    const idx = parseInt(m[1]);
    return {
      evaluate: (store) => store.getVR(idx),
      write: (store, val) => store.setVR(idx, parseFloat(val) || 0),
      dependencies: ['VR:' + idx],
      type: 'vr',
      vrIndex: idx
    };
  }

  // Pattern: VR bit access — "VR(5000).1"
  m = src.match(/^VR\((\d+)\)\.(\d+)$/);
  if (m) {
    const idx = parseInt(m[1]);
    const bit = parseInt(m[2]);
    return {
      evaluate: (store) => store.getVRBit(idx, bit),
      write: (store, val) => store.setVRBit(idx, bit, val ? 1 : 0),
      dependencies: ['VR:' + idx],
      type: 'vr_bit'
    };
  }

  // Pattern: VR with arithmetic — "VR(635)/100", "VR(604)/10"
  m = src.match(/^VR\((\d+)\)\s*([+\-*/])\s*([\d.]+)$/);
  if (m) {
    const idx = parseInt(m[1]);
    const op = m[2];
    const operand = parseFloat(m[3]);
    return {
      evaluate: (store) => {
        const v = store.getVR(idx);
        switch (op) {
          case '/': return v / operand;
          case '*': return v * operand;
          case '+': return v + operand;
          case '-': return v - operand;
        }
        return v;
      },
      write: null,
      dependencies: ['VR:' + idx],
      type: 'vr_expr'
    };
  }

  // Pattern: VR subtraction — "VR(102)-VR(537)"
  m = src.match(/^VR\((\d+)\)\s*-\s*VR\((\d+)\)$/);
  if (m) {
    const idx1 = parseInt(m[1]);
    const idx2 = parseInt(m[2]);
    return {
      evaluate: (store) => store.getVR(idx1) - store.getVR(idx2),
      write: null,
      dependencies: ['VR:' + idx1, 'VR:' + idx2],
      type: 'vr_expr'
    };
  }

  // Pattern: PROGRAM variable — "PROGRAM:varname:page:-1"
  m = src.match(/^PROGRAM:([^:]+):([^:]+):-?\d+$/);
  if (m) {
    const varname = m[1];
    const page = m[2];
    return {
      evaluate: (store) => store.getProgram(varname, page),
      write: (store, val) => store.setProgram(varname, page, val),
      dependencies: ['PROGRAM:' + varname + ':' + page],
      type: 'program',
      varname: varname,
      page: page
    };
  }

  // Pattern: TABLE — "TABLE:0", "TABLE:20"
  m = src.match(/^TABLE:(\d+)$/);
  if (m) {
    const idx = parseInt(m[1]);
    return {
      evaluate: (store) => store.getTable(idx),
      write: null,
      dependencies: ['TABLE:' + idx],
      type: 'table'
    };
  }

  // Pattern: READ_OP — "READ_OP:11" or "READ_OP(11)"
  m = src.match(/^READ_OP[:(](\d+)\)?$/);
  if (m) {
    const idx = parseInt(m[1]);
    return {
      evaluate: (store) => store.getReadOp(idx),
      write: null,
      dependencies: ['READ_OP:' + idx],
      type: 'read_op'
    };
  }

  // Pattern: Boolean/comparison expressions with VR
  // e.g., "VR(547) = 1 AND (VR(608) = 1 OR VR(609) = 1)"
  // e.g., "VR(608) = 1 OR VR(609) = 1 OR VR(638) = 1 OR VR(639) = 1"
  if (src.includes(' AND ') || src.includes(' OR ') || /VR\(\d+\)\s*[=<>]/.test(src)) {
    return parseBooleanExpression(src);
  }

  // Pattern: REMAIN AXIS, MTYPE, IN() — unsupported, use custom store
  // Pattern: LOOKUP(...) — unsupported, use custom store
  return {
    evaluate: (store) => store.getCustom(src),
    write: (store, val) => store.setCustom(src, val),
    dependencies: ['CUSTOM:' + src],
    type: 'custom',
    rawSource: src
  };
}

/**
 * Parse boolean/comparison expressions.
 */
function parseBooleanExpression(src) {
  const vrRefs = [];
  const vrRegex = /VR\((\d+)\)/g;
  let match;
  while ((match = vrRegex.exec(src)) !== null) {
    vrRefs.push(parseInt(match[1]));
  }

  return {
    evaluate: (store) => {
      try {
        // Replace VR(n) with actual values
        let expr = src.replace(/VR\((\d+)\)\.(\d+)/g, (_, idx, bit) => {
          return String(store.getVRBit(parseInt(idx), parseInt(bit)));
        });
        expr = expr.replace(/VR\((\d+)\)/g, (_, idx) => {
          return String(store.getVR(parseInt(idx)));
        });
        // Replace operators for JS evaluation
        expr = expr.replace(/\bAND\b/g, '&&');
        expr = expr.replace(/\bOR\b/g, '||');
        expr = expr.replace(/\bNOT\b/g, '!');
        expr = expr.replace(/\bfalse\b/gi, '0');
        expr = expr.replace(/\btrue\b/gi, '1');
        // Replace = with == (but not ==)
        expr = expr.replace(/(?<!=)=(?!=)/g, '==');
        // Replace <> with !=
        expr = expr.replace(/<>/g, '!=');
        // Evaluate
        return Function('"use strict"; return (' + expr + ')')() ? 1 : 0;
      } catch (e) {
        return 0;
      }
    },
    write: null,
    dependencies: vrRefs.map(i => 'VR:' + i),
    type: 'boolean_expr'
  };
}

/**
 * Set up a binding between a component property and the VR store.
 * Returns an unsubscribe function.
 */
function setupBinding(bindingInfo, store, updateFn) {
  if (!bindingInfo || !bindingInfo.mcsource) return null;
  const evaluator = parseBinding(bindingInfo.mcsource);
  if (!evaluator) return null;

  // Initial evaluation
  try {
    updateFn(evaluator.evaluate(store));
  } catch (e) { /* ignore */ }

  // Subscribe to changes
  const unsubs = [];
  if (evaluator.dependencies) {
    evaluator.dependencies.forEach(dep => {
      unsubs.push(store.subscribe(dep, () => {
        try { updateFn(evaluator.evaluate(store)); } catch (e) { /* ignore */ }
      }));
    });
  }

  return {
    evaluator: evaluator,
    unsubscribe: () => unsubs.forEach(fn => fn())
  };
}
