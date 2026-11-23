# tree-sitter-delphi13 v1.4.15

Grammar release on top of v1.4.14 (root grammar and `pure/`). One fix, requested by drag-lint:
a subrange bound may now be a constant expression. No file that parsed clean on v1.4.14 fails
or changes its tree on v1.4.15 in any corpus below.

## Fixed

- **A subrange bound accepted only a fixed list of shapes** (both grammars), such as `N`,
  `N - 1` or `High(T)`. Any other constant expression was an ERROR, in a type declaration,
  `set of`, an array element type, a record field and a variable, for the lower bound as well
  as the upper. Array indexes (`array[1 .. N * 2]`) already parsed.

  ```pascal
  type
    TA = 1 .. N * 2;
    TB = 0 .. High(Byte) - 1;
    TC = N div 2 .. (N - 1) * 2 + 1;
  var
    Available: set of 1 .. MAXCOLUMNCOUNT * 2;
  ```

  Supported: `+ - * / div mod and or xor shl shr`, signs, parentheses, one-argument calls
  (nested to any depth) and two-level names (`TFoo.Bar`). Not supported in a bound: `not`,
  calls with several arguments, longer dotted names.

  `type T = (N);` is still an enumeration; `type T = (N) .. 100;` is a subrange.

## For consumers

`subrangeType` stays flat: the terms of both bounds are its direct children, as before.
`1 .. N * 2` has one `identifier` child. `kAnd`, `kOr`, `kXor`, `kShl` and `kShr` are new possible
children beside `kDiv` and `kMod`; `+ - * /` are anonymous. A bound can now hold several names,
so find the two bounds by the `..` token, not by the first and last named child.

## Gate (vs v1.4.14)

| corpus | files | newly failing | fixed | trees changed |
|---|---|---|---|---|
| bound matrix, 22 expressions x 9 positions (root / pure) | 198 | 0 / 0 | 120 / 120 | 120 / 120 |
| live corpus (root) | 22945 | 0 | 0 | 18, all failing on both; ERROR bytes 61688 -> 20800, none worse |
| M2022 (root / pure) | 367 | 0 / 0 | 2 / 2 | 2 / 2 |
| drag-lint sources (root / pure) | 622 | 0 / 0 | 0 / 0 | 0 / 0 |
| live corpus + M2022, preprocessed (pure) | 23312 | 0 | 2 | 21: the 2 fixed, and 19 failing on both with ERROR bytes never higher |
| live corpus, raw source (pure) | 22945 | 0 | 0 | 185, all failing on both; ERROR bytes: 58 lower, 32 higher |

The last row is outside the pure grammar's contract (it expects preprocessed text); it is listed
because recovery on such files moves both ways. Some already-failing `JvEx*.pas` files get 1 to 5
more ERROR nodes while covering no more bytes.

`tree-sitter test`: root 150/150, pure 30/30, including `subrange-const-expr.txt`. The parser has
fewer states (root 14077 -> 13941, pure 13735 -> 13599). Language ABI 14, unchanged.
