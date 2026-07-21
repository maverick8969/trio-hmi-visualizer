// ============================================================
// trio-parser.js — Recursive-descent parser for TrioBASIC
// ------------------------------------------------------------
// Produces a flat statement list (each node carries .line) plus a
// label index. Design principle: the parser is permissive. Known
// keywords (IF/FOR/WHILE/REPEAT/GOTO/GOSUB/RETURN/WAIT/GLOBAL/
// CONSTANT/DIM/ON/PRINT/RUN/STOP/HALT) parse into structured nodes;
// everything else becomes an `assign` or `command` node whose
// semantics live in the runtime. This means an unrecognised motion
// or I/O command never breaks parsing — the runtime simply reports
// it as unimplemented.
//
// Node types:
//   label      {name}
//   global     {name, expr}            CONSTANT/GLOBAL share shape via `kind`
//   constant   {name, expr}
//   dim        {decls:[{name,dtype,size}]}
//   assign     {target, value}
//   command    {name, callArgs, axis, args}   axis = AXIS(expr) qualifier
//   if         {cond, then:[...], elifs:[{cond,body}], else:[...]|null, inline:bool}
//   for        {var, from, to, step, body:[...]}
//   while      {cond, body:[...]}
//   repeat     {body:[...], until}
//   goto       {label}       gosub {label}       return {}
//   waituntil  {cond}        waitloaded {mode:'LOADED'|'IDLE'}
//   onerror    {label}       print {port, items:[{expr,sep}]}
//   run        {name, proc}  stop {name|null}     halt {}
//   exitloop   {}
//
// Target (lvalue) node types: var, index (array/VR/DV_OUT/AOUT call),
//   axisparam (PARAM AXIS(e)), bit (base.field).
// Expression node types: num, str, var, call, axisparam, procparam,
//   bit, unary, binary, logical.
// ============================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(
    (typeof require === 'function') ? require('./trio-lexer.js') : root.TrioLexer
  );
  else root.TrioParser = factory(root.TrioLexer);
})(typeof self !== 'undefined' ? self : this, function (TrioLexer) {
  'use strict';

  const T = TrioLexer.T;

  // Keywords that lead a statement (dispatched specially).
  const LEAD = new Set(['IF', 'FOR', 'WHILE', 'REPEAT', 'GOTO', 'GOSUB', 'RETURN',
    'WAIT', 'GLOBAL', 'CONSTANT', 'DIM', 'ON', 'PRINT', 'RUN', 'STOP', 'HALT',
    'EXIT_LOOP', 'LOCAL']);
  // Words that terminate a statement list inside a block.
  const BLOCK_END = new Set(['ELSE', 'ELSEIF', 'ENDIF', 'NEXT', 'WEND', 'UNTIL']);

  class Parser {
    constructor(tokens, opts) {
      this.toks = tokens;
      this.pos = 0;
      this.errors = [];
      this.file = (opts && opts.file) || '';
    }

    peek(k) { return this.toks[this.pos + (k || 0)]; }
    next() { return this.toks[this.pos++]; }
    atEnd() { return this.peek().type === T.EOF; }

    err(msg, tok) {
      tok = tok || this.peek();
      this.errors.push({ file: this.file, line: tok ? tok.line : 0, col: tok ? tok.col : 0, message: msg });
    }

    // Uppercased value of an ID token (for keyword comparison), else null.
    kw(tok) { return (tok && tok.type === T.ID) ? tok.value.toUpperCase() : null; }
    isKw(word, k) { return this.kw(this.peek(k)) === word; }

    isOp(v, k) { const t = this.peek(k); return t && t.type === T.OP && t.value === v; }

    skipSeparators() {
      while (true) {
        const t = this.peek();
        if (t.type === T.NL || t.type === T.COLON) this.pos++;
        else break;
      }
    }

    // ---- top level ----
    parseProgram() {
      const stmts = [];
      this.skipSeparators();
      let guard = 0;
      while (!this.atEnd()) {
        const before = this.pos;
        const s = this.parseStatement(null);
        if (s) { if (Array.isArray(s)) stmts.push(...s); else stmts.push(s); }
        // Ensure forward progress even on a malformed line.
        if (this.pos === before) { this.recoverLine(); }
        this.skipSeparators();
        if (++guard > 1000000) { this.err('Parser guard tripped'); break; }
      }
      return { statements: stmts, errors: this.errors };
    }

    // Skip to the next newline after an error, to resync.
    recoverLine() {
      while (!this.atEnd() && this.peek().type !== T.NL && this.peek().type !== T.COLON) this.pos++;
    }

    // Parse a list of statements until one of `enders` (uppercased words)
    // appears at statement start, or EOF.
    parseBlock(enders) {
      const body = [];
      this.skipSeparators();
      while (!this.atEnd()) {
        const w = this.kw(this.peek());
        if (w && enders.has(w)) break;
        const before = this.pos;
        const s = this.parseStatement(enders);
        if (s) { if (Array.isArray(s)) body.push(...s); else body.push(s); }
        if (this.pos === before) { this.recoverLine(); }
        this.skipSeparators();
      }
      return body;
    }

    parseStatement(enders) {
      const t = this.peek();
      if (t.type === T.EOF) return null;

      // Label:  IDENT :
      if (t.type === T.ID && this.peek(1) && this.peek(1).type === T.COLON) {
        this.pos += 2; // consume IDENT and ':'
        return { type: 'label', name: t.value, line: t.line };
      }

      const w = this.kw(t);
      if (w && LEAD.has(w)) return this.parseKeyword(w, t);

      // Fallthrough: assignment or command.
      return this.parseAssignOrCommand();
    }

    parseKeyword(w, t) {
      switch (w) {
        case 'IF': return this.parseIf();
        case 'FOR': return this.parseFor();
        case 'WHILE': return this.parseWhile();
        case 'REPEAT': return this.parseRepeat();
        case 'GOTO': { this.next(); const id = this.next(); return { type: 'goto', label: id.value, line: t.line }; }
        case 'GOSUB': { this.next(); const id = this.next(); return { type: 'gosub', label: id.value, line: t.line }; }
        case 'RETURN': { this.next(); return { type: 'return', line: t.line }; }
        case 'EXIT_LOOP': { this.next(); return { type: 'exitloop', line: t.line }; }
        case 'WAIT': return this.parseWait();
        case 'ON': return this.parseOn();
        case 'PRINT': return this.parsePrint();
        case 'RUN': return this.parseRun();
        case 'STOP': return this.parseStop();
        case 'HALT': { this.next(); return { type: 'halt', line: t.line }; }
        case 'GLOBAL':
        case 'CONSTANT': return this.parseDeclare(w);
        case 'DIM':
        case 'LOCAL': return this.parseDim();
        default: return this.parseAssignOrCommand();
      }
    }

    // ---- declarations ----
    parseDeclare(kind) {
      const t = this.next(); // GLOBAL / CONSTANT
      const nameTok = this.peek();
      let name;
      if (nameTok.type === T.STR) { name = nameTok.value; this.next(); }
      else if (nameTok.type === T.ID) { name = nameTok.value; this.next(); }
      else { this.err('Expected name after ' + kind, nameTok); return null; }
      // optional comma between name and value; value may be omitted (defaults 0)
      if (this.peek().type === T.COMMA) this.next();
      let expr = null;
      if (this.peek().type !== T.NL && this.peek().type !== T.COLON && this.peek().type !== T.EOF) {
        expr = this.parseExpr();
      }
      return { type: kind === 'CONSTANT' ? 'constant' : 'global', name, expr, line: t.line };
    }

    parseDim() {
      const t = this.next(); // DIM/LOCAL
      const decls = [];
      do {
        const nameTok = this.peek();
        if (nameTok.type !== T.ID) { this.err('Expected variable name in DIM', nameTok); break; }
        this.next();
        let dtype = 'FLOAT', dims = [];
        if (this.isKw('AS')) {
          this.next();
          const ty = this.next();
          dtype = (ty && ty.type === T.ID) ? ty.value.toUpperCase() : 'FLOAT';
          if (this.peek().type === T.LPAREN) dims = this.parseArgList(); // supports (n) and (rows,cols)
        } else if (this.peek().type === T.LPAREN) {
          // DIM name(size[,size...]) without AS
          dims = this.parseArgList();
        }
        // size = first (primary) dimension expression; dims retains all.
        decls.push({ name: nameTok.value, dtype, size: dims.length ? dims[0] : 0, dims });
      } while (this.peek().type === T.COMMA && this.next());
      return { type: 'dim', decls, line: t.line };
    }

    // ---- control flow ----
    parseIf() {
      const t = this.next(); // IF
      const cond = this.parseExpr();
      if (this.isKw('THEN')) this.next(); else this.err("Expected THEN", this.peek());
      // Inline vs block: if the next token is a newline/colon/EOF -> block.
      const nt = this.peek();
      if (nt.type === T.NL || nt.type === T.COLON || nt.type === T.EOF) {
        // Block IF
        const thenBody = this.parseBlock(BLOCK_END);
        const elifs = [];
        let elseBody = null;
        while (this.isKw('ELSEIF')) {
          this.next();
          const c = this.parseExpr();
          if (this.isKw('THEN')) this.next();
          const b = this.parseBlock(BLOCK_END);
          elifs.push({ cond: c, body: b });
        }
        if (this.isKw('ELSE')) {
          this.next();
          elseBody = this.parseBlock(BLOCK_END);
        }
        if (this.isKw('ENDIF')) this.next(); else this.err('Expected ENDIF', this.peek());
        return { type: 'if', cond, then: thenBody, elifs, else: elseBody, inline: false, line: t.line };
      } else {
        // Inline IF: statements until NL, optional ELSE on same line.
        const thenBody = this.parseInlineStatements();
        let elseBody = null;
        if (this.isKw('ELSE')) {
          this.next();
          elseBody = this.parseInlineStatements();
        }
        return { type: 'if', cond, then: thenBody, elifs: [], else: elseBody, inline: true, line: t.line };
      }
    }

    // Statements on the remainder of a single logical line (for inline IF),
    // separated by ':' , terminated by NL/EOF or ELSE.
    parseInlineStatements() {
      const list = [];
      while (true) {
        const t = this.peek();
        if (t.type === T.NL || t.type === T.EOF) break;
        if (this.kw(t) === 'ELSE') break;
        if (t.type === T.COLON) { this.next(); continue; }
        const before = this.pos;
        const s = this.parseStatement(BLOCK_END);
        if (s) { if (Array.isArray(s)) list.push(...s); else list.push(s); }
        if (this.pos === before) { this.recoverLine(); break; }
      }
      return list;
    }

    parseFor() {
      const t = this.next(); // FOR
      const varTok = this.next();
      if (this.isOp('=')) this.next(); else this.err('Expected = in FOR', this.peek());
      const from = this.parseExpr();
      if (this.isKw('TO')) this.next(); else this.err('Expected TO in FOR', this.peek());
      const to = this.parseExpr();
      let step = null;
      if (this.isKw('STEP')) { this.next(); step = this.parseExpr(); }
      const body = this.parseBlock(BLOCK_END);
      if (this.isKw('NEXT')) { this.next(); if (this.peek().type === T.ID) this.next(); }
      else this.err('Expected NEXT', this.peek());
      return { type: 'for', var: varTok.value, from, to, step, body, line: t.line };
    }

    parseWhile() {
      const t = this.next();
      const cond = this.parseExpr();
      const body = this.parseBlock(BLOCK_END);
      if (this.isKw('WEND')) this.next(); else this.err('Expected WEND', this.peek());
      return { type: 'while', cond, body, line: t.line };
    }

    parseRepeat() {
      const t = this.next();
      const body = this.parseBlock(BLOCK_END);
      let until = null;
      if (this.isKw('UNTIL')) { this.next(); until = this.parseExpr(); }
      else this.err('Expected UNTIL', this.peek());
      return { type: 'repeat', body, until, line: t.line };
    }

    parseWait() {
      const t = this.next(); // WAIT
      if (this.isKw('UNTIL')) { this.next(); return { type: 'waituntil', cond: this.parseExpr(), line: t.line }; }
      if (this.isKw('LOADED')) { this.next(); return { type: 'waitloaded', mode: 'LOADED', line: t.line }; }
      if (this.isKw('IDLE')) { this.next(); return { type: 'waitloaded', mode: 'IDLE', line: t.line }; }
      // WAIT UNTIL missing keyword? treat remainder as condition.
      return { type: 'waituntil', cond: this.parseExpr(), line: t.line };
    }

    parseOn() {
      const t = this.next(); // ON
      if (this.isKw('BASICERROR')) {
        this.next();
        if (this.isKw('GOTO')) { this.next(); const id = this.next(); return { type: 'onerror', label: id.value, line: t.line }; }
        if (this.isKw('GOSUB')) { this.next(); const id = this.next(); return { type: 'onerror', label: id.value, gosub: true, line: t.line }; }
      }
      // Unhandled ON ... form -> skip the line, record as command noop.
      this.recoverLine();
      return { type: 'command', name: 'ON', callArgs: [], axis: null, args: [], line: t.line, raw: true };
    }

    parsePrint() {
      const t = this.next(); // PRINT
      let port = null;
      if (this.peek().type === T.HASH) { this.next(); port = this.parseExpr(); if (this.peek().type === T.COMMA) this.next(); }
      const items = [];
      while (true) {
        const p = this.peek();
        if (p.type === T.NL || p.type === T.EOF || p.type === T.COLON) break;
        if (p.type === T.SEMI) { this.next(); if (items.length) items[items.length - 1].sep = ';'; continue; }
        if (p.type === T.COMMA) { this.next(); if (items.length) items[items.length - 1].sep = ','; continue; }
        items.push({ expr: this.parseExpr(), sep: '' });
      }
      return { type: 'print', port, items, line: t.line };
    }

    parseRun() {
      const t = this.next(); // RUN
      let name = null, proc = null;
      const p = this.peek();
      if (p.type === T.STR) { name = p.value; this.next(); }
      else if (p.type === T.ID) { name = p.value; this.next(); }
      if (this.peek().type === T.COMMA) { this.next(); proc = this.parseExpr(); }
      return { type: 'run', name, proc, line: t.line };
    }

    parseStop() {
      const t = this.next(); // STOP
      let name = null;
      const p = this.peek();
      if (p.type === T.STR) { name = p.value; this.next(); }
      else if (p.type === T.ID && !BLOCK_END.has(this.kw(p))) { name = p.value; this.next(); }
      return { type: 'stop', name, line: t.line };
    }

    // ---- assignment / command ----
    parseAssignOrCommand() {
      const t = this.peek();
      const head = this.next(); // IDENT (command / lvalue head)
      if (head.type !== T.ID) { this.err('Unexpected token: ' + JSON.stringify(head.value), head); this.recoverLine(); return null; }

      let callArgs = null;
      let axis = null;
      let fields = [];

      // immediate ( ... )  -> call args (VR(n), OP(...), arr(i), CANCEL(2), DATUM(0))
      if (this.peek().type === T.LPAREN) callArgs = this.parseArgList();

      // AXIS(expr) qualifier
      if (this.isKw('AXIS') && this.peek(1) && this.peek(1).type === T.LPAREN) {
        this.next(); // AXIS
        const args = this.parseArgList();
        axis = args.length ? args[0] : null;
      }

      // .field chain (bit access)
      while (this.peek().type === T.DOT) {
        this.next();
        const f = this.next();
        fields.push(f && (f.type === T.ID || f.type === T.NUM) ? f.value : null);
      }

      // Assignment?
      if (this.isOp('=')) {
        this.next();
        const value = this.parseExpr();
        const target = this.buildTarget(head.value, callArgs, axis, fields);
        return { type: 'assign', target, value, line: t.line };
      }

      // Otherwise a command. Collect any trailing args (comma/space separated).
      const extra = [];
      while (true) {
        const p = this.peek();
        if (p.type === T.NL || p.type === T.EOF || p.type === T.COLON) break;
        if (p.type === T.COMMA) { this.next(); continue; }
        // A second AXIS(...) qualifier already handled; parse remaining as expressions.
        if (this.isKw('AXIS') && this.peek(1) && this.peek(1).type === T.LPAREN) {
          this.next(); const a = this.parseArgList(); axis = a.length ? a[0] : axis; continue;
        }
        const before = this.pos;
        extra.push(this.parseExpr());
        if (this.pos === before) { this.recoverLine(); break; }
      }
      return { type: 'command', name: head.value, callArgs: callArgs || [], axis, args: extra, fields, line: t.line };
    }

    buildTarget(name, callArgs, axis, fields) {
      let node;
      if (axis != null) node = { type: 'axisparam', name, axis };
      else if (callArgs != null) node = { type: 'index', name, args: callArgs };
      else node = { type: 'var', name };
      for (const f of fields) node = { type: 'bit', base: node, field: f };
      return node;
    }

    parseArgList() {
      // assumes current token is '('
      this.next(); // (
      const args = [];
      if (this.peek().type !== T.RPAREN) {
        args.push(this.parseExpr());
        while (this.peek().type === T.COMMA) { this.next(); args.push(this.parseExpr()); }
      }
      if (this.peek().type === T.RPAREN) this.next(); else this.err('Expected )', this.peek());
      return args;
    }

    // ---- expressions (precedence climbing) ----
    parseExpr() { return this.parseOr(); }

    parseOr() {
      let left = this.parseAnd();
      while (this.isKw('OR')) { const op = this.next().value.toUpperCase(); const right = this.parseAnd(); left = { type: 'logical', op: 'OR', left, right }; }
      return left;
    }
    parseAnd() {
      let left = this.parseNot();
      while (this.isKw('AND')) { this.next(); const right = this.parseNot(); left = { type: 'logical', op: 'AND', left, right }; }
      return left;
    }
    parseNot() {
      if (this.isKw('NOT')) { this.next(); return { type: 'unary', op: 'NOT', operand: this.parseNot() }; }
      return this.parseComparison();
    }
    parseComparison() {
      let left = this.parseAdd();
      while (true) {
        const t = this.peek();
        if (t.type === T.OP && ['=', '<>', '<', '>', '<=', '>='].includes(t.value)) {
          this.next();
          const right = this.parseAdd();
          left = { type: 'binary', op: t.value, left, right };
        } else break;
      }
      return left;
    }
    parseAdd() {
      let left = this.parseMul();
      while (true) {
        const t = this.peek();
        if (t.type === T.OP && (t.value === '+' || t.value === '-')) { this.next(); left = { type: 'binary', op: t.value, left, right: this.parseMul() }; }
        else break;
      }
      return left;
    }
    parseMul() {
      let left = this.parsePow();
      while (true) {
        const t = this.peek();
        if (t.type === T.OP && (t.value === '*' || t.value === '/')) { this.next(); left = { type: 'binary', op: t.value, left, right: this.parsePow() }; }
        else if (this.isKw('MOD')) { this.next(); left = { type: 'binary', op: 'MOD', left, right: this.parsePow() }; }
        else break;
      }
      return left;
    }
    parsePow() {
      let left = this.parseUnary();
      while (this.isOp('^')) { this.next(); left = { type: 'binary', op: '^', left, right: this.parseUnary() }; }
      return left;
    }
    parseUnary() {
      const t = this.peek();
      if (t.type === T.OP && (t.value === '-' || t.value === '+')) { this.next(); return { type: 'unary', op: t.value, operand: this.parseUnary() }; }
      return this.parsePostfix();
    }
    parsePostfix() {
      let node = this.parsePrimary();
      // .field bit-access chain
      while (this.peek().type === T.DOT) {
        this.next();
        const f = this.next();
        node = { type: 'bit', base: node, field: (f && (f.type === T.ID || f.type === T.NUM)) ? f.value : null };
      }
      return node;
    }
    parsePrimary() {
      const t = this.peek();
      if (t.type === T.NUM) { this.next(); return { type: 'num', value: t.value }; }
      if (t.type === T.STR) { this.next(); return { type: 'str', value: t.value }; }
      if (t.type === T.LPAREN) { this.next(); const e = this.parseExpr(); if (this.peek().type === T.RPAREN) this.next(); else this.err('Expected )', this.peek()); return e; }
      if (t.type === T.ID) {
        this.next();
        // PARAM AXIS(expr)  e.g. MSPEED AXIS(n), MTYPE AXIS(n), AXISSTATUS AXIS(n)
        if (this.isKw('AXIS') && this.peek(1) && this.peek(1).type === T.LPAREN) {
          this.next(); const a = this.parseArgList(); return { type: 'axisparam', name: t.value, axis: a.length ? a[0] : null };
        }
        // PARAM PROC(expr)  e.g. PROC_STATUS PROC(n), RUN_ERROR PROC(x)
        if (this.isKw('PROC') && this.peek(1) && this.peek(1).type === T.LPAREN) {
          this.next(); const a = this.parseArgList(); return { type: 'procparam', name: t.value, proc: a.length ? a[0] : null };
        }
        // call / array / VR access
        if (this.peek().type === T.LPAREN) {
          const args = this.parseArgList();
          return { type: 'call', name: t.value, args };
        }
        return { type: 'var', name: t.value };
      }
      // Unknown token in expression position.
      this.err('Unexpected token in expression: ' + JSON.stringify(t.value), t);
      this.next();
      return { type: 'num', value: 0 };
    }
  }

  function parse(source, opts) {
    const lex = TrioLexer.tokenize(source);
    const p = new Parser(lex.tokens, opts);
    const prog = p.parseProgram();
    return { statements: prog.statements, errors: lex.errors.concat(prog.errors) };
  }

  return { parse, Parser };
});
