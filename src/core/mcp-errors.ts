import type { McpServerSource } from './types.js';

export type SdoMcpUnavailableReason = 'not_found' | 'exited' | 'timeout';

const ERROR_NAME = 'SdoMcpUnavailableError';

/**
 * The SDO MCP server could not be started or did not complete the MCP
 * handshake. Distinct from a tool error, which comes from a running server.
 * `detail` is already redacted and safe to log.
 */
export class SdoMcpUnavailableError extends Error {
  constructor(
    readonly reason: SdoMcpUnavailableReason,
    readonly source: McpServerSource | undefined,
    readonly detail: string,
  ) {
    super(`SDO MCP unavailable: ${reason}`);
    this.name = ERROR_NAME;
  }
}

/**
 * Checks by name rather than `instanceof`, so the check survives the error
 * crossing a bundle boundary (core code bundled into the Electron worker).
 */
export function isSdoMcpUnavailableError(
  error: unknown,
): error is SdoMcpUnavailableError {
  return error instanceof Error && error.name === ERROR_NAME;
}

/**
 * Appends `chunk` and keeps only the last `max` characters. When truncation
 * cuts into a line, that partial line is dropped: a secret cut mid-key (for
 * example `ionToken=…`) would no longer match the redaction patterns.
 */
export function appendTail(tail: string, chunk: string, max = 4096): string {
  const next = tail + chunk;
  if (next.length <= max) {
    return next;
  }
  const cut = next.slice(next.length - max);
  const firstBreak = cut.indexOf('\n');
  return firstBreak === -1 ? '' : cut.slice(firstBreak + 1);
}
