# Draft GitHub Issue for Isopod/tree-sitter-pascal

> This is a draft text. Review, edit, then post manually at:
> https://github.com/Isopod/tree-sitter-pascal/issues/new
>
> Suggested title: **Sharing experience: preprocessor + pure-grammar split reaches 99.33% on a Delphi 13 corpus (and 30 grammar-only fixes for upstream consideration)**

---

Hi! 👋 First, thanks for maintaining tree-sitter-pascal — I forked it as a starting point for a Delphi-13-focused effort and the well-organized grammar made the work tractable.

Over the past two weeks I ran a high-cadence loop extending the grammar against a 39K-file Delphi 13 corpus (Embarcadero RTL/VCL, DevExpress, Spring4D, OmniThreadLibrary, JEDI/JCL, kbmMW, Indy, AsyncPro, fibplus, EurekaLog, plus internal production code). Two outcomes I want to share, and either could be useful to upstream — I'd love to hear what fits.

## Outcome 1 — Architectural finding: preprocessor + pure-grammar pipeline reaches 99.33%

The single-grammar approach (with `pp_*` external scanner tokens) topped out around **89.7-92%** on the Delphi 13 corpus, regardless of how many grammar-only extensions I added. Hard ceiling: cases where `{$IFDEF}` wraps *structural* elements like a function header, var keyword, or class inheritance line:

```pascal
{$IFDEF WIN32}
procedure Foo(A: Integer);
{$ELSE}
procedure Foo(A: Word);
{$ENDIF}
var
  X: Integer;
begin
  ...
end;
```

No matter where you put `pp_block` in the grammar choices, the parser can't see "there's a function header in there" — both branches together aren't a valid Pascal token sequence, and one-branch-wins regex can't distinguish active from inactive in cases like this.

So I split the work into a **preprocessor library** that resolves IFDEFs as a text transformation, plus a **pure sub-grammar** that drops `pp_*` tokens entirely:

```
raw .pas → delphi13-preprocessor (text→text) → tree-sitter-delphi13-pure → AST
```

Numbers on the same corpus:

| Approach | Pass rate (zero-ERROR-nodes) |
|---|---|
| Master grammar (THEN-wins external scanner) | 93.48% |
| Pure grammar alone (no preprocessor) | ~80% (depends on defaults) |
| **Pure + preprocessor pipeline** | **99.33%** |

Per-root: ORM3 (production) 100%, Spring4D 99.87%, DevExpress 99.82%, OmniThreadLibrary 99.62%, Embarcadero 99.24%. Remaining ~0.5% is intentional broken DUnitX cases, vendor source typos, C code in `.pas` files, etc.

The preprocessor evaluates `{$IFDEF}` / `{$IF expr}` chains (including numeric `CompilerVersion >= 21.0`), handles `{$DEFINE}` / `{$UNDEF}`, resolves `{$I X.inc}` includes. It also supports path-based per-project defines profiles (EurekaLog needs `COMPILER37` + `Compiler11_up..Compiler37_up`, AsyncPro needs `APAX` + `Ver130..Ver150`, etc.) — projects often assume their own gate define is on.

Inactive branches are replaced with whitespace so line numbers / source positions stay accurate.

**Published packages** (all MIT, npm + GitHub):
- [`tree-sitter-delphi13`](https://www.npmjs.com/package/tree-sitter-delphi13) — master grammar (your fork lineage, preserved)
- [`tree-sitter-delphi13-pure`](https://www.npmjs.com/package/tree-sitter-delphi13-pure) — pure sub-grammar
- [`delphi13-preprocessor`](https://www.npmjs.com/package/delphi13-preprocessor) — standalone preprocessor library
- [`tree-sitter-dfm`](https://www.npmjs.com/package/tree-sitter-dfm) — companion form-file grammar (100% on 11,044 real DFM files)

Source: https://github.com/Alexl-git/tree-sitter-delphi13

**Question for you**: would you be open to sharing the preprocessor pattern? Three concrete options:

1. **You stay grammar-only**, I keep the preprocessor in my namespace, we cross-link
2. **Joint `pascal-preprocessor` package** that both projects consume — keeps your grammar single-purpose and gives consumers a clean choice
3. **Upstream the architectural pattern** into tree-sitter-pascal — separate "pure" mode flag and your existing single-grammar mode

I'm not pushing for any specific path — happy to discuss what makes sense given your maintenance load and the project's broader Pascal-family scope (FPC, mode switches, PasCocoa, etc.).

## Outcome 2 — 30 grammar-only fixes ready to PR upstream

Independent of the preprocessor work, I have **30 atomic commits** on a `delphi13-extensions` branch that improve the grammar in ways that should benefit FPC and other Pascal dialects too. The branch went from 49.47% → 92.07% on the same corpus *without* the preprocessor.

Highlights of what's in there (each is its own commit with the measurement delta in the message):

- **`.dpk` package files** — adds `package_file` production with `requires` / `contains` clauses
- **`.dpr` uses with `in 'file' {FormHint}`** — `declUsesUnit` extension
- **Property `read`/`write` dotted target** — `read FVer.iVersion` (record-typed backing fields)
- **`property Name;` redirect form** — no `:` and no `type`, just re-expose inherited
- **RTTI attributes on declArg** — `function Echo([Attr('x')] const A: string)`
- **Generic constraint list** — `T: TBase, constructor` (comma-separated, with `class`/`record`/`constructor` keywords)
- **Caret control-char literal** — `^H`, `^V`, `^X` in case labels
- **Trailing-label-as-last-statement** — `goto X; ... X: end`
- **Subrange extensions** — `0..hid-1`, `#64..#82`, anonymous element types (`array [0..N] of 0..2`)
- **Class operator without return type** — `Initialize` / `Finalize` / `Assign` for managed records
- **Bare `raise;` re-raise** — `field('exception', optional($._expr))`
- **Anonymous record/class type in `type` choice** — `array [0..N] of record A: T; end = (...)`
- **`is not` Delphi 13 operator** — narrow extension to exprBinary
- **2 regex typo fixes** — `kSealed` was `/seled/i`, exponent regex was lowercase-only `(e[+-]?[0-9]+)?`
- **Greedy IFDEF regex** for `pp` token (caveat: trade-off, has known 89-site regression on `{$IFNDEF X} unit Y; {$ENDIF}` — handled correctly by the preprocessor pipeline above)
- **Permissive `declUses` / `declRequires` / `declContains`** — allows interleaved pp tokens for IFDEF-in-uses patterns

I'd be glad to:
- **Open a PR** with the subset that's clearly correct & FPC-compatible (most of them; I haven't tested against an FPC corpus but the changes are structural Delphi extensions that line up with the existing `enable_if(delphi, ...)` gating)
- **Split into smaller PRs** if you'd prefer reviewing in chunks
- **Skip changes you don't want** (the greedy IFDEF one is the obvious "discuss before merge" candidate)

Let me know your preferred shape and I'll prep accordingly.

## What I'm NOT proposing

- Renaming, reorganizing, or otherwise restructuring tree-sitter-pascal. Your project, your call.
- FPC-specific extensions (operator overloading variants, `{$mode ObjFPC}` directives, PasCocoa) — those go into a separate `tree-sitter-delphi-plus-fp` repo I'd maintain if there's interest, well-isolated from your tree-sitter-pascal's Delphi-first focus.

## Thanks

This work wouldn't have happened without your grammar as the starting point. Even if none of the above lands upstream, just wanted to share the architectural finding in case it's useful to others hitting the same ceiling.

Happy to chat sync (Discord, email, anywhere convenient) or async via issue/PR. No timeline pressure on my end.

— Alex
