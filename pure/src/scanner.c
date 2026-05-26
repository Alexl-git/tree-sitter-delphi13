// External scanner for tree-sitter-delphi13-pure.
//
// PURE GRAMMAR: knows NO IFDEFs. Designed to parse the virtual text
// emitted by ../preprocessor/cli.js (or equivalent). All compiler
// directives are expected to be resolved upstream.
//
// Provides two external tokens that tree-sitter regex can't handle:
//
//   char_literal  Delphi's `^X` control-character literal (`^M` = #13,
//                 `^I` = #9, etc.) where X is in `@A-Z[\]^_` and is NOT
//                 followed by an identifier-continuation char.
//
//   trailing_dot_float  `100.` form — float with trailing dot, no
//                       fraction. Distinct from regex `_literalFloat`
//                       because tree-sitter regex can't disambiguate
//                       `100.` (float) from `100..N` (int + range op).
//
// Contract (tree-sitter scanner):
//   - Returning false rolls back the lexer to the position from BEFORE
//     scan() was called. Free to probe via advance().
//   - On true return, mark_end(lexer) determines token end.

#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <stdint.h>

enum TokenType {
    CHAR_LITERAL,
    TRAILING_DOT_FLOAT,
};

void *tree_sitter_delphi13_pure_external_scanner_create(void) { return NULL; }
void  tree_sitter_delphi13_pure_external_scanner_destroy(void *p) { (void)p; }
unsigned tree_sitter_delphi13_pure_external_scanner_serialize(void *p, char *b) {
    (void)p; (void)b; return 0;
}
void tree_sitter_delphi13_pure_external_scanner_deserialize(void *p, const char *b, unsigned n) {
    (void)p; (void)b; (void)n;
}

// ---- helpers ----

static inline bool is_ident_cont(int32_t c) {
    return (c >= 'a' && c <= 'z')
        || (c >= 'A' && c <= 'Z')
        || (c >= '0' && c <= '9')
        || c == '_';
}

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer)    { lexer->advance(lexer, true);  }

// ---- char_literal ----
//
// `^X` where X is in @A-Z[\]^_ (case-insensitive) and is NOT followed by an
// identifier-continuation character (so `^Tx` parses as kHat + identifier,
// while `^M:` parses as char_literal then ':').
static bool scan_char_literal(TSLexer *lexer) {
    if (lexer->lookahead != '^') return false;
    advance(lexer);
    int32_t c = lexer->lookahead;
    bool valid_char =
        c == '@' || c == '[' || c == '\\' || c == ']' ||
        c == '^' || c == '_' ||
        (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
    if (!valid_char) return false;
    advance(lexer);
    if (is_ident_cont(lexer->lookahead)) return false;
    lexer->result_symbol = CHAR_LITERAL;
    lexer->mark_end(lexer);
    return true;
}

// ---- trailing_dot_float ----
//
// `123.` style float literal — digits followed by a dot followed by ANYTHING
// other than a dot or digit. Disambiguates from `123..N` (int + range op).
static bool scan_trailing_dot_float(TSLexer *lexer) {
    if (lexer->lookahead < '0' || lexer->lookahead > '9') return false;
    while (lexer->lookahead >= '0' && lexer->lookahead <= '9') {
        advance(lexer);
    }
    if (lexer->lookahead != '.') return false;
    advance(lexer);
    if (lexer->lookahead == '.') return false;
    if (lexer->lookahead >= '0' && lexer->lookahead <= '9') return false;
    lexer->result_symbol = TRAILING_DOT_FLOAT;
    lexer->mark_end(lexer);
    return true;
}

// ---- entry point ----

bool tree_sitter_delphi13_pure_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols)
{
    (void)payload;

    while (lexer->lookahead == ' ' || lexer->lookahead == '\t'
        || lexer->lookahead == '\n' || lexer->lookahead == '\r') {
        skip(lexer);
    }

    if (valid_symbols[CHAR_LITERAL] && lexer->lookahead == '^') {
        if (scan_char_literal(lexer)) return true;
    }
    if (valid_symbols[TRAILING_DOT_FLOAT] &&
        lexer->lookahead >= '0' && lexer->lookahead <= '9') {
        if (scan_trailing_dot_float(lexer)) return true;
    }
    return false;
}
