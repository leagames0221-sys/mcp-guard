// T-30 + T-31 commander program behaviour. Tests are at the program-
// shape level (`commands.map(c => c.name())` + help-text contents +
// showSuggestionAfterError enabled) rather than full subprocess
// invocations — keeps the test suite fast and OS-independent.

import { describe, it, expect } from 'vitest';

import { buildProgram } from '../../src/cli/index.js';

describe('buildProgram (T-30 commander wire-up)', () => {
  it('registers three subcommands in canonical order', () => {
    const program = buildProgram('1.2.3');
    const names = program.commands.map((c) => c.name());
    expect(names).toEqual(['scan', 'inject', 'suggest']);
  });

  it('--version uses the value supplied to buildProgram (AC-005-4)', () => {
    const program = buildProgram('9.9.9');
    expect(program.version()).toBe('9.9.9');
  });

  it('every subcommand has a non-empty description (AC-005-1)', () => {
    const program = buildProgram('1.0.0');
    for (const cmd of program.commands) {
      expect(cmd.description().length, `empty description on ${cmd.name()}`).toBeGreaterThan(0);
    }
  });

  it('every subcommand has an addHelpText "after" examples block registered (AC-005-1)', () => {
    // commander emits addHelpText output only via outputHelp() (not
    // helpInformation()); capture stdout through configureOutput.
    const program = buildProgram('1.0.0');
    for (const cmd of program.commands) {
      let buf = '';
      cmd.configureOutput({
        writeOut: (s: string) => {
          buf += s;
        },
        writeErr: (s: string) => {
          buf += s;
        },
      });
      cmd.outputHelp();
      expect(buf, `no Examples on ${cmd.name()}`).toContain('Examples:');
    }
  });

  it('top-level --help renders all three subcommand names (AC-005-2)', () => {
    const program = buildProgram('1.0.0');
    const help = program.helpInformation();
    expect(help).toContain('scan');
    expect(help).toContain('inject');
    expect(help).toContain('suggest');
  });

  it('scan subcommand declares --format, --output, --fail-on-severity options', () => {
    const program = buildProgram('1.0.0');
    const scan = program.commands.find((c) => c.name() === 'scan')!;
    const optNames = scan.options.map((o) => o.long);
    expect(optNames).toContain('--format');
    expect(optNames).toContain('--output');
    expect(optNames).toContain('--fail-on-severity');
  });

  it('inject subcommand declares --corpus and --severity-floor options', () => {
    const program = buildProgram('1.0.0');
    const inject = program.commands.find((c) => c.name() === 'inject')!;
    const optNames = inject.options.map((o) => o.long);
    expect(optNames).toContain('--corpus');
    expect(optNames).toContain('--severity-floor');
  });

  it('suggest subcommand requires a <report> positional argument', () => {
    const program = buildProgram('1.0.0');
    const suggest = program.commands.find((c) => c.name() === 'suggest')!;
    // commander stores positional args on _args; presence + required flag are
    // the load-bearing assertions.
    const args = suggest.registeredArguments;
    expect(args.length).toBe(1);
    expect(args[0]!.name()).toBe('report');
    expect(args[0]!.required).toBe(true);
  });

  it('top-level showSuggestionAfterError is enabled (T-31, AC-005-3)', () => {
    const program = buildProgram('1.0.0');
    // commander stores the flag on _showSuggestionAfterError; we read it
    // via the public help artefact: an unknown command emits a
    // "did you mean" hint. Easier path — check the option is set on
    // the internal config.
    const flag = (program as unknown as { _showSuggestionAfterError: boolean })
      ._showSuggestionAfterError;
    expect(flag).toBe(true);
  });
});
