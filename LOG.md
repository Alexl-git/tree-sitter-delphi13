---
title: tree-sitter-delphi13 — Decision Log
project: tree-sitter-delphi13
type: append-only-log
mirror: C:\Projects\claude-obsidian\sessions\tree-sitter-delphi13\LOG.md
---

# tree-sitter-delphi13 — Decision Log

Append-only. Each entry documents one iteration / commit / decision.

---

## 2026-05-24 06:00  Iter 0 — Initial scaffold

**Goal**: fresh Delphi-13-only project derived from Isopod/tree-sitter-pascal (MIT). Address the architectural limitations that capped tree-sitter-pascal at ~90% by designing the right architecture from day 1.

**Created**:
- Project at `C:\Projects\tree-sitter-delphi13`. MIT license crediting Isopod / Philip Zander.
- Grammar.js forked from tree-sitter-pascal with all 22 proven fixes + Delphi-13-only flag lock-in (`fpc = false`, `objc = false`, etc.).
- Asm body as **opaque token** (asm-as-comment) — no asm sub-grammar.
- External scanner skeleton (`src/scanner.c`) declaring `pp_block` and `char_literal`. Currently no-op (returns false → grammar falls back to regex pp).
- Harness (`tools/parse-corpus.js`) with day-1 filtering for non-Delphi files.
- `tools/import-delphi-paths.ps1`: reads HKCU\Software\Embarcadero\BDS\37.0\Library\{Win32,Win64} for Library Path + Browsing Path, expands `$(BDS)`/`$(DXVCL)`/`$(BDSPROJECTSDIR)`/etc. macros, outputs unique existing Pascal-source dirs.
- Curated corpus: 17,081 files = hand-picked roots (ORM3, TableTools, Spring4D, OmniThreadLibrary, etc.) + 121 dirs auto-imported from registry + AsyncPro + Orpheus + DEMOSDIR.

**Baseline**:
- 17,081 files total
- 14,752 OK (86.42%)
- 2,320 FAIL
- 9 skip (template/fragment/binary)

**Notable: lower than tree-sitter-pascal's 90.70%** because the curated corpus is denser (Embarcadero RTL/VCL + full DevExpress + registry-imported component sources). It's the honest number for "what real Delphi-13 developers actually compile."

**Decisions**:
- Scanner is a skeleton; will be implemented next iteration with proper unit tests in `test/corpus/`.
- Preprocessor (`{$I X.inc}` expansion) deferred to optional companion library.
- Logs kept here AND mirrored to `C:\Projects\claude-obsidian\sessions\tree-sitter-delphi13\` for cross-session findability.

**Commit**: scaffold commit (see git log).

---

## 2026-05-24 07:00  Iter 1 — External scanner (pp_block + char_literal)

**Implementation**: `src/scanner.c` ~190 lines. Provides two external tokens:

- `pp_block`: consumes whole `{$IF*}...{$END*}` blocks with depth-counter
  nesting support. REFUSES blocks whose body starts with a structural keyword
  (unit/program/library/package/interface/implementation) — letting the
  parser see the wrapped declaration via the regex-pp fallback.
- `char_literal`: Delphi's `^X` control-char literal. Requires the next char
  NOT be an identifier-continuation char so `^M:` parses but `^TFoo` still
  parses as kHat + identifier.

**Key API insight verified**: tree-sitter rolls back the lexer position when
scan() returns false after calling advance(). My previous iter-15 in tree-sitter-pascal
failed because I conflated this with cooperative rollback in the structure
of the scanner; the API actually handles it cleanly when used correctly.

**Reverted** the iter-14 greedy regex pp from tree-sitter-pascal — the scanner
is now the single source of truth for `{$IF*}` blocks. The 89-file regression
that the greedy regex caused is dodged here.

**Probe results**:
- JvCaretEdit (IFDEF wraps free text) → PASS
- SynEditKeyConst (IFDEF wraps unit decl) → PASS (scanner refuses, regex pp handles directives separately)

**Full corpus delta**:
- 14,752 → 14,882 OK (+130 files, +0.76pp → 87.18%)

---

## 2026-05-24 07:30  Iter 2 — Keyword fixes (sealed/final/readonly/platform)

**Bugs found** in inherited grammar:
- `kSealed: $ => /seled/i` — TYPO, missing 'a'. Same kind of bug as the
  iter-3 `/safecal/` → `/safecall/` fix from tree-sitter-pascal.
- `kFinal` keyword not defined at all (used as method modifier).
- `kReadonly` not defined (used as OLE dispinterface property modifier).
- `kPlatform` was in `enable_if(fpc, ...)` only — needed in Delphi mode too.

**Grammar diff**:
- Fixed `/seled/i` → `/sealed/i`
- Added `kFinal: $ => /final/i`, `kReadonly: $ => /readonly/i`
- Added `$.kFinal, $.kPlatform` to procAttribute choice
- Added `$.kReadonly` to declProp accessor choice

**Full corpus delta**:
- 14,882 → 15,157 OK (+275 files, +1.61pp → **88.78%**)

The typo and missing keywords were responsible for blocking a couple of full
codebases (DevExpress, FireDAC RTL, Spring4D) — most of those files had
just one bad keyword each.

---

## 2026-05-24 08:00  Iter 3 — declProcRef trailing calling convention + IFDEF-in-expression attempt (reverted)

**Attempted**: add `pp_block` as a valid choice in `_expr` and `type` to handle
inline IFDEFs like `: {$IFDEF X}System.Classes{$ELSE}Classes{$ENDIF}`.

**Result**: full corpus dropped from 15,157 to 12,928 OK (-2,229 files,
-14pp). The interaction between `pp_block` being in `extras` (scanner fires
between tokens) AND being a rule alternative (explicit consumption) caused
widespread parser confusion. Reverted.

**Insight**: to handle IFDEF-in-expression properly, `pp_block` needs to
be removed from `extras` AND added as an explicit alternative in MANY rule
positions (_value, _expr, typeref, declArg type, declField type, etc).
That's a larger restructuring deferred to a future iteration.

**Tried instead**: trailing calling convention on declProcRef:

  type TCreateHandleFunc = function(DriverName, DeviceName: PChar): HDC stdcall;
                                                                    ^^^^^^^^

Adding `repeat(field('attribute', $.procAttribute))` triggered a typeref
conflict (procAttribute keywords like `final`/`platform` overlap with type
identifiers). Narrowed the choice to a fixed keyword set:

  optional(choice($.kStdcall, $.kCdecl, $.kSafecall, $.kPascal,
                  $.kRegister, $.kWinapi, $.kInline))

**Full corpus delta**:
- 15,157 → 15,200 OK (+43 files, +0.25pp → **89.03%**)

**Keyword sweep**: ran a script over the 147 keyword regex definitions; no
typos found beyond the ones already fixed.

---

## 2026-05-24 08:30  Iter 4 — pp_block as `type` choice (IFDEF-as-type)

**Pattern target**:
  FStream: {$IFDEF USE_NAMESPACES}System.Classes{$ELSE}Classes{$ENDIF};
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The external scanner already consumes the whole `{$IF*}...{$END*}` block
as `pp_block`. Adding it as a `type` alternative makes that opaque token
acceptable wherever a type is expected.

**Grammar diff**: one line added to the `type` choice array.

**Also attempted (REVERTED)**: adding pp_block to `_expr` to handle
IFDEF-as-value in call args. That dropped the corpus from 15,239 → 12,959
(-2,280 files): when pp_block is a valid expression, the scanner consumes
IFDEFs aggressively even between statements where they should be silent
extras, and the parser then tries to use them as values in wrong contexts.
Reverted to type-only.

**Per-root snapshot**: ORM3 still 97.28%, ORM3-SERVER still 100%, DevExpress
94.72% (+0.10), Embarcadero 84.48% (+0.17), OmniThread 92.51% (+0.38).
Small gains across the board.

**Full corpus**: 15,200 → 15,239 OK (+39 files, +0.23pp → 89.26%).

**Insight for IFDEF-in-expression**: pp_block-as-extras and pp_block-as-rule
fundamentally conflict. To handle inline IFDEFs in expression position
properly, the scanner needs to differentiate between "this is a value-shaped
IFDEF" (peek the body to see if it's expression-like) and "this is a
statement-shaped IFDEF" (body has `;`s, control flow). Deferred to a
future scanner refinement.

---

## 2026-05-24 09:00  Iter 5 — declProp accessor _ref + declSet subrange

**Step 2 of the 3-step autonomous batch.** Two small targeted fixes from
the priority-root cluster analysis (`tools/priority-clusters.js` added).

### declProp accessor accepts _ref
Original: `read identifier`, `write identifier`. Real code uses richer forms:
  property X: T read fChilds[0];      // array element
  property X: T read Self.FBar;       // qualified
  property X: T read FBar.Field;      // dotted access

Widened to `$._ref` which covers identifier, qualified-ident (typerefDot),
typeref-with-tpl-args, and array element access.

### declSet allows subrange
Original: `kSet kOf type`. But `set of 1..100;` (subrange directly, no
named ordinal type) is widespread in Embarcadero RTL and component code:
  FFlags: set of 1..8;
  TIntSet = set of 1..100;

Added `choice($.type, $.subrangeType)` to declSet.

**Delta**: +46 files (+0.27pp → 89.53%).
**Per-root**: DevExpress 94.72%→95.08% (+16), Spring4D 84.59%→85.10% (+4).

### Tried (REVERTED): dispid on procAttribute
Added `kDispId` to the procAttribute keyword+expr choice so dispinterface
methods like `procedure ItemAdded(...); dispid 1;` would parse. Generate
required a [$.procAttribute] conflict declaration. After all the plumbing,
+0 files — the affected dispinterface files had multiple other issues
upstream. Reverted to keep the grammar lean.

---

## 2026-05-24 09:15  Iter 6 — float regex accepts both `e` and `E`

**Bug found** in inherited `_literalFloat` regex:
  /[-+]?[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/
                        ^ lowercase ONLY

Real code uses both:
  SpeedEpsilon = 1E-3;    (in FMX.Skia.pas, Vcl.Skia.pas)
  SpeedEpsilon = 1e-3;    (other RTL files)

Fix: `(e[+-]?[0-9]+)?` → `([eE][+-]?[0-9]+)?`. One character change.

**Delta**: +33 files (+0.20pp → 89.73%).
**Per-root**: ORM3 97.28%→**97.71%** (+3), Embarcadero +12, DevExpress +8.

This is the same class of bug as kSealed (`/seled/`) and kSafecall
(`/safecal/`) — copy-paste / case-sensitivity slips in token regexes that
block real codebases on tiny technicalities. Worth a sweep through all
token regexes whose names contain `e`/`E` chars... but I've already swept
keyword regexes and found nothing further.

**Step 2 cumulative**: 89.03% → 89.73% (+0.70pp / +118 files) across
iterations 4-6. ORM3 up from 97.28% to 97.71%.

---

## 2026-05-24 09:30  Iter 7 / Step 3 — External scanner unit tests

**Step 3 of the 3-step autonomous batch (FINAL).** No grammar change —
just regression safety for the scanner work in iter 1.

Created `test/corpus/external-scanner.txt` with 5 passing tests:

1. **pp_block wraps free text at file root** (eaten as one opaque token,
   no `pp` siblings)
2. **pp_block REFUSED when body starts with structural keyword**
   (`{$IFNDEF X} unit Y; {$ENDIF}` parses as `pp` + `unit` + `pp`)
3. **pp_block nested IFDEFs match outermost via depth counter**
4. **char_literal: `^M` in case label** (followed by `:`)
5. **char_literal: NOT matched for `^TFoo`** (typerefPtr with kHat + identifier)

All 5 pass via `tree-sitter test`. Future scanner changes that regress
any of these will fail immediately at dev-time rather than silently
breaking the corpus pass rate.

**Process notes for future contributors**: tree-sitter test format requires
EXACT tree match including field labels (`name:`, `body:`, etc) and full
node nesting. Trees were captured by running `tree-sitter parse` on tiny
example files and pattern-matching the output. Don't write tests by hand
without first seeing what the parser actually produces.

---

## Batch summary (steps 1-3, iters 4-7)

| iter | what                                             | pass %   | files |
|------|--------------------------------------------------|----------|-------|
| 3 (start) | — (entering this session)                   | 89.03%   | 15,200 |
| 4 | pp_block as `type` choice                            | 89.26%   | 15,239 |
| 5 | declProp accessor _ref + declSet subrange            | 89.53%   | 15,285 |
| 6 | float regex `[eE]`                                   | **89.73%** | **15,318** |
| 7 | scanner unit tests (no grammar change)               | 89.73%   | 15,318 |

**Net session delta**: +0.70pp / +118 files.

**Per-root progression** (start → end):

| Root          | Start  | End    | Files Δ |
|---------------|--------|--------|---------|
| ORM3          | 97.28% | 97.71% | +3      |
| ORM3-SERVER   | 100%   | 100%   | 0       |
| ORM3-CLIENT   | 96.57% | 97.42% | +2      |
| ORM3-COMMON   | 96.45% | 96.77% | +1      |
| DevExpress    | 94.72% | 95.26% | +24     |
| OmniThread    | 92.13% | 92.51% | +1      |
| Embarcadero   | 84.31% | 85.03% | +29     |
| Spring4D     | 84.59% | 85.10% | +4      |

**4 commits landed this batch**:
- pp_block as type choice (+39)
- declProp _ref + declSet subrange (+46)
- float [eE] regex (+33)
- scanner unit tests (regression safety, no metric change)

**Stuck patterns remaining** (need scanner-level / preprocessor work):
- IFDEF in expression position (`Foo({$IFDEF X}a{$ELSE}b{$ENDIF}, c)`)
- IFDEF in argument-default-value position
- IFDEF inside `else` keyword position (Spring4D HashMap pattern)
- `{$I X.inc}` macro expansion (WARNINGHEADER and similar JEDI patterns —
  rare in the curated Delphi-13 corpus, more common when adding JEDI back)

---

## 2026-05-24 10:00-10:45  Iters 8-11 — Delphi 12+ features + declaration hints

Continuation batch focused on closing real-Delphi-13 feature gaps:

### Iter 8 — Inline if-then-else expression (Delphi 12+)
  X := if Cond then 1 else 0;
  Result := if Assigned(X) then X.Name else '';

Added `exprIf` rule, registered in `_expr` choice, declared conflict with
`statementTr` (both start with `if cond then`).

Delta: +4 files (+0.02pp → 89.75%). ORM3 → **98.00%**.

### Iter 9 — Inline-var in for-in loop (Delphi 12+)
  for var fname in List do ...

foreach iterator field widened: `field('iterator', choice($._expr, $.varAssignDef))`.

Delta: **+29 files** (+0.17pp → 89.92%). ORM3 98.28%, ORM3-CLIENT 98.71%.

### Iter 10 — Declaration hints on const
  const X = 'foo' deprecated 'use Y instead';
  const Z = 1 platform;

declConst gained optional hint clause between defaultValue and `;`:
  choice(seq(kDeprecated, optional(_expr)), kPlatform, kExperimental)

Delta: **+26 files** (+0.15pp → 90.07%). **Crossed 90% real-Delphi-13.**
Embarcadero +24 (RTL has lots of deprecated const aliases).

### Iter 11 — `end deprecated` on class/interface
  type IFoo = interface ... end deprecated;
  type IBar = interface ... end deprecated 'use IBaz';

_declClass appended optional hint after kEnd. Tried qualified-id
subrange bound (`TFoo.Bar..TFoo.Baz`) — conflicts with typerefDot, reverted.

Delta: **+58 files** (+0.34pp → **90.41%**). Biggest single iteration since
the first batch's Iter 5 (declProp). Embarcadero +38, Spring4D +7, DevExpress +8.

---

**Cumulative session 2** (iters 4-11 since user returned from break):
- Overall: 89.03% → **90.41%** (+1.38pp / +235 files)
- ORM3: 97.28% → 98.28% (+7)
- ORM3-CLIENT: 96.57% → 98.71% (+5)
- Embarcadero: 84.31% → 86.57% (+120)
- DevExpress: 94.72% → 95.44% (+36)
- Spring4D: 84.59% → 86.24% (+13)
- ORM3-SERVER: 100% (held)

---

## 2026-05-24 11:00-11:15  Iters 12-13 — Escape quote + soft keywords

### Iter 12 — `''` escape inside single-quoted strings
Old regex `/'[^']*'/` stopped at the first inner apostrophe so any string
containing an escaped quote (`'Can''t find'` → `Can't find`) was broken.
New regex `/'([^']|'')*'/` accepts non-quote chars OR doubled-quote pairs.

Delta: net 0 (files containing escaped quotes were blocked by other issues
too) but the fix is correct Delphi syntax.

### Iter 13 — Soft keywords in typeref
OLE Automation wrappers like Access2000.pas use type names that collide
with Delphi soft keywords:

  function AddOne(const Item: Reference); safecall;

The lexer greedily takes `Reference` as `kReference`; typeref couldn't
fall back to identifier. Added six soft keywords as alias-identifier
alternatives in _typeref: Reference, Message, Name, Index, Read, Write.

Delta: +3 files (+0.02pp → 90.43%). Embarcadero +3.

The pattern likely repeats in other identifier positions (arg/field/method
names). A generalized `_softIdent` helper used everywhere identifier appears
would unlock more — deferred to a future restructure.

---

## 2026-05-24 11:30-12:00  Iters 14-16 — case-label-Pascal-label + procAttrs + generic constraints

### Iter 14 — caseCase Pascal-label between caseLabel and body
Spring4D state machines use Pascal labels as goto targets inside case
clauses:
  STATE_RUNNING:
  _STATE_RUNNING:                  // pascal label
    begin if Done then goto _STATE_RUNNING; end;

Added `field('jumpLabel', optional($.label))` between caseLabel and body.

Also tried (REVERTED -12): adding `type` (and broader: var/const/function/
record/class) to the scanner's refuse-list. The Embarcadero pattern
`{$IFDEF X}type {$ENDIF}DWord` would benefit but legit uses elsewhere
broke. Net regression.

Delta: +3 files (+0.02pp → 90.45%). Spring4D +1, Embarcadero +2.

### Iter 15 — more procAttribute keywords
procAttribute was missing: kExport (legacy DLL export), kVarargs (cdecl
variadic), kWinapi (calling convention alias), kInterrupt (legacy ISR).
kForward intentionally NOT added — conflicts with declProcFwd's own
`; forward;` handling.

Delta: +25 files (+0.14pp → 90.59%). ORM3 +1 (sndkey32.pas), ORM3-CLIENT
+1, Embarcadero +14.

### Iter 16 — Generic-type constraints `<T: class, constructor>`
Spring4D's IoC container uses constraint syntax heavily:
  class function GetInstance<T: class, constructor>: T; static;
  procedure AddExtension<T: IContainerExtension, constructor>; overload;

genericArg was: `name [: typeref] [= default]`
                          ^ single typeref only

New: `name [: constraint (, constraint)*] [= default]`
where constraint = typeref | kClass | kRecord | kConstructor

Delta: **+73 files** (+0.43pp → **91.02%**). Spring4D 86.37% → **90.45%**
(+32, Spring's most-used feature). Embarcadero +24, DevExpress +8.

### Tried (REVERTED): dual pp_block / pp_block_value external token
Attempted to solve IFDEF-in-expression by adding a separate `pp_block_value`
token emitted only when expression-position context. Scanner overproduced
PP_BLOCK_VALUE in too many positions causing massive regression (-2,283
files). Single-token pp_block-in-extras stays as the design.

The IFDEF-in-expression case (`Result := {$IFDEF X}a{$ELSE}b{$ENDIF};`)
remains the largest structural unfixed cluster. A proper fix likely
needs the scanner to peek at the body to classify it as value-shaped
(no semicolons, single expression in each branch) vs statement-shaped —
that's more involved scanner work for a future iteration.

---

**Cumulative session 3** (iters 14-16 + iter 13 from prior batch):
- Overall: 90.43% → **91.02%** (+0.59pp / +101 files)
- Spring4D: 86.24% → **90.45%** (+33 — generic constraints unlock)
- Embarcadero: 86.63% → 87.38% (+40)
- DevExpress: 95.44% → 95.63% (+8)
- ORM3: 98.28% → 98.43% (+1)
- ORM3-CLIENT: 98.71% → 99.14% (+1)

---

## 2026-05-24 12:30  Iter 17 — declArray allows subrange element + narrow ident-OP-int subrange

Tightened `declArray` to accept subrange element type (`array of 0..255` outside type-position contexts) without explosion. Narrowed the `_subrangeBound` pattern to prevent false positives where qualified-id range was previously ambiguous.

Delta: +2 files (+0.02pp → 91.04%).

---

## 2026-05-24 13:00  Iter 18 — Trailing-dot float `100.` via external scanner

Added `TRAILING_DOT_FLOAT` external token. Scanner peeks the char after `.` and only emits if it's NOT another `.` (would be range op) or a digit (would be regular float). Tree-sitter regex can't disambiguate `100.` (float, e.g. `100. * x`) from `100..N` (int + range) without lookahead.

Delta: +6 files (+0.03pp → 91.07%). ORM3 → **99.43%**.

---

## 2026-05-24 13:30  Iter 19 — try-except `else` last statement may omit `;`

Investigating ORM3 BASICSF.pas (CLIENT + COMMON copies — `MISSING ";"` insertion at row 841). The construct:

```
except
  on EConvertError do
  begin
    ...
    raise EMicroniteMessage.Create(...)    // no trailing ;
  end;
  else
    raise EMicroniteMessage.Create(...)    // no trailing ; — followed by `end` of try
end;
```

The `_exceptionHandlers` rule was using non-trailing `$.exceptionElse` even inside the trailing context (`_exceptionHandlersTr`, which is what `try`'s `except` clause invokes). The non-trailing form requires the last statement to end in `;` — but the `else` body is always followed by `end` (close of try), so the trailing form should be allowed.

**Fix**: `optional(choice($.exceptionElse, tr($,'exceptionElse')))`. Added two conflict declarations: `[$.exceptionElse, $.exceptionElseTr]` and `[$.exceptionElse]` (to resolve the repeat-vs-end ambiguity).

Delta: **+9 files** in ORM3 alone (the pattern was wider than just BASICSF — also in COMMON utility units). Overall +2 (91.07% → **91.09%**). 

**Per-root jump**:
- ORM3: 98.43% → **99.71%** (+9 files)
- ORM3-CLIENT: 99.14% → **100%** ✓
- ORM3-COMMON: 97.10% → **99.35%**
- All other roots flat (no regression)

Remaining ORM3 failures (2):
- MSCTYPES.PAS r160: `TCodeLetter = #64..#82;` char-literal subrange bound
- MStreams.pas r1084: `{$IFEND}` chain — scanner depth-counter not handling this dialect

---

## 2026-05-24 14:54  Iter 20 — `#NN` char-literal as subrange bound

MSCTYPES.PAS r160: `TCodeLetter = #64..#82;` — Delphi character type subrange via numeric char literals. Grammar's `_subrangeBound` accepted integer/float/identifier but not `#N`.

Earlier attempt in iter history added the full `$.literalChar` choice (which includes both `#N` AND the `^X` external char_literal) — that triggered Spring4D regression of -4 files (likely conflict with `^TFoo` pointer-to-type appearing in subrange-adjacent contexts). This iteration uses the **narrow form** `seq('#', $._literalInt)` only, excluding the `char_literal` external token.

**Result**: +1 file. ORM3 99.71% → **99.86%** (COMMON 99.35% → 99.68%). Spring4D held at 90.45% (no regression confirmed). Overall 91.09% → 91.09% (+1 / +0.006pp).

**Why this fixed only 1 file even though the pattern exists**: `#NN` numeric char-literal in subrange position is rare — most code uses `'A'..'Z'` char string-literal or named-constant ranges. Worth keeping for correctness regardless.

**Last remaining ORM3 fail**: MStreams.pas r1084 `{$IFEND}` chain. Needs scanner investigation — the depth counter handles `{$ifend}` matching `{$if...}`, but something about this specific chain isn't closing cleanly.

---

## 2026-05-24 16:00  Iter 21 — REVERTED — defProc body=`pp_block + end`

**Target**: MStreams.pas r1084 — Delphi's asm-vs-pascal switch pattern:

```
function BitCount(...): integer;
{$IF Defined(CPUX86)...}
asm
  CMP eax,$00 JNZ @@NotZero ...
  {$ELSE}
  {$IF Defined(CPUX64)...}
  asm
    ...
    {$ELSE}
    var v: cardinal;
    begin
      ...
      else Result := -1;
  {$IFEND}
  {$IFEND}
end; // function
```

The scanner consumed the whole `{$IF}...{$IFEND}` block correctly. Issue: the closing `end;` sits OUTSIDE the pp_block, so the function body needed to be modeled as `pp_block + kEnd`.

**Hypothesis tested**: `defProc.body = choice(block, asm, seq(pp_block, kEnd))`.

**Result**: -502 files (15550 → 15048; 91.09% → 88.13%). REVERTED.

**Why it broke things**: tree-sitter GLR began greedily consuming IFDEFs as pp_block in too many positions where the original regex-pp wrapper inside `pp(...)` had already handled them. The function-locals-IFDEF pattern (e.g. `function F; {$IFDEF X} var l: integer; {$ENDIF} begin ... end;`) was already covered correctly by regex-pp; my change made pp_block compete with that, and tree-sitter's parser preferred the new path which failed at `begin`.

**BLOCKED** marker: handling IFDEF-wraps-body-internals requires invariants that distinguish "IFDEF wraps body internals + end outside" from "IFDEF wraps just locals, body normal". Likely needs scanner-aware classification, not a parser-level alternative.

**Net for this iteration**: 0 grammar change, 1 documented dead-end.

---

## 2026-05-24 18:00  Iter 22 — Unit-deprecated hint + `&&` identifier prefix

Pivoted from BLOCKED MStreams asm-vs-pascal pattern. Mined Spring4D failure clusters for tractable fixes.

### Change 1: unit-level deprecated hint
```
unit Spring.Services.Logging deprecated 'Use Spring.Logging instead';
```

The `unit` rule was: `kUnit moduleName ';'`. Extended with optional clause between moduleName and `;`:
```
optional(seq($.kDeprecated, optional($._expr)))
```

Same syntax already supported on declConst (iter 10), declClass (iter 11), and typeref (iter 11). The unit-level form was missed.

### Change 2: `&&` identifier prefix
```
class function &&op_Equality<T>(...): T; static;
class function &&op_Inequality<T>(...): T; static;
```

Delphi.NET operator-name convention: `&&op_Addition`, `&&op_Equality`, etc. — still used by Spring4D.Mocking. The grammar's identifier regex was `/[&]?[a-zA-Z_]+.../` (single `&` for keyword escape). Widened to `/&{0,2}[a-zA-Z_]+.../`.

**Combined result**: **+28 files** (15550 → 15578; 91.09% → **91.25%**).
- Embarcadero: 87.38% → **87.72%** (+18 — RTL legacy units use `unit X deprecated` heavily)
- Spring4D: 90.45% → **91.08%** (+5 — Logging units + Mocking.Matching)
- ORM3 / DevExpress / OmniThread / others held

**Why the unit-deprecated win was bigger than expected**: hundreds of RTL units have legacy deprecation banners (`unit IBX.IBQuery deprecated 'use FireDAC';`, `unit JPEG deprecated;`, etc.). The grammar was failing on the very first line.

**Next clusters worth chasing** (after combined iter 22):
- Spring4D's `else{$ELSE}begin{$ENDIF}` (8 files) — BLOCKED, same shape as MStreams
- Spring4D's RTL-asm-vs-pascal `function F; {$IFDEF CPUX86} asm ...` (7 files across multiple `function`s) — BLOCKED
- Embarcadero remaining 651 fails — needs cluster analysis to find next tractable pattern

---

## 2026-05-24 18:15  Iter 23 — Inline `const NAME=value` inside statement body

User asked to also track **TableTools** (the user's own ORM tools project) — added to per-root-stats. Baseline: 12/13 = 92.31% with the single fail being `FieldsInfo.Model.pas` at row 1316 (Delphi 12+ inline const inside procedure body):

```pascal
const MAX_KEY_FIELD_LEN = 68;
if Length(KeyField) > MAX_KEY_FIELD_LEN then ...
```

Grammar's `_statement` already supported `seq($.varDef, ...semicolon)` (inline `var x: T;`) and `seq($.assignment, ...semicolon)` (inline `var x := v;`) but lacked an inline-const form.

**Fix**: new `constInline` rule + `seq($.constInline, ...semicolon)` choice in `_statement`.

```js
constInline: $ => seq(
    $.kConst, field('name', $.identifier),
    optional(seq(':', field('type', $.typeref))),
    '=', field('value', $._expr)
)
```

**Result**: TableTools 92.31% → **100%** ✓. Overall +1 file (91.25% held). No regressions.

---

## 2026-05-24 18:50  Iter 24 — REVERTED — defProc body=`prec(-1, pp_block+end)`

Re-attempted iter-21's MStreams asm-vs-pascal fix with `prec(-1)` guard, hoping negative precedence would prevent GLR over-consumption.

**Result**: -502 files (15579 → 15077; 91.25% → 88.31%). Same regression magnitude as iter 21 — `prec(-1)` does NOT meaningfully reduce GLR ambiguity here.

**Root cause confirmed**: pp_block is in `extras` (consumed everywhere as whitespace). When `defProc.body` also accepts pp_block, the GLR parser opens too many alternate paths for every IFDEF in every procedure body. tree-sitter precedence biases parse-tree selection AFTER a successful parse — it doesn't prune the search.

**MStreams ORM3 fail is FINAL BLOCKED**. Requires either:
- A preprocessor pass (companion library — out of scope for this grammar)
- Scanner-level classifier that distinguishes "IFDEF wraps body internals" from "IFDEF wraps locals" before emitting the token

Marking the ORM3 ceiling at **99.86% (698/699)** as the practical maximum for the pure-grammar approach.

Reverted to iter 23 state.

---

## 2026-05-24 19:30  Iter 25 — `const [ref]` arg attr + prec(-1) on pp_block-as-type

Pivoted to Embarcadero (largest fail pool, 651 fails). Cluster analysis revealed:

### Change 1: `const [ref]` in arg list
Delphi 10+ `const [ref] X: T` modifier for forcing pass-by-reference of large records. Pattern from `Embarcadero/source/data/ems/EMSHosting.Yaml.pas`:
```pascal
class operator Assign(var Dest: TYamlElement; const [ref] Src: TYamlElement);
```

`declArg` was: `(var|const|out|constref) name [: type [= default]]`. Added `optional($.rttiAttributes)` between modifier and name to accept the inline `[ref]` (or any `[attr]`) bracket.

### Change 2: `prec(-1)` on pp_block-as-type
The pp_block-as-type choice was greedily consuming `{$IFDEF X}packed{$ENDIF}` as if it were the entire type, leaving `record...end` orphaned. Pattern from Datasnap.DBClient/Data.Win.ADODB:
```pascal
TRecInfo = {$IFDEF CPUX86}packed{$ENDIF} record
  ...
end;
```

Lowered pp_block's precedence in the _typeref choice list so the GLR parser prefers the path where pp_block is consumed as extras + the real `record` type follows.

**Combined result**: +26 files (15579 → 15605; 91.25% → **91.41%**).
- Embarcadero: 87.72% → **88.21%** (+26)
- All other roots held

---

## 2026-05-24 20:10  Iter 26 — Scanner: add `packed` to refuse-list

Iter 25's prec(-1) on pp_block-as-type was insufficient — the parser was still consuming `{$IFDEF CPUX86}packed{$ENDIF}` as the entire type. The actual fix needed is at scanner level: refuse to absorb the IFDEF block when its body starts with `packed`, so the parser sees `(pp){$IFDEF}(/pp) packed (pp){$ENDIF}(/pp) record`.

Scanner change: extended refuse-list from `unit/program/library/package/interface/implementation` to add `packed`. Required rewriting `starts_with_structural_keyword()` because `packed` and `package` share the 4-char prefix `pack`, and the old try-then-fallback cascade didn't actually work for shared-prefix keywords (silently broken for `package` too — same first letter as `program`).

New char-by-char prune state machine properly distinguishes:
- `p` + `r` → program
- `p` + `a` + `c` + `k` + `e` + `d` → packed
- `p` + `a` + `c` + `k` + `a` + `g` + `e` → package
- (everything else with `p` → not refused)

**Result**: 0 file delta (15605 → 15605). DBClient error count dropped 7→5 but file still has 5 other errors → still classified as fail. **Foundation commit** — enables future iters tackling the other Embarcadero clusters that overlap with the same files.

---

## 2026-05-24 20:25  Iter 27 — REVERTED — `type` in scanner refuse-list

Added `type` keyword to scanner refuse-list so `{$IFDEF TYPE_IDENTITY}type {$ENDIF}DWord` would split into pp + type-keyword + pp, letting the grammar's `declType` distinct-type-alias path handle it.

**Result**: net -12 files. Breakdown:
- Spring4D: **+2** (715 → 717)
- Embarcadero: **-6** (4678 → 4672)
- Others held

Same magnitude as iter 14's broader attempt. Embarcadero RTL has many `{$IFDEF X}type Foo = ...{$ENDIF}` patterns where the IFDEF wraps a whole type declaration; refusing the block leaves these orphaned because the regex-pp wrapper only handles single-level if-else-end balanced patterns and the surrounding context isn't a simple statement.

**Trade-off net negative — reverted.** Spring4D's +2 wasn't worth Embarcadero's -6.

---

## 2026-05-24 20:40  Iter 28 — pp_block in declUses/declRequires (BIG WIN)

Investigating Embarcadero `procedure OSExecute; begin {$IFDEF MSWINDOWS}` cluster (6 files). The actual root cause turned out to be the preceding `uses` clause, not the procedure body:

```pascal
uses
{$IFDEF MSWINDOWS}
  Winapi.ShellAPI, Winapi.Windows;     <-- ';' INSIDE the IFDEF
{$ENDIF MSWINDOWS}
{$IFDEF POSIX}
Posix.Stdlib;                          <-- ';' INSIDE this IFDEF too
{$ENDIF POSIX}
```

The scanner consumes each `{$IFDEF}...{$ENDIF}` block as one external pp_block token (in extras). The terminating `;` is INSIDE the pp_block — so the parser sees `uses (extras) (extras) procedure ...` with no `;` for the uses clause, fails, and cascades errors through the rest of the file.

Fix: add `$.pp_block` to the `repeat1(choice(...))` of `declUses` (and `declRequires` for `.dpk`). Both are designed permissively to allow `pp / , / ;` interleaving — pp_block was the missing piece.

**Result**: **+69 files** (15605 → 15674; 91.41% → **91.81%**).
- Embarcadero: 88.21% → **89.01%** (+42)
- Spring4D: 91.08% → **91.34%** (+2 — likely Spring4D's uses-clauses also had this pattern)
- ORM3 / TableTools / DevExpress / OmniThread held

Biggest single-iter win since iter 16 (generic-type constraints, +73 files). The pattern is heavily used in Embarcadero RTL's cross-platform shims and Spring4D's compatibility layer.

---

## 2026-05-24 20:55  Iter 29 — REVERTED — `cdecl;` trailing after declField

Tried adding optional trailing calling-convention pseudo-statement after declField's `;` to handle Apache HTTPD pattern:
```pascal
rewrite_args: procedure(process: Pprocess_rec); cdecl;
```

**Result**: -2 files (15674 → 15672). Embarcadero -2. The HTTPD20/22/24 files didn't flip (still 13 errors each) but two other files broke — the optional trailing-conv pattern matched somewhere it shouldn't have.

Reverted. The Apache HTTPD files have many other parse issues; a single-pattern fix doesn't promote them.

---

## 2026-05-24 21:25  Iter 30 — REVERTED — pp_block as range bound

Tried allowing `range = (_expr | pp_block) '..' (_expr | pp_block)` to handle:
```pascal
array[0..{$IFDEF CPU64BITS}4{$ELSE}2{$ENDIF}] of Integer
```

**Result**: **-97 files** (15674 → 15577; 91.81% → 91.24%). Embarcadero -72, DevExpress -8, Spring4D -2.

pp_block in expression-adjacent positions opens the GLR parser to wholesale path-explosion (same lesson as iters 21/24). The change correctly fixed System.pas's array-bound IFDEF but broke 97 other files where pp_block became an attractive misinterpretation in normal range contexts.

**Pattern marked BLOCKED**. IFDEF-as-value-in-expression-position is the long-standing structural cluster that needs a different approach (preprocessor pass or scanner-aware classifier).

---

## 2026-05-24 22:30  Iter 31 — Soft-keyword names in declVar

Datasnap.DSCommonServer.pas has variables named `Message`, `Param`, etc. — soft keywords. Grammar's declVar required strict `identifier` for the name, lexer-matched `Message` as kMessage → parse fail.

Iter 13 added the same alias set (`Message/Name/Index/Read/Write/Reference`) for `_typeref` positions. This iter extends it to `declVar.name`. Required a `[$.declVar]` conflict declaration because `var X: T; <next-decl-start-keyword>` and `var X: T; <kMessage-as-var-name>` are ambiguous at the lookahead.

**Result**: +13 files (15674 → 15687; 91.81% → **91.89%**).
- Embarcadero: 89.01% → **89.21%** (+11)
- DevExpress: 95.58% → **95.63%** (+2)
- ORM3 / TableTools / Spring4D held

Same alias set can probably be extended to declField and declArg names in a future iter for additional wins.

---

## 2026-05-24 22:50  Iter 32 — Tried 2 extensions, both 0 file delta — reverted

Two attempts:
1. Extended soft-keyword aliases to declField + declArg names. Generated cleanly with conflict declarations but **0 file delta** — patterns must not appear in our corpus.
2. Added `kOperator` alias to declVar (for `var Operator: WideString;` in Data.Win.ADODB.pas). Single file went from 11+ errors to 1 error, but didn't promote to OK because of another remaining issue. **0 file delta**.

Both reverted to avoid grammar bloat without functional gain. Aliases-everywhere isn't worth the parse-table cost unless it actually flips files. Will revisit when other constraints in those same files are also fixed.

---

## 2026-05-24 23:05  Iter 33 — Investigation-only — DevExpress cluster

Added `Default` and `Operator` to `declEnumValue` soft-keyword aliases for DevExpress's `TdxChartToolTipMode = (Default, None, ...)` enum (2 files). Generated cleanly. **0 file delta** because each of those files ALSO has the qualified-id-subrange pattern at the next type decl (`TdxChartActualToolTipMode = TdxChartToolTipMode.None..TdxChartToolTipMode.Crosshair;`) which was tried + reverted in iter 11.

Reverted iter 33 grammar change.

**Investigation note**: Spring4D's remaining 68 fails are dominated by patterns already marked BLOCKED (asm-vs-pascal, else-IFDEF, IFDEF-in-expression). OmniThread's 20 fails are similarly IFDEF-in-expression dominated. DevExpress's 192 fails would mostly need qualified-id-subrange to unlock — itself a BLOCKED-on-conflict pattern.

Cohort of "easy wins" largely exhausted at iter 28-31. The remaining cliffs require multi-pattern combos or preprocessor expansion.

---

## 2026-05-24 23:30  Iter 34 — Qualified-id subrange (DevExpress unlock)

Iter 11 tried `TFoo.Bar..TFoo.Baz` and reverted due to typerefDot conflict. This iter retries with proper conflict declaration `[$._typeref, $._subrangeBound]`.

Added narrow 2-level form `seq($.identifier, '.', $.identifier)` to `_subrangeBound`. Conflict declared. Generated cleanly.

**Result**: +8 files (15687 → 15695; 91.89% → **91.93%**).
- DevExpress: 95.63% → **95.76%** (+6)
- Embarcadero: 89.21% → **89.25%** (+2)
- Others held

The DevExpress ChartCore enum-class subrange pattern is now parsed:
```pascal
TdxChartActualToolTipMode = TdxChartToolTipMode.None..TdxChartToolTipMode.Crosshair;
```

This was the cluster blocked behind iter 11's revert. With the proper conflict, the resolution works.

---

## 2026-05-24 23:50  Iter 35 — REVERTED — declEnumValue Default+Operator aliases

Hoped that with qualified-id-subrange now in (iter 34), the enum-Default alias would flip more DevExpress chart files.

**Result**: 0 file delta. The dxChartCore.pas file STILL has another blocking issue beyond the two patterns we addressed. Reverted to avoid grammar bloat.

Recent iter cadence: 32 reverted, 33 0-delta, 34 +8, 35 0-delta. Approaching but not yet at the "3 consecutive non-improvement" stage-transition trigger.

---

## 2026-05-25 00:15  Iter 36 — IFDEF stats + .inc fragment skip

User asked for statistics on IFDEF patterns to justify whether a "treat IFDEF as AST branches" refactor is worth doing. Built `tools/ifdef-stats.js`, scanned the full corpus (17,081 files, 107,675 IFDEFs).

**Categorization (mutually exclusive):**

| Shape           | Count   | %      | Modelable as AST branches? |
|-----------------|---------|--------|-----------------------------|
| `single` (no ELSE) | 75,428 | 70.05% | Trivial — already handled |
| `crossterm` (`;`/`,`/`.` inside) | 10,699 | 9.94% | Yes — per-rule fixes (uses-clause done in iter 28) |
| `other` (mixed bodies) | 10,468 | 9.72% | Mostly yes — needs `ppAlt(_expr)`/`ppAlt(_stmt)` rules |
| `nested` | 9,883 | 9.18% | Yes — recursive `ppAlt` |
| `asym_open` (different opener kw) | 1,128 | **1.05%** | **No** — requires preprocessor |
| `sym_lit` (literal vs literal) | 69 | 0.06% | Trivial — `ppAlt(_expr)` |

**Bottom line for the refactor decision**: only 1.05% (~1,100 instances) are truly unfixable without preprocessor expansion. The other 99% can be parsed as branching AST nodes.

Also added a `.inc` fragment skip filter in `parse-corpus.js`: Indy-style include files with bare const-block contents (no module header, body opens with `IDENT = value;`). 5 files filtered; real-Pascal denominator 17072 → 17067 → **91.96%**.

Embarcadero: 89.25% → **89.29%** (denominator drop from .inc filter).

---

## 2026-05-25 00:45  Iter 37 — Stage-A.1 IFDEF-as-AST refactor — REVERTED

User approved the refactor (treat IFDEFs as AST branching nodes). Added discrete `pp_open`/`pp_else`/`pp_end` external tokens, scanner emits them when `valid_symbols` signals; grammar `ppExprAlt` rule consumes them in `_expr`.

**Result**: **-2,977 files** (15695 → 12718; 91.96% → 74.52%). Catastrophic. Detailed cliff:
- DevExpress: 95.76% → 60.23% (-1,552)
- Embarcadero: 89.29% → 74.63% (-777)
- Spring4D: 91.34% → 82.55% (-69)
- ORM3: 99.86% → 98.00% (-13)

**Root cause of regression**: tree-sitter's `valid_symbols` is permissive — expressions are reachable from many positions (statements, declarations, args). When scanner sees `{` it emits PP_OPEN because parser MIGHT want ppExprAlt. But the body inside IS often a statement/declaration, not a single expression — `ppExprAlt` fails, no fallback to pp_block extras absorption (scanner already committed to discrete).

**Lesson**: this refactor needs ppAlt rules at every position simultaneously (`_expr`, `_statement`, `_definition`, type position, arg list, etc.). Cannot be done one-position-at-a-time. The intermediate states are net-negative.

**Tried second approach**: scanner refuses pp_block when body looks expression-shaped, lets regex `pp` tokens expose body for ppExprAlt rule. Ran into rollback impossibility — scanner can't peek body without committing advances, and committed advances + return-false would re-enter the same code in an infinite loop.

**Reverted to iter 36 baseline (91.96%)**. The refactor is doable but requires:
1. Add ppAlt at ALL positions in grammar
2. Disable pp_block scanner emission (scanner becomes lexer-only for directives)
3. Big-bang change, no incremental path

For now, continuing piecemeal. May revisit with a different architecture (e.g. emit discrete pp tokens always but make grammar rules tolerant via `optional(pp_text)` body, or shift to a tree-sitter `seq` with explicit pp_ tokens at every alternation point).

---

## 2026-05-25 01:10  Iter 38 — `pp_block.kDot.typeref` qualified-type prefix

Pivoted back to piecemeal. Investigated `crossterm` cluster — found 5+ files with the unit-scope-name switch pattern:

```pascal
Response: {$IFDEF USE_NAMESPACES}Web.HTTPApp{$ELSE}HTTPApp{$ENDIF}.TWebResponse;
```

EurekaLog and Embarcadero RTL XE2+ use this to support both with-namespace-prefix and legacy unit names. The pp_block consumed `{$IFDEF...}Web.HTTPApp{$ELSE}HTTPApp{$ENDIF}` as one extras token, leaving `.TWebResponse` orphaned in the type position.

**Fix**: explicit `prec(1, seq($.pp_block, $.kDot, $.typeref))` choice in `type`. Forces the parser to consume pp_block as the LHS of a dotted-qualified-type instead of as extras whitespace.

**Result**: +22 files (15695 → 15717; 91.96% → **92.09%**).

Per-root deltas: all gain landed in non-tracked roots (mostly EurekaLog Source/ and one each in DevExpress utility modules). ORM3/Spring4D/Embarcadero (per-tracker) held.

---

## 2026-05-25 01:25  Iter 39 — REVERTED — pp_block.kDot.X in exprDot

Tried the iter-38 pattern in expression position too: added `prec.left(5, seq(pp_block, kDot, _ref))` as a choice in `exprDot` for the statement-position cluster:
```pascal
{$IFDEF USE_NAMESPACES}Winapi.Windows{$ELSE}Windows{$ENDIF}.MessageBox(...);
```

**Result**: **-3,048 files** (15717 → 12669; 92.09% → 74.23%). Same catastrophe shape as iter 37 (-2977) and iter 30 (-97).

**Confirmed lesson**: pp_block in expression-adjacent positions causes wholesale GLR explosion. The type-position version (iter 38) worked because types have restricted, terminator-friendly grammar (`type` is followed by `;` or `=`). Expression positions cascade through every `_expr`, `assignment`, `arg`, etc. — multiplies GLR forks across the entire parser state.

**Reverted to iter 38 baseline (92.09%)**.

This is the FOURTH revert of pp_block-in-expression (iters 21, 30, 37, 39). Marking the pattern as **structurally BLOCKED for grammar-only fixes**. Would need the full all-positions-at-once refactor with discrete pp tokens (Stage A) to handle expression IFDEFs.

---

## 2026-05-25 01:35  Iter 40 — REVERTED — pp_block.kDot.typeref in typerefDot

Tried the iter-38 pattern in typeref position too (for `class({$IFDEF}NS.X{$ELSE}X{$ENDIF}.TBaseClass)` parent-clause cluster — many EurekaLog files).

**Result**: net +1 overall (15717 → 15718; 92.09 → 92.10%), but:
- EurekaLog +10 (non-tracked roots)
- **Spring4D -3** (717 → 714)
- **Embarcadero -2** (4733 → 4731)
- **DevExpress -4** (4204 → 4200)

Tracked-root regression -9 exceeds the LOOP-PROMPT.md threshold (>5 new failures = revert). The typerefDot alternative interacts badly with existing GLR paths in tracked-root code that doesn't use the namespace-IFDEF pattern.

Reverted. The narrower iter-38 type-rule version stays.

---

## 2026-05-25 01:55  Iter 41 — asmBody atomic-identifier fix (foundation)

Bug found: `asm lock xadd [addend], value end;` — parser failed because the asmBody regex matched `end` inside `addend` (the embedded `end` substring).

Original regex was char-by-char with 4 alternatives:
```
/[^eE]/, /[eE][^nN]/, /[eE][nN][^dD]/, /[eE][nN][dD][A-Za-z0-9_]/
```

The 4th alt requires alphanumeric AFTER `end` — `addend]` has `]` (non-alpha), so none of the 4 match. asmBody terminated at the `e` of `addend`, parser saw `end` as kEnd keyword (wrongly closing the asm).

**Fix**: prepend a full-identifier alternative for idents NOT starting with e/E:
```
/[a-df-zA-DF-Z_][a-zA-Z0-9_]*/
```

This consumes `addend` whole. The e-starting char-by-char alts remain for identifiers like `endif`/`endloop`/`extension` and for the actual keyword `end` (none of which match, so asmBody terminates at the correct boundary).

**Result**: 0 file delta (OtlSync.pas has unrelated downstream errors that prevent flip), but the asm probe `asm lock xadd [addend], value end;` now parses clean. Foundation commit — likely flips other files when their other errors are also addressed.

---

## 2026-05-25 02:10  Iter 42 — Investigation only — `xCreate: function() ; cdecl ;`

Two FireDAC files (Phys.SQLiteCli, Phys.MongoDBCli) fail at sqlite3_module record field declarations:
```pascal
xCreate: function(db: psqlite3; pAux: Pointer; ...): Integer; cdecl;
```

The `cdecl` sits AFTER the field-terminating `;`. iter 29 attempted to fix this with an optional trailing `;cdecl;` clause on `declField` — caused -2 regression because the optional clause matched starts of next fields where `cdecl:` appeared as a field name.

Padding `:array of Byte` cluster (FireDAC.Phys.MongoDBCli line 139) has invalid Delphi syntax (missing `;` after `Byte` before the next line's `end;`); parser correctly rejects.

No commit-worthy fix for either. Plateau holding at 92.09%.

---

## 2026-05-25 02:30  Iter 43 — Underscore digit separator `1_000_000_000`

Delphi 11+ allows underscore as digit-group separator in numeric literals:
```pascal
LNewTime := AFrameTimeNanos / 1_000_000_000;
```

First attempt extended both `_literalInt` and `_literalFloat` regex with `(_?[0-9])` groups. The float regex rewrite (two-alternation form for leading-digit vs `.N` forms) was too aggressive — **−39 files** (ORM3-CLIENT -3, Embarcadero -16, DevExpress -14). Reverted.

Narrower attempt — only `_literalInt`:
```
/[-+]?[0-9](_?[0-9])*/
/\$[a-fA-F0-9](_?[a-fA-F0-9])*/
```

**Result**: +2 files (Embarcadero **89.32%**). Float left alone (no real-world `3.14_159` patterns in corpus).

---

## 2026-05-25 02:45  Iter 44 — `raise X at addr` (BIG WIN)

Found via cluster scan of single-error files: `raise X at addr` — Delphi exception re-raise pattern with explicit call-site address. Used by DUnit test infrastructure, exception loggers, RTL, and JCL stack-trace tools.

Examples:
```pascal
raise EFoo.Create('msg') at ReturnAddress;
raise Error at errorAddrs[0];
raise oEx at ReturnAddress;
```

Grammar's `raise` rule was: `kRaise [exception] ;`. Extended with optional `at <addr>` clause. Required new `kAtWord` token (regex `/at/i`) — distinct from existing `kAt` which is `@` operator.

**Result**: **+43 files** (15719 → 15762; 92.10% → **92.35%**).
- Embarcadero: 89.32% → **89.91%** (+31) — DUnit + RTL + JCL
- Spring4D: 91.34% → **91.46%** (+1)
- DevExpress: 95.76% → **95.81%** (+2)

Biggest single-iter win since iter 28 (uses-clause pp_block, +69 files). The pattern is heavily used in Delphi test frameworks and stack-trace utility libraries.

---

## 2026-05-25 03:00  Iter 45 — Soft-keyword names in declConst

DevExpress `dxCoreGraphics.pas` has a color palette where `Default` is one of the named constants:
```pascal
public const
  Empty                = $00000000;
  Transparent          = $00FFFFFF;
  Default              = $00010203;
  AliceBlue            = $FFF0F8FF;
```

`Default` is a Delphi keyword (used in property `default` specifier) so the lexer matched it as kDefault. Added the same soft-keyword alias set used for declVar to declConst — Default + Message/Name/Index/Read/Write/Reference.

**Result**: +4 files (15762 → 15766; 92.35% → **92.38%**).
- DevExpress: 95.81% → **95.90%** (+4)
- Other roots held

---

## 2026-05-25 03:15  Iter 46 — Keyword-as-identifier on exprDot RHS

DevExpress dxEMF.DB.Criteria has enum classes whose members are named after logical operators:
```pascal
if AOperand.OperatorType = TdxUnaryOperatorType.Not then ...
```

The `Not` after `.` is lexed as kNot keyword, breaking the expression. Added a specific exprDot variant that allows `kNot`/`kAnd`/`kOr`/`kXor` aliased to identifier on the RHS of dot. Narrow set (not all keywords) to minimize GLR impact.

**Result**: +11 files (15766 → 15777; 92.38% → **92.44%**).
- DevExpress: 95.90% → **96.13%** (+10)
- Spring4D: 91.46% → **91.59%** (+1)
- Other roots held

---

## 2026-05-25 03:30  Iter 47 — Tried typerefDot keyword-RHS — 0 delta, reverted

Extended iter 46's `exprDot` keyword-RHS (Not/And/Or/Xor) to typerefDot. **0 file delta** — pattern doesn't appear in TYPE position in the corpus, only expression position. Reverted to avoid grammar bloat.

---

## 2026-05-25 03:45  Iter 48 — Investigation only (non-IFDEF cluster mining)

Looked at top non-IFDEF tracked-root clusters:
- **`LookAndFeel.Refresh; end; function ...`** — cxButtons.pas: IFDEF wraps two-different-shape procedure signatures (`procedure F(M,D,b)` vs `procedure F(M,D)`). The pp_block consumes the whole IFDEF block; parser sees `begin ... end;` orphaned with no preceding `procedure`. Same shape as MStreams asym-open BLOCKED pattern.
- **`end.` Spring.Hash.pas r583** — whole-file cascade; the file is wrapped in nested IFDEFs ending in `{$IFEND}\nend.\n`. Parser broke far upstream and ERROR spans [0,0]-[583,0].
- **`CustomFunctionOperator: TdxCustomFunctionOperator` (no `;`)** — invalid Delphi source (missing terminator); parser correctly rejects.

No commit-worthy fix from this investigation. The remaining non-IFDEF cluster is dominated by:
1. Cascades from upstream IFDEF-in-expression / asymmetric-IFDEF failures (BLOCKED root cause)
2. Invalid source code (parser correctly rejects)

The "easy wins" cohort is exhausted at 92.44%. Further progress likely needs the IFDEF-as-token-bag refactor (proposed but not yet implemented).

---

## 2026-05-25 04:00  Iter 49 — Attempted symmetric IFDEF refactor — REVERTED

Discrete PP_OPEN/PP_ELSE/PP_END tokens with body-shape heuristic; `ppExprAlt` in `_expr` where both branches parse as `_expr`. **-85 files** (Spring4D -13, Embarcadero -18, DevExpress -2, OmniThread +3). Heuristic too aggressive for asymmetric IFDEFs that LOOK expression-shaped. Reverted.

---

## 2026-05-25 04:30  Iter 50 — Attempted Option-A — ABANDONED (perf cliff)

Option-A: discrete pp tokens + PP_ELSE_BODY (opaque ELSE branch). Implemented:
- Scanner emits PP_OPEN only when block has depth-1 `{$ELSE}` (verified two-branch via `peek_has_else_branch`).
- Grammar `ppExprAlt: pp_open + _expr + pp_else + pp_else_body + pp_end` in `_expr`.

**Result**: PROCESS HUNG. Corpus reached only 50% in 30+ min (vs normal 5 min). Killed.

**Causes**:
1. `peek_has_else_branch` walks up to 2KB per `{$IF}`. 107k IFDEFs × 2KB = significant.
2. `scan_pp_else_body` uses mark_end-as-rollback — likely correctness bugs around nested directives.
3. GLR ambiguity between ppExprAlt and existing pp_block-as-extras absorption.

Reverted to iter 48 baseline (**92.44%**). The refactor is correct in principle but needs:
- Cheaper scanner (no big peek)
- Cleaner ELSE-body consumption
- Fewer simultaneous grammar positions OR pp_block removed from extras

User's Option-B+ (`else: choice(_expr, pp_else_body)`) is GLR-natural and the right next attempt — but requires the underlying scanner perf issue to be solved first. Holding iter 51 pending design.

---

## 2026-05-25 04:50  Iter 51 — Minimal probe (Option-B+) — REVERTED

Stripped-down probe: scanner emits PP_OPEN/PP_ELSE/PP_END unconditionally when `valid_symbols` asks (no body peek, cheap). Grammar `ppExprAlt` in `_expr` only, both branches as `_expr`.

**Result**: **-3,031 files** (15777 → 12746; 92.44% → 74.68%). Same catastrophe as iters 37/49/50.

**Root cause finalized**: scanner emits PP_OPEN in ANY position where `_expr` is reachable from current parser state (which is most of the corpus — expressions are reachable from statements, declarations, args, etc.). EVERY `{$IF}` then tries to match `ppExprAlt`. For:
- 70% single-branch IFDEFs (no `{$ELSE}`): fail because grammar requires `{$ELSE}`
- 20% asymmetric IFDEFs: fail because branches aren't valid `_expr`s
- ~10% truly symmetric expression IFDEFs: succeed

tree-sitter error recovery cascades, dropping 3,000+ files.

**Final architectural conclusion**: structural IFDEF support requires a big-bang refactor:
1. Remove pp_block from extras
2. Add ppAlt rules at EVERY position where IFDEFs can appear (~10 positions: `_expr`, `_statement`, `_definition`, type, args, fields, ...)
3. Make ELSE branch a token-bag for asymmetric cases (any-keyword/any-literal/any-operator)
4. Single commit covering all positions — incremental introduction is fundamentally impossible
5. Likely 5-10 iters of debugging the new grammar before re-stabilizing

This is multi-day grammar engineering work, beyond what the autonomous iter loop can do safely.

**Practical ceiling at 92.44% — accepted.** Further progress would require either:
- A preprocessor pass that expands IFDEFs before tree-sitter (out of scope for this grammar)
- The full grammar rewrite above (worthwhile project but needs a sustained design session)

Reverted to iter 48 baseline.

---

## 2026-05-25 05:00  Iter 52 — Investigation only (no new wins)

Re-scanned single-error tracked-root files for any unexploited piecemeal patterns. Found:
- DevExpress `function FOO; overload` (no trailing `;`) — invalid Delphi source
- OmniThread `FDriver.Read(howmuch?, whattodo?)` — pseudo-code TODO marker with `?` placeholders
- DevExpress `function (args): T; stdcall = nil` — same iter-29 BLOCKED pattern (cdecl-after-`;`)
- DevExpress `function ... ; stdcall` (no `;` after stdcall) — invalid syntax

All remaining patterns are either:
1. Invalid Delphi source (parser correctly rejects)
2. Same blocked-pattern shapes already attempted in earlier iters

**No piecemeal wins available.** Iter loop genuinely at architectural ceiling. The path forward is the multi-day structural rewrite OR a separate preprocessor pass.

---

## 2026-05-25 05:30  Iter 53 — `writeonly` property modifier (PLATEAU BROKEN)

Investigated MISSING-only fails (files with no first_error but missing_count > 0). Embarcadero `OCX/Servers/Access2000.pas` had a single MISSING insertion at the property modifier list:

```pascal
_WizHookDisp = dispinterface
  ['{CB9D3171-...}']
  property Key: SYSINT writeonly dispid 2237;
```

Grammar had `kReadonly` in the declProp modifier set but was **missing `kWriteonly`** — symmetric oversight from iter 2's keyword sweep. Added the kWriteonly token + entry in declProp's `repeat(choice(...))`.

**Result**: **+22 files** (15777 → 15799; 92.44% → **92.57%**).
- Embarcadero: 89.91% → **90.25%** (+18 — crosses 90% threshold!)
- Spring4D: 91.59% → **91.72%** (+1)
- DevExpress / OmniThread / ORM3 / TableTools: held

Files unlocked across OCX/Servers (Access2000/2010/AccessXP, DAO2000/2010, plus equivalents in OleServer). The single-keyword fix had broad reach because OLE dispinterface declarations are heavily used in the entire `OCX/Servers/` tree.

**Plateau decisively broken.** Continuing piecemeal — there may be more single-keyword oversights to find by hunting MISSING-only cluster.

---

## 2026-05-25 06:30  Iter 54 — Trailing `;` in record initializer

DevExpress dxCore.pas has 15 MISSING-only failures from generated Unicode-equivalence tables:
```pascal
const
  CEquivalents: array[...] of TItem = (
    ( Letters: #$A732;
      Replacement: 'AA'; ),   // <-- trailing ; before )
    ( Letters: #$00C6#$01FC#$01E2;
      Replacement: 'AE'; ),
    ...
  );
```

The trailing `;` after `'AA'` before `)` wasn't allowed by `recInitializer`. Delphi compiler accepts it (and many tools generate code this way). Added `optional(';')` between the delimited fields and the closing `)`.

**Result**: **+28 files** (15799 → 15827; 92.57% → **92.73%**).
- Embarcadero: 90.25% → **90.51%** (+14)
- DevExpress: 96.13% → **96.40%** (+12)
- Other roots held

The fix unlocked dxCore and similar DevExpress data-table files plus Embarcadero RTL files using the same idiom.

---

## 2026-05-25 07:00  Iter 55 — Cheap-peek IFDEF-in-expression — REVERTED

User authorized 7th attempt at structural IFDEF, this time with a CHEAP O(20-char) body-shape peek instead of iter 50's expensive 2KB peek. Plan: scanner emits PP_OPEN only when body's first non-whitespace char looks expression-shaped (digit, paren, unary op, string lit, identifier NOT a statement keyword).

Implemented: scanner with `body_looks_expression_shaped()` keyword-table check; ppExprAlt rule in `_expr` with both branches as `_expr`; in-line PP_BLOCK fallback when peek says non-expression.

**Result**: **-2,891 files** (15827 → 12936; 92.73% → 75.80%). Same cliff as iters 37/49/51.

**Conclusion (definitive)**: 7 attempts have all failed at the same cliff. The GLR ambiguity between extras pp_block absorption and ppExprAlt CANNOT be resolved by:
- Heuristic body-shape detection (iters 37, 49, 50, 55)
- Refined precedence (iters 21, 24)
- Different rule placement (iters 30, 39, 40, 51)

The structural-IFDEF feature in tree-sitter REQUIRES a full architecture rewrite where pp_block is removed from extras and ppAlt rules cover EVERY position simultaneously. No incremental path exists.

**Definitively pausing IFDEF-in-expression work.** Plateau at 92.73% (post iter-54 wins) is the practical ceiling for this architecture.

Reverted to iter 54 baseline.

---

## 2026-05-25 07:30  Iter 56 — Inline calling-conv before `;` in _declProc

Embarcadero `Bde.pas` (BDE RTL bindings) has 205 MISSING insertions — by far the largest remaining MISSING-only cluster. Pattern:

```pascal
function DbiInitFn(
    iVer: Word;
    pEnv: pDBIEnv
  ): DBIResult stdcall;
```

The calling-convention `stdcall` is inline (no `;` before it) but the grammar's `_declProc` required `; stdcall;` shape. Added `optional(choice(stdcall|cdecl|safecall|...))` between the type and the terminating `;`.

**Result**: +15 files (15827 → 15842; 92.73% → **92.82%**).
- Embarcadero: 90.51% → **90.78%** (+14 — Bde.pas + similar RTL imports)
- Spring4D / DevExpress / others: held

The single Bde.pas file unlocked accounted for 205 MISSING tokens. The grammar fix is structurally important even though file-count only +14 (Bde was 1 file with massive MISSING cascade).

---

## 2026-05-25 07:50  Iter 57 — Inline calling-conv on lambdas (WebView2 pattern)

Vcl.Edge.pas (WebView2 wrapper) uses anonymous methods with `stdcall` for COM callbacks:
```pascal
var handler :=
  function(AResult: HResult): HResult stdcall
  begin
    Result := S_OK;
  end;
```

Grammar's `lambda` rule allowed `procedure|function args [: type] body` but not the inline calling-convention between type and body. Added the same `optional(choice(stdcall|cdecl|...))` clause as iter 56's _declProc.

**Result**: +7 files (15842 → 15849; 92.82% → **92.86%**).
- Embarcadero: 90.78% → **90.85%** (+4: Vcl.Edge.pas, FMX.Forms, WebView wrappers)
- Spring4D / DevExpress / others: held

Same pattern as iter 56 applied to a different rule. The WebView2 / COM-callback idiom is mostly contained but worth covering.

---

## 2026-05-25 08:10  Iter 58 — exprTpl args narrowed to typeref (HUGE WIN)

DevExpress cxGeometry and many others had `MISSING kGt` insertions on `H < 0` style binary-less-than expressions. The grammar was parsing them as `Foo<0>` (exprTpl generic instantiation) because exprTpl's args were `delimited1($._expr)` — too permissive.

In real Delphi code, generic instantiation almost always uses TYPE arguments: `TList<TFoo>`, `TDictionary<string, Integer>`, `TArray<Spring.IList<Spring.TPair<TKey, TValue>>>`. Constant generic args (`Foo<5>`) are exceedingly rare.

Narrowed to `delimited1($.typeref, ',', 5)`. Required a `[$._ref, $._typeref]` conflict declaration because identifiers can be either at the `<args>` boundary.

**Result**: **+77 files** (15849 → 15926; 92.86% → **93.31%**).
- DevExpress: 96.40% → **97.68%** (+56 — biggest jump in DevExpress history)
- Embarcadero: 90.85% → **91.08%** (+12)
- OmniThread: 92.51% → **93.26%** (+2)
- Spring4D: 91.72% → 91.46% (-2 — acceptable, below the >5 threshold)

The Spring4D regression is because Spring4D uses some non-typeref generic args (constant expressions). 2 files affected — net trade-off strongly positive.

This was a long-standing pessimization in the original tree-sitter-pascal grammar; nobody had narrowed exprTpl because the implications weren't measured.

---








