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
  const trimmedUsername = username.trim();
  const canSubmit = trimmedUsername.length > 0 && password.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({ username: trimmedUsername, password });
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
          required
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
          required
          value={password}
          disabled={disabled}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={disabled || !canSubmit}>
          Войти
        </button>
      </form>
    </main>
  );
}
