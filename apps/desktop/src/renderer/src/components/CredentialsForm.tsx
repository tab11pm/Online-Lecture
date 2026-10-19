import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  UserRound,
} from 'lucide-react';
import type { LoginInput } from '../../../shared/ipc-contract.js';

export interface CredentialsFormProps {
  error?: string;
  disabled?: boolean;
  onSubmit(input: LoginInput): void | Promise<void>;
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
    <div className="panel">
      <p className="panel__eyebrow">Шаг 1 · учётная запись</p>
      <h2 className="panel__title">Вход в ТУСУР</h2>
      <p className="panel__lede">
        Логин и пароль от личного кабинета. Они не покидают этот компьютер.
      </p>
      {error ? (
        <p id="credentials-error" role="alert" className="alert alert--error">
          {error}
        </p>
      ) : null}
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="username">
            <UserRound size={13} strokeWidth={1.8} aria-hidden="true" />
            Логин
          </label>
          <input
            id="username"
            name="username"
            className="input"
            type="text"
            autoComplete="username"
            spellCheck={false}
            required
            value={username}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'credentials-error' : undefined}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">
            <KeyRound size={13} strokeWidth={1.8} aria-hidden="true" />
            Пароль
          </label>
          <input
            id="password"
            name="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'credentials-error' : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={disabled || !canSubmit}
          >
            {disabled ? (
              <>
                <LoaderCircle className="spin" size={15} aria-hidden="true" />
                Выполняется вход…
              </>
            ) : (
              <>
                <LogIn size={15} strokeWidth={1.8} aria-hidden="true" />
                Войти
              </>
            )}
          </button>
        </div>
      </form>
      <p className="fineprint fineprint--icon">
        <LockKeyhole size={12} strokeWidth={1.8} aria-hidden="true" />
        Пароль шифруется средствами Windows и хранится только локально.
      </p>
    </div>
  );
}
