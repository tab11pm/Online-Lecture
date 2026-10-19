import { redactSensitiveText } from '../core/redaction.js';
import type { CompletionReason, RunStatus } from '../core/types.js';
import { SqliteStore } from './sqlite-store.js';

export type JournalCode =
  | 'login_succeeded'
  | 'auth_required'
  | 'search_ambiguous'
  | 'import_error'
  | 'core_error'
  | 'retries_exhausted'
  | 'lecture_finished';

export interface StoredJournalRecord {
  id: string;
  at: string;
  title: string;
  status: RunStatus | JournalCode;
  reason?: CompletionReason | 'retries_exhausted';
  isError: boolean;
}

interface EventInput {
  key: string;
  code: JournalCode;
  at: string;
  title?: string;
  jobId?: string;
  occurrenceId?: string;
}

interface Cursor {
  at: string;
  rank: number;
  id: string;
}

interface EventRow {
  id: number;
  code: JournalCode;
  occurred_at: string;
  title: string | null;
}

interface RunRow {
  job_id: string;
  occurrence_id: string;
  payload: string;
  title: string | null;
}

interface RankedRecord {
  record: StoredJournalRecord;
  cursor: Cursor;
}

const PAGE_SIZE = 50;
const ERROR_CODES: JournalCode[] = [
  'auth_required',
  'import_error',
  'core_error',
  'retries_exhausted',
];

function parseCursor(value: string | undefined): Cursor | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0 || value.length > 512)
    throw new Error('Invalid journal cursor');
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      typeof parsed[0] !== 'string' ||
      !Number.isFinite(Date.parse(parsed[0])) ||
      (parsed[1] !== 0 && parsed[1] !== 1) ||
      typeof parsed[2] !== 'string' ||
      parsed[2].length === 0 ||
      parsed[2].length > 300
    ) {
      throw new Error('Invalid journal cursor');
    }
    return { at: parsed[0], rank: parsed[1], id: parsed[2] };
  } catch {
    throw new Error('Invalid journal cursor');
  }
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    JSON.stringify([cursor.at, cursor.rank, cursor.id]),
  ).toString('base64url');
}

function older(a: Cursor, b: Cursor): number {
  if (a.at !== b.at) return a.at > b.at ? -1 : 1;
  if (a.rank !== b.rank) return b.rank - a.rank;
  return a.id === b.id ? 0 : a.id > b.id ? -1 : 1;
}

function safeTitle(value: string | null | undefined): string {
  return value?.trim() ? redactSensitiveText(value.trim()) : 'Лекция';
}

export class DesktopEventRepository {
  constructor(private readonly store: SqliteStore) {}

  async insert(input: EventInput): Promise<{ id: number; created: boolean }> {
    const database = this.store.getDatabase();
    const result = database
      .prepare(
        `
      INSERT INTO desktop_events (event_key, code, occurred_at, title, job_id, occurrence_id)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(event_key) DO NOTHING
    `,
      )
      .run(
        input.key,
        input.code,
        input.at,
        input.title === undefined ? null : safeTitle(input.title),
        input.jobId ?? null,
        input.occurrenceId ?? null,
      );
    const row = database
      .prepare('SELECT id FROM desktop_events WHERE event_key = ?')
      .get(input.key) as { id: number };
    return { id: row.id, created: result.changes === 1 };
  }

  async recoverTerminalRuns(): Promise<number> {
    const database = this.store.getDatabase();
    return database
      .transaction(() => {
        const rows = database
          .prepare(
            `
        SELECT r.job_id, r.occurrence_id, r.payload,
          COALESCE(json_extract(j.payload, '$.title'), json_extract(j.payload, '$.origin.discipline')) AS title
        FROM runs r LEFT JOIN jobs j ON j.id = r.job_id
        WHERE json_extract(r.payload, '$.status') IN ('completed', 'blocked', 'failed')
      `,
          )
          .all() as Array<RunRow>;
        let count = 0;
        for (const row of rows) {
          const run = JSON.parse(row.payload) as {
            status: RunStatus;
            updatedAt: string;
            failureCode?: string;
          };
          const result = database
            .prepare(
              `
          INSERT INTO desktop_events (event_key, code, occurred_at, title, job_id, occurrence_id)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(event_key) DO NOTHING
        `,
            )
            .run(
              `terminal:${row.job_id}:${row.occurrence_id}:${run.status}`,
              run.failureCode === 'retries_exhausted'
                ? 'retries_exhausted'
                : 'lecture_finished',
              run.updatedAt,
              safeTitle(row.title),
              row.job_id,
              row.occurrence_id,
            );
          count += result.changes;
        }
        return count;
      })
      .immediate();
  }

  async listPage(
    filter: 'all' | 'errors',
    cursorValue?: string,
  ): Promise<{ records: StoredJournalRecord[]; nextCursor?: string }> {
    if (filter !== 'all' && filter !== 'errors')
      throw new Error('Invalid journal filter');
    const cursor = parseCursor(cursorValue);
    const database = this.store.getDatabase();
    const runRows = database
      .prepare(
        `
      SELECT r.job_id, r.occurrence_id, r.payload,
        COALESCE(e.title, json_extract(j.payload, '$.title'), json_extract(j.payload, '$.origin.discipline')) AS title
      FROM runs r
      LEFT JOIN jobs j ON j.id = r.job_id
      LEFT JOIN desktop_events e ON e.event_key = 'terminal:' || r.job_id || ':' || r.occurrence_id || ':' || json_extract(r.payload, '$.status')
      WHERE (? = 'all' OR json_extract(r.payload, '$.status') IN ('failed', 'blocked'))
        AND (? IS NULL OR json_extract(r.payload, '$.updatedAt') < ?
          OR (json_extract(r.payload, '$.updatedAt') = ? AND (1 < ? OR (1 = ? AND (r.job_id || char(0) || r.occurrence_id) < ?))))
      ORDER BY json_extract(r.payload, '$.updatedAt') DESC, r.job_id DESC, r.occurrence_id DESC
      LIMIT 51
    `,
      )
      .all(
        filter,
        cursor?.at ?? null,
        cursor?.at ?? null,
        cursor?.at ?? null,
        cursor?.rank ?? null,
        cursor?.rank ?? null,
        cursor?.id ?? null,
      ) as RunRow[];
    const eventRows = database
      .prepare(
        `
      SELECT id, code, occurred_at, title FROM desktop_events
      WHERE code NOT IN ('lecture_finished', 'retries_exhausted')
        AND (? = 'all' OR code IN ('auth_required', 'import_error', 'core_error'))
        AND (? IS NULL OR occurred_at < ?
          OR (occurred_at = ? AND (0 < ? OR (0 = ? AND printf('%020d', id) < ?))))
      ORDER BY occurred_at DESC, id DESC LIMIT 51
    `,
      )
      .all(
        filter,
        cursor?.at ?? null,
        cursor?.at ?? null,
        cursor?.at ?? null,
        cursor?.rank ?? null,
        cursor?.rank ?? null,
        cursor?.id ?? null,
      ) as EventRow[];

    const ranked: RankedRecord[] = [
      ...runRows.map((row) => {
        const run = JSON.parse(row.payload) as {
          status: RunStatus;
          updatedAt: string;
          completionReason?: CompletionReason;
          failureCode?: 'retries_exhausted';
        };
        const id = `${row.job_id}\u0000${row.occurrence_id}`;
        return {
          cursor: { at: run.updatedAt, rank: 1, id },
          record: {
            id: `run:${Buffer.from(id).toString('base64url')}`,
            at: run.updatedAt,
            title: safeTitle(row.title),
            status: run.status,
            ...(run.failureCode
              ? { reason: run.failureCode }
              : run.completionReason
                ? { reason: run.completionReason }
                : {}),
            isError: run.status === 'failed' || run.status === 'blocked',
          },
        };
      }),
      ...eventRows.map((row) => ({
        cursor: {
          at: row.occurred_at,
          rank: 0,
          id: String(row.id).padStart(20, '0'),
        },
        record: {
          id: `event:${row.id}`,
          at: row.occurred_at,
          title: row.title ? safeTitle(row.title) : 'Приложение',
          status: row.code,
          isError: ERROR_CODES.includes(row.code),
        },
      })),
    ];
    ranked.sort((a, b) => older(a.cursor, b.cursor));
    const page = ranked.slice(0, PAGE_SIZE);
    const nextCursor =
      ranked.length > PAGE_SIZE
        ? encodeCursor(page[PAGE_SIZE - 1]!.cursor)
        : undefined;
    return {
      records: page.map((entry) => entry.record),
      ...(nextCursor ? { nextCursor } : {}),
    };
  }
}
