import { SqliteStore } from './sqlite-store.js';

export class SqliteMetaRepository {
  constructor(private readonly store: SqliteStore) {}

  get(key: string): string | undefined {
    const row = this.store
      .getDatabase()
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  set(key: string, value: string): void {
    this.store
      .getDatabase()
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }
}
