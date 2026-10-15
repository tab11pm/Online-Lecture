import { useEffect, useState } from 'react';
import { desktop } from '../api';
import { BrowserChoice } from './BrowserChoice';

export interface SettingsPanelProps {
  onCheckSession(): void;
}

export function SettingsPanel({ onCheckSession }: SettingsPanelProps) {
  const [autostart, setAutostart] = useState(false);
  const [showWindow, setShowWindow] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void desktop.app
      .getInfo()
      .then((info) => {
        if (active) setAutostart(info.autostart);
      })
      .catch(() => undefined);
    void desktop.app
      .getShowLectureWindow()
      .then((show) => {
        if (active) setShowWindow(show);
      })
      .catch(() => {
        if (active) setShowWindow(true);
      });
    return () => {
      active = false;
    };
  }, []);

  function fail(reason: unknown, fallback: string): string {
    return reason instanceof Error ? reason.message : fallback;
  }

  function handleAutostart(enabled: boolean): void {
    const previous = autostart;
    setError(undefined);
    setAutostart(enabled);
    void desktop.app
      .setAutostart(enabled)
      .then((info) => setAutostart(info.autostart))
      .catch((reason: unknown) => {
        setAutostart(previous);
        setError(fail(reason, 'Не удалось изменить автозапуск.'));
      });
  }

  function handleShowWindow(show: boolean): void {
    const previous = showWindow;
    setError(undefined);
    setShowWindow(show);
    void desktop.app
      .setShowLectureWindow(show)
      .then((saved) => setShowWindow(saved))
      .catch((reason: unknown) => {
        setShowWindow(previous);
        setError(fail(reason, 'Не удалось сохранить настройку.'));
      });
  }

  return (
    <details>
      <summary>Настройки</summary>
      <label>
        <input
          type="checkbox"
          checked={showWindow}
          onChange={(event) => handleShowWindow(event.target.checked)}
        />
        Показывать окно лекции
      </label>
      <label>
        <input
          type="checkbox"
          checked={autostart}
          onChange={(event) => handleAutostart(event.target.checked)}
        />
        Запускать при старте системы
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" onClick={onCheckSession}>
        Проверить вход
      </button>
      <BrowserChoice bannerOwnsInstall />
    </details>
  );
}
