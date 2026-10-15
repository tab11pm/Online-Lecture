import { useEffect, useState } from 'react';
import type { BrowserView } from '../../../shared/browser-choice.js';
import { desktop } from '../api';
import { chromiumMissing } from './BrowserChoice';

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось установить Chromium.';
}

/** Install prompt shown on the main screen while the chosen Chromium is missing. */
export function ChromiumBanner() {
  const [view, setView] = useState<BrowserView>();
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
      () => undefined,
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!chromiumMissing(view)) return null;

  const installing = busy || view?.install.status === 'installing';
  const installError =
    view?.install.status === 'error' ? view.install.message : undefined;

  async function install(): Promise<void> {
    if (installing) return;
    setBusy(true);
    setError(undefined);
    try {
      setView(await desktop.app.installChromium());
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Установка Chromium">
      <button
        type="button"
        disabled={installing}
        onClick={() => void install()}
      >
        {view?.install.status === 'error'
          ? 'Повторить установку'
          : 'Установить Chromium'}
      </button>
      {installing ? <p role="status">Установка Chromium…</p> : null}
      {error || installError ? (
        <p role="alert">{error ?? installError}</p>
      ) : null}
    </section>
  );
}
