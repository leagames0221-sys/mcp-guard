// Generic atomic file write — `writeFile(temp) → rename(temp → final)`.
// AC-NF-7: when N processes race for the same target, each writes its
// own UUID-suffixed temp file and the rename is a single atomic POSIX
// operation. The reader either sees the previous file or a complete
// new one, never a truncated partial.
//
// Caller is responsible for ensuring the parent directory exists.

import { writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, basename, join } from 'node:path';

import { IoError } from '../../errors/index.js';

export interface WriteAtomicOptions {
  // POSIX file mode for the target. Defaults are platform-defined.
  mode?: number;
}

export function buildTempPath(targetPath: string, id: string = randomUUID()): string {
  const dir = dirname(targetPath);
  const base = basename(targetPath);
  return join(dir, `.${base}.${id}.tmp`);
}

export async function writeAtomic(
  targetPath: string,
  content: string | Uint8Array,
  opts?: WriteAtomicOptions,
): Promise<void> {
  const tempPath = buildTempPath(targetPath);

  try {
    // `wx` = create exclusively; falls over EEXIST so two writers with
    // the same UUID (statistically impossible) cannot clobber each other.
    const writeOpts: Parameters<typeof writeFile>[2] = { flag: 'wx' };
    if (opts?.mode !== undefined) writeOpts.mode = opts.mode;
    await writeFile(tempPath, content, writeOpts);

    await rename(tempPath, targetPath);
  } catch (err) {
    // Best-effort cleanup of the temp file. We don't surface unlink
    // errors — the original failure is the one that matters.
    try {
      await unlink(tempPath);
    } catch {
      /* swallow */
    }
    const code = (err as NodeJS.ErrnoException).code ?? 'IO_ERROR';
    throw new IoError(`atomic write failed: ${(err as Error).message}`, {
      target: targetPath,
      tempPath,
      code,
    });
  }
}
