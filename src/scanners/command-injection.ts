// T-20 (AC-001-1): Command-injection detector. Inspects stdio server
// entries (`command` + `args` + `env`) and flags 5 known injection
// primitives:
//
//   CMDINJ-CURL-PIPE-SHELL   critical  `curl ... | sh` / `wget ... | bash`
//                                      anywhere in the joined command-line —
//                                      direct RCE supply-chain primitive
//   CMDINJ-SHELL-INTERPRETER high      `command` IS a shell (sh/bash/zsh/
//                                      cmd/powershell/...) WITH an eval
//                                      flag (-c / /c / -Command / ...)
//   CMDINJ-INTERPRETER-EVAL  high      `command` IS a code interpreter
//                                      (python/node/perl/ruby/php) WITH an
//                                      eval flag (-c / -e / -r / --eval)
//   CMDINJ-SHELL-METACHAR    medium    `args` contain shell metacharacters
//                                      (; | & > < `, $( ), ${ }) — exploitable
//                                      when MCP runtime spawns through shell
//   CMDINJ-ENV-INJECTION     medium    `env` value contains $( ) / backtick /
//                                      Shellshock-style function definition
//                                      (CVE-2014-6271 pattern)
//
// Http servers have no command surface and are skipped (SSRF detector
// covers them). Multiple rules may fire on the same server; each
// represents a distinct remediation surface, so all hits are emitted.

import type { Finding } from '../io/emitters/json.js';
import { makeFindingId, type ScanContext, type Scanner } from './types.js';

const SHELL_INTERPRETERS: ReadonlySet<string> = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'ksh',
  'fish',
  'ash',
  'cmd',
  'powershell',
  'pwsh',
]);

const SHELL_EVAL_FLAGS: ReadonlySet<string> = new Set([
  '-c',
  '/c',
  '/C',
  '-Command',
  '-command',
  '-EncodedCommand',
  '-encodedcommand',
]);

// Map of code interpreter basename → set of eval flags that pass a
// string body to be executed.
const CODE_EVAL_FLAGS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['python', new Set(['-c'])],
  ['python2', new Set(['-c'])],
  ['python3', new Set(['-c'])],
  ['node', new Set(['-e', '--eval', '-p', '--print'])],
  ['nodejs', new Set(['-e', '--eval', '-p', '--print'])],
  ['deno', new Set(['eval'])],
  ['perl', new Set(['-e', '-E'])],
  ['ruby', new Set(['-e'])],
  ['php', new Set(['-r'])],
  ['lua', new Set(['-e'])],
  ['osascript', new Set(['-e'])],
]);

// curl/wget/fetch piped into a shell anywhere in the joined cmdline.
// Case-insensitive; tolerates intermediate flags between curl and the pipe.
const CURL_PIPE_SHELL_RE =
  /\b(?:curl|wget|fetch|iwr|invoke-webrequest)\b[^|]*\|\s*(?:sh|bash|zsh|ksh|dash|ash|pwsh|powershell|cmd)\b/i;

// Shell metacharacters that enable injection when args reach a shell.
// Single & is treated as background (still injection-relevant). Single
// > / < are I/O redirection. ; chains commands. ${} and $() expand.
// Backtick is command substitution.
const METACHAR_RE = /[`;|&<>]|\$\(|\$\{/;

// Shellshock-like env injection: function definition prefix `() {` or
// command substitution `$(...)` / backtick inside an env value.
const ENV_EXPANSION_RE = /\$\(|`|\(\)\s*\{/;

function basename(commandPath: string): string {
  const normalized = commandPath.replace(/\\/g, '/');
  const last = normalized.split('/').pop() ?? commandPath;
  return last.replace(/\.exe$/i, '').toLowerCase();
}

interface RuleHit {
  ruleId:
    | 'CMDINJ-CURL-PIPE-SHELL'
    | 'CMDINJ-SHELL-INTERPRETER'
    | 'CMDINJ-INTERPRETER-EVAL'
    | 'CMDINJ-SHELL-METACHAR'
    | 'CMDINJ-ENV-INJECTION';
  severity: 'critical' | 'high' | 'medium';
  message: string;
  locatorSuffix: string;
}

export interface CmdInjInput {
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
}

export function evaluateCommandInjection(input: CmdInjInput): RuleHit[] {
  const hits: RuleHit[] = [];
  const args = input.args ?? [];
  const cmdBase = basename(input.command);
  const joined = [input.command, ...args].join(' ');

  // 1. CURL-PIPE-SHELL — most severe, but does not preempt other rules.
  if (CURL_PIPE_SHELL_RE.test(joined)) {
    hits.push({
      ruleId: 'CMDINJ-CURL-PIPE-SHELL',
      severity: 'critical',
      message:
        'command-line contains `curl|wget … | sh|bash|…` pattern — direct RCE supply-chain primitive (no signature, no checksum, attacker-controlled HTTP body executed verbatim)',
      locatorSuffix: 'command+args',
    });
  }

  // 2. SHELL-INTERPRETER — command is a shell + eval flag in args.
  if (SHELL_INTERPRETERS.has(cmdBase)) {
    const evalFlagIndex = args.findIndex((a) => SHELL_EVAL_FLAGS.has(a));
    if (evalFlagIndex >= 0) {
      hits.push({
        ruleId: 'CMDINJ-SHELL-INTERPRETER',
        severity: 'high',
        message: `command "${cmdBase}" is a shell interpreter invoked with eval flag "${args[evalFlagIndex]}" — argument body is executed as shell code (any future config edit becomes RCE)`,
        locatorSuffix: 'command',
      });
    }
  }

  // 3. INTERPRETER-EVAL — code interpreter + string-body eval flag.
  const evalFlags = CODE_EVAL_FLAGS.get(cmdBase);
  if (evalFlags) {
    const evalFlagIndex = args.findIndex((a) => evalFlags.has(a));
    if (evalFlagIndex >= 0) {
      hits.push({
        ruleId: 'CMDINJ-INTERPRETER-EVAL',
        severity: 'high',
        message: `command "${cmdBase}" is a code interpreter invoked with eval flag "${args[evalFlagIndex]}" — argument body is executed as ${cmdBase} code (config-driven code execution surface)`,
        locatorSuffix: 'command',
      });
    }
  }

  // 4. SHELL-METACHAR — any arg containing shell metacharacters.
  const metacharIndex = args.findIndex((a) => METACHAR_RE.test(a));
  if (metacharIndex >= 0) {
    hits.push({
      ruleId: 'CMDINJ-SHELL-METACHAR',
      severity: 'medium',
      message: `args[${metacharIndex}] contains shell metacharacter(s) — exploitable to command injection when the MCP runtime spawns through a shell (common on Windows + shell:true)`,
      locatorSuffix: `args[${metacharIndex}]`,
    });
  }

  // 5. ENV-INJECTION — Shellshock-style expansion in env value.
  if (input.env) {
    for (const [key, value] of Object.entries(input.env)) {
      if (ENV_EXPANSION_RE.test(value)) {
        hits.push({
          ruleId: 'CMDINJ-ENV-INJECTION',
          severity: 'medium',
          message: `env["${key}"] value contains shell-expansion syntax ($(…) / backtick / function definition) — Shellshock-class injection if forwarded to a vulnerable shell (CVE-2014-6271 family)`,
          locatorSuffix: `env.${key}`,
        });
      }
    }
  }

  return hits;
}

export const commandInjectionScanner: Scanner = {
  category: 'command-injection',
  scan(ctx: ScanContext): Finding[] {
    const findings: Finding[] = [];
    for (const [serverName, server] of Object.entries(ctx.config.mcpServers)) {
      if (!('command' in server)) continue; // http entries are out of scope
      const hits = evaluateCommandInjection({
        command: server.command,
        ...(server.args !== undefined ? { args: server.args } : {}),
        ...(server.env !== undefined ? { env: server.env } : {}),
      });
      for (const hit of hits) {
        const locator = `mcpServers.${serverName}.${hit.locatorSuffix}`;
        findings.push({
          id: makeFindingId({
            category: 'command-injection',
            ruleId: hit.ruleId,
            target: ctx.target,
            locator,
          }),
          ruleId: hit.ruleId,
          severity: hit.severity,
          source: 'static',
          message: hit.message,
          path: ctx.target,
          details: {
            server: serverName,
            command: server.command,
            locator,
          },
        });
      }
    }
    return findings;
  },
};
