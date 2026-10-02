import { useState } from 'react';
import type { FormEvent } from 'react';
import type { LoginInput } from '../../../shared/ipc-contract.js';

export interface CredentialsFormProps {
  error?: string;
  disabled?: boolean;
  onSubmit(input: LoginInput): void;
}

export function CredentialsForm({
  error,
  disabled = false,
  onSubmit,
}: CredentialsFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({ username, password });
    setPassword('');
  }

  return (
    <main>
      <h1>Вход в ТУСУР</h1>
      {error ? <p role="alert">{error}</p> : null}
      <form onSubmit={handleSubmit}>
        <label htmlFor="username">Логин</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          disabled={disabled}
          onChange={(event) => setUsername(event.target.value)}
        />
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={disabled}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={disabled}>
          Войти
        </button>
      </form>
    </main>
  );
}
