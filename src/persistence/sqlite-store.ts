import Database from 'better-sqlite3';

const initialSchema = `
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS runs (
    job_id TEXT NOT NULL,
    occurrence_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (job_id, occurrence_id)
  );
`;

export class SqliteStore {
  private database: Database.Database | undefined;

  constructor(private readonly path: string) {}

  async open(): Promise<void> {
    this.database = new Database(this.path);
    this.database.exec(initialSchema);
    this.database.pragma('user_version = 1');
  }

  migrationVersion(): number {
    const database = this.requireDatabase();
    return database.pragma('user_version', { simple: true }) as number;
  }

  getDatabase(): Database.Database {
    return this.requireDatabase();
  }

  close(): void {
    this.database?.close();
    this.database = undefined;
  }

  private requireDatabase(): Database.Database {
    if (this.database === undefined)
      throw new Error('SQLite store is not open');
    return this.database;
  }
}
