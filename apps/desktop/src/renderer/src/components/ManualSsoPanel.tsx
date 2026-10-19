import { ExternalLink, LoaderCircle } from 'lucide-react';

export interface ManualSsoPanelProps {
  pending?: boolean;
  onOpen(): void | Promise<void>;
}

export function ManualSsoPanel({
  onOpen,
  pending = false,
}: ManualSsoPanelProps) {
  return (
    <div className="panel">
      <p className="panel__eyebrow">Шаг 1 · вход</p>
      <h2 className="panel__title">Вход через ТУСУР</h2>
      <p className="panel__lede">
        Откроется видимое окно входа ТУСУР. Пройдите проверку (капчу или
        двухфакторную аутентификацию) прямо в нём.
      </p>
      <p className="panel__lede">
        После завершения проверки вернитесь сюда — приложение продолжит вход.
      </p>
      {pending ? (
        <p role="status" className="panel__lede manual-sso__status">
          Завершите проверку в окне ТУСУР…
        </p>
      ) : null}
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={pending}
          onClick={onOpen}
        >
          {pending ? (
            <>
              <LoaderCircle className="spin" size={15} aria-hidden="true" />
              Ожидаем входа в браузере…
            </>
          ) : (
            <>
              <ExternalLink size={15} strokeWidth={1.8} aria-hidden="true" />
              Открыть окно входа
            </>
          )}
        </button>
      </div>
    </div>
  );
}
