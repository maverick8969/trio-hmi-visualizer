// ============================================================
// trio-lexer.js — Tokenizer for the TrioBASIC dialect
// ------------------------------------------------------------
// Handles the subset of TrioBASIC used by real Trio controller
// projects: ' comments, `_` line continuation, labels, string /
// number / $hex literals, GLOBAL/CONSTANT/DIM, block + inline
// IF, FOR/NEXT, WHILE/WEND, REPEAT/UNTIL, GOTO/GOSUB/RETURN,
// WAIT, ON BASICERROR, AND/OR/NOT/XOR/MOD word-operators,
// comparisons, `alias.bit` field access, arrays, PRINT #port.
//
// Environment-agnostic: usable from Node (module.exports) and
// the browser (window.TrioLexer).
// ============================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TrioLexer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Token types
  const T = {
    NUM: 'num',
    STR: 'str',
    ID: 'id',
    OP: 'op',
    LPAREN: 'lparen',
    RPAREN: 'rparen',
    COMMA: 'comma',
    DOT: 'dot',
    COLON: 'colon',
    HASH: 'hash',
    SEMI: 'semi',
    NL: 'nl',
    EOF: 'eof',
  };

  const isDigit = (c) => c >= '0' && c <= '9';
  const isHex = (c) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
  const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  const isIdPart = (c) => isIdStart(c) || isDigit(c);

  // Strip an inline comment (') from a single physical line, honoring
  // string literals so an apostrophe inside "..." is not a comment.
  function stripComment(line) {
    let inStr = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inStr = !inStr;
      else if (ch === "'" && !inStr) return line.slice(0, i);
    }
    return line;
  }

  // Join physical lines that end with a continuation `_` into logical
  // lines. Returns [{text, line}] where `line` is the 1-based number of
  // the first physical line of the logical line.
  function toLogicalLines(source) {
    const physical = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const logical = [];
    let buf = '';
    let startLine = 0;
    for (let i = 0; i < physical.length; i++) {
      let code = stripComment(physical[i]);
      const trimmedRight = code.replace(/[ \t]+$/, '');
      // Continuation: last non-space char is `_` and it is preceded by
      // whitespace or is the only char (Trio's line-continuation marker).
      const isCont = /(^|[ \t])_$/.test(trimmedRight);
      if (buf === '') startLine = i + 1;
      if (isCont) {
        buf += trimmedRight.slice(0, -1) + ' ';
      } else {
        buf += code;
        logical.push({ text: buf, line: startLine });
        buf = '';
      }
    }
    if (buf !== '') logical.push({ text: buf, line: startLine });
    return logical;
  }

  function tokenize(source) {
    const tokens = [];
    const errors = [];
    const lines = toLogicalLines(source);

    for (const { text, line } of lines) {
      const raw = text;
      if (raw.trim() === '') continue; // blank logical line -> no tokens
      let i = 0;
      const n = raw.length;
      let emittedOnLine = false;

      const push = (type, value, col) => {
        tokens.push({ type, value, line, col });
        emittedOnLine = true;
      };

      while (i < n) {
        const c = raw[i];

        // Whitespace
        if (c === ' ' || c === '\t') { i++; continue; }

        // String literal
        if (c === '"') {
          let j = i + 1;
          let s = '';
          while (j < n && raw[j] !== '"') { s += raw[j]; j++; }
          if (j >= n) { errors.push({ line, col: i + 1, message: 'Unterminated string' }); }
          push(T.STR, s, i + 1);
          i = j + 1;
          continue;
        }

        // Hex literal $FF..
        if (c === '$') {
          let j = i + 1;
          let h = '';
          while (j < n && isHex(raw[j])) { h += raw[j]; j++; }
          if (h === '') { errors.push({ line, col: i + 1, message: 'Malformed hex literal' }); i++; continue; }
          push(T.NUM, parseInt(h, 16), i + 1);
          i = j;
          continue;
        }

        // Number (int / float / leading-dot float). A `.` followed by a digit
        // is a decimal only when it STARTS an operand; if the previous token on
        // this line is a value ( ) / identifier / number ) then `.` is member/
        // bit access (e.g. VR(5010).2, word.0) and must fall through to DOT.
        const prevTok = tokens[tokens.length - 1];
        const prevIsValue = prevTok && prevTok.line === line &&
          (prevTok.type === T.RPAREN || prevTok.type === T.ID || prevTok.type === T.NUM);
        if (isDigit(c) || (c === '.' && isDigit(raw[i + 1]) && !prevIsValue)) {
          let j = i;
          let numStr = '';
          while (j < n && isDigit(raw[j])) { numStr += raw[j]; j++; }
          if (raw[j] === '.') { numStr += '.'; j++; while (j < n && isDigit(raw[j])) { numStr += raw[j]; j++; } }
          // exponent (rare, but cheap to support)
          if (raw[j] === 'e' || raw[j] === 'E') {
            let k = j + 1; let exp = raw[j];
            if (raw[k] === '+' || raw[k] === '-') { exp += raw[k]; k++; }
            if (isDigit(raw[k])) { while (k < n && isDigit(raw[k])) { exp += raw[k]; k++; } numStr += exp; j = k; }
          }
          push(T.NUM, parseFloat(numStr), i + 1);
          i = j;
          continue;
        }

        // Identifier / keyword. BASIC type suffixes `$` (string) and `%`
        // (integer) are allowed as a single trailing char, e.g. TIME$.
        if (isIdStart(c)) {
          let j = i;
          let id = '';
          while (j < n && isIdPart(raw[j])) { id += raw[j]; j++; }
          if (raw[j] === '$' || raw[j] === '%') { id += raw[j]; j++; }
          push(T.ID, id, i + 1);
          i = j;
          continue;
        }

        // Two-char operators
        const two = raw.substr(i, 2);
        if (two === '<=' || two === '>=' || two === '<>') { push(T.OP, two, i + 1); i += 2; continue; }

        // Single-char tokens
        switch (c) {
          case '(': push(T.LPAREN, '(', i + 1); i++; continue;
          case ')': push(T.RPAREN, ')', i + 1); i++; continue;
          case ',': push(T.COMMA, ',', i + 1); i++; continue;
          case '.': push(T.DOT, '.', i + 1); i++; continue;
          case ':': push(T.COLON, ':', i + 1); i++; continue;
          case '#': push(T.HASH, '#', i + 1); i++; continue;
          case ';': push(T.SEMI, ';', i + 1); i++; continue;
          case '=':
          case '<':
          case '>':
          case '+':
          case '-':
          case '*':
          case '/':
          case '^':
            push(T.OP, c, i + 1); i++; continue;
          default:
            errors.push({ line, col: i + 1, message: 'Unexpected character: ' + JSON.stringify(c) });
            i++;
            continue;
        }
      }

      if (emittedOnLine) tokens.push({ type: T.NL, value: '\n', line, col: n + 1 });
    }

    tokens.push({ type: T.EOF, value: null, line: (lines.length ? lines[lines.length - 1].line : 0) + 1, col: 0 });
    return { tokens, errors };
  }

  return { tokenize, T };
});
