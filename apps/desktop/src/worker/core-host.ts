import { redactSensitiveText } from '@core/core/redaction.js';
import type { HostEvent, MainCommand } from '../shared/host-protocol.js';
import type { LoginOutcome, OnboardingState } from '../shared/onboarding.js';
import type { AppPaths } from '../shared/paths.js';
import { OnboardingMachine } from './onboarding-machine.js';
import { SdoMcpSessionProvider } from './sdo-mcp-session-provider.js';
import type { SessionProvider } from './session-provider.js';

export interface HostTransport {
  post(event: HostEvent): void;
  onMessage(handler: (command: MainCommand) => void): void;
}

export interface CoreHostDependencies {
  paths: AppPaths;
  machine?: OnboardingMachine;
  provider?: SessionProvider;
}

export class CoreHost {
  private readonly paths: AppPaths;
  private readonly machine: OnboardingMachine;
  private capturedOutcome: LoginOutcome | undefined;
  private unsubscribe: (() => void) | undefined;
  private started = false;

  constructor(
    private readonly transport: HostTransport,
    deps: CoreHostDependencies,
  ) {
    this.paths = deps.paths;
    this.machine = deps.machine ?? this.buildMachine(deps.provider);
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.unsubscribe = this.machine.onChange((state) =>
      this.postChanged(state),
    );
    this.transport.onMessage((command) => {
      void this.handle(command);
    });
    // Handshake: the transport is wired and can accept commands, so tell the
    // host it is safe to flush anything it queued before this point.
    this.transport.post({ type: 'host.ready' });
    this.machine.start();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private buildMachine(provider?: SessionProvider): OnboardingMachine {
    const session = provider ?? new SdoMcpSessionProvider();
    return new OnboardingMachine({
      login: async (input) => {
        const outcome = await session.loginWithCredentials({
          ...input,
          authStatePath: this.paths.authState,
        });
        this.capturedOutcome = outcome;
        return outcome;
      },
      openManualSso: async () => {
        const outcome = await session.openManualLogin(this.paths.authState);
        this.capturedOutcome = outcome;
        return outcome;
      },
      checkSession: () => session.checkSession(this.paths.authState),
    });
  }

  private async handle(command: MainCommand): Promise<void> {
    if (!this.started) {
      return;
    }
    try {
      switch (command.type) {
        case 'onboarding.getState':
          this.postChanged(this.machine.getState());
          return;
        case 'onboarding.login':
          this.postOutcome(await this.machine.submitCredentials(command.input));
          return;
        case 'onboarding.openManualSso':
          this.postOutcome(await this.machine.openManualSso());
          return;
        case 'onboarding.checkSession':
          this.postChanged(await this.machine.checkSession());
          return;
        default:
          return;
      }
    } catch (error) {
      this.transport.post({
        type: 'host.error',
        message: redactSensitiveText(errorMessage(error)),
      });
    }
  }

  private postChanged(state: OnboardingState): void {
    this.transport.post({ type: 'onboarding.changed', state });
  }

  private postOutcome(state: OnboardingState): void {
    const outcome = this.capturedOutcome ?? outcomeFromState(state);
    this.capturedOutcome = undefined;
    this.transport.post({ type: 'onboarding.loginResult', outcome });
  }
}

function outcomeFromState(state: OnboardingState): LoginOutcome {
  switch (state.phase) {
    case 'session_ready':
      return { ok: true };
    case 'manual_sso':
      return { ok: false, reason: 'captcha' };
    case 'credentials':
      return state.error
        ? { ok: false, reason: 'invalid', message: state.error }
        : { ok: false, reason: 'invalid' };
    case 'failed':
      return { ok: false, reason: 'error', message: state.message };
    default:
      return { ok: false, reason: 'error' };
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Не удалось выполнить операцию.';
}
