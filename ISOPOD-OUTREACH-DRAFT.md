Hi!

First, thanks for maintaining tree-sitter-pascal. I forked it back in May as the
starting point for a Delphi-13-focused effort, and the grammar being well organised is
the main reason the work was tractable at all.

Four months on, I want to share what came out of it. Some of it may be useful upstream,
some of it may not be a fit for your scope at all -- I have no expectations either way,
and nothing here needs a decision from you.

Everything is MIT and lives at **https://github.com/Alexl-git/tree-sitter-delphi13**

## Outcome 1 -- the architectural finding: a preprocessor + a "pure" grammar reaches 100%

This is the part I think is genuinely worth sharing, because I spent a long time
proving it the hard way.

The single-grammar approach -- `pp_*` external scanner tokens, one branch of each
`{$IFDEF}` wins -- topped out around **98.5%** on my corpus and would not move further.
I tried seven separate refactors to lift it; every one was reverted, several at a cost
of ~3,000 files. The ceiling is structural, not a matter of missing rules.

The blocking shape is a conditional that wraps *structural* elements, so that no single
token sequence through the file is valid Pascal:

```pascal
if (I >= crSqlWait) and (I <= crDrag) then
{$IFDEF LINUX}
  InsertCursor(I, LoadCursorResData(HInstance, 'C' + IntToStr(Integer(CursorMap[I]))))
else
  InsertCursor(I, LoadCursor(0, CursorMap[I]));
{$ENDIF}
{$IF DEFINED(CLR) OR DEFINED(MSWINDOWS)}
  Instance := THandle(HInstance) else
  Instance := 0;
```

(That is verbatim from `Vcl.Forms.pas` in the Delphi 13 RTL.) Taking the `then` arm of
both conditionals yields a dangling `else`. No placement of `pp_block` in the grammar
choices can fix it, because the parser would have to know which arm is *active*, and
that is a preprocessor question, not a parsing one.

So I split it in two: a **preprocessor** that resolves conditionals as a text-to-text
transformation, and a **pure sub-grammar** that drops the `pp_*` tokens entirely.

```
raw .pas -> delphi13-preprocessor (text -> text) -> tree-sitter-delphi13-pure -> AST
```

Inactive branches are replaced with whitespace, so byte offsets and line numbers are
preserved exactly -- which matters, because the consumer is a linter and a language
server, and both need to map AST positions back to the original file.

Measured on a corpus of 11,722 unique real-world files (Embarcadero RTL/VCL/FMX/FireDAC/
Indy, DevExpress, Spring4D, JEDI JCL/JVCL, OmniThreadLibrary, kbmMW, AsyncPro, fibplus,
EurekaLog, plus production code):

| Approach | Pass rate (zero ERROR/MISSING nodes) |
|---|---|
| Single grammar, then-wins scanner | ~98.5% |
| Pure grammar alone, no preprocessor | ~80% (it cannot see conditionals at all) |
| **Preprocessor + pure grammar** | **100.000%** (11,292 / 11,292) |

The 100% figure is on files that are valid Delphi 13. The residual failures it excludes
were each opened individually and verified against `dcc32`: they are genuine syntax
errors in vendor source, intentionally-broken test fixtures, FPC-only or .NET-only code,
and a few files truncated on disk. The compiler rejects them too.

As an independent check on source neither side tuned against, the entire RAD Studio 37.0
`source` tree (2,218 `.pas` files) last week:

* single grammar: 2183 / 2217 = **98.47%**
* preprocessor + pure: 2217 / 2217 = **100.000%**

Every real failure of the single-grammar path is resolved by the pipeline.

**Published, all MIT:**

* [`tree-sitter-delphi13`](https://www.npmjs.com/package/tree-sitter-delphi13) 1.3.0 -- the master grammar (your fork lineage, attribution preserved in `tree-sitter.json`)
* [`tree-sitter-delphi13-pure`](https://www.npmjs.com/package/tree-sitter-delphi13-pure) 1.3.0 -- the pure sub-grammar
* [`delphi13-preprocessor`](https://www.npmjs.com/package/delphi13-preprocessor) 1.1.0 -- the preprocessor on its own, no tree-sitter dependency
* [`tree-sitter-dfm`](https://www.npmjs.com/package/tree-sitter-dfm) 1.1.0 -- companion grammar for `.dfm`/`.fmx` form files

The preprocessor handles `{$IFDEF}` / `{$IFNDEF}` / `{$IF expr}` chains including numeric
comparisons (`CompilerVersion >= 21.0`), `{$DEFINE}` / `{$UNDEF}` with propagation through
includes, and `{$I X.inc}` resolution with a nearest-first search. It also supports
per-project define profiles, because a lot of real projects assume their own gate define
is set (EurekaLog wants `COMPILER37` + `Compiler11_up..Compiler37_up`, AsyncPro wants
`APAX` + `Ver130..Ver150`, and so on).

**The pattern is not Delphi-specific.** Any dialect with a conditional-compilation
preprocessor hits the same wall. If it is of interest, the options I see are:

1. You stay grammar-only, I keep the preprocessor in my namespace, we cross-link.
2. A joint `pascal-preprocessor` package both projects consume -- keeps your grammar
   single-purpose and gives consumers an explicit choice.
3. The pattern goes upstream as an optional "pure" mode alongside the existing one.

I am not pushing for any of these. Option 1 costs you nothing and is a perfectly good
outcome.

## Outcome 2 -- grammar fixes that are not preprocessor-related

Separately from the above, 95 commits touch `grammar.js`, most of them small Delphi
constructs the upstream grammar does not yet cover. Each carries its corpus measurement
in the commit message. A sample:

* `.dpk` package files -- `requires` / `contains` clauses
* `.dpr` uses with `in 'file' {FormHint}`
* property `read`/`write` with a dotted target (`read FVer.iVersion`)
* `property Name;` redirect form -- no `:`, no type, just re-exposing an inherited property
* RTTI attributes on arguments -- `function Echo([Attr('x')] const A: string)`
* generic constraint lists -- `<T: TBase, constructor>`
* caret control-character literals (`^H`, `^V`) in case labels
* class operators with no return type -- `Initialize` / `Finalize` / `Assign` on managed records
* bare `raise;` re-raise, and `raise E at Addr`
* Delphi 11+ digit separators (`1_000_000`)
* two regex typos worth having regardless: `kSealed` was `/seled/i`, and the float
  exponent pattern was lowercase-only, so `1E-3` did not lex

Most should be dialect-neutral or fit your existing `enable_if(delphi, ...)` gating, but
I have not tested against an FPC corpus, so I would not assert that. I can extract a
curated series of PRs, smallest and safest first, and you can take whichever subset you
want and ignore the rest. Say the word and I will prepare it; if you would rather not
review a large series right now, that is fine too and I will leave it.

## Outcome 3 -- query files, if you want them

Your `queries/` has `highlights.scm` and `locals.scm`. I have written and validated a
full set for my fork: `injections.scm` (SQL-in-string and inline `asm`), `indents.scm`,
`folds.scm`, `outline.scm`, and `tags.scm` for symbol extraction.

That last pair matters for reach: **nvim-treesitter requires `folds.scm` and
`indents.scm`**, and `tags.scm` is what codebase indexers read to build symbol tables.
These are additive files that cannot regress parsing, so they are about as low-risk as a
contribution gets. Happy to send them as a standalone PR against your node names, with
no grammar changes attached.

One portability note you have already avoided, but which cost me a shipped release, so
I will mention it in case it is useful to anyone reading: native tree-sitter evaluates
`#match?` with the Rust regex crate, while `web-tree-sitter` hands the pattern to
JavaScript's `RegExp`. The regex crate accepts an inline `(?i)` flag and JavaScript
rejects it outright -- and a query that throws on compile takes the *whole file* with it,
silently, only in WASM hosts. I had `(?i)` in `injections.scm` for three releases and the
CLI never once complained. Your `[eE][xX][iI][tT]` spelling is immune to this; I only
worked out why after building a validator that compiles every query against the actual
`.wasm` rather than against the CLI.

## What I am not proposing

* Renaming, reorganising or restructuring tree-sitter-pascal. Your project, your call.
* FPC-specific work (operator overloading variants, `{$mode ObjFPC}`, PasCocoa). My fork
  deliberately dropped the FPC branches to keep the Delphi grammar simple, which is a
  narrowing your project should not have to accept.

## Thanks

None of this would exist without your grammar as the starting point, and the fork keeps
the MIT header and the attribution to you and Philip Zander.

Even if nothing lands upstream, I wanted the ceiling finding written down somewhere
public, because I lost weeks to it and the failure mode looks exactly like a missing
grammar rule right up until you prove it is not one.

No timeline pressure at all, and no reply needed if this is not where you want to spend
your time. Happy to talk over an issue, a PR, or email -- whatever is least effort for
you.

-- Alex Liberov
P.S. I'm very bad and slow at writing, so this letter was AI created.  