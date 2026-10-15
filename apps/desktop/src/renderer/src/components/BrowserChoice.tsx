import { useEffect, useState } from 'react';
import type {
  BrowserChoice as Choice,
  BrowserView,
} from '../../../shared/browser-choice.js';
import { desktop } from '../api';

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось изменить браузер.';
}

/** The chosen browser needs Chromium, and Chromium is not available yet. */
export function chromiumMissing(view: BrowserView | undefined): boolean {
  return (
    view !== undefined &&
    (view.choice === 'chromium' || view.externalChannel === '') &&
    view.install.status !== 'available'
  );
}

export interface BrowserChoiceProps {
  /** The main screen shows the install prompt itself while Chromium is missing. */
  bannerOwnsInstall?: boolean;
}

export function BrowserChoice({ bannerOwnsInstall }: BrowserChoiceProps) {
  const [view, setView] = useState<BrowserView>();
  const [pendingChromium, setPendingChromium] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const unsubscribe = desktop.app.onBrowserChanged((next) => {
      if (active) setView(next);
    });
    void desktop.app.getBrowser().then(
      (next) => {
        if (active) setView(next);
      },
      (reason: unknown) => {
        if (active) setError(message(reason));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function select(choice: Choice): Promise<void> {
    if (!view || busy) return;
    setError(undefined);
    if (choice === 'chromium' && view.install.status !== 'available') {
      setPendingChromium(true);
      return;
    }
    setPendingChromium(false);
    setBusy(true);
    try {
      setView(await desktop.app.setBrowser(choice));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function install(): Promise<void> {
    if (busy || view?.install.status === 'installing') return;
    setBusy(true);
    setError(undefined);
    try {
      const next = await desktop.app.installChromium();
      setView(next);
      if (next.install.status === 'available') setPendingChromium(false);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  const selected = pendingChromium ? 'chromium' : view?.choice;
  const installing = busy || view?.install.status === 'installing';
  const needsInstall =
    (selected === 'chromium' || view?.externalChannel === '') &&
    view?.install.status !== 'available' &&
    !(bannerOwnsInstall && chromiumMissing(view));
  const installError =
    view?.install.status === 'error' ? view.install.message : undefined;

  return (
    <section aria-label="Настройка браузера">
      <fieldset disabled={!view || installing}>
        <legend>Браузер для автоматизации</legend>
        <label>
          <input
            type="radio"
            name="automation-browser"
            checked={selected === 'edge'}
            onChange={() => void select('edge')}
          />
          Edge (Windows)
        </label>
        <label>
          <input
            type="radio"
            name="automation-browser"
            checked={selected === 'chromium'}
            onChange={() => void select('chromium')}
          />
          Chromium
        </label>
      </fieldset>
      {view?.externalChannel !== undefined ? (
        <p>
          Для входа в ТУСУР действует внешняя настройка браузера:
          {view.externalChannel === ''
            ? ' Chromium для входа.'
            : ` ${view.externalChannel}.`}
        </p>
      ) : null}
      {needsInstall ? (
        <button
          type="button"
          disabled={installing}
          onClick={() => void install()}
        >
          {view?.install.status === 'error'
            ? 'Повторить установку'
            : 'Установить Chromium'}
        </button>
      ) : null}
      {needsInstall && import.meta.env.DEV ? (
        <p>
          Для разработки: <code>npx playwright install chromium</code>
        </p>
      ) : null}
      {installing && needsInstall ? (
        <p role="status">Установка Chromium…</p>
      ) : null}
      {error || installError ? (
        <p role="alert">{error ?? installError}</p>
      ) : null}
    </section>
  );
}
