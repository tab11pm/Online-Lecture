import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { redactSensitiveText } from '@core/core/redaction.js';

export interface CoreLog {
  readonly path: string;
  info(message: string): void;
  error(message: string): void;
}

const DEFAULT_MAX_BYTES = 1_048_576;

/**
 * Append-only log of the core worker. Every line is redacted; when the file
 * grows past `maxBytes` it is moved to `<file>.1` (one previous copy is kept).
 * Logging never throws: a broken log must not break the core.
 */
export function createCoreLog(
  filePath: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
): CoreLog {
  function write(level: 'INFO' | 'ERROR', message: string): void {
    const line = `${new Date().toISOString()} ${level} ${redactSensitiveText(message)}\n`;
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      rotateIfNeeded(filePath, maxBytes, Buffer.byteLength(line));
      appendFileSync(filePath, line, 'utf8');
    } catch {
      // The log is best effort.
    }
  }

  return {
    path: filePath,
    info: (message) => write('INFO', message),
    error: (message) => write('ERROR', message),
  };
}

function rotateIfNeeded(
  filePath: string,
  maxBytes: number,
  incoming: number,
): void {
  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    return;
  }
  if (size + incoming > maxBytes) {
    renameSync(filePath, `${filePath}.1`);
  }
}
