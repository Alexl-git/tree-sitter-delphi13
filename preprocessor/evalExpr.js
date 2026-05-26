// delphi13-preprocessor — {$IF expr} boolean evaluator (Phase 1 MVP)
//
// Subset of Delphi compile-time expression grammar:
//   expr  ::= or-expr
//   or-expr  ::= and-expr ('or' and-expr)*
//   and-expr ::= not-expr ('and' not-expr)*
//   not-expr ::= 'not' not-expr | atom
//   atom     ::= 'defined(' IDENT ')'
//              | 'declared(' IDENT ')'   (best-effort: returns false MVP)
//              | IDENT                   (treated as `defined(IDENT)`)
//              | INT                     (non-zero → true)
//              | '(' expr ')'
//
// Comparison operators (=, <>, <, >, <=, >=) are accepted but only over
// integer literals. Identifiers in comparisons resolve to 0 if undefined,
// 1 if defined (rough heuristic for RTL version checks).
//
// Caller passes a `defines` Set<string> for membership lookup.

'use strict';

class Parser {
  constructor(src, defines) {
    this.src = src;
    this.defines = defines;
    this.i = 0;
  }
  skip() { while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++; }
  peek(s) {
    this.skip();
    const sub = this.src.substr(this.i, s.length).toLowerCase();
    return sub === s.toLowerCase();
  }
  consume(s) {
    if (this.peek(s)) { this.i += s.length; return true; }
    return false;
  }
  readIdent() {
    this.skip();
    const start = this.i;
    while (this.i < this.src.length && /[A-Za-z0-9_]/.test(this.src[this.i])) this.i++;
    return this.src.slice(start, this.i);
  }
  readInt() {
    this.skip();
    const start = this.i;
    if (this.src[this.i] === '$') {
      this.i++;
      while (this.i < this.src.length && /[0-9A-Fa-f]/.test(this.src[this.i])) this.i++;
      return parseInt(this.src.slice(start + 1, this.i), 16);
    }
    while (this.i < this.src.length && /[0-9]/.test(this.src[this.i])) this.i++;
    return parseInt(this.src.slice(start, this.i), 10);
  }

  expr() { return this.orExpr(); }
  orExpr() {
    let left = this.andExpr();
    while (this.peekKW('or')) {
      this.skipKW('or');
      left = left || this.andExpr();
    }
    return left;
  }
  andExpr() {
    let left = this.notExpr();
    while (this.peekKW('and')) {
      this.skipKW('and');
      left = left && this.notExpr();
    }
    return left;
  }
  notExpr() {
    if (this.peekKW('not')) { this.skipKW('not'); return !this.notExpr(); }
    return this.cmpExpr();
  }
  cmpExpr() {
    let left = this.atom();
    this.skip();
    // Try a comparison operator
    const ops = ['<=', '>=', '<>', '=', '<', '>'];
    for (const op of ops) {
      if (this.src.substr(this.i, op.length) === op) {
        this.i += op.length;
        const right = this.atom();
        const L = typeof left === 'boolean' ? (left ? 1 : 0) : left;
        const R = typeof right === 'boolean' ? (right ? 1 : 0) : right;
        switch (op) {
          case '<=': return L <= R;
          case '>=': return L >= R;
          case '<>': return L !== R;
          case '=':  return L === R;
          case '<':  return L < R;
          case '>':  return L > R;
        }
      }
    }
    return left;
  }
  atom() {
    this.skip();
    if (this.consume('(')) { const v = this.expr(); this.skip(); this.consume(')'); return v; }
    if (this.peekKW('defined')) {
      this.skipKW('defined');
      this.skip(); this.consume('(');
      const id = this.readIdent();
      this.skip(); this.consume(')');
      return this.defines.has(id.toLowerCase());
    }
    if (this.peekKW('declared')) {
      // Best-effort: returns false (no symbol table available).
      this.skipKW('declared');
      this.skip(); this.consume('(');
      this.readIdent();
      this.skip(); this.consume(')');
      return false;
    }
    if (/[0-9$]/.test(this.src[this.i] || '')) return this.readInt();
    // Bare identifier — treat as defined-test for the symbol.
    const id = this.readIdent();
    if (!id) return false;
    return this.defines.has(id.toLowerCase());
  }
  peekKW(kw) {
    this.skip();
    const sub = this.src.substr(this.i, kw.length).toLowerCase();
    if (sub !== kw.toLowerCase()) return false;
    const after = this.src[this.i + kw.length];
    return !after || !/[A-Za-z0-9_]/.test(after);
  }
  skipKW(kw) { this.skip(); this.i += kw.length; }
}

function evalExpr(src, defines) {
  try {
    const p = new Parser(src, defines);
    const v = p.expr();
    return typeof v === 'boolean' ? v : v !== 0;
  } catch (_e) {
    // On any evaluator error, treat the expression as false. Conservative
    // for `{$IF cond}` — at least it picks a deterministic branch.
    return false;
  }
}

module.exports = { evalExpr };
