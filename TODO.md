# TODO

Living list of follow-up work. Items move from here to commits or to FUTURE.md as they're addressed or deferred.

## Current focus

- [ ] **Push orchestrator past 99% on full corpus.** Currently at 98.43% (master: 98.22%). 65 master-pass-but-orch-fail regressions remain — mostly Indy .NET .dpk patterns, EurekaLog defaultValue IFDEF chains, Embarcadero RTL files with specific defines needs. Each defines-tuning iter recovers 10-30 files.

- [ ] **Tighten declared() resolution.** Currently returns false (no symbol table). Files using `{$IF declared(SymName)}` get the wrong branch. Lightweight symbol pre-scan (TYPE/CONST/VAR/FUNCTION/PROCEDURE declarations in the same unit) would close most cases.

- [ ] **Include-file resolution beyond same directory.** Some `{$I X.inc}` references live in sibling directories; need a search-path option per project.

## Statement-level grammar gaps (found 2026-07-06 via Delphi-RAG-lint indexing)

Surfaced while indexing `Delphi-RAG-lint/src/cli/DRagLint.CLI.pas` (a real, compiler-clean
unit). These are **grammar rule gaps**, a different class from the defines/orchestrator work
above — specific *valid* Delphi-13 constructs that the master grammar errors on mid-file. Each
undercuts the "parses ~99.9% of real code" claim at the statement level, and a recovering
error still drops the local symbols in that scope from a consumer's index.

**FIRST STEP before any grammar edit — rule out staleness.** [RESOLVED 2026-07-16 — but keep
reading, the rule stands.] The DLL shipped in Delphi-RAG-lint was dated **May 29** and stayed that
way for ~6 weeks, so drag-lint ran a pre-v1.1.0 grammar while filing bug reports against it as if
it were current. **All 17 live DLL copies were rebuilt + refreshed 2026-07-16** (2,544,640 →
2,895,360 bytes on Win64). Recipes: `Delphi-RAG-lint/build/_buildgrammar{32,64}_manual.bat` and
`_builddfm{32,64}_manual.bat` — run via PowerShell `Start-Process -Wait` **without**
`-NoNewWindow` (it hangs after the first build with it).

**Why it went unnoticed, and why it will recur:** `drag-lint info` prints
`tree-sitter: delphi13 14 / dfm 14`. That `14` is the **tree-sitter ABI version, not a grammar
version** — constant across every grammar and every build. There is no grammar build stamp, so
staleness is invisible. A fix was proposed to drag-lint in
`INBOX-draglint-reply-inline-var-array-of.md` (export a version symbol, or print DLL mtime+size).

**Also stale-prone — the measurement harness:** `build/Release/*.node` and
`pure/build/Release/*.node` are what `tools/parse-corpus*.js` load. Run `npx node-gyp build` in
BOTH the root and `pure/` after `tree-sitter generate`, or you will measure the OLD grammar.

Only the gaps that still reproduce against a freshly-built parser are real.

Verified against the CURRENT grammar (`npx tree-sitter parse`, tree-sitter 0.24.7), isolated:

- [x] **FIXED 2026-07-06: inline `var` with an anonymous `array of T` type.**
  `var Y: array of Integer;` errored (ERROR at the `array of` span). Root cause: BOTH inline-var
  rules — `varDef` (no initializer) and `varAssignDef` (the `var X: T := e` initializer form,
  LHS of `assignment`) — restricted their type slot to a bare `$.typeref`, so any anonymous type
  (`array of T`, record, enum) was rejected. Fix: widened both type slots to
  `choice($.type, $.subrangeType)` — the same production the var-section `declVar` already uses.
  **Critical gotcha (cost one regressing corpus run):** the two rules share the `var X: <type>`
  prefix, so widening only `varDef` made the GLR parser mis-disambiguate and regress 156 files
  using the far more common `var S: string := expr;` form. They MUST be widened in lockstep.
  Verified: minimal repro clean; `DRagLint.CLI.pas` array-of-T hits (1091/1092/1100) clean
  (CLI.pas leaf errors 39 -> 4); full corpus 0 regressions, +2 files (IBX.IBScript.pas
  `var oldParams: Array of Variant;`), 98.240% -> 98.257%. Regression tests in
  `test/corpus/inline-var.txt`. Staleness ruled out first: committed `src/parser.c` was already
  current with `grammar.js`, and the gap reproduced against a freshly-generated parser.

- [x] **FIXED 2026-07-06 (commit adf435a): `expr < SoftKeyword` misparsed as generic
  instantiation.** `while (EolIdx < Read) do` inserted a MISSING `>` — `kRead`/`kWrite`/`kName`/
  `kMessage` were aliased into `_typeref`, so `a < Read` forked into `a<Read...>` generic and
  demanded `>`. Fix: removed those 4 soft-keyword aliases from `_typeref` (kept `kReference`),
  mirroring the `kIndex` precedent — the word-rule still promotes them to `$.identifier`, so
  type-name uses (`X: Read`) and property `read`/`write` accessors keep parsing. Full corpus 0
  regressions; drag-lint src 110/113 → 112/113 (both `DragLint.Plugin.*` fixed). Test:
  `test/corpus/expr-lt-softkeyword.txt`.

- [~] **PARTIALLY FIXED 2026-07-06 (commit f85b412): declaration-hint / callconv keyword as a
  var/field name after a prior declaration.** `var X: string; Platform: string;` ate `Platform`
  as a trailing hint on `X`. **declVar half DONE:** added `kPlatform`/`kDeprecated`/
  `kExperimental`/`kRegister` to `declVar`'s name-alias list; 0 corpus regressions; CLI.pas leaf
  errors 4 → 1. Test: `test/corpus/var-keyword-names.txt`.
  **declField half STILL OPEN** (`Winapi.D3D10.pas` `Register: UINT;` struct field): applying the
  same alias to `declField` triggers a cascade of `declField`/`declFieldNoSemi`/callconv GLR
  conflicts that blow up the parser tables (5-min generates). Needs a more careful approach —
  perhaps a dedicated field-name-that-is-a-keyword production gated so it can't be confused with a
  trailing callconv on the previous field. Verify via full corpus diff.

- [ ] **NEW GAP (isolated 2026-07-06): type alias with trailing hint on a dotted RHS.**
  `ToolsAPI.pas` L1164: `TOTAThreadContext = Winapi.Windows.TContext deprecated;` inserts a
  MISSING `identifier`. The `deprecated` hint after a fully-qualified (dotted) type-alias RHS
  isn't accepted. Minimal-repro + fix TBD; lower priority (1 known file).

- [ ] **NOT a gap (hypothesis debunked, recorded so nobody re-chases it):** dot-qualified type
  names in a var decl (`Resolver: DRagLint.Project.Resolver.TProjectResolver;`, and 2-level
  `R: System.SysUtils.TStringHelper;`) both parse CLEAN in the current grammar. Confirmed again
  2026-07-06 — a dotted-name line parses clean both alone and inside a full var block once the
  actual trigger (below) is removed. The reported line was downstream error-recovery noise.

- [ ] **ISOLATED GAP (2026-07-06): declaration-hint keyword as a var name after a prior decl.**
  This is the true root cause of the CLI.pas 8236/8293/8362/8398 quartet (the array-of-T fix
  cleared the OTHER 35 of CLI.pas's 39 leaf errors; exactly these 4 survive). The failing region
  is `ResolveConsumerDbs`'s var section, which declares a variable named `Platform`. Minimal repro:
  ```pascal
  procedure P;
  var
    X: string;
    Platform : string;   // <-- ERROR here (col 11), NOT on X
  begin
  end;
  ```
  Mechanism (from the parse tree): after the first `declVar` (`X: string`), the parser greedily
  consumes `Platform` as a trailing `procAttribute (kPlatform)` declaration hint on `X` (the
  `CmdShow: Integer platform;` production), then chokes on the dangling `: string;`. `Platform`
  as the FIRST decl in the section parses clean — the ambiguity only bites mid-section. Same bug
  for the other two hint keywords used as var names after a prior decl: **`Deprecated`** and
  **`Experimental`**. Likely fix: add `kPlatform`/`kDeprecated`/`kExperimental` to `declVar`'s
  name-alias list (like the existing `kMessage`/`kName`/`kDefault` aliases) AND/OR make the
  trailing-hint slot require the hint not be followed by `:` — but this is a delicate GLR area
  (the hint and the next-var-name genuinely collide), so verify against the full corpus with a
  pre/post diff exactly as the array-of-T fix did. NOT bundled with the array-of-T fix.

### Corpus survey 2026-07-06 (post array-of-T fix) — where the remaining misses are

Ran the master (THEN-wins) parser against two targeted trees to see what stands between us and 99%+.

- **Delphi-RAG-lint tree (448 files): 98.65%.** `src/` 110/113 (97.3%) — the 3 fails are the two
  new gaps above (`< Read` MISSING-kGt x2, `Platform` var-name x1). `tests/` 319/322 real (99.1%) —
  all 3 fails are INTENTIONAL fixtures (`BrokenSyntax.pas` `:= 42`, `syntax-error-ifend.pas`
  `;;;garbage@@@`, `Docs.pas` doc-comment stress fixture). `third_party`/`scratchpad`/`build` 100%.
- **RTL (Studio 37 `source/` tree, 2397 unique files): 97.9%** (50 unique fails). Classified:
  - **~26 (52%) `{$IFDEF}` cross-branch** — a statement/decl split across IFDEF arms
    (`{$IFDEF POSIX} sDB := ... {$ENDIF};`). NOT a grammar gap — this is exactly what the
    `delphi13-preprocessor` + orchestrator exist to resolve. Counts toward the orchestrator goal
    (top of file), not the master grammar.
  - **~5 asm / .NET** — inline `asm` (MOV/CALL) and DOTNET-only branches. Already "does NOT count"
    (see below).
  - **~10 MISSING-node** — REAL grammar gaps, several distinct causes: the `< SoftKeyword` gap,
    `class function F: TObject {$IFDEF} unsafe {$ENDIF}` (hint-in-ifdef after return type),
    `TAlias = Dotted.Type deprecated;`, etc. **This bucket is the highest-value lever for the
    master grammar** — ~31 unique MISSING-only files corpus-wide, all genuine gaps.
  - **~4 non-Pascal-ish unit headers** (`SHDocVw.pas`, `bdemts.pas`) + a few `Register:`/field-name
    cases (the new gap family above).

**Takeaway on "99%+ on RTL":** the master grammar alone is near its ceiling on RTL (~98%) because
half the RTL misses are IFDEF-cross-branch by design. Two paths raise it: (1) run RTL through the
**orchestrator** (resolves the IFDEF half — this is the existing top-of-file goal), and (2) close
the **MISSING-node grammar gaps** above (recovers ~10 RTL + ~20 more corpus-wide, no defines
needed). The gaps in (2) are the concrete, self-contained follow-ups; the IFDEF half is orchestrator
work, not grammar work.

### Grammar-gap sprint 2026-07-06 (session 2) — 5 fixes shipped, full corpus 98.207% → 98.322%

Each fix followed the same discipline: minimal repro → generate+build → **full-corpus pre/post
diff requiring 0 regressions** → corpus regression test → atomic commit.

| # | Gap | Commit | Corpus effect |
|---|-----|--------|---------------|
| 1 | `unit U experimental;` / `platform;` / `library;` (unit-level hint) | `820c5af` | +6 files |
| 2 | bare `string` as last record field, no trailing `;` | `069107d` | +3 files |
| 3 | `function F: T unsafe;` (ARC method directive) | `a99900b` | +3 files |
| 4 | `expr < SoftKeyword` (Read/Write/Name) misparse-as-generic | `adf435a` | drag-lint 97.3→99.1% |
| 5 | hint/callconv keyword as var name after prior decl (declVar half) | `f85b412` | CLI.pas 4→1 errors |

Net: full corpus 16214 → 16233 ok (+19). drag-lint src 110/113 → 112/113 (99.12%). All five had
**0 corpus regressions** (two — the naive #2 with full declString/declArray, and the initial #5
with kUnsafe in procAttribute — were caught by the diff and narrowed before commit).

### Session 3 (2026-07-06) — published v1.1.0, ported to pure, +2 more gaps

- **Published `v1.1.0`** (pushed + tagged; npm publish still manual). RELEASE-NOTES-v1.1.0.md.
- **Ported the 5 root fixes to `pure/grammar.js`** (`a9892fe`) so the preprocessor/orchestrated
  path gets them too. Orchestrated (preprocess → pure) full corpus **99.34% → 99.37%**, 0
  regressions. (gap #2 was already solved in pure via `alias(kString, typeref)`.) The pure grammar
  is a SEPARATE hand-maintained file — root fixes must be ported by hand; there's no generator.
- **Gap #6 — type-alias trailing hint** (`T = Winapi.Windows.TContext deprecated;`, ToolsAPI):
  added a deprecated/platform/experimental/library slot before the `;` in declType. `a8cb43f`
  (root + pure). Master +1, orchestrated +1.
- **Gap #7 — `not in` operator** (`if 1 not in a then`, isnotnotin.pas): a leading `not` can't
  attach to the left `in` operand, so `not in` needed a dedicated infix op. `0a5b6cd` (root +
  pure). Master +1, orchestrated +1. (`is not` already parsed via `is` + unary-`not`; no
  production needed.)

- **Gap #8 — float digit separators** (`6.022_140e23`, Delphi 12+): integer separators already
  worked; `_literalFloat` didn't. Widened its regex to the `(_?<digit>)*` shape without breaking
  the `..` range operator (verified guard). `2e14b74` (root + pure). Correctness fix (fixture not
  in corpus).
- **Gap #9 — record/class field subrange type** (`FtrListCount: 0 .. FTRRECMAXCOUNT;`): declField's
  type slot was `$.type` (excludes subrangeType); widened to `choice($.type, $.subrangeType)` like
  declVar. `db5e6cc` (root + pure). Master +2, orchestrated +3. **Found by parsing ORM3** (below).

### Own-projects measurement (2026-07-06, drag-lint rows re-measured 2026-07-16)

| Project | master grammar | orchestrated (preprocessor → pure) |
|---|---|---|
| **ORM3** (user production code, 770 files) | **99.74%** (768→**769**/770 after gap #9) | **100.00%** (770/770) |
| **drag-lint src** (139 files) | **100.00%** (139/139) — was 99.12% (113/114) before the `Local` fix | — |
| **drag-lint-graph** (31 files) | **100.00%** (31/31, 1 harness-excluded) | — |
| **drag-lint tests** (322 files) | 98.76% (318/322) — all 4 fails intentional* | — |

\* `BrokenSyntax.pas`, `syntax-error-ifend.pas`, `Docs.pas` (doc-comment stress fixture), and
`tests/preprocess/fixtures/platform_heavy.pas` — the last is an `{$IFDEF MSWINDOWS}` cross-branch
*preprocessor* fixture, so failing on the MASTER path is by design, not a gap.

ORM3's 2 master-grammar misses: gap #9 (fixed) + `MStreams.pas BitCount` — which is a nested
`{$IF} asm ... {$ELSE} ... {$IFEND}` (IFDEF-cross-branch **with asm arms**). That's the master
grammar's by-design THEN-wins limitation, NOT a grammar gap: it PASSES on the orchestrated path
(confirmed).

**CORRECTION 2026-07-16:** the claim that drag-lint's 1 miss (`CLI.pas DoSelfTestManifestMerge`)
was "the same class — a multiline-const-in-context whole-function interaction the orchestrator
resolves" was **wrong**. It was an ordinary grammar gap: a local var named `Local` (see the closed
entry in the still-open list). Now fixed, so **drag-lint src is 100% on the MASTER path** — no
preprocessor required. **Takeaway: on the user's own code the grammar is effectively complete —
99.7% raw ORM3 / 100% raw drag-lint, 100% with the preprocessor.**

### Session 4 (2026-07-06) — 2 more gaps (root + pure)

- **Gap #10 — anonymous enum as an array index** (`array [TScheme, (cpHi, cpLo)]`, Orpheus
  ovclabel.pas): added `$.declEnum` to the array index choice, with a `[_ref, declEnumValue]`
  conflict so a parenthesized subscript `A[(x+1)]` still parses. `f27689b`. +1 both paths.
- **Gap #11 — parameter attribute per-name in a shared group** (`const [REF] CLSID, [REF] IID:
  TGUID`, Datasnap.DSIntf): declArg's name group accepted only bare identifiers; now
  `delimited1(seq(optional(rttiAttributes), identifier))` with `[rttiAttributes]`+`[declArg]`
  conflicts. `9ce0460`. +1 both paths.
- **Attempted+reverted:** a labeled loop/conditional body (`while true do redo: case...`,
  superobject.pas) — cascaded into `caseCaseTr` GLR conflicts; not worth destabilizing the
  statement grammar for one file. **Skipped:** `is nested` (FPC-only, 1 Lazarus file, off-mission
  for a Delphi-13 grammar).

Current: master full corpus **98.39%** (16244 ok), orchestrated **99.44%** (16418 ok).

### Session 5 (2026-07-06) — remaining-92 triage: at the practical ceiling

Full classification of the 92 orchestrated failures. **No further clean grammar wins available.**

- **6 encoding/BOM** — NOT grammar gaps. The grammar handles a decoded BOM (`U+FEFF`) fine; these
  fail only because the *corpus harness* falls back to latin1 and turns the UTF-8 BOM bytes into
  `ï»¿`. A real consumer (drag-lint `EnsureUtf8Bytes`) decodes properly — e.g. `Velthuis.BigIntegers`
  parses CLEAN when UTF-8-decoded. (`System.pas` still fails decoded, but for IFDEF/asm reasons.)
- **~10 intentional fixtures** — `broken_unit`, `forwardwithoutsemicolon`, `numbers.pas` (`123123_`
  invalid trailing separator), `multiline` (odd triple-quote), `NOTREADYLIST`/`FORPROJECT` (data
  files), `genericinterfacemethoddelegation` (FPC).
- **~3 asm**, **C-code-in-.pas**, **.NET/DOTNET** — by-design exclusions.
- **Remaining "candidates" examined and ruled out:** `{$EXTERNALSYM}` interleaving parses clean in
  isolation (failures are downstream IFDEF/asm recovery); `dxServerModeUtils` is a *missing-semicolon
  source typo* (`deprecated 'msg'` with no `;`) — tolerating that would mask real errors; `is nested`
  is FPC-only (1 file).

**One real gap remains but is architecturally blocked:** `array[...] of T` as a last record field
with no `;` (SHX, MongoDBCli, ShlObj = +3). Adding `declArray` to `declFieldNoSemi` regresses
`array[0..4] of String[1];` **with** a trailing `;` (OoMisc, Z19b5 = -2/3) — the short-string `[N]`
element overlaps the no-semi form at the LEXICAL level, so GLR can't split them. A safe fix needs a
constrained array element (excludes `declString`); deferred as not worth the parser-table cost for
~1 net file. Documented inline at `declFieldNoSemi`. Also still open: field named after a
callconv/hint keyword (`Register: UINT;`, D3D10) — same declField/declFieldNoSemi table-explosion
risk.

**Bottom line:** the master grammar (98.4%) and orchestrated path (99.4%) are at their practical
ceiling on this corpus. What's left is by-design (IFDEF/asm — the preprocessor's job), invalid
source (typos, broken fixtures), non-Delphi (FPC, C, .NET), or harness artifacts (BOM). On the
maintainer's own production code the effective rate is 100% (orchestrated).

**drag-lint uses the MASTER path** (raw bytes → full `delphi13` DLL, no preprocessor — confirmed
via `DRagLint.Core.Indexer.pas:249/269` + `DRagLint.Parser.Delphi13.pas:31`). **DLL refreshed
2026-07-16**, so it now has every master-grammar fix through the `Local` gap. A message proposing
the preprocessor→pure path (with the CLI contract + trade-offs) was left at
`Delphi-RAG-lint/docs/INBOX-tree-sitter-preprocessor-adoption.md`. Note drag-lint's own Delphi
preprocessor port is complete + oracle-diff green (canonical for them since v0.92.0-alpha), but the
preprocessor→pure grammar swap is still deferred on their side — they run the full grammar.

### Measurement re-run 2026-07-16 (post `Local` fix, freshly rebuilt bindings)

| Path | ok / readable | rate | vs session-4 |
|---|---|---|---|
| **master** (raw → full grammar) | 16,242 / 16,508 | **98.389%** | 98.39% — unchanged |
| **orchestrated** (preprocessor → pure) | 16,416 / 16,508 | **99.443%** | 99.44% — unchanged |

The `Local` fix added **0 corpus files** — no file in the baseline corpus names a var `Local`; it
only occurs in drag-lint's own source, which was never in the corpus (now added to
`corpus-roots.txt`). The `-2 ok` vs session-4's 16,244/16,418 is **not a regression**: two
DevExpress files vanished from disk (DevExpress ships ~monthly), leaving both numerator and
denominator, so the rate is identical.

**Harness gotcha — denominators.** `parse-corpus*.js` emits an `error` key for files it
*intentionally excludes* (573 here: 410 `inc_fragment`, 154 `read_failed`, 7
`interpreter_fragment`, 2 `template_placeholder`). Those are NOT parse failures. Score as
`ok / (total - excluded)`; counting them as failures yields a bogus ~95%.

**`tools/corpus-roots.txt` does NOT reproduce this corpus.** It is a public *starter* file (6
roots). The real 17,081-file baseline additionally spans ORM3 (699), Indy (662),
RADStudio12Demos (787), Orpheus, dsharp, AsyncPro, DUnitX, EurekaLog, Loader2019 and IDE library
paths pulled by `import-delphi-paths.ps1` (`E:\CAD`, `CatalogRepository`). **Regenerating
`manifest-baseline.txt` from `corpus-roots.txt` alone silently shrinks the corpus to 12,889 and
drops ORM3** — do not do it without reconciling the roots first. Decide before publishing whether
to (a) keep the starter file public and record the maintainer's real roots in a gitignored local
file, or (b) commit the full root list.

> **2026-07-16 — every unique corpus failure has now been individually diagnosed and
> dcc32-verified. See [CORPUS-CEILING-REPORT.md](CORPUS-CEILING-REPORT.md) for the full
> classification, the two measurement defects found (31% duplicate manifest rows; the
> `error`-key scoring trap), and the ranked path from 0.275% to 0.1%. The list below is
> the grammar-gap subset of that report.**

### Session 2026-07-16 (b) — 6 commits, orchestrated 82 → 53 fails (99.503% → 99.679% raw)

Commits `6f10463`, `f7f590f`, `9bfffa9`, `32766a4`, `fa9ce2e`, `9ce187b`. What moved:

| fix | recovered (orchestrated rows) |
|---|---|
| preprocessor: include defines now PROPAGATE in expand mode (dcc textual-include semantics) + nearest-first include search (baseDir subdirs, then up to 3 parents each with their subdirs) | EurekaLog ELowLevel/ETools/EExceptionInfoGeneric (the whole "chained IFDEF arms" cluster — it was never a grammar gap, both arms blanked because `ELDefines.inc` in `Source\Common\` was unresolved AND its `{$DEFINE CPU64}` was being discarded), fibplus VariantRtn + Samples Zlib, YADF includefile |
| preprocessor: blank decoded UTF-8 BOM, incl. inside spliced includes | Velthuis.BigIntegers (`bases.inc` BOM landed mid-unit) |
| preprocessor lexer: `"..."` MASM asm strings + quote skips line-bounded | System.AnsiStrings (a `CMP AL,"'"` operand mis-paired `'`-strings and swallowed `{$ENDIF}`s to EOF) |
| grammar: implicit `begin..end.` unit initialization (unit-tail restructure, `[$.implementation]` conflict — the library-shaped `tr($,'block')` arm) | bdemts ×2, SHDocVw ×2, System.Win.InternetExplorer, Winapi.OpenGL.PkgHelper, AsyncPro APFPDENG ×2 |
| grammar: `trailingText` after final `end.` (W1011) | MainScreenForm, lazfileutils (doubled `end.`) |
| grammar: `genericArgTpl` (nested generic in method resolution clause) | YADF genericinterfacemethoddelegation ×2 |
| grammar: `_space` includes `\x00-\x1F` (dcc treats ctrl chars as blanks) | dxPDFForm (stray 0x12) |
| harness: BOM-sniffing UTF-16 reads + POSIX define profile for `\rtl\posix\` | umlauts (UTF-16LE), Posix.SysSocket |

**Attempted and DROPPED this session — read before retrying:**

- **`platform` hint before initializer** (`Default8087CW: Word platform = $033F;`,
  System.pas — 6 of its 7 errors). Adding a hint-then-defaultValue arm to `declVar`'s
  post-type optional **explodes `tree-sitter generate`** (>20 min, killed twice;
  bisect-confirmed the arm is the bomb — kPlatform/kDeprecated already have two other
  roles there: name-alias and post-value hint). Standalone value is ZERO anyway:
  System.pas also contains a labeled-body gap, so it stays failing until BOTH land.
- **genericArg name = full `genericTpl`** — same explosion; the shipped fix is the
  self-contained `genericArgTpl` (identifier-only recursion) instead.

### Session 2026-07-16 (c) — v1.2.0: +4 commits, orchestrated 53 → 38 fails, adjusted gap 0.115% → 0.035%

| fix | commit | recovered |
|---|---|---|
| **dcc-tolerance pass** (preprocessor, opt-in `tolerances:true`) — inserts the `;` dcc itself imagines; Rule A = final directive group (same-line-`;` + decl-keyword-follower anchors), Rule B = `array[..] of T` last field (next-code-line-`end` anchor); row/col-preserving, false positives provably harmless | `d0842ff` | dxCryptoAPI, dxServerModeUtils, dxGDIPlusAPI, MongoDBCli ×2, ShlObj, SHX (orchestrated) |
| **label as then/else/do body** — `lastStatement` gains optional `prec.dynamic(-1) $.label`; case-ARM interpretation keeps winning (`[caseCase]`/`[caseCaseTr]` conflicts — NAMED, unlike the old cascade) | `1537fd7` | LFN ×2, superobject (both paths) |
| **lenient directive tail in interface lists** — `declProcFront($)` extraction; `_declProcLenient` separator-form tail used only via `_declarations`; defProc header stays strict (`procedure P; stdcall begin` still rejected); `[procAttribute]` + `[_declProcLenient, _procAttributeNoExt]` conflicts | `9452610` | dxCryptoAPI, dxServerModeUtils, dxGDIPlusAPI (master path — orchestrated already covered by tolerance) |

**Ranked remaining REAL gaps, post-v1.2.0 — 4 rows total:**

| rows | gap | status |
|---|---|---|
| 2 | **System.pas** (+ dated backup) — `platform` hint before initializer (`Default8087CW: Word platform = $033F;`, 6 sites/file) | parked — the declVar arm is a bisect-confirmed generate table bomb. UNTRIED angle: `typeref` already tolerates a trailing `deprecated` hint (`[$.typeref]` conflict exists); adding `platform` there would make `Word platform` parse as the TYPE and `= $033F` follow naturally — one experiment, same 10-min abort rule |
| 2 | record field named after a callconv keyword (`Register: UINT;`, D3D10/D3D10_1) | **not worth it** (documented declField/declFieldNoSemi table-explosion risk) |

**Still-open grammar gaps — RE-VERIFIED 2026-07-16 (every entry below was retested; two were
already fixed and one is now closed, so trust this list over older prose above):**

- [ ] **STILL OPEN — declField half of #5** (`Winapi.D3D10 Register: UINT;`). Now precisely
  characterised: it is **exactly the 7 callconv keywords** in declField's post-`;` slot
  (grammar.js ~1504) — `Register`, `Stdcall`, `Cdecl`, `Safecall`, `Winapi`, `Inline`, `Pascal` —
  all ERROR as a field name after a prior field. The *hint* keywords (`Deprecated`,
  `Experimental`) and soft keywords (`Name`, `Index`) are **clean**, because the hint slot sits
  BEFORE the `;` while the callconv slot sits AFTER it (the `DispInvoke: procedure(...); cdecl;`
  production), so after `Foo: Integer;` the parser takes `Register` as a trailing callconv on the
  previous field and then chokes on `: UINT;`.
  **Verdict: not worth it.** Corpus-wide this is **2 files** (`Winapi.D3D10.pas`,
  `Winapi.D3D10_1.pas`) against the documented declField/declFieldNoSemi table-explosion risk.
- [ ] **STILL OPEN — `array of T` as last record field with no `;`** (SHX, MongoDBCli): +3 but
  regresses -2/3 via the short-string `[N]` lexical overlap. Architecturally blocked; see the
  inline note at `declFieldNoSemi`. Net ~+1 file — not worth the parser-table cost.
- [x] **ALREADY FIXED — `TAlias = Dotted.Type deprecated;`** (ToolsAPI). Fixed in `a8cb43f`
  (session 3, gap #6); this list just never got updated. Retested 2026-07-16: **parses clean.**
- [x] **ALREADY FIXED — `class function F: TObject {$IFDEF AUTOREFCOUNT} unsafe {$ENDIF};`**
  Retested 2026-07-16: **parses clean.**
- [x] **CLOSED 2026-07-16 — CLI.pas `DoSelfTestManifestMerge`** (was L8398, now L12305). `f85b412`
  recorded this as *"resisted synthetic isolation; not the keyword-name family"* — **that was
  wrong.** It IS the keyword-name family: the var is named **`Local`**, and `local` is a
  `procAttribute`, so after a prior `declVar` the parser ate it as a trailing directive. The
  earlier isolation attempt never tried `Local` as the name (`Global` on the preceding line was a
  red herring). Fixed root + pure via `alias($.kLocal, $.identifier)`; test in
  `test/corpus/var-keyword-names.txt`. **DRagLint.CLI.pas: 7 → 0 syntax errors.**

## Near term — finish the orchestrator

- [ ] **Reach 99%+ on full corpus.** Realistic ceiling once defines are tuned: ~99.5% (the last ~50 files are intentional broken-test cases, vendor source typos, files with `{$IF declared(...)}` that need full symbol awareness, and a handful of pathologically large auto-generated TypeLib units).

- [ ] **What does NOT count toward 100%:**
  - Inline `asm` blocks (treated as opaque text — by design, this isn't tree-sitter-asm).
  - Files with actual Delphi-compiler syntax errors (DUnitX has intentionally broken test cases; DevExpress has a couple of vendor `;` typos).
  - C-language code mistakenly placed in `.pas` files (fibplus TREES.PAS has literal `#if defined(...)` C preprocessor lines).

## Publishing plan (once we hit ~99%)

- [ ] **Publish `tree-sitter-delphi13` to npm.** The master grammar (98.22% self-contained THEN-wins parser).

- [ ] **Publish `tree-sitter-delphi13-pure` to npm.** The simpler sub-grammar that drops `pp_*` tokens — paired with the preprocessor.

- [ ] **Publish `delphi13-preprocessor` to npm.** Standalone text-transformation tool with the directive resolver. Can be consumed by other tools (formatters, refactoring tools, language servers).

- [ ] **Publish `tree-sitter-dfm` to npm.** Companion DFM/FMX form-file grammar (already 100% on real text-DFM).

- [ ] **Reach out to [Isopod / tree-sitter-pascal](https://github.com/Isopod/tree-sitter-pascal)** about the architectural pattern. The preprocessor + pure-grammar split is portable to their grammar — would let them break past their current pp_block-driven ceiling. Offer either a PR upstreaming our pattern OR coordinate a shared `pascal-preprocessor` package both projects consume.

## Optional companion packages (deferred)

- [ ] **delphi13-ifdef-resolver** — post-pass that recovers ELSE-branch parses for tools that need both. See [FUTURE.md](FUTURE.md) for the design (Approach 3 = `ts_parser_set_included_ranges`).

- [ ] **tree-sitter-delphi-plus-fp** — FreePascal-aware variant sharing the preprocessor and pure-grammar core. Separate repo so FP-specific extensions never leak into the Delphi-first quality of this one.
