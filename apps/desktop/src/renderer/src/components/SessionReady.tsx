export interface SessionReadyProps {
  onCheck(): void;
}

export function SessionReady({ onCheck }: SessionReadyProps) {
  return (
    <main>
      <h1>Вход выполнен</h1>
      <p role="status">Сессия активна.</p>
      <button type="button" onClick={onCheck}>
        Проверить вход
      </button>
    </main>
  );
}
