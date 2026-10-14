import { useEffect, useState } from 'react';
import { desktop } from '../api';
import { BrowserChoice } from './BrowserChoice';

export interface SettingsPanelProps {
  onCheckSession(): void;
}

export function SettingsPanel({ onCheckSession }: SettingsPanelProps) {
  const [autostart, setAutostart] = useState(false);
  const [showWindow, setShowWindow] = useState(false);

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
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function handleAutostart(enabled: boolean): void {
    setAutostart(enabled);
    void desktop.app
      .setAutostart(enabled)
      .then((info) => setAutostart(info.autostart))
      .catch(() => undefined);
  }

  function handleShowWindow(show: boolean): void {
    setShowWindow(show);
    void desktop.app
      .setShowLectureWindow(show)
      .then((saved) => setShowWindow(saved))
      .catch(() => undefined);
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
      <button type="button" onClick={onCheckSession}>
        Проверить вход
      </button>
      <BrowserChoice />
    </details>
  );
}
