// Feature flags — locked to Delphi 13 only.
// (Originally tree-sitter-pascal had these toggleable; here they're
// constants set to the values that match modern Delphi 13.)
const public_name = false;  // fpc 'public name' hint — Delphi has different syntax
const rtti        = true;   // [Attribute(...)] declarations
const lambda      = true;   // anonymous procedures/functions
const fpc         = false;  // no FPC-only syntax
const delphi      = true;   // Delphi syntax
const objc        = false;  // no PasCocoa
const templates   = true;   // generic types
const use_pp      = true;   // preprocessor handling

// Helpers

const op = {
	infix:   (prio, lhs, op, rhs)      => prec.left(prio, seq(
		field('lhs',      lhs),
		field('operator', op),
		field('rhs',      rhs)
	)),
	prefix:  (prio, operator, operand) => prec.left(prio, seq(
		field('operator', operator),
		field('operand',  operand)
	)),
	postfix: (prio, operand, operator) => prec.left(prio, seq(
		field('operand',  operand),
		field('operator', operator)
	)),

	args: (prio, entity, open, args, close) => prec.left(prio, seq(
		field('entity', entity), open, field('args', args), close
	))
}

function delimited1(rule, delimiter = ',', precedence=0) {
	return seq(
		optional(repeat1(prec(precedence,seq(rule, delimiter)))),
		rule
	);
}

function delimited(rule, delimiter = ',') {
	return optional(delimited1(rule, delimiter));
}

// Preprocessor wrapper.
// This just supports a single `if[def] ... [else[if] ...]* endif` right now.
// It is inteded for code like this:
//
//   procedure foo;
//   {$ifdef bla}
//   var i: integer;
//   begin
//     inc(i);
//   end;
//   {$else}
//   var j: integer;
//   begin
//     dec(j);
//   end;
//   {$endif}
//
// If we don't handle this case explicitly, tree-sitter produces a completely
// broken AST, which severely messes up the syntax highlighting.
//
// Ideally, we would want to support nested ifdefs as well, but that will be
// more complex.
//
// A word of caution: It is tempting to sprinkle this macro in many more
// places, but unfortunately tihs results in a significant performance penalty.
// Use it sparingly! A general rule of thumb is to use it only in situations
// where otherwise a severly broken parse tree would be generated. For small
// errors that TreeSitter can recover from automatically, it is better not to
// use it.
function pp($, ...rule) {
	if (!use_pp)
		return seq(...rule);
	return (
		choice(
			seq(...rule),
			seq(
				alias(/\{\$if[^}]*\}/i, $.pp),
				...rule,
				repeat(seq(
					alias(/\{\$else[^}]*\}/i, $.pp),
					...rule
				)),
				alias(/\{\$end[^}]*\}/i, $.pp)
			),
		)
	);
}

// tr = Trailing
// Return the trailing equivalent of a rule, aliased to the non-trailing version.
const tr = ($,rule) =>
	rule[0] == '_' ? $[rule+'Tr'] : alias($[rule+'Tr'], $[rule])


function enable_if(cond, ...args) {
	return cond ? args : [];
}

// Generate rules for trailing & non-trailing statements
function statements(trailing) {
	let rn            = x => trailing ? x + 'Tr' : x
	let lastStatement = $ => trailing ? optional(tr($,'_statement')) : $._statement;
	let lastStatement1= $ => trailing ? tr($,'_statement') : $._statement;
	let semicolon     = trailing ? [] : [';'];

	return Object.fromEntries([
		[rn('if'),          $ => seq(
			$.kIf, field('condition', $._expr), $.kThen,
			field('then', lastStatement($))
		)],

		[rn('nestedIf'),    $ => prec(1,$.if)],

		[rn('ifElse'),      $ => prec.right(1, seq(
			$.kIf, field('condition', $._expr), $.kThen,
			field('then', optional(choice(tr($,'_statement'), $.if))),
			$.kElse,
			field('else', lastStatement($))
		))],

		[rn('while'),       $ => seq(
			$.kWhile, field('condition', $._expr), $.kDo,
			field('body', lastStatement($))
		)],

		[rn('repeat'),      $ => prec(2,seq(
			$.kRepeat,
			field('body', optional(tr($,'statements'))),
			$.kUntil, field('condition', $._expr),
			...semicolon
		))],

		[rn('for'),         $ => seq(
			$.kFor,
			field('start', $.assignment),
			choice($.kTo, $.kDownto),
			field('end', $._expr), $.kDo,
			field('body', lastStatement($))
		)],

		[rn('foreach'),     $ => seq(
			$.kFor,
			// Iterator can be an existing variable OR a Delphi 12+ inline-var
			// declaration: `for var fname in List do`. The varAssignDef rule
			// already handles `var x` and `var x: T`.
			field('iterator', choice($._expr, $.varAssignDef)), $.kIn,
			field('iterable', $._expr), $.kDo,
			field('body', lastStatement($))
		)],

		[rn('exceptionHandler'), $ => seq(
			$.kOn,
			field('variable', optional(seq($.identifier, ':'))),
			field('exception', $.typeref), $.kDo,
			field('body', lastStatement($))
		)],

		[rn('exceptionElse'), $ => seq(
			$.kElse, repeat($._statement), lastStatement($)
		)],

		[rn('_exceptionHandlers'), $ => seq(
			repeat($.exceptionHandler),
			choice($.exceptionHandler, tr($,'exceptionHandler')),
			// exceptionElse's body is always followed by `end` (of try), so
			// allow the trailing-form (last statement may omit `;`).
			optional(choice($.exceptionElse, tr($,'exceptionElse')))
		)],

		[rn('try'),         $ => prec(2,seq(
			$.kTry,
			field('try', optional(tr($,'statements'))),
			choice(
				field('except', seq(
					$.kExcept,
					optional(
						choice(tr($,'statements'),
						tr($,'_exceptionHandlers'))
					)
				)),
				field('finally', seq(
					$.kFinally,
					optional(tr($,'statements'))
				))
			),
			$.kEnd, ...semicolon
		))],

		[rn('caseCase'),    $ => seq(
			field('label', $.caseLabel),
			// Optional Pascal `label:` prefix before the body. Spring4D's
			// enumerator state-machines use this to expose goto targets
			// from inside a case clause:
			//   STATE_RUNNING:
			//   _STATE_RUNNING:    // pascal label
			//     begin ... end;
			field('jumpLabel', optional($.label)),
			field('body', lastStatement($))
		)],

		[rn('case'),        $ => prec(2,seq(
			$.kCase, $._expr, $.kOf,
			repeat($.caseCase),
			optional(tr($,'caseCase')),
			optional(seq(
				$.kElse,
				optional(':'),
				optional(tr($,'_statements'))
			)),
			$.kEnd, ...semicolon
		))],

		[rn('block'),       $ => seq(
			$.kBegin,
			optional(tr($,'_statements')),
			$.kEnd, ...semicolon
		)],

		[rn('asm'),         $ => seq(
			$.kAsm,
			optional($.asmBody),
			$.kEnd, ...semicolon
		)],

		[rn('with'),        $ => seq(
			$.kWith, delimited1(field('entity', $._expr)), $.kDo,
			field('body', lastStatement($))
		)],

		[rn('raise'),       $ => seq(
			$.kRaise,
			field('exception', optional($._expr)),
			// Optional `at <addr-expr>` — Delphi exception re-raise with a
			// specific call-site address: `raise EFoo.Create(msg) at ReturnAddress`.
			optional(seq($.kAtWord, field('address', $._expr))),
			...semicolon
		)],

		[rn('statement'),   $ => choice(
			seq($._expr, ...semicolon),
		)],

		[rn('goto'),        $ => seq($.kGoto, $.identifier, ...semicolon)],

		[rn('_statement'),   $ => choice(
			...semicolon,
			seq($.assignment, ...semicolon),
			seq($.varDef, ...semicolon),
			// Delphi 12+ inline `const NAME [: T] = value;` inside statement body.
			seq($.constInline, ...semicolon),
			alias($[rn('statement')], $.statement),
			alias($[rn('if')],        $.if),
			alias($[rn('ifElse')],    $.ifElse),
			alias($[rn('while')],     $.while),
			alias($[rn('repeat')],    $.repeat),
			alias($[rn('for')],       $.for),
			alias($[rn('foreach')],   $.foreach),
			alias($[rn('try')],       $.try),
			alias($[rn('case')],      $.case),
			alias($[rn('block')],     $.block),
			alias($[rn('with')],      $.with),
			alias($[rn('raise')],     $.raise),
			alias($[rn('goto')],      $.goto),
			alias($[rn('asm')],       $.asm),
		)],

	]);
}

module.exports = grammar({
	name: "delphi13_pure",

	// PURE GRAMMAR: knows NO IFDEFs. Designed to parse the virtual text
	// emitted by delphi13-preprocessor (which has resolved all directives
	// to whitespace). Drops pp_open / pp_else_tail / pp_end_only / pp_block
	// external tokens that the main grammar uses for the THEN-wins refactor.
	// `pp` regex token is kept for any orphan compiler directives that
	// don't affect parse structure ({\$EXTERNALSYM ...}, {\$WARN ...}, etc).
	extras: $ => [
		$._space,
		$.comment,
		$.pp,
	],

	externals: $ => [
		// PURE GRAMMAR: only two externals — both unrelated to IFDEFs.
		// Context-aware `^X` control-char literal — matches `^` followed by
		// one of @A-Z[\]^_ and NOT followed by an identifier character.
		// Disambiguates from `^TFoo` pointer-to-type.
		$.char_literal,
		// Trailing-dot float literal `100.` — disambiguated from `100..N`
		// (int + range op) by scanner-level lookahead at the char after `.`.
		$.trailing_dot_float,
		// (DROPPED: pp_block, pp_open, pp_else_tail, pp_end_only — the
		// preprocessor resolves all directives before this grammar sees the
		// input, so directive tokens are unnecessary here.)
	],

	word: $ => $.identifier,

	conflicts: $ => [
		// Phase 3 (pure): `package ... contains <units>; <defs> end.` has
		// optional _definitions before AND after declContains. GLR forks
		// on which slot absorbs a given definition.
		[$.package],
		// Anonymous record/class types in type position conflict with the
		// type-declaration form (`type Foo = record ... end;`). Both reach
		// declClass but at different parser states.
		[$.type, $.declType],
		// Inline if-expression vs if-statement: both start with `if cond then`.
		// At a position where both are valid (e.g. RHS of `x := if ...`), let
		// tree-sitter GLR-fork and decide via context.
		[$.exprIf, $.statementTr],
		// try-except `else` last-statement: trailing form lets last statement
		// omit `;` since `end` follows; ambiguous with non-trailing repeat
		// (both reach `_statement` before `end`). GLR resolves at parse time.
		[$.exceptionElse, $.exceptionElseTr],
		[$.exceptionElse],
		// Soft-keyword identifiers (Message, Name, Index, Read, Write, Reference)
		// allowed as variable names — ambiguous with next-statement starts.
		[$.declVar],
		// Same alias set on const names (`Default = $00010203;` etc.)
		[$.declConst],
		// Qualified-id subrange `TFoo.Bar..TFoo.Baz` vs `_typeref` (typerefDot).
		[$._typeref, $._subrangeBound],
		// Iter 58: exprTpl args narrowed to typeref — generic-arg identifier
		// vs general expression-ref identifier conflict.
		[$._ref, $._typeref],
		// Iter 61: declField has optional declaration hint AND typeref allows
		// trailing kDeprecated. Ambiguous which level the `deprecated` belongs.
		[$.typeref],
		[$._declClass],
		// Iter 65: trailing `inline` (no `;`) before body in defProc conflicts
		// with `_declProc`'s `inline ;` _procAttributeNoExt repeat. Same for
		// _declOperator (class operators can also be inlined).
		[$._declProc],
		[$._declOperator],
		// Phase 3b iter 7: declEnum trailing platform/deprecated hint is
		// ambiguous with the same hint appearing on the enclosing declType.
		[$.declEnum],
		// Phase 3b iter 21: declSet has same trailing-hint ambiguity.
		[$.declSet],
		// Phase 3b iter 10: _declFields choice of repeat1(declField) vs
		// trailing declFieldNoSemi — both reach declField from the same state.
		[$._declFields],
		[$.declClass],
		// Phase 3b iter 11: declFieldNoSemi uses a narrower type set; conflicts
		// with the full `type` rule's choices.
		[$.type, $.declFieldNoSemi],
		[$.declString, $.declFieldNoSemi],
		// The following conflict rules are only needed because "public" can be
		// a visibility or an attribute. *sigh*
		// TODO: We would probably avoid this by having separate decl* clauses
		// for use inside classes and at unit scope, since the "public"
		// attribute seems to only be valid for standalone routines.
		...enable_if(public_name,
			[$._declProc ], [ $._declOperator], [$.declConst], [$.declVar],
			[$.declType], [$.declProp]
		),
		// RTTI attributes clash with fpc declaration hints syntax since both
		// are surrounded by brackets.
		...enable_if(rtti,
			[ $.declProcFwd ], [ $.declVars], [ $.declConsts ], [ $.declTypes]
		),
		// `procedure (` could be a declaration of an anonymous procedure or
		// the call of a function named "procedure" (which doesn't actually
		// make sense, but for Treesitter it does), so we need another conflict
		// here.
		//...enable_if(lambda, [ $.lambda ]),
	],

	rules: {
		root:               $ => optional(choice(
			$.program,
			$.library,
			$.unit,
			$.package,
			$._definitions // For include files
		)),

		// HIGH LEVEL ----------------------------------------------------------

		program:            $ => seq(
			$.kProgram, $.moduleName, ';',
			optional($._definitions),
			// Phase 3b iter 34: CIL/.NET attribute on program entry (`[STAThread]`).
			// (UnitTests4Net.dpr Delphi.NET pattern.)
			optional($.rttiAttributes),
			tr($,'block'),
			$.kEndDot
		),

		library:            $ => seq(
			$.kLibrary, $.moduleName, ';',
			optional($._definitions),
			choice(tr($,'block'), $.kEnd),
			$.kEndDot
		),

		unit:               $ => seq(
			$.kUnit, $.moduleName,
			// `unit Spring.Foo deprecated 'Use Spring.Bar instead';` — unit-level
			// deprecation hint (Spring4D pattern in retired units).
			// `unit Posix.NetinetIcmp6 platform;` — unit-level platform hint
			// (Embarcadero RTL Posix units).
			optional(choice(
				seq($.kDeprecated, optional($._expr)),
				$.kPlatform,
				$.kExperimental,
			)),
			';',
			repeat(choice(
				$.interface,
				$.implementation,
				$.initialization,
				$.finalization,
			)),
			$.kEnd, $.kEndDot
		),

		// Delphi package file (.dpk). Structure:
		//   package <Ident>;
		//   <compiler directives / $I includes>
		//   [requires <pkgList> ;]
		//   [contains <unitList> ;]    -- units may carry  in 'path.pas'
		//   end .
		package:            $ => seq(
			$.kPackage, $.moduleName, ';',
			optional($._definitions),
			optional($.declRequires),
			optional($.declContains),
			// Phase 3 iter (pure): Indy .NET dpk packages have a tail
			// `{$I X.inc}` after `contains` that expands to CIL assembly
			// attributes. Allow definitions AFTER contains too.
			optional($._definitions),
			$.kEnd, $.kEndDot
		),

		interface:       $ => seq($.kInterface, optional($._declarations)),
		implementation:  $ => seq($.kImplementation, optional($._definitions)),
		initialization:  $ => seq($.kInitialization, optional(tr($,'_statements'))),
		finalization:    $ => seq($.kFinalization, optional(tr($,'_statements'))),

		moduleName:      $ => delimited1($.identifier, $.kDot),

		// STATEMENTS ---------------------------------------------------------

		...statements(false),
		...statements(true),

		assignment:      $ => op.infix(1,
			choice($._expr, $.varAssignDef),
			choice(
				$.kAssign,
				// Phase 3b iter 29: compound assignment `+=`/`-=`/`*=`/`/=`.
				// FPC has always supported these; Delphi accepts them when
				// `{$EXTENDEDCOMPATIBILITY}` directive is on (since 2005).
				// FPC-corpus files (lazutils) use them heavily.
				$.kAssignAdd, $.kAssignSub, $.kAssignMul, $.kAssignDiv,
			),
			$._expr
		),
		varAssignDef:          $ => seq($.kVar, $.identifier,
			optional(seq(
				':',
				field('type', $.typeref)
			))),
		varDef:          $ => seq($.kVar, delimited1($.identifier), ':', field('type', $.typeref)),
		// Delphi 12+ inline `const NAME [: T] = value`. Used inside statement
		// bodies (begin..end blocks). Distinct from `declConst` which lives
		// in unit/procedure-local `const X = 1;\n Y = 2;` blocks under kConst.
		constInline:     $ => seq(
			$.kConst, field('name', $.identifier),
			optional(seq(':', field('type', $.typeref))),
			'=', field('value', $._expr)
		),
		label:           $ => seq($.identifier, ':'),
		caseLabel:       $ => seq(delimited1(choice($._expr, $.range)), ':'),

		_statements:     $ => repeat1(choice($.varDef, $._statement,  $.label)),
		_statementsTr:   $ => seq(
			repeat(choice($._statement, $.label)),
			// Trailing item may be a statement OR a bare label (labeled-empty
			// statement right before `end`). EurekaLog ESendAPI*.pas uses
			//   begin ... ExitSearch: end;
			choice(tr($,'_statement'), $._statement, $.label)
		),

		statements:      $ => $._statements,
		statementsTr:    $ => $._statementsTr,

		// asmBody is treated as ONE opaque token — content between `asm` and
		// the next word-boundary `end`. This grammar is not tree-sitter-asm;
		// the body is consumed wholesale and not subdivided into instructions,
		// labels, registers, etc. Use a dedicated assembler grammar if you
		// need that.
		//
		// The regex matches any character except an `end` keyword at a word
		// boundary. Alternations: any non-e/E char, e/E not followed by n/N,
		// en/EN not followed by d/D, end immediately followed by ident-char
		// (so it's NOT the keyword, e.g. 'endif' / 'endloop').
		asmBody: $ => token(prec(-1, repeat1(choice(
			// Identifier not starting with e/E — consume as a unit so an
			// embedded `end` substring (like in `addend` or `xchg ext`)
			// doesn't falsely terminate the body.
			/[a-df-zA-DF-Z_][a-zA-Z0-9_]*/,
			// Phase 3b iter 18: local asm labels `@@end:` / `@@loop:` etc.
			// Without this the `@@end` parses as `@@` (two `[^eE]`) + `end`
			// (asm terminator), falsely closing the asm block.
			// Match `@@<ident>` as one chunk so `end` after `@@` doesn't
			// terminate.
			/@@[a-zA-Z_][a-zA-Z0-9_]*/,
			/@[a-zA-Z_][a-zA-Z0-9_]*/,
			// Single-char alternatives — preserve the original e/E word-boundary
			// detection: stop when we see the bare `end` keyword.
			/[^eE]/,
			/[eE][^nN]/,
			/[eE][nN][^dD]/,
			/[eE][nN][dD][A-Za-z0-9_]/
		)))),

		// EXPRESSIONS ---------------------------------------------------------

		_expr:           $ => choice(
			$._ref, $.exprBinary, $.exprUnary,
			// Delphi 12+ inline if-then-else expression:
			//   X := if Cond then 1 else 0;
			//   Result := (if Assigned(X) then X.Name else '');
			$.exprIf,
		),

		// Inline if-expression: `if <cond> then <a> else <b>`. Distinct from
		// the if-then-else STATEMENT (rn('ifElse')) — this one returns a value.
		// Right-associative + lower precedence than binary operators so that
		// `a + if c then x else y` groups as `a + (if c then x else y)`.
		exprIf:          $ => prec.right(0, seq(
			$.kIf, field('condition', $._expr),
			$.kThen, field('then', $._expr),
			$.kElse, field('else', $._expr),
		)),

		_ref:            $ => choice(
			...enable_if(templates && fpc,
				// TODO: Ideally, the kSpecialize should be part of exprTpl,
				// but for some reason this leads to a rule conflict, so for
				// now we just put it here.
				//
				// Also, we have to write the rule in this weird weird way,
				// because if we just do
				//
				//   seq(optional($.kSpecialize), $.identifier)
				//
				// then we can't have a standalone identifier named
				// "specialize". (Bug in tree-sitter?)
				prec.left(choice(
					seq($.kSpecialize, $.identifier),
					seq(alias($.kSpecialize, $.identifier)),
				))
			),
			$.identifier,
			$._literal,  $.inherited, $.exprDot,
			$.exprBrackets, $.exprParens, $.exprSubscript, $.exprCall,
			alias($.exprDeref, $.exprUnary),
			alias($.exprAs, $.exprBinary),
			...enable_if(templates, $.exprTpl),
			...enable_if(lambda, $.lambda)
		),

		lambda:          $ => seq(
			choice($.kProcedure, $.kFunction),
			field('args', optional($.declArgs)),
			optional(seq(
				':',
				field('type', $.typeref),
			)),
			// Optional inline calling-convention on the lambda (Vcl.Edge.pas
			// passes anonymous-method callbacks with `stdcall` to interop with
			// WebView2 COM):
			//   var h := function(R: HRESULT): HRESULT stdcall begin ... end;
			optional(choice(
				$.kStdcall, $.kCdecl, $.kSafecall, $.kPascal,
				$.kRegister, $.kWinapi, $.kInline
			)),
			field('local', optional($._definitions)),
			field('body', choice(tr($, 'block'), tr($, 'asm'))),
		),

		inherited:       $ => prec.right(seq($.kInherited, optional($.identifier))),

		exprDot:         $ => choice(
			op.infix(5, $._ref, $.kDot, $._ref),
			// Keyword-as-identifier on RHS of dot: `TdxUnaryOp.Not`, `T.And`,
			// `T.Or`, `T.Xor` — common in DevExpress enum-class patterns where
			// the enum members are named after logical operators.
			// Phase 3b iter 21: add kFunction/kProcedure for `TdxToken.FUNCTION`
			// (DevExpress dxEMF criteria parser enum-class).
			prec.left(5, seq(
				field('lhs', $._ref),
				field('operator', $.kDot),
				field('rhs', choice(
					alias($.kNot,       $.identifier),
					alias($.kAnd,       $.identifier),
					alias($.kOr,        $.identifier),
					alias($.kXor,       $.identifier),
					alias($.kFunction,  $.identifier),
					alias($.kProcedure, $.identifier),
				))
			)),
		),
		exprDeref:       $ => op.postfix(4, $._expr, $.kHat),

		exprAs:          $ => op.infix(3, $._expr, $.kAs,  $._expr),

		// Unfortunately, we can't use $.exprArgs for $.exprTpl because the
		// parser cannot handle it.
		//
		// There are two conflicting rules:
		//
		//   0. Binary comparison: a < b
		//   1. Template use:      a < b >
		//                         ^^^^^
		//                         prefix
		//
		// In order for this to work, the prefix must produce the same nodes in
		// both cases. This is not the case when we introduce a wrapper node.
		//
		// Example:
		//
		//   exprBinary
		//     identifier
		//     <
		//     identifier
		//
		//   vs.
		//
		//   exprTpl
		//     exprArgs <-- extra node
		//       identifier
		//       <
		//       identifier
		//       >
		//
		// Basically the way this works is that there is a tentative node like
		// "exprTplOrBinary", which looks like this:
		//
		//   exprTplOrBinary
		//     identifier
		//     <
		//     identifier
		//
		// At this point we don't yet know what we are dealing with.  The next
		// token will determine whether we are dealing with a comparison or a
		// template. Then the existing node is simply "renamed". Because of
		// this, we can't have an extra node in only one of the branches.
		//
		// Generic instantiation `Foo<A, B, C>`. Originally `delimited1($._expr)`
		// but that caused `H < 0` (binary less-than) to be parsed as `Foo<0>`
		// (exprTpl) and parser then inserted MISSING `>` when no matching `>`
		// arrived. Narrowed to `typeref` — covers `TList<TFoo>`,
		// `TDictionary<string, TBar>` etc. (real generic instantiation).
		// Constant generic args (rare in Delphi corpus) lose structural parsing
		// but the program-as-a-whole parses cleanly.
		exprTpl:         $ => op.args(5, $._ref, $.kLt, delimited1($.typeref, ',', 5),  $.kGt),
		exprSubscript:   $ => op.args(5, $._ref, '[',   $.exprArgs,  ']'  ),
		exprCall:        $ => op.args(5, $._ref, '(',   optional($.exprArgs), ')'  ),

		// Pascal legacy string formatting for WriteLn(foo:4:3) etc.
		legacyFormat:    $ => repeat1(seq(':', $._expr)),

		exprArgs:        $ => delimited1(seq($._expr, optional($.legacyFormat))),

		exprBinary:      $ => choice(
			op.infix(1, $._expr, $.kLt,  $._expr),
			op.infix(1, $._ref,  $.kLt,  $._expr),
			op.infix(1, $._expr, $.kEq,  $._expr),
			op.infix(1, $._expr, $.kNeq, $._expr),
			op.infix(1, $._expr, $.kGt,  $._expr),
			op.infix(1, $._expr, $.kLte, $._expr),
			op.infix(1, $._expr, $.kGte, $._expr),
			op.infix(1, $._expr, $.kIn,  $._expr),
			op.infix(1, $._expr, $.kIs,  $._expr),

			op.infix(2, $._expr, $.kAdd, $._expr),
			op.infix(2, $._expr, $.kSub, $._expr),
			op.infix(2, $._expr, $.kOr,  $._expr),
			op.infix(2, $._expr, $.kXor, $._expr),

			op.infix(3, $._expr, $.kMul, $._expr),
			op.infix(3, $._expr, $.kFdiv,$._expr),
			op.infix(3, $._expr, $.kDiv, $._expr),
			op.infix(3, $._expr, $.kMod, $._expr),
			op.infix(3, $._expr, $.kAnd, $._expr),
			op.infix(3, $._expr, $.kShl, $._expr),
			op.infix(3, $._expr, $.kShr, $._expr),
			// Phase 3b iter 30: C-style shift `<<` and `>>` — FPC supports
			// these as alias for `shl`/`shr`. lazutils uses them heavily.
			op.infix(3, $._expr, alias(token('<<'), $.kShl), $._expr),
			op.infix(3, $._expr, alias(token('>>'), $.kShr), $._expr),
		),

		exprUnary:       $ => choice(
			op.prefix(4,  $.kNot,  $._expr),
			op.prefix(4,  $.kAdd,  $._expr),
			op.prefix(4,  $.kSub,  $._expr),
			op.prefix(4,  $.kAt,   $._expr),
		),

		exprParens:      $ => prec.left(5,seq('(', $._expr, ')')),

		// Set or array literal
		exprBrackets:       $ => seq(
			'[', delimited(choice($._expr, $.range)), ']'
		),

		// TYPES ---------------------------------------------------------------

		type:            $ => pp($,choice(
			$.typeref,
			$.declMetaClass,
			$.declEnum,
			$.declSet,
			$.declArray,
			$.declFile,
			$.declString,
			$.declProcRef,
			// Anonymous record/class/object types in type position. Required for
			// patterns like:
			//   const Errors: array [0..N] of record A: T; B: T; end = (...);
			//   var X: record I: Integer; end;
			$.declClass,
			// (PURE: pp_block-as-type alternatives dropped — preprocessor
			// resolves IFDEFs before this grammar sees the input.)
		)),

		typeref:         $ => seq(
			...enable_if(fpc, field('_dummy', optional($.kSpecialize))),
			$._typeref,
			...enable_if(delphi, optional(seq($.kDeprecated, $._expr))),
		),

		_typeref:        $ => choice(
			$.identifier, $.typerefDot,
			...enable_if(templates, $.typerefTpl),
			$.typerefPtr,
			// Soft keywords that can also serve as type names. Delphi allows
			// many context-sensitive keywords to be used as identifiers when
			// the surrounding syntax requires one. These come up most often
			// in OleServer / Excel / Word automation wrappers where the OLE
			// IDL was translated mechanically and used clashing names.
			//
			// Phase 3b iter 19: kIndex removed from this list so that at
			// expression positions, kIndex is NOT in valid_symbols (it's
			// only reachable from declProp's index clause and procExternal's
			// index ordinal — both class/external scope). With kIndex out of
			// reach, tree-sitter's word-rule soft-keyword promotion fires
			// and "Index" tokenizes as identifier in expressions like
			// `if i < Index then ...`. _typeref still gets "Index" via the
			// $.identifier path (no functional regression).
			alias($.kReference, $.identifier),
			alias($.kMessage,   $.identifier),
			alias($.kName,      $.identifier),
			alias($.kRead,      $.identifier),
			alias($.kWrite,     $.identifier),
		),

		typerefDot:      $ => op.infix(1,$._typeref, $.kDot, $._typeref),
		typerefTpl:      $ => op.args(1, $._typeref, $.kLt, $.typerefArgs, $.kGt),
		typerefPtr:      $ => op.prefix(1,$.kHat, $._typeref),
		typerefArgs:     $ => delimited1($._typeref),

		// GENERIC TYPE DECLARATION --------------------------------------------
		//
		// E.g. Foo<A: B, C: D<E>>.XYZ<T>
		//           ^     ^
		//     Note the optional constraints, which makes this different from a
		//     specialization
		//
		// We treat regular names as a special case of generic names. I.e. if
		// you see $._genericName somewhere, it doesn't mean that the name HAS
		// to be generic, it could just be a regular name like "TFoobar" or
		// "MyUnit.Foo".

		genericDot:      $ => op.infix(1,$._genericName, $.kDot, $._genericName),
		genericTpl:      $ => op.args(2,$._genericName, $.kLt, $.genericArgs, $.kGt),

		_genericName:    $ => choice(
			$.identifier, $.genericDot, ...enable_if(templates, $.genericTpl)
		),
		genericArgs:     $ => delimited1($.genericArg, ';'),
		genericArg:      $ => seq(
			field('name', delimited1($.identifier)),
			// Type constraint: `T: BaseType` or one/more of the special
			// constraint keywords `class` / `record` / `constructor`, comma-
			// separated. Examples:
			//   <T: class>                          must be a class type
			//   <T: constructor>                    must have parameterless ctor
			//   <T: class, constructor>             both
			//   <T: IFoo>                           must implement interface
			//   <T: IFoo, constructor>              both
			field('type', optional(seq(
				':',
				$._genericConstraint,
				repeat(seq(',', $._genericConstraint))
			))),
			field('defaultValue', optional($.defaultValue))
		),
		_genericConstraint: $ => choice(
			$.typeref,
			$.kClass,
			$.kRecord,
			$.kConstructor,
		),

		// LITERALS -----------------------------------------------------------

		_literal:        $ => choice(
			$.literalString,
			$.literalNumber,
			$.kNil, $.kTrue, $.kFalse
		),
		literalString:   $ => repeat1($._literalString),
		// Delphi 12+ multi-line string (triple-quoted, like Python's """) — must
		// be matched BEFORE the single-quoted form because tree-sitter uses
		// longest-match. The body matches any chars (including newlines and
		// single quotes) up to a closing `'''`.
		_literalString:  $ => choice(
			// Delphi 12+ triple-quoted multi-line string. prec(2) so the
			// regex engine prefers this over the single-quoted form when
			// three quotes start the literal.
			token(prec(2, /'''[\s\S]*?'''/)),
			// Single-quoted string. `''` (doubled single-quote) is Delphi's
			// escape for one literal apostrophe — `'Can''t'` is "Can't".
			// Body alternation: any non-quote char, OR a doubled quote.
			token(/'([^']|'')*'/),
			$.literalChar
		),
		// Char literal: `#NN` decimal/hex char code, OR `^X` control char
		// (the latter handled by the external scanner with proper lookahead
		// to disambiguate from `^TFoo` pointer-to-type).
		literalChar:     $ => choice(
			seq('#', $._literalInt),
			$.char_literal
		),
		literalNumber:   $ => choice($._literalInt, $._literalFloat, $.trailing_dot_float),
		// Delphi 11+ allows `_` as a digit-group separator: `1_000_000_000`
		// or `$FFFF_FFFF`. Underscore is between digits, never leading/trailing.
		_literalInt:     $ => choice(
			token.immediate(/[-+]?[0-9](_?[0-9])*/),
			token.immediate(/\$[a-fA-F0-9](_?[a-fA-F0-9])*/),
			// Phase 3b iter 24: Delphi octal literal `&NNN` (System.Beacon
			// uses `&1`, `&0`; RTL Linux/Posix code uses `&777` perm masks).
			token.immediate(/&[0-7](_?[0-7])*/),
			// Delphi binary literal `%NNN` — used in lower-level RTL code.
			token.immediate(/%[01](_?[01])*/),
		),
		// Float: optional sign, digits with optional decimal portion, optional
		// scientific exponent. Exponent letter is `e` OR `E` (case-insensitive).
		// NOTE: trailing-dot form (`100.`) is intentionally NOT supported here
		// because it conflicts with the `..` range operator (e.g. `array [0..N]`
		// would be lex-greedy-matched as `0.` float + `.N` and break the array).
		_literalFloat:   $ => prec(10, /[-+]?[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/),

		range:           $ => seq(
			$._expr, '..', $._expr
		),

		// DEFINITIONS --------------------------------------------------------

		_definitions:    $ => repeat1($._definition),
		_definition:     $ => choice(
			$.declTypes, $.declVars, $.declConsts, $.defProc,
			alias($.declProcFwd, $.declProc),
			$.declLabels, $.declUses, $.declExports,

			// Top-level CIL/.NET attributes such as
			//   [assembly: AssemblyDescription('...')]
			// found in Delphi.NET .inc files (Indy assembly metadata).
			$.declAssemblyAttribute,

			// Not actually valid syntax, but helps the parser recover:
			prec(-1,$.blockTr)
		),

		// A single bracketed attribute that applies to a module-level target
		// (e.g. assembly, module). Distinct from rttiAttributes (which attach
		// to declarations) because these are standalone.
		declAssemblyAttribute: $ => prec(1, seq(
			'[', $.identifier, ':', delimited($._ref), ']'
		)),

		defProc:         $ => seq(
			/*pp($,*/ field('header', $.declProc)/*)*/,
			// DevExpress nested fn pattern (iter 65, extended iter 66):
			//   function Production(...): Single; inline
			//   begin ... end;
			//   function EnumChildProc(...): BOOL; stdcall
			//   var ...
			// Trailing calling-conv / inline without `;` before body.
			// Restricted to safe keyword set (kDeprecated 'msg' conflicts with []).
			optional(field('trailingAttr', choice(
				$.kInline,
				$.kStdcall, $.kCdecl, $.kSafecall, $.kPascal,
				$.kRegister, $.kWinapi
			))),
			pp(
			 	$,
				field('local', optional($._definitions)),
				field('body', choice(tr($, 'block'), tr($, 'asm'))),
				';'
			)
		),

		declProcFwd:     $ => seq(
			$._declProc,
			choice(seq($.kForward, ';'), $.procExternal),
			repeat($._procAttribute)
		),

		// DECLARATIONS -------------------------------------------------------

		_visibility:     $ => choice(
			$.kPublished, $.kPublic, $.kProtected, $.kPrivate
		),

		_declarations:   $ => repeat1(choice(
			$.declTypes, $.declVars, $.declConsts, $.declProc, $.declProp,
			alias($.declProcFwd, $.declProc),
			$.declUses, $.declLabels, $.declExports
		)),
		_classDeclarations: $ => repeat1(choice(
			$.declTypes, $.declVars, $.declConsts, $.declProc, $.declProp
		)),

		defaultValue:    $ => seq($.kEq, $._initializer),

		// Declaration sections

		// Permissive uses-clause: accepts the normal `kUses delimited(unit) ;`
		// form AND patterns where `{$IF}/{$ELSE}/{$ENDIF}` directives appear
		// between units OR wrap the entire `units ;` block:
		//   uses
		//     {$IFDEF HAS_UNITSCOPE}
		//     System.SysUtils;
		//     {$ELSE}
		//     SysUtils;
		//     {$ENDIF}
		// We allow units, commas, pp tokens AND `;` to interleave; the rule
		// terminates on the LAST `;` it can consume. Trades grammatical
		// strictness for parsing robustness on real-world JEDI/JCL/Indy code.
		declUses:        $ => seq(
			$.kUses,
			// pp_block (external-scanner token) is added so a uses-clause whose
			// `;` lives INSIDE an IFDEF block doesn't dangle:
			//   uses
			//     {$IFDEF MSWINDOWS}Winapi.Windows;{$ENDIF MSWINDOWS}
			//     {$IFDEF POSIX}Posix.Stdlib;{$ENDIF POSIX}
			repeat1(choice($.declUsesUnit, ',', $.pp, ';'))
		),
		// A unit reference inside a uses / contains clause. In program (.dpr) and
		// package (.dpk) files the unit may carry an explicit source-file path
		// via  in '<literal>' . Optional braces with a form-name hint
		// (e.g.  {Form1}) are stripped as comments by the extras layer.
		declUsesUnit:    $ => seq($.moduleName, optional(seq($.kIn, $.literalString))),
		declRequires:    $ => seq(
			$.kRequires,
			repeat1(choice($.moduleName, ',', $.pp, ';'))
		),
		declContains:    $ => seq(
			$.kContains,
			repeat1(choice($.declUsesUnit, ',', $.pp, ';'))
		),
		declExports:     $ => seq($.kExports, delimited($.declExport), ';'),

		declTypes:       $ => seq(
			$.kType,
			repeat($.declType)
		),

		declVars:        $ => seq(
			optional($.kClass),
			choice($.kVar, $.kThreadvar),
			repeat($.declVar)
		),

		declConsts:      $ => seq(
			optional($.kClass),
			choice($.kConst, $.kResourcestring),
			repeat($.declConst),
		),

		// Declarations

		declType:        $ => seq(
			...enable_if(rtti, optional($.rttiAttributes)),
			// Phase 3b iter 30: `generic TFoo<T> = class` keyword form — was
			// FPC-only; lazutils uses it heavily. Accepting in Delphi mode is
			// harmless because real Delphi code never uses `generic` here.
			optional($.kGeneric),
			field('name', $._genericName), $.kEq,
			field('type',
				choice(
					seq(optional($.kType), $.type),
					choice($.type),
					$.declClass,
					$.declIntf,
					$.declHelper,
					// Subrange types: `type TJvMargin = 2..24;`, also
					// `type T = Low(Integer)..High(Integer);`
					$.subrangeType,
					// Phase 3b iter 8: strong-typed string with code-page
					// argument — `UTF8String = type _AnsiString(65001);`
					// and `RawByteString = type _AnsiString($ffff);`
					// (System.pas RTL pattern).
					seq($.kType, $.identifier, '(', $._literalInt, ')'),
				)
			),
			';',
			repeat($._procAttribute)
		),

		// Narrow subrange specialization used only as a type-declaration RHS,
		// to avoid the precedence/conflict cascade that `range` (uses _expr)
		// triggers in this position. Accepts numeric literals, negative
		// numbers, simple identifiers, and call-like `Func(arg)` forms which
		// covers Low/High/Ord patterns.
		subrangeType:    $ => seq(
			$._subrangeBound, '..', $._subrangeBound
		),
		_subrangeBound: $ => choice(
			$._literalInt,
			$._literalFloat,
			seq('-', $._literalInt),
			seq('+', $._literalInt),
			// Phase 3b iter 25: `-$7FFFFFFF-1..$7FFFFFFF` (System.UITypes TColor)
			// signed-hex with explicit binary correction: `-$N-K` / `+$N+K`.
			seq(choice('-','+'), $._literalInt, choice('-','+'), $._literalInt),
			// Phase 3b iter 5: `-Identifier` / `+Identifier` form for
			// `THelpContext = -MaxInt..MaxInt` (System.Classes pattern).
			seq('-', $.identifier),
			seq('+', $.identifier),
			$.identifier,
			// Qualified identifier `TFoo.Bar` (DevExpress enum-class subrange:
			//   TdxChartActualToolTipMode = TdxChartToolTipMode.None .. TdxChartToolTipMode.Crosshair;
			// Narrow form: two-level only; full qualified-name uses _ref which
			// conflicts with typerefDot in this position.)
			seq($.identifier, '.', $.identifier),
			seq($.identifier, '(', $.identifier, ')'),
			// `hid - 1`, `MaxN + 2` — narrow `identifier OP integer` form for
			// real-corpus patterns like `TNmbrRange = 0 .. hid - 1;`.
			// Kept narrow (no full _expr) to avoid the conflict cascade hit
			// when wider _expr was tried earlier.
			seq($.identifier, choice('-', '+'), $._literalInt),
			// `SizeOf(Integer) * 8 - 1`-style binary chain — narrow
			// `ident(ident) OP int OP int` form for the DevExpress pattern
			// `TcxContainerStyleValue = 0..SizeOf(Integer) * 8 - 1;`.
			seq($.identifier, '(', $.identifier, ')',
				choice('*', '/'), $._literalInt,
				choice('-', '+'), $._literalInt),
			// `#NN` numeric char-literal bound: `TCodeLetter = #64..#82;`.
			// (Excluding `^X` external char_literal — narrower keeps Spring4D
			// safe from the earlier regression.)
			seq('#', $._literalInt),
			// Phase 3b iter 41: parenthesized binary then trailing op + arg
			// for `(MaxInt div SizeOf(JOCTET))-1` (Vcl.Imaging.jpeg) and
			// `(High(Integer) - $F) div SizeOf(DWORD)` (EBorDebug). Narrow
			// shape: paren-wrap a 3-term binary then one more op + literal-or-call.
			seq(
				'(',
				choice($.identifier, seq($.identifier, '(', $.identifier, ')')),
				choice('-', '+', '*', '/', $.kDiv, $.kMod),
				choice($.identifier, $._literalInt, seq($.identifier, '(', $.identifier, ')')),
				')',
				choice('-', '+', '*', '/', $.kDiv, $.kMod),
				choice($._literalInt, seq($.identifier, '(', $.identifier, ')')),
			),
		),

		declProc:        $ => seq(
			...enable_if(rtti, optional($.rttiAttributes)),
			choice($._declProc, $._declOperator),
		),

		declVar:         $ => seq(
			...enable_if(rtti, optional($.rttiAttributes)),
			// Allow soft-keyword names as variable identifiers. Same set as
			// `_typeref`'s alias list — `Message: TFoo;`, `Name: string;`,
			// `Index: integer;` etc. show up frequently in legacy code.
			field('name', delimited1(choice(
				$.identifier,
				alias($.kMessage,   $.identifier),
				alias($.kName,      $.identifier),
				alias($.kIndex,     $.identifier),
				alias($.kRead,      $.identifier),
				alias($.kWrite,     $.identifier),
				alias($.kReference, $.identifier),
				// Phase 3b iter 14: kDefault as var name (FMX.Media.Win,
				// WBComp, System.Classes use `Default: Boolean;` etc.)
				alias($.kDefault,   $.identifier),
				// Phase 3b iter 16: kOperator as var name (Data.Win.ADODB,
				// Data.DBCommon use `Operator: TCANOperator;` etc.)
				alias($.kOperator,  $.identifier),
				// Phase 3b iter 36: kFinal as var name (Rave RvCsRpt
				// `Final: boolean;` — local var named Final).
				alias($.kFinal,     $.identifier),
			))),
			':',
			// Phase 3b iter 36: declVar type may be a subrange:
			//   Element: 0..MaxSet absolute Value;
			// (Raize CodeSiteLogging.)
			field('type', choice($.type, $.subrangeType)),
			optional(choice(
				seq($.kAbsolute, $._ref),
				field('defaultValue', $.defaultValue)
			)),
			// Phase 3b iter 14: declaration hints on module-level vars:
			//   CmdShow: Integer platform;
			//   SupportsAnimateWindow: Boolean = False deprecated 'msg';
			optional(choice(
				seq($.kDeprecated, optional($._expr)),
				$.kPlatform,
				$.kExperimental
			)),
			';',
			// Phase 3b iter 13: function-typed module-level vars with
			// callconv + default value:
			//   var Name: function(...): T; stdcall = nil;
			// Without this, the `;` before stdcall closes declVar and
			// `stdcall = nil ;` is orphaned. Match at declVar scope only
			// (not declProcRef) to avoid the iter-12 GLR cascade.
			optional(seq(
				choice(
					$.kStdcall, $.kCdecl, $.kSafecall, $.kPascal,
					$.kRegister, $.kWinapi, $.kInline
				),
				'=',
				field('defaultValueAfterCC', $._expr),
				';',
			)),
			repeat(choice($._procAttribute, $.procExternal))
		),

		declConst:       $ => seq(
			...enable_if(rtti, optional($.rttiAttributes)),
			// Allow soft-keyword names as const identifiers (DevExpress
			// dxCoreGraphics uses `Default` as a color-name constant; other
			// libraries use Message/Name/Index/etc.)
			field('name', choice(
				$.identifier,
				alias($.kDefault,   $.identifier),
				alias($.kMessage,   $.identifier),
				alias($.kName,      $.identifier),
				alias($.kIndex,     $.identifier),
				alias($.kRead,      $.identifier),
				alias($.kWrite,     $.identifier),
				alias($.kReference, $.identifier),
			)),
			// Phase 3b iter 31: declConst type may be a subrange:
			//   const allocatedCount : 0..MaxAllocEntries = 0;
			//   const Element : 0..MaxSet absolute Value;
			// (fibplus Zutil, Raize CodeSiteLogging patterns.)
			optional(seq(':', field('type', choice($.type, $.subrangeType)))),
			field('defaultValue', $.defaultValue),
			// Declaration hints before the terminating ';':
			//   const X = 'foo' deprecated 'use Y instead';
			//   const Y = 1 platform;
			//   const Z = 'bar' experimental;
			// Phase 3b iter 27: chained hints `platform deprecated;`
			// (System.SysUtils faVolumeID = $00000008 platform deprecated).
			// Phase 3b iter 28: `library` as legacy declaration hint
			// (YADF DeprecatedOnConst MyConst3 = 'test4' library).
			repeat(choice(
				seq($.kDeprecated, optional($._expr)),
				$.kPlatform,
				$.kExperimental,
				$.kLibrary,
			)),
			';',
			repeat($._procAttribute)
		),

		declLabels:      $ => seq($.kLabel, delimited1($.declLabel), ';'),
		declLabel:       $ => field('name', $.identifier),

		declExport:      $ => seq($._genericName, repeat(seq(choice($.kName, $.kIndex), $._expr))),

		// Type declarations

		declEnum:        $ => seq(
			'(', delimited1($.declEnumValue), ')',
			// Trailing platform/deprecated hint on the enum body itself:
			//   TFPUPrecisionMode = (pmSingle, pmReserved, ...) platform;
			// (System.Math pattern.)
			optional(choice(
				seq($.kDeprecated, optional($._expr)),
				$.kPlatform,
				$.kExperimental,
			)),
		),
		declEnumValue:   $ => seq(field('name', $.identifier), field('value', optional($.defaultValue))),
		// `set of T` where T is a type OR a subrange (`set of 1..100;`).
		declSet:         $ => seq(
			$.kSet, $.kOf, choice($.type, $.subrangeType),
			// Phase 3b iter 21: trailing platform/deprecated hint on set-type
			// declaration. `TFileAttributes = set of TFileAttribute platform;`
			// (System.IOUtils pattern.)
			optional(choice(
				seq($.kDeprecated, optional($._expr)),
				$.kPlatform,
				$.kExperimental,
			)),
		),
		declArray:       $ => seq(
			optional($.kPacked),
			$.kArray,
			optional(seq('[', delimited(choice($.range, $._expr)), ']')),
			// Element type can be a regular type OR an inline subrange:
			//   array [0..7] of 0..9 = (0, 1, 2, ...);
			$.kOf, choice($.type, $.subrangeType)
		),
		declFile:        $ => seq($.kFile, optional(seq($.kOf, $.type))),
		declString:      $ => prec.left(seq(
			$.kString,
			optional(seq('[', choice($._expr), ']'))
		)),

		declProcRef:     $ => prec.right(1,seq(
			optional(seq($.kReference, $.kTo)),
			choice($.kProcedure, $.kFunction),
			field('args', optional($.declArgs)),
			optional(seq(
				':',
				field('type', $.typeref),
			)),
			optional(seq($.kOf, $.kObject)),
			// Trailing calling convention. Restricted to a narrow keyword list
			// (NOT the full procAttribute, which causes typeref ambiguity)
			// to keep the grammar deterministic.
			// Phase 3b iter 25: `repeat` allows chained callconvs like
			// `cdecl varargs` (FireDAC.Phys.SQLiteCli Tsqlite3_config pattern).
			repeat(choice(
				$.kStdcall, $.kCdecl, $.kSafecall, $.kPascal,
				$.kRegister, $.kWinapi, $.kInline, $.kVarargs
			))
		)),

		declMetaClass:   $ => seq($.kClass, $.kOf, $.typeref),

		declClass:       $ => seq(
			optional($.kPacked),
			choice(
				$.kClass, $.kRecord, $.kObject,
				...enable_if(objc,
					$.kObjcclass, $.kObjccategory, $.kObjcprotocol
				)
			),
			optional(choice(
				$.kAbstract, $.kSealed,
				...enable_if(objc,
					seq($.kExternal, optional(seq($.kName, $._expr)))
				)
			)),
			field('parent', optional(seq('(',delimited($.typeref),')'))),
			optional($._declClass)
		),

		declIntf:        $ => seq(
			optional($.kPacked),
			choice(
				$.kInterface,
				...enable_if(delphi, $.kDispInterface)
			),
			field('parent', optional(seq('(',delimited($.typeref),')'))),
			field('guid', optional($.guid)),
			optional($._declClass)
		),

		declHelper:      $ => seq(
			choice($.kClass, $.kRecord, $.kType), $.kHelper,
			field('parent', optional(seq('(',delimited($.typeref),')'))),
			$.kFor, $.typeref,
			$._declClass
		),

		// Stuff for class/record/interface declarations

		guid:            $ => prec(1,seq('[', $._ref, ']')),

		_declClass:      $ => seq(
			optional($._declFields),
			optional($._classDeclarations),
			repeat($.declSection),
			optional($.declVariant),
			$.kEnd,
			// Record alignment hint (Win API patterns):
			//   _SLIST_ENTRY = record ... end align 16;
			//   _SLIST_ENTRY = record ... end align(16);
			//   sockaddr_storage = record ... end align (_SS_ALIGNSIZE);
			optional(seq(
				$.kAlign,
				choice(
					$._literalInt,
					seq('(', choice($._literalInt, $.identifier), ')'),
				),
			)),
			// Whole-type declaration hints AFTER `end`:
			//   type IFoo = interface ... end deprecated;
			//   type IBar = interface ... end deprecated 'use IBaz';
			optional(choice(
				seq($.kDeprecated, optional($._expr)),
				$.kPlatform,
				$.kExperimental,
			))
		),

		declSection:     $ => seq(
			optional($.kStrict),
			choice($._visibility, ...enable_if(objc, $.kRequired, $.kOptional)),
			optional($._declFields),
			optional($._classDeclarations)
		),

		// Phase 3b iter 10: allow LAST field to omit trailing `;` before `end`.
		// Pattern (extremely common in DevExpress and RTL records):
		//   TFoo = record
		//     A: TA;
		//     B: TB        // no `;` here
		//   end;
		// Tried in iter 62 with broader scope and reverted. Narrow form here:
		// repeat of normal declField (each with `;`) optionally followed by ONE
		// declFieldNoSemi at end. Anchor: declFieldNoSemi only fires before
		// `end` or kEnd-equivalent, since the parent rule expects that.
		_declFields:     $ => choice(
			repeat1($.declField),
			seq(repeat($.declField), $.declFieldNoSemi),
		),
		declFieldNoSemi: $ => seq(
			...enable_if(rtti, optional($.rttiAttributes)),
			field('name', delimited1($.identifier)),
			':',
			// Narrower type set than declField. Excludes declString with the
			// `[N]` short-string size spec — that conflicts with declFieldNoSemi
			// because the `[N]` looks like declFieldNoSemi's continuation when
			// in GLR fork. Excludes declArray for the same reason
			// (`Array[0..4] of String[1]` in ORM3 Z19b5.pas).
			// declString and declArray almost never appear as last-field with
			// no `;` in the corpus (those use the trailing `;` form already).
			field('type', choice(
				$.typeref,
				$.declMetaClass,
				$.declEnum,
				$.declSet,
				$.declFile,
				$.declProcRef,
				$.declClass,
				// Narrow `kString` only (no `[N]` size spec) — covers
				// `ColorValue: string` last-field-no-`;` (dxFontIconsImageLoader)
				// without re-introducing the iPLANLIST `string[30]` regression
				// (declField with `;` is preferred when `[N]` follows).
				alias($.kString, $.typeref),
			)),
			field('defaultValue', optional($.defaultValue)),
		),

		declField:       $ =>  seq(
			...enable_if(rtti, optional($.rttiAttributes)),
			field('name', delimited1($.identifier)),
			':',
			field('type', $.type),
			field('defaultValue', optional($.defaultValue)),
			// Declaration hints on record/class fields (Embarcadero RTL):
			//   FMin: Integer deprecated;
			//   FOldField: T platform;
			optional(choice(
				seq($.kDeprecated, optional($._expr)),
				$.kPlatform,
				$.kExperimental
			)),
			';',
			// Phase 3b iter 9: trailing `<callconv>;` clause for procedural-type
			// fields that import procDecl's `; cdecl;` convention. Pattern:
			//   DispInvoke: procedure(Dest: PVarData; ...); cdecl;
			//   VarArrayGet: function(...): Variant; cdecl;
			// (System.pas TVarManager + similar Win API records.)
			optional(seq(
				choice(
					$.kStdcall, $.kCdecl, $.kSafecall, $.kPascal,
					$.kRegister, $.kWinapi, $.kInline,
				),
				';',
			)),
		),

		declProp:        $ => seq(
			...enable_if(rtti, optional($.rttiAttributes)),
			optional($.kClass),
			$.kProperty,
			field('name', $.identifier),
			field('args', optional($.declPropArgs)),
			// Type clause is omitted in the "redirection" form: `property Name;`
			// or `property Name; default;` — used to expose an inherited property
			// at a different visibility without changing accessors.
			optional(seq(':', field('type', $.type))),
			repeat(choice(
				seq($.kIndex, field('index', $._expr)),
				...enable_if(delphi, seq($.kDispId, field('dispid', $._expr))),
				// read/write may reference: identifier (plain), qualified
				// identifier (Foo.Bar), or array-element access (fChilds[0])
				// — full _ref covers all of these.
				seq($.kRead, field('getter', $._ref)),
				seq($.kWrite, field('setter', $._ref)),
				seq($.kImplements, field('implements', delimited($._expr))),
				seq($.kDefault, field('defaultValue', $._expr)),
				seq($.kStored, field('stored', $._expr)),
				$.kNodefault,
				$.kReadonly,  // OLE dispinterface property: readonly dispid 0
				$.kWriteonly, // OLE dispinterface property: writeonly dispid N
			)),
			';',
			repeat($._procAttribute)
		),

		declPropArgs:    $ => seq('[', delimited($.declArg, ';'), ']'),

		// Variant records

		declVariant:     $ => prec.right(seq(
			$.kCase,
			field('name', optional(seq($.identifier, ':'))),
			field('type', $.typeref), $.kOf,
			delimited1($.declVariantClause, ';'),
			optional(';'),
		)),

		declVariantClause: $ => seq(
			$.caseLabel,
			'(',
			choice(
				seq(delimited(alias($.declVariantField, $.declField), ';'), optional(seq(';', $.declVariant))),
				seq($.declVariant),
			),
			optional(';'),
			')',
		),

		declVariantField: $ => seq(
			// Phase 3b iter 32: allow RTTI attribute on variant-record field.
			// Pattern: `case byte of 1:( [Example] V: Integer; );` (YADF test).
			optional($.rttiAttributes),
			field('name', delimited1($.identifier)),
			':',
			field('type', $.type),
			field('defaultValue', optional($.defaultValue))
		),

		// Stuff for procedure / function / operator declarations

		_declProc:       $ => seq(
			...enable_if(fpc, optional($.kGeneric)),
			optional($.kClass),
			choice($.kProcedure, $.kFunction, $.kConstructor, $.kDestructor),
			field('name', $._genericName),
			field('args', optional($.declArgs)),
			optional(seq(
				':',
				field('type', $.typeref),
			)),
			field('assign', optional($.defaultValue)),
			// Inline calling-convention or procAttribute BEFORE the terminating
			// ';' — Embarcadero RTL / AzureAPI use lenient forms:
			//   function DbiInitFn(...): DBIResult stdcall;   (iter 56)
			//   procedure PreflightBlobRequest(...) overload; (iter 60)
			// `repeat` allows multiple chained attributes like `... cdecl overload`.
			repeat(choice(
				$.kStdcall, $.kCdecl, $.kSafecall, $.kPascal,
				$.kRegister, $.kWinapi, $.kInline,
				$.kOverload, $.kVirtual, $.kAbstract, $.kOverride,
				$.kReintroduce, $.kStatic, $.kDynamic, $.kFinal
			)),
			';',
			repeat($._procAttributeNoExt)
		),

		_declOperator:   $ => seq(
			optional($.kClass),
			$.kOperator,
			field('name', $._operatorName),
			field('args', optional($.declArgs)),
			...enable_if(fpc, field('resultName', optional($.identifier))),
			// Return type is omitted for procedure-style class operators on
			// managed records: Initialize, Finalize, Assign.
			optional(seq(
				':',
				field('type', $.type),
				field('assign', optional($.defaultValue))
			)),
			';',
			repeat($._procAttributeNoExt)
		),

		operatorDot:     $ => op.infix(0, $._genericName, $.kDot, $.operatorName),
		_operatorName:   $ => seq(
			choice(
				$._genericName,
				...enable_if(fpc,
					$.operatorName,
					alias($.operatorDot, $.genericDot)
				)
			)
		),
		operatorName:    $ => choice(
			$.kDot, $.kLt, $.kEq, $.kNeq, $.kGt, $.kLte, $.kGte,
			$.kAdd, $.kSub, $.kMul, $.kFdiv, $.kDiv, $.kMod,
			$.kAssign,
			$.kOr, $.kXor, $.kAnd, $.kShl, $.kShr, $.kNot,
			$.kIn,
		),

		declArgs:        $ => seq('(', delimited($.declArg, ';'), ')'),

		declArg:         $ => choice(
			seq(
				// Phase 3b iter 20: allow rttiAttributes BEFORE the modifier
				// keyword, for IFDEF-wrapped attribute patterns:
				//   class operator Equal({$IFDEF X}[ref]{$ENDIF}const left: T)
				// THEN-wins exposes `[ref] const left: T`, so the bracketed
				// attribute precedes `const`. Original between-modifier-and-name
				// placement is still supported via the second optional below.
				optional($.rttiAttributes),
				choice($.kVar, $.kConst, $.kOut, $.kConstref),
				// Inline attribute between modifier and name:
				//   `const [ref] X: T` — pass-by-reference const (Delphi 10+).
				//   Generally any bracketed attribute is allowed here.
				optional($.rttiAttributes),
				field('name', delimited1($.identifier)),
				optional(seq(
					':', field('type', $.type),
					field('defaultValue', optional($.defaultValue))
				))
			),
			seq(
				// Phase 3b iter 15: allow bare `[Ref]` / `[in, ...]` attribute
				// before arg name without a leading modifier keyword. Win API
				// D3D11 wrappers use `[Ref] ppConstantBuffers: ID3D11Buffer`.
				optional($.rttiAttributes),
				field('name', delimited1($.identifier)), ':',
				field('type', $.type),
				field('defaultValue', optional($.defaultValue))
			)
		),

		// Attributes & declaration hints

		_procAttribute:  $ => /*pp($,*/choice(
			// Phase 3b iter 26: allow CHAINED proc attributes sharing one `;`,
			// for FireDAC.Phys.SQLiteCli pattern `; cdecl varargs;` on
			// procedural-type declarations. Single-attr form still matches.
			seq(repeat1(field('attribute', $.procAttribute)), ';'),
			// FPC-specific syntax, e.g. procedure myproc; [public; alias:'bla'; cdecl];
			...enable_if(fpc, seq(
				'[',
				delimited(field('attribute', choice($.procAttribute, $.procExternal))),
				']', ';'
			))
		)/*)*/,
		_procAttributeNoExt: $ => /*pp($,*/ choice(
			seq(repeat1(field('attribute', $.procAttribute)), ';'),
			// FPC-specific syntax, e.g. procedure myproc; [public; alias:'bla'; cdecl];
			...enable_if(fpc, seq('[', delimited(field('attribute', choice($.procAttribute)), ';'), ']', ';'))
		)/*)*/,

		procAttribute:   $ => choice(
			$.kStatic, $.kVirtual, $.kDynamic, $.kAbstract, $.kOverride,
			$.kOverload, $.kReintroduce, $.kInline, $.kStdcall,
			$.kCdecl, $.kPascal, $.kRegister, $.kSafecall, $.kAssembler,
			$.kNoreturn, $.kLocal,  $.kFar, $.kNear,
			$.kDefault, $.kNodefault, $.kDeprecated, $.kExperimental,
			$.kFinal,    // sealed-method modifier: 'function X; override; final;'
			$.kPlatform, // valid in Delphi too (was fpc-only)
			$.kExport,   // legacy DLL-export modifier (valid in Delphi too)
			$.kVarargs,  // variadic-arg modifier on cdecl functions
			$.kWinapi,   // calling convention (alias for stdcall on Win32)
			$.kInterrupt,
			// Phase 3b iter 39: legacy `library` hint on proc decls
			// (Rave11 RpCanvas/RpFiler etc. `override; deprecated; library;`).
			$.kLibrary,
			// NOTE: kForward intentionally NOT here — it conflicts with the
			// declProcFwd rule which has its own `; forward;` handling.

			seq(
				choice(
					seq($.kMessage, optional($.kName)),
					$.kDeprecated
				),
				$._expr
			),

			...enable_if(fpc,
				$.kPlatform, $.kUnimplemented,
				$.kCppdecl, $.kCvar, $.kMwpascal, $.kNostackframe,
				$.kInterrupt, $.kIocheck, $.kHardfloat,
				$.kSoftfloat, $.kMs_abi_default, $.kMs_abi_cdecl,
				$.kSaveregisters, $.kSysv_abi_default, $.kSysv_abi_cdecl,
				$.kVectorcall, $.kVarargs, $.kWinapi,
				...enable_if(public_name, $.kPublic),
				seq(
					choice(
						$.kExport,
						seq($.kAlias, ':'),
						...enable_if(public_name, seq($.kPublic, $.kName)),
					),
					$._expr
				)
			),

			...enable_if(delphi, field('dispid', seq($.kDispId, $._expr))),
		),

		rttiAttributes:  $ => repeat1(seq(
			// Note: "Identifier:" is for tagging parameters of procedures (Delphi)
			'[', optional(seq($.identifier, ':')), delimited($._ref), ']'
		)),

		procExternal:    $ => seq(
			$.kExternal,
			optional($._expr),
			optional(seq(choice($.kName, $.kIndex), $._expr)),
			...enable_if(delphi, optional($.kDelayed)),
			// Phase 3b iter 17: native library dependency hint
			//   function f; cdecl; external LIB name 'foo' dependency 'c++_static','c++abi';
			// (Embarcadero FlatBox2D Android/iOS linker pattern.)
			// Phase 3b iter 35: `dependency` clause may use identifier-name
			// constants too: `dependency LibCPP, LibCPP_ABI` (FireDAC.Phys.IBCli).
			optional(seq(
				$.kDependency,
				delimited1(choice($._literalString, $.identifier)),
			)),
			';'
		),

		// INITIALIZERS --------------------------------------------------------

		_initializer:    $ => prec(2,seq(
			choice($._expr, $.recInitializer, $.arrInitializer)
		)),

		// record initializer
		recInitializer:  $ => seq(
			'(',
			delimited1($.recInitializerField, ';'),
			// Optional trailing `;` before `)` — accepted by Delphi compiler,
			// used in DevExpress dxCore Unicode tables and similar generated
			// data files.
			optional(';'),
			')'
		),

		recInitializerField: $ => choice(
			seq(field('name',$.identifier), ':', field('value', $._initializer)),
			field('value', $._initializer)
		),

		// array initializer
		// Array / set initializer. Allows empty `()` (Spring4D const sentinels:
		// `Arg: TArg = ();`) as well as `(a, b, c)` populated form.
		arrInitializer:  $ => prec(1,seq('(', delimited($._initializer), ')')),

		// TERMINAL SYMBOLS ----------------------------------------------------

		kProgram:          $ => /program/i,
		kLibrary:          $ => /library/i,
		kUnit:             $ => /unit/i,
		kPackage:          $ => /package/i,
		kRequires:         $ => /requires/i,
		kContains:         $ => /contains/i,
		kUses:             $ => /uses/i,
		kInterface:        $ => /interface/i,
		kDispInterface:    $ => /dispinterface/i,
		kImplementation:   $ => /implementation/i,
		kInitialization:   $ => /initialization/i,
		kFinalization:     $ => /finalization/i,
		kEndDot:           $ => '.',

		kBegin:            $ => /begin/i,
		kEnd:              $ => /end/i,
		kAsm:              $ => /asm/i,

		kVar:              $ => /var/i,
		kThreadvar:        $ => /threadvar/i,
		kConst:            $ => /const/i,
		kConstref:         $ => /constref/i,
		kResourcestring:   $ => /resourcestring/i,
		kOut:              $ => /out/i,
		kType:             $ => /type/i,
		kLabel:            $ => /label/i,
		kExports:          $ => /exports/i,

		kAbsolute:         $ => /absolute/i,

		kProperty:         $ => /property/i,
		kRead:             $ => /read/i,
		kWrite:            $ => /write/i,
		kImplements:       $ => /implements/i,
		kDefault:          $ => /default/i,
		kNodefault:        $ => /nodefault/i,
		kStored:           $ => /stored/i,
		kIndex:            $ => /index/i,
		kDispId:           $ => /dispid/i,

		kClass:            $ => /class/i,
		kInterface:        $ => /interface/i,
		kObject:           $ => /object/i,
		kRecord:           $ => /record/i,
		kObjcclass:        $ => /objcclass/i,
		kObjccategory:     $ => /objccategory/i,
		kObjcprotocol:     $ => /objcprotocol/i,
		kArray:            $ => /array/i,
		kFile:             $ => /file/i,
		kString:           $ => /string/i,
		kSet:              $ => /set/i,
		kOf:               $ => /of/i,
		kHelper:           $ => /helper/i,
		kPacked:           $ => /packed/i,

		kGeneric:          $ => /generic/i,
		kSpecialize:       $ => /specialize/i,

		kDot:              $ => '.',
		kLt:               $ => '<',
		kEq:               $ => '=',
		kNeq:              $ => '<>',
		kGt:               $ => '>',
		kLte:              $ => '<=',
		kGte:              $ => '>=',
		kAdd:              $ => '+',
		kSub:              $ => '-',
		kMul:              $ => '*',
		kFdiv:             $ => '/',
		kAt:               $ => '@',
		// `at` keyword (raise with address): `raise E at ReturnAddress`.
		// Distinct from `@` operator (kAt). Soft keyword — must not clash
		// with normal identifiers.
		kAtWord:           $ => /at/i,
		kHat:              $ => '^',
		kAssign:           $ => ':=',
		kAssignAdd:        $ => '+=', // Freepascal
		kAssignSub:        $ => '-=', // Freepascal
		kAssignMul:        $ => '*=', // Freepascal
		kAssignDiv:        $ => '/=', // Freepascal
		kOr:               $ => /or/i,
		kXor:              $ => /xor/i,
		kDiv:              $ => /div/i,
		kMod:              $ => /mod/i,
		kAnd:              $ => /and/i,
		kShl:              $ => /shl/i,
		kShr:              $ => /shr/i,
		kNot:              $ => /not/i,
		kIs:               $ => /is/i,
		kAs:               $ => /as/i,
		kIn:               $ => /in/i,

		kFor:              $ => /for/i,
		kTo:               $ => /to/i,
		kDownto:           $ => /downto/i,
		kIf:               $ => /if/i,
		kThen:             $ => /then/i,
		kElse:             $ => /else/i,
		kDo:               $ => /do/i,
		kWhile:            $ => /while/i,
		kRepeat:           $ => /repeat/i,
		kUntil:            $ => /until/i,
		kTry:              $ => /try/i,
		kExcept:           $ => /except/i,
		kFinally:          $ => /finally/i,
		kRaise:            $ => /raise/i,
		kOn:               $ => /on/i,
		kCase:             $ => /case/i,
		kWith:             $ => /with/i,
		kGoto:             $ => /goto/i,

		kFunction:         $ => /function/i,
		kProcedure:        $ => /procedure/i,
		kConstructor:      $ => /constructor/i,
		kDestructor:       $ => /destructor/i,
		kOperator:         $ => /operator/i,
		kReference:        $ => /reference/i,

		kPublished:        $ => /published/i,
		kPublic:           $ => /public/i,
		kProtected:        $ => /protected/i,
		kPrivate:          $ => /private/i,
		kStrict:           $ => /strict/i,
		kRequired:         $ => /required/i,
		kOptional:         $ => /optional/i,

		kForward:          $ => /forward/i,

		kStatic:           $ => /static/i,
		kVirtual:          $ => /virtual/i,
		kAbstract:         $ => /abstract/i,
		kSealed:           $ => /sealed/i,
		kFinal:            $ => /final/i,
		kReadonly:         $ => /readonly/i,
		kWriteonly:        $ => /writeonly/i,
		kDynamic:          $ => /dynamic/i,
		kOverride:         $ => /override/i,
		kOverload:         $ => /overload/i,
		kReintroduce:      $ => /reintroduce/i,
		kInherited:        $ => /inherited/i,
		kInline:           $ => /inline/i,

		kStdcall:          $ => /stdcall/i,
		kCdecl:            $ => /cdecl/i,
		kCppdecl:          $ => /cppdecl/i,
		kPascal:           $ => /pascal/i,
		kRegister:         $ => /register/i,
		kMwpascal:         $ => /mwpascal/i,
		kExternal:         $ => /external/i,
		kName:             $ => /name/i,
		kMessage:          $ => /message/i,
		kDeprecated:       $ => /deprecated/i,
		kExperimental:     $ => /experimental/i,
		kPlatform:         $ => /platform/i,
		// Soft keyword: only used in `record ... end align N` record-alignment
		// hint (Win API records). Tokenizes everywhere but only consumed
		// structurally in _declClass post-end clause.
		kAlign:            $ => /align/i,
		// Soft keyword: native library dependency hint in procExternal.
		kDependency:       $ => /dependency/i,
		kUnimplemented:    $ => /unimplemented/i,
		kCvar:             $ => /cvar/i,
		kExport:           $ => /export/i,
		kFar:              $ => /far/i,
		kNear:             $ => /near/i,
		kSafecall:         $ => /safecall/i,
		kAssembler:        $ => /assembler/i,
		kNostackframe:     $ => /nostackframe/i,
		kInterrupt:        $ => /interrupt/i,
		kNoreturn:         $ => /noreturn/i,
		kIocheck:          $ => /iocheck/i,
		kLocal:            $ => /local/i,
		kHardfloat:        $ => /hardfloat/i,
		kSoftfloat:        $ => /softfloat/i,
		kMs_abi_default:   $ => /ms_abi_default/i,
		kMs_abi_cdecl:     $ => /ms_abi_cdecl/i,
		kSaveregisters:    $ => /saveregisters/i,
		kSysv_abi_default: $ => /sysv_abi_default/i,
		kSysv_abi_cdecl:   $ => /sysv_abi_cdecl/i,
		kVectorcall:       $ => /vectorcall/i,
		kVarargs:          $ => /varargs/i,
		kWinapi:           $ => /winapi/i,
		kAlias:            $ => /alias/i,
		// Delphi
		kDelayed:          $ => /delayed/i,

		kNil:              $ => /nil/i,
		kTrue:             $ => /true/i,
		kFalse:            $ => /false/i,

		kIfdef:            $ => /ifdef/i,
		kIfndef:           $ => /ifndef/i,
		kEndif:            $ => /endif/i,

		// `&` prefix escapes a keyword as an identifier (`&type`).
		// `&&` prefix is the Delphi.NET operator-name convention
		// (`&&op_Equality`, `&&op_Implicit`, etc.) still used in Spring4D's
		// generic operator overloads.
		// Phase 3b iter 40: identifier accepts Unicode letters too.
		// Delphi allows non-ASCII identifiers (umlauts, accented letters,
		// Cyrillic, etc.). Pattern: ASCII letter/underscore start, then
		// any letter/digit/underscore including the Unicode-letter range
		// U+0080+ (Latin-1 Supplement onwards). Excludes ASCII punctuation
		// so structural tokens stay intact.
		identifier:        $ => /&{0,2}[a-zA-Z_-￿][0-9_a-zA-Z-￿]*/,

	  	_space:            $ => /[\s\r\n\t]+/,
		// Single preprocessor directive. The external scanner (src/scanner.c)
		// handles multi-line `{$IF*}...{$END*}` blocks via the pp_block token,
		// refusing blocks that wrap structural decls so they parse normally.
		pp:                $ => /\{\$[^}]*\}/,
		comment:           $ => token(choice(
			seq('//', /.*/),
			seq('{', /([^$}][^}]*)?/, '}'),
			/[(][*]([^*]*[*]+[^)*])*[^*]*[*]+[)]/
		)),
	}
});
