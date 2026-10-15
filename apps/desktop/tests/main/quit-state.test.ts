import { describe, expect, it } from 'vitest';
import { QuitController } from '../../src/main/quit-state.js';

describe('QuitController', () => {
  it('starts shutdown on the first quit and prevents it', () => {
    const quit = new QuitController();
    expect(quit.onBeforeQuit()).toBe('begin-shutdown');
    expect(quit.state).toBe('shuttingDown');
    expect(quit.isQuitting()).toBe(false);
  });

  it('prevents a second quit during shutdown without stopping the core', () => {
    const quit = new QuitController();
    quit.onBeforeQuit();
    expect(quit.onBeforeQuit()).toBe('prevent');
    expect(quit.state).toBe('shuttingDown');
  });

  it('lets the quit proceed exactly once after shutdown finishes', () => {
    const quit = new QuitController();
    quit.onBeforeQuit();
    quit.finishShutdown();
    expect(quit.isQuitting()).toBe(true);
    expect(quit.onBeforeQuit()).toBe('proceed');
  });
});
