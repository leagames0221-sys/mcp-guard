import { describe, it, expect } from 'vitest';

import {
  REMEDIATION_TEMPLATES,
  hasTemplate,
  remediateFindings,
  templateFor,
  templateRemediationFor,
} from '../../src/remediation/index.js';
import type { Finding } from '../../src/io/emitters/json.js';
import { SCANNER_CATEGORIES } from '../../src/scanners/types.js';

function mkFinding(over: Partial<Finding> = {}): Finding {
  return {
    id: over.id ?? 'finding-1',
    ruleId: over.ruleId ?? 'SSRF-LOOPBACK',
    severity: over.severity ?? 'high',
    source: 'static',
    message: 'test message',
    ...over,
  };
}

// Every ruleId every scanner can emit, captured from src/scanners/*.
// If a scanner adds a rule, add it here (and the template) — the
// coverage invariant below ensures drift is caught immediately.
const ALL_KNOWN_RULE_IDS = [
  // SSRF (T-19)
  'SSRF-CLOUD-METADATA',
  'SSRF-LOOPBACK',
  'SSRF-PRIVATE-IP',
  'SSRF-NON-HTTP-SCHEME',
  // command-injection (T-20)
  'CMDINJ-SHELL-INTERPRETER',
  'CMDINJ-SHELL-METACHAR',
  'CMDINJ-INTERPRETER-EVAL',
  'CMDINJ-ENV-INJECTION',
  'CMDINJ-CURL-PIPE-SHELL',
  // auth-gap (T-21)
  'AUTH-GAP-URL-CREDENTIAL',
  'AUTH-GAP-NO-AUTHORIZATION',
  'AUTH-GAP-WEAK-BEARER',
  'AUTH-GAP-BASIC-AUTH-PLAINTEXT',
  'AUTH-GAP-PLAINTEXT-CREDENTIAL',
  // supply-chain (T-22)
  'SUPPLY-CHAIN-UNSCOPED-PACKAGE',
  'SUPPLY-CHAIN-UNPINNED-VERSION',
  'SUPPLY-CHAIN-EPHEMERAL-HOST',
  'SUPPLY-CHAIN-RAW-CONTENT',
] as const;

describe('REMEDIATION_TEMPLATES — coverage invariant (AC-003-1)', () => {
  it('has a template entry for every known scanner ruleId', () => {
    for (const ruleId of ALL_KNOWN_RULE_IDS) {
      expect(hasTemplate(ruleId), `missing template for ${ruleId}`).toBe(true);
    }
  });

  it('every template references a known scanner category', () => {
    for (const [ruleId, tpl] of Object.entries(REMEDIATION_TEMPLATES)) {
      expect(SCANNER_CATEGORIES, `bad category at ${ruleId}`).toContain(tpl.category);
    }
  });

  it('every template carries a non-empty suggested_patch', () => {
    for (const [ruleId, tpl] of Object.entries(REMEDIATION_TEMPLATES)) {
      expect(tpl.suggested_patch.length, `empty patch for ${ruleId}`).toBeGreaterThan(20);
    }
  });

  it('every template carries ≥ 1 reference URL', () => {
    for (const [ruleId, tpl] of Object.entries(REMEDIATION_TEMPLATES)) {
      expect(tpl.references.length, `no refs for ${ruleId}`).toBeGreaterThanOrEqual(1);
      for (const ref of tpl.references) {
        expect(ref).toMatch(/^https?:\/\//);
      }
    }
  });

  it('every scanner category has at least 1 ruleId templated', () => {
    const cats = new Set(Object.values(REMEDIATION_TEMPLATES).map((t) => t.category));
    for (const cat of SCANNER_CATEGORIES) {
      expect(cats, `no template for category ${cat}`).toContain(cat);
    }
  });

  it('REMEDIATION_TEMPLATES is frozen', () => {
    expect(Object.isFrozen(REMEDIATION_TEMPLATES)).toBe(true);
  });

  it('templateFor returns undefined for unknown ruleId', () => {
    expect(templateFor('UNKNOWN-RULE-X')).toBeUndefined();
  });
});

describe('templateRemediationFor — AC-003-1 + AC-003-3', () => {
  it('produces output with the spec-mandated AC-003-1 fields', () => {
    const r = templateRemediationFor(mkFinding({ id: 'f-1', ruleId: 'SSRF-LOOPBACK', severity: 'high' }));
    expect(r.findingId).toBe('f-1');
    expect(r.ruleId).toBe('SSRF-LOOPBACK');
    expect(r.severity).toBe('high');
    expect(r.category).toBe('ssrf');
    expect(typeof r.suggested_patch).toBe('string');
    expect(r.suggested_patch.length).toBeGreaterThan(0);
    expect(Array.isArray(r.references)).toBe(true);
    expect(r.references.length).toBeGreaterThan(0);
  });

  it('labels source as "template" (AC-003-3)', () => {
    const r = templateRemediationFor(mkFinding({ ruleId: 'SSRF-CLOUD-METADATA' }));
    expect(r.source).toBe('template');
  });

  it('preserves finding severity verbatim', () => {
    for (const sev of ['low', 'medium', 'high', 'critical'] as const) {
      const r = templateRemediationFor(mkFinding({ ruleId: 'CMDINJ-SHELL-METACHAR', severity: sev }));
      expect(r.severity).toBe(sev);
    }
  });

  it('routes ssrf rules to ssrf category', () => {
    for (const ruleId of ALL_KNOWN_RULE_IDS.filter((r) => r.startsWith('SSRF-'))) {
      expect(templateRemediationFor(mkFinding({ ruleId })).category).toBe('ssrf');
    }
  });

  it('routes cmdinj rules to command-injection category', () => {
    for (const ruleId of ALL_KNOWN_RULE_IDS.filter((r) => r.startsWith('CMDINJ-'))) {
      expect(templateRemediationFor(mkFinding({ ruleId })).category).toBe('command-injection');
    }
  });

  it('routes auth-gap rules to auth-gap category', () => {
    for (const ruleId of ALL_KNOWN_RULE_IDS.filter((r) => r.startsWith('AUTH-GAP-'))) {
      expect(templateRemediationFor(mkFinding({ ruleId })).category).toBe('auth-gap');
    }
  });

  it('routes supply-chain rules to supply-chain-risk category', () => {
    for (const ruleId of ALL_KNOWN_RULE_IDS.filter((r) => r.startsWith('SUPPLY-CHAIN-'))) {
      expect(templateRemediationFor(mkFinding({ ruleId })).category).toBe('supply-chain-risk');
    }
  });
});

describe('templateRemediationFor — unknown ruleId fallback', () => {
  it('falls back to ssrf category guidance for SSRF-prefixed unknown', () => {
    const r = templateRemediationFor(mkFinding({ ruleId: 'SSRF-FUTURE-RULE' }));
    expect(r.category).toBe('ssrf');
    expect(r.suggested_patch.length).toBeGreaterThan(0);
    expect(r.source).toBe('template');
    expect(r.references).toEqual([]);
  });

  it('falls back to command-injection guidance for CMDINJ-prefixed unknown', () => {
    const r = templateRemediationFor(mkFinding({ ruleId: 'CMDINJ-FUTURE-RULE' }));
    expect(r.category).toBe('command-injection');
  });

  it('falls back to auth-gap guidance for AUTH-GAP-prefixed unknown', () => {
    const r = templateRemediationFor(mkFinding({ ruleId: 'AUTH-GAP-FUTURE-RULE' }));
    expect(r.category).toBe('auth-gap');
  });

  it('falls back to supply-chain-risk guidance for SUPPLY-CHAIN-prefixed unknown', () => {
    const r = templateRemediationFor(mkFinding({ ruleId: 'SUPPLY-CHAIN-FUTURE-RULE' }));
    expect(r.category).toBe('supply-chain-risk');
  });
});

describe('remediateFindings — bulk path', () => {
  it('produces one Remediation per Finding, in input order', () => {
    const findings: Finding[] = [
      mkFinding({ id: 'f-1', ruleId: 'SSRF-LOOPBACK' }),
      mkFinding({ id: 'f-2', ruleId: 'CMDINJ-SHELL-METACHAR' }),
      mkFinding({ id: 'f-3', ruleId: 'AUTH-GAP-URL-CREDENTIAL' }),
    ];
    const out = remediateFindings(findings);
    expect(out.length).toBe(3);
    expect(out.map((r) => r.findingId)).toEqual(['f-1', 'f-2', 'f-3']);
    expect(out.map((r) => r.category)).toEqual(['ssrf', 'command-injection', 'auth-gap']);
  });

  it('returns [] on empty input', () => {
    expect(remediateFindings([])).toEqual([]);
  });
});
