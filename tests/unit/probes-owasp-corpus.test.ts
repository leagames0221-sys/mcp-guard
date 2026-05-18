// T-24 corpus integrity test — runs the real loader against the real
// `src/probes/owasp/` tree and asserts AC-002-1 (≥ 30 probes, all 10
// OWASP categories represented) without touching detector / harness yet.

import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { loadProbeDirectory } from '../../src/probes/loader.js';
import { OWASP_CATEGORIES } from '../../src/probes/types.js';

const CORPUS_DIR = join(process.cwd(), 'src', 'probes', 'owasp');

describe('OWASP probe corpus (AC-002-1)', () => {
  it('contains ≥ 30 probes', async () => {
    const loaded = await loadProbeDirectory(CORPUS_DIR);
    expect(loaded.length).toBeGreaterThanOrEqual(30);
  });

  it('spans all 10 OWASP LLM Top 10 categories', async () => {
    const loaded = await loadProbeDirectory(CORPUS_DIR);
    const seen = new Set(loaded.map((l) => l.probe.owasp_category));
    for (const cat of OWASP_CATEGORIES) {
      expect(seen, `missing category ${cat}`).toContain(cat);
    }
  });

  it('every probe carries corpus_version=1 (D-009 literal)', async () => {
    const loaded = await loadProbeDirectory(CORPUS_DIR);
    for (const { probe, sourcePath } of loaded) {
      expect(probe.corpus_version, `bad corpus_version at ${sourcePath}`).toBe(1);
    }
  });

  it('every probe carries an OWASP reference URL (educational scope attribution)', async () => {
    const loaded = await loadProbeDirectory(CORPUS_DIR);
    for (const { probe, sourcePath } of loaded) {
      const hasOwaspRef = probe.references.some((r) => r.includes('genai.owasp.org'));
      expect(hasOwaspRef, `no OWASP reference at ${sourcePath}`).toBe(true);
    }
  });

  it('every probe carries a license string', async () => {
    const loaded = await loadProbeDirectory(CORPUS_DIR);
    for (const { probe, sourcePath } of loaded) {
      expect(probe.license, `empty license at ${sourcePath}`).toBeTruthy();
    }
  });

  it('probe ids are globally unique', async () => {
    const loaded = await loadProbeDirectory(CORPUS_DIR);
    const ids = loaded.map((l) => l.probe.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every category has at least 3 probes (balanced corpus)', async () => {
    const loaded = await loadProbeDirectory(CORPUS_DIR);
    const counts = new Map<string, number>();
    for (const { probe } of loaded) {
      counts.set(probe.owasp_category, (counts.get(probe.owasp_category) ?? 0) + 1);
    }
    for (const cat of OWASP_CATEGORIES) {
      expect(counts.get(cat) ?? 0, `category ${cat} has < 3 probes`).toBeGreaterThanOrEqual(3);
    }
  });
});
