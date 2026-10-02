import { useEffect, useState } from 'react';
import { desktop } from '../api';

export interface SessionReadyProps {
  onCheck(): void;
}

export function SessionReady({ onCheck }: SessionReadyProps) {
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    let active = true;
    void desktop.app
      .getInfo()
      .then((info) => {
        if (active) {
          setAutostart(info.autostart);
        }
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

  return (
    <main>
      <h1>Вход выполнен</h1>
      <p role="status">Сессия активна.</p>
      <label>
        <input
          type="checkbox"
          checked={autostart}
          onChange={(event) => handleAutostart(event.target.checked)}
        />
        Запускать при старте системы
      </label>
      <button type="button" onClick={onCheck}>
        Проверить вход
      </button>
    </main>
  );
}
