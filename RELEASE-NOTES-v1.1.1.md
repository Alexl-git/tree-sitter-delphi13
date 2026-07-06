# tree-sitter-delphi13 v1.1.1  ·  tree-sitter-delphi13-pure v1.1.0

Grammar-coverage release. Since v1.1.0 this closes seven more real Delphi
declaration/expression gaps, and — new in this cycle — **the pure grammar now
has full parity with the master grammar** (it had drifted and lacked most of the
v1.1.0 fixes). Both grammars ship every fix below.

Every fix was gated on a full pre/post corpus diff (master AND the
preprocessor→pure orchestrated path) requiring **0 regressions**, and ships with
a corpus regression test.

## Pass rates (17,081-file corpus)

| path | v1.1.0 | now |
|---|---|---|
| master grammar (raw, THEN-wins) | 98.22% | **98.39%** |
| orchestrated (preprocessor → pure) | 99.33% | **99.44%** |

On the maintainer's own production code (ORM3, 770 files): **99.87% master,
100.00% orchestrated.**

## New in this release

| Construct that now parses | Package(s) |
|---|---|
| `unit U library;` (unit hint — completes platform/experimental) | pure (was root-only) |
| `T = Winapi.Windows.TContext deprecated;` (trailing hint on a type alias) | root + pure |
| `if 1 not in a then` (negated `not in` membership operator) | root + pure |
| `6.022_140e23` (digit-group separators in **float** literals) | root + pure |
| `FtrListCount: 0 .. FTRRECMAXCOUNT;` (subrange as a record field type) | root + pure |
| `array [TScheme, (cpHi, cpLo)] of T` (anonymous enum as an array index) | root + pure |
| `const [REF] CLSID, [REF] IID: TGUID` (param attribute per name in a group) | root + pure |

Plus the pure grammar received all v1.1.0 fixes (inline `var: array of T`,
`unsafe` method directive, `expr < SoftKeyword`, hint/callconv keyword as a var
name, etc.) — it is now a drop-in for the master grammar on preprocessor-resolved
source.

## Notes

- Integer digit separators (`123_456`, `$FF_FF`, `%1010`, `&77`) already worked;
  this adds the float case (`1000.000_1`, exponent) **without** disturbing the
  `..` range operator (`array [0..9]` still lexes as a range — guarded by test).
- `is not` needs no new production — it parses via `is` + a unary `not` on the RHS.
- Still out of scope by design: `{$IFDEF}`-cross-branch and inline `asm` regions
  (the preprocessor path resolves the former); FPC-only constructs (`is nested`);
  non-ASCII / BOM-prefixed files.

## Known follow-ups (TODO.md)

- Record/class **field** named after a hint/callconv keyword (`Register: UINT;`)
  and `array of T` as a last field with no `;` — both carry parser-table
  ambiguity risk and remain open.
- A labeled loop/conditional body (`while ... do label: case ...`) — attempted,
  reverted (GLR cascade in case bodies), one file.
