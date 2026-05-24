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





