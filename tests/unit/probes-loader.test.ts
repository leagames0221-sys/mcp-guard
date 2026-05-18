import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { DataFormatError, InvalidInputError, IoError } from '../../src/errors/index.js';
import { loadProbeDirectory, loadProbeFile, parseProbeYaml } from '../../src/probes/loader.js';
import { OWASP_CATEGORIES, EXPECTED_BEHAVIORS } from '../../src/probes/types.js';

const FIX = join(process.cwd(), 'tests', 'fixtures', 'prompts');

describe('parseProbeYaml — happy path', () => {
  it('parses a fully-populated valid probe', async () => {
    const { probe } = await loadProbeFile(join(FIX, 'valid-minimal.yaml'));
    expect(probe.id).toBe('llm01-fixture-direct-override');
    expect(probe.corpus_version).toBe(1);
    expect(probe.owasp_category).toBe('LLM01');
    expect(probe.expected_behavior).toBe('refuse');
    expect(probe.tags).toContain('direct-injection');
    expect(probe.references.length).toBeGreaterThan(0);
    expect(probe.license).toBe('CC-BY-4.0');
  });

  it('returns a frozen probe object', async () => {
    const { probe } = await loadProbeFile(join(FIX, 'valid-minimal.yaml'));
    expect(Object.isFrozen(probe)).toBe(true);
  });

  it('preserves the absolute source path on the LoadedProbe', async () => {
    const loaded = await loadProbeFile(join(FIX, 'valid-minimal.yaml'));
    expect(loaded.sourcePath.endsWith('valid-minimal.yaml')).toBe(true);
  });

  it('accepts every OWASP category enum value', () => {
    for (const cat of OWASP_CATEGORIES) {
      const yaml = `id: ok-${cat.toLowerCase()}\ncorpus_version: 1\nowasp_category: ${cat}\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n`;
      const probe = parseProbeYaml(yaml, `<inline:${cat}>`);
      expect(probe.owasp_category).toBe(cat);
    }
  });

  it('accepts every expected_behavior enum value', () => {
    for (const beh of EXPECTED_BEHAVIORS) {
      const yaml = `id: ok-${beh}\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: ${beh}\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n`;
      const probe = parseProbeYaml(yaml, '<inline>');
      expect(probe.expected_behavior).toBe(beh);
    }
  });

  it('defaults tags to [] when omitted', () => {
    const yaml = `id: ok-default-tags\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\nreferences: ["https://example.com/"]\nlicense: MIT\n`;
    const probe = parseProbeYaml(yaml, '<inline>');
    expect(probe.tags).toEqual([]);
  });
});

describe('parseProbeYaml — required-metadata gate (AC literal)', () => {
  it('rejects probe missing corpus_version with InvalidInputError', async () => {
    await expect(loadProbeFile(join(FIX, 'invalid-missing-corpus-version.yaml'))).rejects.toThrow(
      InvalidInputError,
    );
  });

  it('rejects probe missing owasp_category with InvalidInputError', async () => {
    await expect(loadProbeFile(join(FIX, 'invalid-missing-owasp.yaml'))).rejects.toThrow(
      InvalidInputError,
    );
  });

  it('error message names the missing metadata key', async () => {
    try {
      await loadProbeFile(join(FIX, 'invalid-missing-corpus-version.yaml'));
      expect.fail('expected throw');
    } catch (err) {
      expect((err as Error).message).toContain('corpus_version');
    }
  });

  it('rejects probe missing BOTH keys and lists both in the error', () => {
    const yaml = 'id: nope\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n';
    try {
      parseProbeYaml(yaml, '<inline>');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidInputError);
      const msg = (err as Error).message;
      expect(msg).toContain('corpus_version');
      expect(msg).toContain('owasp_category');
    }
  });
});

describe('parseProbeYaml — schema rejections', () => {
  it('rejects bad owasp_category enum value', async () => {
    await expect(loadProbeFile(join(FIX, 'invalid-bad-category.yaml'))).rejects.toThrow(
      InvalidInputError,
    );
  });

  it('rejects unparseable YAML with DataFormatError', async () => {
    await expect(loadProbeFile(join(FIX, 'invalid-malformed.yaml'))).rejects.toThrow(
      DataFormatError,
    );
  });

  it('rejects YAML root that is not a mapping (array)', () => {
    expect(() => parseProbeYaml('- a\n- b\n', '<inline>')).toThrow(DataFormatError);
  });

  it('rejects YAML root that is not a mapping (scalar)', () => {
    expect(() => parseProbeYaml('hello\n', '<inline>')).toThrow(DataFormatError);
  });

  it('rejects negative corpus_version', () => {
    const yaml = 'id: ok\ncorpus_version: -1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n';
    expect(() => parseProbeYaml(yaml, '<inline>')).toThrow(InvalidInputError);
  });

  it('rejects empty references array', () => {
    const yaml = 'id: ok\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: []\nlicense: MIT\n';
    expect(() => parseProbeYaml(yaml, '<inline>')).toThrow(InvalidInputError);
  });

  it('rejects malformed reference URL', () => {
    const yaml = 'id: ok\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["not a url"]\nlicense: MIT\n';
    expect(() => parseProbeYaml(yaml, '<inline>')).toThrow(InvalidInputError);
  });

  it('rejects id with uppercase letters', () => {
    const yaml = 'id: BadID\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n';
    expect(() => parseProbeYaml(yaml, '<inline>')).toThrow(InvalidInputError);
  });

  it('rejects unknown extra field (strict)', () => {
    const yaml = 'id: ok\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\nextra_field: oops\n';
    expect(() => parseProbeYaml(yaml, '<inline>')).toThrow(InvalidInputError);
  });

  it('error.details include the offending sourcePath', () => {
    try {
      parseProbeYaml('id: ok\n', '/tmp/x.yaml');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as InvalidInputError).details).toMatchObject({ sourcePath: '/tmp/x.yaml' });
    }
  });
});

describe('loadProbeFile — IO surface', () => {
  it('maps ENOENT to IoError (exit 74)', async () => {
    await expect(loadProbeFile(join(FIX, 'does-not-exist.yaml'))).rejects.toThrow(IoError);
  });
});

describe('loadProbeDirectory', () => {
  it('loads two valid fixtures from an isolated dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probes-loader-'));
    try {
      writeFileSync(
        join(dir, 'a.yaml'),
        'id: dir-a\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n',
      );
      writeFileSync(
        join(dir, 'b.yaml'),
        'id: dir-b\ncorpus_version: 1\nowasp_category: LLM02\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n',
      );
      const loaded = await loadProbeDirectory(dir);
      expect(loaded.map((l) => l.probe.id).sort()).toEqual(['dir-a', 'dir-b']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns probes in lexicographic order for cross-OS determinism', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probes-loader-'));
    try {
      // Write in an order that does NOT match lexicographic
      writeFileSync(
        join(dir, 'zzz.yaml'),
        'id: z-id\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n',
      );
      writeFileSync(
        join(dir, 'aaa.yaml'),
        'id: a-id\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n',
      );
      writeFileSync(
        join(dir, 'mmm.yaml'),
        'id: m-id\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n',
      );
      const loaded = await loadProbeDirectory(dir);
      expect(loaded.map((l) => l.probe.id)).toEqual(['a-id', 'm-id', 'z-id']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recurses into subdirectories', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probes-loader-'));
    try {
      const sub = join(dir, 'sub');
      mkdirSync(sub);
      writeFileSync(
        join(sub, 'nested.yaml'),
        'id: nested-id\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n',
      );
      const loaded = await loadProbeDirectory(dir);
      expect(loaded.map((l) => l.probe.id)).toEqual(['nested-id']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores non-yaml files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probes-loader-'));
    try {
      writeFileSync(join(dir, 'note.md'), '# not a probe');
      writeFileSync(join(dir, 'data.json'), '{}');
      writeFileSync(
        join(dir, 'only.yml'),
        'id: only-id\ncorpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n',
      );
      const loaded = await loadProbeDirectory(dir);
      expect(loaded.map((l) => l.probe.id)).toEqual(['only-id']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects duplicate probe ids across files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probes-loader-'));
    try {
      const body = 'corpus_version: 1\nowasp_category: LLM01\ntitle: t\ndescription: d\nprompt: p\nexpected_behavior: refuse\ntags: []\nreferences: ["https://example.com/"]\nlicense: MIT\n';
      writeFileSync(join(dir, 'one.yaml'), `id: dup-id\n${body}`);
      writeFileSync(join(dir, 'two.yaml'), `id: dup-id\n${body}`);
      await expect(loadProbeDirectory(dir)).rejects.toThrow(InvalidInputError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
