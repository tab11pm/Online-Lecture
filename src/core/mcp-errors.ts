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

/** Appends `chunk` and keeps only the last `max` characters. */
export function appendTail(tail: string, chunk: string, max = 4096): string {
  const next = tail + chunk;
  return next.length > max ? next.slice(next.length - max) : next;
}
