import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  ChromiumInstaller,
  resolvePlaywrightCliPath,
} from '../../src/main/chromium-installer.js';

function makeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function setup(exists = false) {
  const child = makeChild();
  const fileExists = vi.fn().mockResolvedValue(exists);
  const spawn = vi.fn().mockReturnValue(child);
  const onChanged = vi.fn();
  const installer = new ChromiumInstaller({
    executablePath: () => '/browsers/chrome',
    fileExists,
    spawn,
    resolveCliPath: () => '/app/playwright/cli.js',
    nodePath: '/app/electron.exe',
    env: { PATH: '/bin' },
    onChanged,
  });
  return { installer, child, fileExists, spawn, onChanged };
}

describe('ChromiumInstaller', () => {
  it('reports whether the expected Playwright executable exists', async () => {
    const missing = setup(false);
    expect(await missing.installer.getState()).toEqual({ status: 'missing' });
    const available = setup(true);
    expect(await available.installer.getState()).toEqual({
      status: 'available',
    });
  });

  it('does not publish a repeated status when the UI reads it', async () => {
    const { installer, fileExists, onChanged } = setup();
    await installer.getState();
    await installer.getState();
    expect(onChanged).not.toHaveBeenCalled();
    fileExists.mockResolvedValue(true);
    await installer.getState();
    await installer.getState();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('starts one bundled Playwright installation for simultaneous requests', async () => {
    const { installer, child, fileExists, spawn, onChanged } = setup();
    const first = installer.install();
    const second = installer.install();
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));
    expect(spawn).toHaveBeenCalledWith(
      '/app/electron.exe',
      ['/app/playwright/cli.js', 'install', 'chromium'],
      expect.objectContaining({
        shell: false,
        env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
      }),
    );
    fileExists.mockResolvedValue(true);
    child.emit('close', 0);
    expect(await first).toEqual({ status: 'available' });
    expect(await second).toEqual({ status: 'available' });
    expect(onChanged).toHaveBeenCalledWith({ status: 'installing' });
  });

  it('rejects a zero exit code when Chromium is still missing', async () => {
    const { installer, child, spawn } = setup();
    const pending = installer.install();
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));
    child.emit('close', 0);
    expect(await pending).toMatchObject({ status: 'error' });
  });

  it('reports failures without exposing process output or URLs', async () => {
    const { installer, child, spawn } = setup();
    const pending = installer.install();
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));
    child.stderr.emit(
      'data',
      Buffer.from('cookie: session=abc123 https://sdo.tusur.ru/?token=xyz'),
    );
    child.emit('error', new Error('https://sdo.tusur.ru/?token=xyz'));
    const result = await pending;
    expect(result.status).toBe('error');
    expect(JSON.stringify(result)).not.toMatch(/abc123|xyz|https:/);
  });

  it('locates the CLI outside app.asar when packaged', () => {
    expect(
      resolvePlaywrightCliPath(
        'C:\\app\\resources\\app.asar\\node_modules\\playwright\\package.json',
      ),
    ).toBe(
      'C:\\app\\resources\\app.asar.unpacked\\node_modules\\playwright\\cli.js',
    );
  });
});
