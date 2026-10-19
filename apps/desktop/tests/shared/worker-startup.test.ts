import { describe, expect, it } from 'vitest';
import {
  decodeWorkerStartup,
  encodeWorkerStartup,
} from '../../src/shared/worker-startup.js';

describe('worker startup codec', () => {
  it('round-trips a Windows path with spaces and Cyrillic', () => {
    const options = {
      userDataDir: 'C:\\Users\\Студент Имя\\AppData\\Local\\OnlineLecture',
      externalChannel: 'msedge',
      runtimeMode: 'packaged' as const,
    };

    expect(decodeWorkerStartup(encodeWorkerStartup(options))).toEqual(options);
  });

  it('preserves an explicitly empty external channel', () => {
    const encoded = encodeWorkerStartup({
      userDataDir: '/data',
      externalChannel: '',
      runtimeMode: 'development',
    });

    expect(encoded[1]).toBe('1');
    expect(decodeWorkerStartup(encoded)).toEqual({
      userDataDir: '/data',
      externalChannel: '',
      runtimeMode: 'development',
    });
  });

  it('encodes a missing channel without one', () => {
    const encoded = encodeWorkerStartup({
      userDataDir: '/data',
      runtimeMode: 'packaged',
    });

    expect(encoded[1]).toBe('0');
    expect(decodeWorkerStartup(encoded)).toEqual({
      userDataDir: '/data',
      runtimeMode: 'packaged',
    });
  });

  it('treats a missing fourth argument as development', () => {
    expect(decodeWorkerStartup(['/data', '0', ''])).toEqual({
      userDataDir: '/data',
      runtimeMode: 'development',
    });
  });

  it('keeps the historical one-argument startup working', () => {
    expect(decodeWorkerStartup(['/data'])).toEqual({
      userDataDir: '/data',
      runtimeMode: 'development',
    });
  });

  it('rejects an unknown runtime mode', () => {
    expect(() => decodeWorkerStartup(['/data', '0', '', 'staging'])).toThrow(
      'invalid runtime mode',
    );
  });

  it('rejects an invalid channel flag and missing user data dir', () => {
    expect(() => decodeWorkerStartup(['/data', 'yes', ''])).toThrow(
      'invalid external channel flag',
    );
    expect(() => decodeWorkerStartup([])).toThrow('userData directory');
  });

  it('decodes the same startup twice after a worker restart', () => {
    const encoded = encodeWorkerStartup({
      userDataDir: '/data',
      runtimeMode: 'development',
    });

    expect(decodeWorkerStartup(encoded)).toEqual(decodeWorkerStartup(encoded));
  });
});
