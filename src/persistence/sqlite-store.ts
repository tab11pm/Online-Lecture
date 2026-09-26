import Database from 'better-sqlite3';
import { copyFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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

  async openWithRecovery(): Promise<{
    status: 'restored' | 'new';
    diagnosticPath: string;
  }> {
    try {
      await this.open();
      return { status: 'new', diagnosticPath: '' };
    } catch {
      this.close();
      const diagnosticPath = `${this.path}.corrupt-${Date.now()}`;
      await rename(this.path, diagnosticPath);
      const backupDirectory = join(dirname(this.path), 'backups');
      const backups = (await readdir(backupDirectory).catch(() => []))
        .filter((name) => name.endsWith('.sqlite'))
        .sort();
      const latest = backups.at(-1);
      if (latest === undefined) {
        await this.open();
        return { status: 'new', diagnosticPath };
      }
      await copyFile(join(backupDirectory, latest), this.path);
      await this.open();
      return { status: 'restored', diagnosticPath };
    }
  }

  migrationVersion(): number {
    const database = this.requireDatabase();
    return database.pragma('user_version', { simple: true }) as number;
  }

  getDatabase(): Database.Database {
    return this.requireDatabase();
  }

  async createBackup(): Promise<string> {
    const backupDirectory = join(dirname(this.path), 'backups');
    await mkdir(backupDirectory, { recursive: true });
    const backupPath = join(backupDirectory, `lectures-${Date.now()}.sqlite`);
    await this.requireDatabase().backup(backupPath);
    const backups = (await readdir(backupDirectory))
      .filter((name) => name.endsWith('.sqlite'))
      .sort();
    await Promise.all(
      backups.slice(0, -5).map((name) => rm(join(backupDirectory, name))),
    );
    return backupPath;
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
