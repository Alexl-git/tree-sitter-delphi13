# Building the WASM artifacts

`tree-sitter-delphi13`, `tree-sitter-delphi13-pure` and `tree-sitter-dfm` each ship a
prebuilt `.wasm` next to `src/`. That file -- not the native `.node` binding -- is what
browser and Electron hosts load: VS Code, Cursor, the tree-sitter playground, and
anything else built on `web-tree-sitter`.

This page exists because the build is **not** just `tree-sitter build --wasm`. Get the
toolchain version wrong and you produce a parser that loads in some hosts and not
others, with no error at build time.

---

## 1. Toolchain

`tree-sitter build --wasm` shells out to Emscripten. With none installed it fails
immediately:

```
You must have either emcc, docker, or podman on your PATH to run this command
```

**Pin Emscripten to the version the CLI expects.** The tree-sitter CLI records it in
its own repo at `cli/loader/emscripten-version`; for the `tree-sitter-cli` 0.24.7 used
here that is **3.1.64**. Do not use `emsdk install latest` -- a newer Emscripten
changes the generated glue code and the mismatch shows up as a load failure in the
host, not as a build error.

```bash
git clone --depth 1 https://github.com/emscripten-core/emsdk.git C:/emsdk
C:/emsdk/emsdk.bat install  3.1.64
C:/emsdk/emsdk.bat activate 3.1.64
```

Activation is per-shell. In PowerShell:

```powershell
. C:\emsdk\emsdk_env.ps1
emcc --version      # -> 3.1.64
```

Docker or Podman work as an alternative and need no local Emscripten, but on Windows
that route requires WSL with Docker integration enabled.

## 2. Build

Each package has a `build-wasm` script, so from the package directory:

```bash
npm run build-wasm
```

which expands to:

| Package | Command | Output |
|---|---|---|
| `tree-sitter-delphi13` | `tree-sitter build --wasm -o tree-sitter-delphi13.wasm .` | ~3.2 MB |
| `tree-sitter-delphi13-pure` | `tree-sitter build --wasm -o tree-sitter-delphi13_pure.wasm .` | ~2.8 MB |
| `tree-sitter-dfm` | `tree-sitter build --wasm -o tree-sitter-dfm.wasm .` | ~13 KB |

The output filename matters: `web-tree-sitter` and most registries expect
`tree-sitter-<grammar name>.wasm`, where the name is the `name` field in `grammar.js`
(`delphi13`, `delphi13_pure`, `dfm`) -- note the **underscore** in `delphi13_pure`.

All three are listed in their package's `files` array, so `npm publish` ships them.
Verify before publishing:

```bash
npm pack --dry-run
```

## 3. Verify

A `.wasm` that builds is not a `.wasm` that works. Load each one through
`web-tree-sitter` -- the same runtime the target hosts use -- and assert it parses
real source with no `ERROR` or `MISSING` nodes:

```js
const Parser = require('web-tree-sitter');
await Parser.init();
const L = await Parser.Language.load('tree-sitter-delphi13.wasm');
const p = new Parser(); p.setLanguage(L);
console.log(L.version);            // 14  <- tree-sitter ABI
p.parse(fs.readFileSync('Some.pas', 'utf8'));
```

Current state, verified this way:

| Grammar | ABI | Node kinds | Fields |
|---|---|---|---|
| `delphi13` | 14 | 399 | 40 |
| `delphi13_pure` | 14 | 395 | 40 |
| `dfm` | 14 | 53 | 5 |

## 4. Query portability -- the trap

**Queries must also be verified against the WASM build, not only the CLI.** The two
hosts do not run the same regex engine:

* native `tree-sitter` (Rust) evaluates `#match?` with the **regex crate**
* `web-tree-sitter` hands the pattern to **JavaScript `RegExp`**

The regex crate supports the inline `(?i)` flag; JavaScript rejects it outright with
`Invalid regular expression: ... Invalid group`. A query file that uses `(?i)` there-
fore compiles fine under `tree-sitter query`, passes CI, and then **throws on load in
VS Code, Cursor and every browser host** -- taking the entire query file with it, not
just the offending pattern.

This is not hypothetical: `queries/injections.scm` shipped with `(?i)` through v1.2.3
and its SQL and assembler injections were silently dead in every WASM host. It now
spells case-insensitivity out as `[Ss][Ee][Ll]...` character classes, which both
engines accept.

**Rule: no inline regex flags in `.scm` files.** Verify every query against the built
WASM, e.g.:

```js
const L = await Parser.Language.load('tree-sitter-delphi13.wasm');
L.query(fs.readFileSync('queries/injections.scm', 'utf8'));  // throws on a bad pattern
```