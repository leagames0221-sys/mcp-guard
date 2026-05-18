// SARIF v2.1.0 emitter — hand-rolled per D-003 (no sarif-multitool / npm
// sarif dep; supply-chain blast radius minimization). Output is shaped
// for GitHub code scanning UI ingestion per AC-001-3 + AC-alpha-6.
//
// Spec references kept narrow:
//   - SARIF v2.1.0: $schema, version, runs[].tool.driver.{name, version,
//     rules[]}, runs[].results[].{ruleId, level, message.text, locations}
//   - GitHub code scanning: ruleIndex + partialFingerprints for stable
//     finding de-duplication across runs.
//
// AC-001-4 honoured: a finding-free report becomes `runs[0].results = []`
// (the field is always present, never omitted).

import { writeAtomic } from './atomic.js';
import type { Finding, ScanReport } from './json.js';
import type { SeverityLevel } from '../../types/index.js';

export const SARIF_VERSION = '2.1.0';
export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
export const TOOL_INFORMATION_URI = 'https://github.com/leagames0221-sys/mcp-guard';

export type SarifLevel = 'none' | 'note' | 'warning' | 'error';

export interface SarifArtifactLocation {
  uri: string;
}

export interface SarifRegion {
  startLine?: number;
  startColumn?: number;
}

export interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region?: SarifRegion;
}

export interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

export interface SarifMessage {
  text: string;
}

export interface SarifReportingDescriptor {
  id: string;
  name?: string;
  shortDescription?: SarifMessage;
  defaultConfiguration?: { level: SarifLevel };
}

export interface SarifResult {
  ruleId: string;
  ruleIndex?: number;
  level: SarifLevel;
  message: SarifMessage;
  locations?: SarifLocation[];
  partialFingerprints?: Record<string, string>;
}

export interface SarifToolComponent {
  name: string;
  version: string;
  informationUri?: string;
  rules: SarifReportingDescriptor[];
}

export interface SarifRun {
  tool: { driver: SarifToolComponent };
  results: SarifResult[];
}

export interface SarifLog {
  $schema: typeof SARIF_SCHEMA;
  version: typeof SARIF_VERSION;
  runs: SarifRun[];
}

export function severityToSarifLevel(severity: SeverityLevel): SarifLevel {
  switch (severity) {
    case 'low':
      return 'note';
    case 'medium':
      return 'warning';
    case 'high':
      return 'error';
    case 'critical':
      return 'error';
  }
}

// SARIF artifactLocation.uri prefers forward-slashed paths. Windows
// backslashes get normalized; we deliberately do NOT prefix a file://
// scheme because GitHub code-scanning UI matches in-repo files by
// repo-relative path, not absolute URI.
export function pathToSarifUri(p: string): string {
  return p.replace(/\\/g, '/');
}

function buildLocations(finding: Finding): SarifLocation[] | undefined {
  if (!finding.path) return undefined;
  const region: SarifRegion = {};
  if (finding.line !== undefined) region.startLine = finding.line;
  if (finding.col !== undefined) region.startColumn = finding.col;
  const physical: SarifPhysicalLocation = {
    artifactLocation: { uri: pathToSarifUri(finding.path) },
  };
  if (Object.keys(region).length > 0) physical.region = region;
  return [{ physicalLocation: physical }];
}

export function buildSarifLog(report: ScanReport): SarifLog {
  // Stable rule index = order of first appearance. Multiple findings
  // sharing a ruleId reuse the same rules[] entry.
  const ruleByid = new Map<string, SarifReportingDescriptor>();
  for (const f of report.results) {
    if (!ruleByid.has(f.ruleId)) {
      ruleByid.set(f.ruleId, {
        id: f.ruleId,
        name: f.ruleId,
        shortDescription: { text: f.ruleId },
        defaultConfiguration: { level: severityToSarifLevel(f.severity) },
      });
    }
  }
  const rules = Array.from(ruleByid.values());
  const ruleIndexById = new Map(rules.map((r, i) => [r.id, i] as const));

  const results: SarifResult[] = report.results.map((finding) => {
    const result: SarifResult = {
      ruleId: finding.ruleId,
      level: severityToSarifLevel(finding.severity),
      message: { text: finding.message },
      partialFingerprints: { mcpGuardFindingId: finding.id },
    };
    const idx = ruleIndexById.get(finding.ruleId);
    if (idx !== undefined) result.ruleIndex = idx;
    const locations = buildLocations(finding);
    if (locations) result.locations = locations;
    return result;
  });

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: report.tool.name,
            version: report.tool.version,
            informationUri: TOOL_INFORMATION_URI,
            rules,
          },
        },
        results,
      },
    ],
  };
}

export function serializeSarifLog(log: SarifLog): string {
  return `${JSON.stringify(log, null, 2)}\n`;
}

export async function emitSarifReport(
  report: ScanReport,
  outputPath: string,
): Promise<void> {
  await writeAtomic(outputPath, serializeSarifLog(buildSarifLog(report)));
}
