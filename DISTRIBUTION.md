# Distribution: getting these grammars into other products

State as of 2026-09-19. Everything below was checked against the live upstreams,
not assumed.

## What now ships

| Package | Version | Artifacts |
|---|---|---|
| `tree-sitter-delphi13` | 1.3.0 | `.wasm` (ABI 14), `queries/{highlights,injections,indents,folds,outline,tags}.scm`, prebuilt `.node` |
| `tree-sitter-delphi13-pure` | 1.3.0 | `.wasm` (ABI 14), same six query files |
| `tree-sitter-dfm` | 1.1.0 | `.wasm` (ABI 14), `queries/{highlights,indents,folds,outline,tags}.scm` |

`folds.scm` and `tags.scm` are new in these versions; `tags.scm` is what codebase
indexers (GitHub, Cursor, Sourcegraph) read for symbol extraction. Build and
verification instructions: [WASM-BUILD.md](WASM-BUILD.md).

## Evidence to quote in any submission

Measured on this machine, 2026-09-19, with the shipped artifacts.

**Delphi grammar** -- every `.pas` in the RAD Studio 37.0 source tree
(RTL, VCL, FMX, FireDAC, Indy, DataSnap, SOAP), both paths, same 2,218-file manifest,
measured 2026-09-19 with `tools/parse-corpus.js` and `tools/parse-corpus-orchestrated.js`:

| Path | ok / readable | rate |
|---|---|---|
| **Master grammar alone** -- raw `.pas`, `{$IFDEF}` then-wins | 2183 / 2217 | **98.47%** |
| **Preprocessor -> pure grammar** | 2217 / 2217 | **100.000%** |

Of the 35 master-path failures, exactly **one** survives the orchestrated pipeline,
and it is `FMX.WebBrowser.Win.pas` scored `template_placeholder` -- an *excluded*
category, not a parse failure (see CORPUS-CEILING-REPORT.md §2.3). **The preprocessor
resolves every real master-path failure on this tree.**

### Which number applies to you

This distinction decides what any given integration can achieve, so state it
explicitly in every submission:

* **98.47% -- one WASM, raw source.** A stock tree-sitter host (Zed, Neovim, Helix,
  anything that loads a single grammar and hands it the file) gets the master grammar.
  Its residue is `{$IFDEF}` splitting one statement across mutually exclusive branches
  (`Vcl.Forms.pas:11157` is canonical). That is the documented architectural ceiling of
  the then-wins policy -- seven refactor attempts to lift it are recorded as reverted in
  STATUS.md and CORPUS-CEILING-REPORT.md. **Do not promise an editor 100%.**
* **100.000% -- preprocessor first.** Any consumer that controls its own pipeline can
  reach it today. `delphi13-preprocessor` is published on npm and is pure JS, and
  `tree-sitter-delphi13-pure` now ships a `.wasm`, so **the full 100% pipeline runs
  inside a browser or Electron host** -- which is exactly the shape of a VS Code or
  Cursor extension. This is the strongest thing we have to offer those two, and it is
  not available from any other Pascal grammar.

See [DESIGN-ifdef-then-wins.md](DESIGN-ifdef-then-wins.md) for why the single-grammar
path cannot close the gap.

**DFM grammar** -- every `.dfm`/`.fmx` under `C:\Projects`:

```
9681 files scanned
  705  binary / resource-form DFM   (out of scope: not the text format)
 8976  text-format DFM
   74  failures, all explained:
          2  IDE templates containing %FORMNAME% placeholders
          6  truncated build artifacts (file ends mid-token)
         65  generated forms with a malformed `object Name :` (no class name)
          1  deliberate broken fixture in a lint test suite
  ->  99.18% of text DFMs parse; ZERO confirmed grammar defects
```

---

## Targets, in descending order of yield

### 1. Isopod/tree-sitter-pascal -- highest yield by far

**nvim-treesitter and Helix both already point at `Isopod/tree-sitter-pascal`**, at
the same revision (`042119ec`). That is the grammar this project forked from.

```lua
-- nvim-treesitter lua/nvim-treesitter/parsers.lua
pascal = {
  install_info = {
    revision = '042119eca2e18a60e56317fb06ee3ba5c32cb447',
    url = 'https://github.com/Isopod/tree-sitter-pascal',
  },
  tier = 2,
},
```

```toml
# helix languages.toml
[[grammar]]
name = "pascal"
source = { git = "https://github.com/Isopod/tree-sitter-pascal", rev = "042119eca2e18a60e56317fb06ee3ba5c32cb447" }
```

So upstreaming the Delphi 13 fixes reaches **both editors at once, with no PR in
either**, and without asking anyone to carry a second Pascal grammar. Competing with
the incumbent means persuading every downstream separately; merging with it means
persuading one maintainer.

[ISOPOD-OUTREACH-DRAFT.md](ISOPOD-OUTREACH-DRAFT.md) is already written for this.
**It is the first thing to send.** Everything else below is contingent on whether the
answer is "upstream it" or "stay a fork".

### 2. Zed extension registry

`editors/zed/` already exists and works as a dev extension. Publishing means a PR to
`zed-industries/extensions` adding the extension to `extensions.toml` as a submodule.

Zed reads `highlights`, `brackets`, `outline`, `indents`, `injections`, `overrides`,
`textobjects`, `redactions`, `runnables`. We currently supply highlights, outline,
indents and injections. **Missing before publishing: `brackets.scm` and
`textobjects.scm`** -- both are small and neither has an equivalent elsewhere in this
repo. Note Zed does *not* consume `folds.scm` or `tags.scm`.

This is the most tractable "real product, real users" target we control end to end.

### 3. nvim-treesitter (as a distinct `delphi13` parser)

Only if the Isopod route is declined. Acceptance criteria, quoted from their
CONTRIBUTING:

> parsers must "correspond to a filetype detected by Neovim (nightly)", be "feature
> complete, tested by users, and actively maintained", "hosted or mirrored on Github",
> "covered by CI using upstream workflows", and "provide reference queries covered by
> a ts_query_ls workflow"

Three real obstacles:

* **Filetype collision.** Neovim detects `.pas` as `pascal`, which already maps to the
  incumbent parser. A `delphi13` parser needs its own detected filetype -- that is a
  Neovim change, not an nvim-treesitter one.
* **CI.** This repo has no GitHub Actions workflow. They require upstream CI.
* **`ts_query_ls` coverage** for the query files.

`folds.scm` and `indents.scm` were missing before this release and are now present,
so the query-completeness half of the bar is met.

### 4. Helix

Same story: a `[[language]]` + `[[grammar]]` pair in `languages.toml` plus
`runtime/queries/delphi13/`. Same `pascal` collision. Helix is a smaller lift than
nvim-treesitter (no CI requirement) but also a smaller audience.

### 5. VS Code / Cursor via `microsoft/vscode-tree-sitter-wasm`

See [UPSTREAM-vscode-tree-sitter-wasm.md](UPSTREAM-vscode-tree-sitter-wasm.md) for the
exact patch and commands. **Read the feasibility note there before spending effort** --
the short version is that every grammar in that repo was added by the VS Code team for
a language VS Code itself had decided to support, and shipping the WASM there does not
by itself make VS Code or Cursor use it.

### 6. Others worth a cheap shot

* **difftastic** vendors tree-sitter grammars and adds languages readily.
* **Sourcegraph** (`sourcegraph/syntax-highlighter`) consumes tree-sitter grammars and
  `tags.scm`-style queries for symbol extraction.
* **Emacs 29+ `treesit`** needs no upstream PR at all -- users add an entry to
  `treesit-language-source-alist`. Worth a README snippet rather than a submission.
* **tree-sitter's own "Available parsers" doc list** is a one-line PR and pure
  discoverability.

---

## Blockers we own

These are ours to fix and they gate several targets above:

1. **No CI.** No GitHub Actions workflow in either repo. nvim-treesitter requires it;
   every other reviewer will look for it. It should run `tree-sitter test`,
   `npm run build-wasm`, and `npm run validate-queries`.
2. **`brackets.scm` and `textobjects.scm`** missing -- blocks Zed publication.
3. **Published npm versions lag the source.** The registry has
   `tree-sitter-delphi13@1.2.2` and `tree-sitter-dfm@1.0.0`; this tree is at 1.3.0 /
   1.1.0. Nothing above can reference the new `.wasm` or `tags.scm` until they are
   published.
4. **`tree-sitter-dfm` has no separate repo checked out here** matching its
   `repository` URL (`Alexl-git/tree-sitter-dfm`) -- confirm it is pushed before
   pointing anyone at it.