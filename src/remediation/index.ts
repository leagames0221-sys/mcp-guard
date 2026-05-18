// Remediation engine entry. T-28 surface: per-finding template lookup
// (source: 'template', AC-003-3). T-29 surface: optional LLM enrichment
// (source: 'llm', AC-003-2). Caller controls which surface runs via the
// presence + health of an LlmProvider — the engine NEVER instantiates
// a paid provider, preserving the project-wide paid-API 6-layer defense.
//
// Missing-template policy: if a scanner emits a ruleId we don't yet
// have a template for, we fall back to a category-level generic
// suggestion rather than throw. The test suite asserts that every
// known ruleId has a template (coverage invariant), so the fallback
// only runs in genuine drift cases the test would catch.

import type { Finding } from '../io/emitters/json.js';
import { sanitize } from '../logger/sanitize.js';
import type { LlmProvider } from '../providers/llm/types.js';
import type { ScannerCategory } from '../scanners/types.js';

import { templateFor } from './templates.js';
import type { Remediation } from './types.js';

export { REMEDIATION_TEMPLATES, hasTemplate, templateFor } from './templates.js';
export type { Remediation, RemediationSource, RemediationTemplate } from './types.js';

// Category → generic fallback used only when a ruleId has no template.
// Phrased as guidance rather than a fix because the specific patch
// path is unknown.
const CATEGORY_FALLBACK: Record<ScannerCategory, string> = {
  ssrf:
    'Add an outbound-host allowlist + DNS re-check after resolution. Reject loopback, private IPv4, and cloud metadata IPs at the URL parser.',
  'command-injection':
    'Replace shell invocations with direct argv arrays. Pass arguments as separate elements so the kernel exec path bypasses the shell.',
  'auth-gap':
    'Require an Authorization or x-api-key header on every non-loopback server entry. Move literal credentials to env-var interpolation.',
  'supply-chain-risk':
    'Pin packages to a publisher scope + semver. Replace ephemeral preview hosts and raw-content URLs with stable release artifacts.',
};

function categoryForRuleId(ruleId: string): ScannerCategory {
  if (ruleId.startsWith('SSRF-')) return 'ssrf';
  if (ruleId.startsWith('CMDINJ-')) return 'command-injection';
  if (ruleId.startsWith('AUTH-GAP-')) return 'auth-gap';
  if (ruleId.startsWith('SUPPLY-CHAIN-')) return 'supply-chain-risk';
  // Defense-in-depth: a Finding whose ruleId we cannot route to any
  // category is a genuine drift case; we still produce a Remediation
  // so the CLI does not crash, but the suggestion is empty rather
  // than misleading.
  return 'ssrf';
}

export function templateRemediationFor(finding: Finding): Remediation {
  const tpl = templateFor(finding.ruleId);
  if (tpl !== undefined) {
    return {
      findingId: finding.id,
      ruleId: finding.ruleId,
      category: tpl.category,
      severity: finding.severity,
      suggested_patch: tpl.suggested_patch,
      references: tpl.references,
      source: 'template',
    };
  }
  // Fallback path (no template registered for this ruleId).
  const cat = categoryForRuleId(finding.ruleId);
  return {
    findingId: finding.id,
    ruleId: finding.ruleId,
    category: cat,
    severity: finding.severity,
    suggested_patch: CATEGORY_FALLBACK[cat],
    references: [],
    source: 'template',
  };
}

export function remediateFindings(findings: readonly Finding[]): Remediation[] {
  return findings.map((f) => templateRemediationFor(f));
}

// ── LLM enrichment path (T-29, AC-003-2) ─────────────────────────
//
// Bounded prompt budget — every enriched call costs the same upper
// bound regardless of finding shape. Composes with T-13b PaidApiBudget
// so a misbehaving provider cannot inflate per-finding cost.
const ENRICH_MAX_TOKENS = 256;

const ENRICH_PROMPT_VERSION = 1;

// Prompt is short, action-oriented, and includes a deterministic
// trailer marker so the response can be cleanly extracted without
// re-prompting. Finding fields are sanitized via T-07 before
// interpolation — defense-in-depth against an attacker who plants
// ANSI / control bytes in a scanned config to weaponize the LLM
// prompt path.
function buildEnrichmentPrompt(finding: Finding, baseTemplate: string): string {
  const parts = [
    'You are reviewing an MCP server configuration security finding.',
    'Produce a single-paragraph remediation patch (2-3 sentences).',
    'Be concrete and actionable. Do not include code fences.',
    '',
    `Finding ID: ${sanitize(finding.id)}`,
    `Rule: ${sanitize(finding.ruleId)}`,
    `Severity: ${sanitize(finding.severity)}`,
    `Message: ${sanitize(finding.message)}`,
    finding.path !== undefined ? `Location: ${sanitize(finding.path)}` : '',
    '',
    'Baseline guidance (use as a reference, refine if you can do better):',
    sanitize(baseTemplate),
    '',
    'Concrete remediation:',
  ].filter((line) => line !== '');
  return parts.join('\n');
}

// Heuristic post-processing: take the model output, trim, drop any
// leading marker line that echoes the prompt trailer, cap length so a
// runaway response cannot dominate the report. Returns null when the
// response is empty/whitespace-only — caller treats that as
// "enrichment failed" and falls back to template.
function extractEnrichedPatch(raw: string): string | null {
  const cleaned = sanitize(raw).trim();
  if (cleaned.length === 0) return null;
  // Drop a leading "Concrete remediation:" echo if present.
  const stripped = cleaned.replace(/^(?:concrete\s+remediation\s*:?\s*)/i, '').trim();
  if (stripped.length === 0) return null;
  // Hard length cap so a runaway provider cannot bloat the report.
  return stripped.length > 1024 ? stripped.slice(0, 1024) : stripped;
}

export interface EnrichOptions {
  signal?: AbortSignal;
  // Test seam — let unit tests inject a fixed prompt budget without
  // touching the runtime constant.
  maxTokens?: number;
}

export async function enrichRemediation(
  finding: Finding,
  provider: LlmProvider,
  opts: EnrichOptions = {},
): Promise<Remediation> {
  const base = templateRemediationFor(finding);
  const prompt = buildEnrichmentPrompt(finding, base.suggested_patch);
  let raw: string;
  try {
    const genOpts: { maxTokens: number; signal?: AbortSignal } = {
      maxTokens: opts.maxTokens ?? ENRICH_MAX_TOKENS,
    };
    if (opts.signal !== undefined) genOpts.signal = opts.signal;
    raw = await provider.generate(prompt, genOpts);
  } catch {
    // Provider failure (network / budget / abort) → fall back to
    // template. AC-003-3 already permits this output shape, so no
    // additional signal is necessary for downstream consumers.
    return base;
  }
  const enriched = extractEnrichedPatch(raw);
  if (enriched === null) return base;
  return {
    ...base,
    suggested_patch: enriched,
    source: 'llm',
  };
}

export interface BulkEnrichOptions extends EnrichOptions {
  stderr?: NodeJS.WritableStream;
}

// Bulk enrichment path used by the suggest subcommand. Provider gate:
//   - no provider           → all-template (AC-003-3)
//   - provider unhealthy    → all-template + stderr warning (AC-003-3)
//   - provider healthy      → per-finding enrich (AC-003-2);
//                             individual failures fall back to template
//                             without aborting the whole run.
export async function enrichFindings(
  findings: readonly Finding[],
  provider: LlmProvider | undefined,
  opts: BulkEnrichOptions = {},
): Promise<Remediation[]> {
  const stderr = opts.stderr ?? process.stderr;
  if (provider === undefined) {
    return remediateFindings(findings);
  }
  let healthy: boolean;
  try {
    healthy = await provider.health();
  } catch {
    healthy = false;
  }
  if (!healthy) {
    stderr.write(
      `[remediation] provider "${sanitize(provider.name)}" unhealthy — falling back to template-only output\n`,
    );
    return remediateFindings(findings);
  }
  const out: Remediation[] = [];
  for (const f of findings) {
    out.push(await enrichRemediation(f, provider, opts));
  }
  return out;
}

export const _ENRICH_PROMPT_VERSION = ENRICH_PROMPT_VERSION;

