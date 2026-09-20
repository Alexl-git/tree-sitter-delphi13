# Issue for ChemisTechlabs/zed-pascal

Post at https://github.com/ChemisTechlabs/zed-pascal/issues/new

Send this **in the same week** as the registry PR, and say the PR exists. Being
found out afterwards is far worse than disclosing it upfront.

Suggested title: **Offer: Delphi 13 grammar + full query set, and a heads-up about a registry submission**

---

Hi! I saw zed-pascal in the extension registry while preparing a submission of my
own, and I would rather talk to you first than quietly ship something next to it.

I maintain a Delphi-focused fork of `Isopod/tree-sitter-pascal`:
https://github.com/Alexl-git/tree-sitter-delphi13

**What I have that might be useful to you:**

* A grammar measured against real source. Over the 2,218 `.pas` files of the RAD
  Studio 37.0 RTL/VCL/FMX/FireDAC tree it parses 2183/2217 = **98.47%** with zero
  ERROR/MISSING nodes, raw source, one parser, no preprocessing. Paired with a
  preprocessor that resolves `{$IFDEF}` before parsing -- which is outside what a
  Zed extension can do, but matters for linters and language servers -- the same
  grammar family reaches **100%** (2217/2217). Method and corpus are documented
  in the repo so you can check either number.
* A full query set, validated by compiling each file against the built WASM:
  `highlights`, `brackets`, `outline`, `indents`, `injections`, `textobjects`.
  The injections one highlights SQL inside string literals and inline `asm`
  blocks, which is a nice win in Delphi code.
* A separate grammar for **DFM/FMX form files**. A Delphi form is a `.pas` unit
  plus a `.dfm` component tree, and nothing in the registry covers the second
  half today.

Your README lists grammar/highlighting as in progress, so if any of the above
saves you time, take it -- it is all MIT. I am happy to open PRs against
zed-pascal with the queries, the grammar, or both, in whatever shape suits you.
Queries alone would be the smallest, safest starting point: they are additive
files that cannot regress parsing.

**The disclosure:** I have also submitted my own extension (`delphi13`) to
zed-industries/extensions, mainly to get DFM support into the registry, since
nothing covers form files at all. I said in that PR that I had offered this to
you first and that I would be glad to see the Delphi half merged into zed-pascal
instead. If you would prefer that, say so and I will pursue it that way -- I care
much more about Delphi developers getting working support than about whose
extension provides it.

One thing worth passing on regardless, because it cost me a shipped release:
native tree-sitter evaluates `#match?` with the Rust regex crate, while
`web-tree-sitter` uses JavaScript's `RegExp`. An inline `(?i)` flag is valid in
the first and a hard error in the second, and a query that throws on compile
takes the whole file down silently. Spell case-insensitivity out as
`[eE][xX][iI][tT]` character classes and you are immune.

Happy to help however is most useful, or to stay out of the way if you would
rather carry it yourself.

-- Alex