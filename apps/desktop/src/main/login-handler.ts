import type { LoginInput } from '../shared/ipc-contract.js';
import type { LoginOutcome } from '../shared/onboarding.js';
import type { SecretStore } from './secret-store.js';
import type { SettingsStore } from './settings-store.js';

export interface LoginHandlerDependencies {
  secretStore: Pick<SecretStore, 'save'>;
  settingsStore: Pick<SettingsStore, 'update'>;
  core: { login(input: LoginInput): Promise<LoginOutcome> };
}

/**
 * Logs in through the core and persists the credentials only once the login
 * succeeded, so a mistyped password never overwrites the stored one.
 */
export function createLoginHandler({
  secretStore,
  settingsStore,
  core,
}: LoginHandlerDependencies): (input: LoginInput) => Promise<LoginOutcome> {
  return async (input) => {
    const outcome = await core.login(input);
    if (outcome.ok) {
      await secretStore.save(input.password);
      await settingsStore.update({ username: input.username });
    }
    return outcome;
  };
}
