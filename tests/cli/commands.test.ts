import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCli } from '../../src/cli/commands.js';

vi.mock('node:fs/promises');
vi.mock('../../src/config/job-config.js');
vi.mock('../../src/config/mcp-config.js', () => ({
  loadMcpConfig: vi.fn().mockReturnValue({
    serverPath: '/mock/sdo-mcp',
    connectionTimeout: 5000,
  }),
}));
vi.mock('../../src/core/job-runner.js');
vi.mock('../../src/core/mcp-client.js');
vi.mock('../../src/core/bbb-session.js');
vi.mock('../../src/persistence/sqlite-store.js');
vi.mock('../../src/persistence/job-repository.js');
vi.mock('../../src/persistence/run-repository.js');

describe('CLI run-job command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject without job-id parameter', async () => {
    const result = await executeCli(['run-job', '--db', '/tmp/test.db']);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('job-id');
  });

  it('should reject without occurrence-id parameter', async () => {
    const result = await executeCli(['run-job', 'job-1', '--db', '/tmp/test.db']);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('occurrence-id');
  });

  it('should reject without --db parameter', async () => {
    const result = await executeCli(['run-job', 'job-1', 'occ-1']);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('--db');
  });

  it('should handle job not found', async () => {
    const result = await executeCli([
      'run-job',
      'invalid-job',
      'occ-1',
      '--db',
      '/tmp/test.db',
    ]);

    expect(result.exitCode).toBe(1);
  });
});