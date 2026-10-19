import type { PackagedRuntimeSmokeInput } from '../../../scripts/packaged-runtime-smoke.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';

export type PackagedRuntimeSmoke = (
  input: PackagedRuntimeSmokeInput,
) => Promise<void>;

export async function runPackagedRuntimeSmokeForE2E(
  executablePath: string,
  smoke: PackagedRuntimeSmoke,
): Promise<void> {
  const absoluteExecutablePath = resolve(executablePath);
  const cwd = mkdtempSync(join(tmpdir(), 'online-lecture-packaged-e2e-'));
  const input: PackagedRuntimeSmokeInput = {
    executablePath: absoluteExecutablePath,
    packageDir: dirname(absoluteExecutablePath),
    cwd,
  };
  try {
    await smoke(input);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
