import { useEffect, useState } from 'react';
import { LoaderCircle, LogIn, Monitor, Power, Settings2 } from 'lucide-react';
import { desktop } from '../api';
import { BrowserChoice } from './BrowserChoice';

export interface SettingsPanelProps {
  onCheckSession(): void;
  checkingSession?: boolean;
}

export function SettingsPanel({
  onCheckSession,
  checkingSession = false,
}: SettingsPanelProps) {
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
    <details className="settings">
      <summary>
        <span className="settings__title">
          <Settings2 size={16} strokeWidth={1.8} aria-hidden="true" />
          Настройки
        </span>
        <span className="settings__hint">Поведение приложения</span>
      </summary>
      <div className="settings__body">
        <div className="settings__group">
          <label className="check-row">
            <input
              type="checkbox"
              checked={showWindow}
              onChange={(event) => handleShowWindow(event.target.checked)}
            />
            <span className="check-row__label">
              <Monitor size={14} strokeWidth={1.8} aria-hidden="true" />
              Показывать окно лекции
            </span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={autostart}
              onChange={(event) => handleAutostart(event.target.checked)}
            />
            <span className="check-row__label">
              <Power size={14} strokeWidth={1.8} aria-hidden="true" />
              Запускать при старте системы
            </span>
          </label>
        </div>
        {error ? (
          <p role="alert" className="alert alert--error">
            {error}
          </p>
        ) : null}
        <div className="settings__actions">
          <button
            type="button"
            className="btn"
            onClick={onCheckSession}
            disabled={checkingSession}
            aria-busy={checkingSession}
          >
            {checkingSession ? (
              <LoaderCircle className="spin" size={15} aria-hidden="true" />
            ) : (
              <LogIn size={15} strokeWidth={1.8} aria-hidden="true" />
            )}
            {checkingSession ? 'Проверяем вход…' : 'Проверить вход'}
          </button>
        </div>
        <BrowserChoice bannerOwnsInstall />
      </div>
    </details>
  );
}
