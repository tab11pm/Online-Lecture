export type OnboardingState =
  | { phase: 'welcome' }
  | { phase: 'credentials'; error?: string }
  | { phase: 'authenticating' }
  | { phase: 'manual_sso' }
  | { phase: 'session_ready' }
  | { phase: 'failed'; message: string };

export type LoginOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: 'captcha' | 'two_factor' | 'invalid' | 'error';
      message?: string;
    };
