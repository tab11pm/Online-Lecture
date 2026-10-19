import { ExternalLink } from 'lucide-react';

export interface ManualSsoPanelProps {
  onOpen(): void;
}

export function ManualSsoPanel({ onOpen }: ManualSsoPanelProps) {
  return (
    <div className="panel">
      <p className="panel__eyebrow">Шаг 1 · вход</p>
      <h2 className="panel__title">Вход через ТУСУР</h2>
      <p className="panel__lede">
        Откроется видимое окно входа ТУСУР. Пройдите проверку (капчу или
        двухфакторную аутентификацию) прямо в нём.
      </p>
      <p className="panel__lede">
        После завершения входа вернитесь в это приложение.
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn--primary" onClick={onOpen}>
          <ExternalLink size={15} strokeWidth={1.8} aria-hidden="true" />
          Открыть окно входа
        </button>
      </div>
    </div>
  );
}
