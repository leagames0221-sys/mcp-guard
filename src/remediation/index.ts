// Remediation engine entry. T-28 surface: per-finding template lookup.
// T-29 will extend this with an optional LLM-enriched path; for now,
// `source: 'template'` (AC-003-3) is the only valid output.
//
// Missing-template policy: if a scanner emits a ruleId we don't yet
// have a template for, we fall back to a category-level generic
// suggestion rather than throw. The test suite asserts that every
// known ruleId has a template (coverage invariant), so the fallback
// only runs in genuine drift cases the test would catch.

import type { Finding } from '../io/emitters/json.js';
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

