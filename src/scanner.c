// External scanner for tree-sitter-delphi13.
//
// Currently a SKELETON — declares the external tokens but always returns
// false. The grammar references these tokens via `externals` so the scanner
// must exist and compile. Actual scanning logic will be added incrementally
// with proper unit tests in test/corpus/.
//
// Planned external tokens:
//   pp_block       — entire {$IF*}...{$END*} block consumed as one token,
//                    refusing blocks that begin with a structural keyword
//                    (unit/program/library/package/interface/implementation).
//   char_literal   — ^X control char (one of @A-Z[\]^_) NOT followed by an
//                    identifier-continuation char, so it disambiguates from
//                    ^TFoo pointer-to-type.

#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <stdint.h>

enum TokenType {
    PP_BLOCK,
    CHAR_LITERAL,
};

void *tree_sitter_delphi13_external_scanner_create(void) { return NULL; }
void  tree_sitter_delphi13_external_scanner_destroy(void *p) { (void)p; }
unsigned tree_sitter_delphi13_external_scanner_serialize(void *p, char *b) {
    (void)p; (void)b; return 0;
}
void tree_sitter_delphi13_external_scanner_deserialize(void *p, const char *b, unsigned n) {
    (void)p; (void)b; (void)n;
}

bool tree_sitter_delphi13_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols)
{
    (void)payload; (void)lexer; (void)valid_symbols;
    // Skeleton: not yet implemented. Returning false means the grammar's
    // built-in `pp` and `literalChar` rules handle these cases normally,
    // which is the same behavior as tree-sitter-pascal upstream.
    return false;
}
