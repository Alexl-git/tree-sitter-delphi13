# Zed extension registry submission

## READ FIRST: what we can and cannot claim here

The 100% figure is real, but it belongs to the **preprocessor + pure-grammar
pipeline**, and **a Zed extension cannot run the preprocessor**. Zed loads one
grammar and hands it the raw file. So what this extension delivers is the
**master-grammar number: 98.47%**.

Leading a registry submission with "100%" would therefore be claiming something
the extension does not do, and the first reviewer who tries a `{$IFDEF}`-heavy
RTL unit would find the gap. The submission below cites both numbers with their
scope, which is still a much stronger position than anything else on offer:
98.47% measured and published, against no published measurement at all for the
alternatives.

Do **not** publish a pass-rate number for the `pascal` extension or for
`Isopod/tree-sitter-pascal`. We have not measured either, and running a
competitor's score in a public PR would poison the upstream conversation we just
opened.

## Prerequisites (Zed's own rules)

* Extension repo must be **public** -- `Alexl-git/tree-sitter-delphi13` is.
* Submodule URL must be **HTTPS, not SSH**.
* Extension ID must be unique, kebab-case, and must not contain `zed` or
  `extension` -- ours is `delphi13`.
* An accepted license -- MIT. **The file must sit INSIDE the extension
  directory** (`editors/zed/LICENSE`), not only at the repo root. Zed's
  `package-extensions.js` computes `extensionPath = submodule + path` and does a
  NON-recursive `readdir` of exactly that folder, so a root `LICENSE` is
  invisible to it. This failed CI on 2026-09-22 with "No license was found."
  even though the repo had been MIT-licensed all along. Any filename whose stem
  starts with `license` or `licence` counts.
* "Test your extension within Zed manually at the submodule commit you are
  submitting." **Do this before opening the PR.** Install `editors/zed` as a dev
  extension, open a `.pas` and a `.dfm`, and confirm highlighting, the outline
  panel, folding, bracket matching and select-inside-function all behave.

## Steps

```bash
git clone https://github.com/zed-industries/extensions
cd extensions
git submodule add https://github.com/Alexl-git/tree-sitter-delphi13.git extensions/delphi13
```

Add to `extensions.toml`, keeping the file sorted:

```toml
[delphi13]
submodule = "extensions/delphi13"
path = "editors/zed"
version = "0.3.0"
```

`path` is required because the extension lives in a subdirectory of the grammar
repo rather than at its root. `version` must match `version` in
`editors/zed/extension.toml` -- **re-read that file, do not trust the number
above.** It said 0.2.0 here until 2026-09-22 while `extension.toml` had already
moved to 0.3.0 for the language-server registration, and a mismatch is an
immediate reviewer bounce. `agnix` is the precedent for this submodule+`path`
shape if you need one to copy.

Both `extensions.toml` and `.gitmodules` are kept in **sorted** order, and
`git submodule add` appends its stanza to the END of `.gitmodules` -- move it
into place. `pnpm sort-extensions` does this for you, but it needs the repo's
dependencies installed; without them `node src/sort-extensions.js` dies with
`ERR_MODULE_NOT_FOUND` and silently leaves both files unsorted.

```bash
pnpm sort-extensions      # sorts extensions.toml and .gitmodules
git commit -am "Add delphi13 extension"
```

Open the PR against `zed-industries/extensions`.

## PR description

---

**Adds `delphi13`: Delphi / Object Pascal and DFM form files**

This adds tree-sitter support for Delphi (`.pas`, `.dpr`, `.dpk`, `.inc`) and for
DFM/FMX form files (`.dfm`, `.fmx`).

**On the existing `pascal` extension.** I want to be upfront that one exists, and
that I have opened an issue on it offering this work rather than going around it.
Two things make this a different submission rather than a duplicate:

1. **DFM/FMX form files have no coverage in the registry at all.** A Delphi form
   is two files -- a `.pas` unit and a `.dfm` component tree -- and the second is
   where the entire UI lives. Nothing currently highlights or outlines them. This
   is the part I would most like to land regardless of what happens to the rest.
2. **This grammar targets Delphi 13 specifically**, including inline variable
   declarations, generic constraints, attributes, class and record helpers,
   anonymous methods, and the `{$IFDEF}`-saturated source that real Delphi
   codebases are made of.

I am entirely happy for this to be resolved by merging the Delphi half into
`pascal` instead, if that is what the maintainers prefer -- the queries and the
grammar are MIT and the offer is already on the table there.

**Measured coverage.** Over the 2,218 `.pas` files of the RAD Studio 37.0
RTL/VCL/FMX/FireDAC source tree, the grammar as this extension uses it -- one
parser, raw source -- parses **2183/2217 = 98.47%** with zero ERROR or MISSING
nodes. The residue is conditional compilation that splits a single statement
across mutually exclusive `{$IFDEF}` arms, which no single-grammar parser can
resolve; paired with a preprocessor (outside Zed's model) the same grammar family
reaches 2217/2217. For DFM: 8,976 text-format form files, 99.18%, with every
failure traced to malformed or truncated input rather than a grammar defect.

The method and corpus are documented at
https://github.com/Alexl-git/tree-sitter-delphi13 so the numbers can be checked.

**Queries provided:** `highlights`, `brackets`, `outline`, `indents`,
`injections` and `textobjects` for both languages. Injections highlight SQL
embedded in string literals and inline `asm` blocks -- both extremely common in
Delphi codebases.

**Grammars:** MIT, forked from `Isopod/tree-sitter-pascal` with attribution
preserved in `tree-sitter.json`; the DFM grammar is original.

---

## After submitting

Zed reviews every submission and not all are accepted. If the Delphi half is
rejected as duplicative, fall back to submitting a **DFM-only** extension --
that half cannot be duplicative, since nothing in the registry covers it.