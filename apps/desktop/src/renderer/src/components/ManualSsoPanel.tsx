export interface ManualSsoPanelProps {
  onOpen(): void;
}

export function ManualSsoPanel({ onOpen }: ManualSsoPanelProps) {
  return (
    <main>
      <h1>Вход через ТУСУР</h1>
      <p>
        Откроется видимое окно входа ТУСУР. Пройдите проверку (капчу или
        двухфакторную аутентификацию) прямо в нём.
      </p>
      <p>После завершения входа вернитесь в это приложение.</p>
      <button type="button" onClick={onOpen}>
        Открыть окно входа
      </button>
    </main>
  );
}
