// Shared default define profile: Delphi 13 (Florence, compiler 37.0) Win64.
// Used by cli.js and serve.js when no --defines profile is supplied. Real
// consumers (e.g. drag-lint) pass a project-derived profile instead.
'use strict';

const DEFAULT_DEFINES = [
  'MSWINDOWS', 'WIN64', 'CPU64BITS', 'CPUX86_64', 'CONDITIONALEXPRESSIONS',
  'UNICODE', 'NEXTGEN_FALSE', // negation tokens (matches some legacy IFDEFs)
  'COMPILER_VERSION_37',
];

const DEFAULT_NUMERIC = {
  CompilerVersion: 37,
  RTLVersion: 37,
};

module.exports = { DEFAULT_DEFINES, DEFAULT_NUMERIC };
