export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type Schedule =
  | {
      type: 'once';
      date: string;
      joinAt: string;
      leaveAt: string;
      timezone: string;
    }
  | {
      type: 'weekly';
      days: Weekday[];
      joinAt: string;
      leaveAt: string;
      timezone: string;
    };

export type LectureTarget =
  | {
      type: 'search';
      course: string;
      lecture?: string;
    }
  | {
      type: 'url';
      url: string;
    };

export interface Job {
  id: string;
  enabled: boolean;
  schedule: Schedule;
  target: LectureTarget;
  browser: {
    headless: boolean;
  };
}

export interface Occurrence {
  id: string;
  jobId: string;
  joinAt: string;
  leaveAt: string;
  timezone: string;
}

export type RunStatus =
  | 'scheduled'
  | 'resolving'
  | 'joining'
  | 'waiting_room'
  | 'connected'
  | 'reconnecting'
  | 'leaving'
  | 'completed'
  | 'skipped'
  | 'blocked'
  | 'failed';

export type CompletionReason =
  'meeting_ended' | 'deadline' | 'manual' | 'error';

export interface Run {
  jobId: string;
  occurrenceId: string;
  status: RunStatus;
  completionReason?: CompletionReason;
  createdAt: string;
  updatedAt: string;
}

export interface JobRepository {
  listEnabled(): Promise<Job[]>;
  getById(id: string): Promise<Job | undefined>;
  save(job: Job): Promise<void>;
}

export interface RunRepository {
  getOrCreate(run: Run): Promise<{ run: Run; created: boolean }>;
  update(run: Run): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface LectureRunner {
  start(occurrence: Occurrence): Promise<void>;
  stop(occurrence: Occurrence, reason: CompletionReason): Promise<void>;
}

// MCP Client types
export interface Credentials {
  username: string;
  password: string;
}

export interface Session {
  token: string;
  expiresAt: Date;
}

export interface Course {
  id: string;
  name: string;
}

export interface BbbActivity {
  id: string;
  name: string;
  courseId: string;
  startTime?: string;
}

export interface BbbUrl {
  url: string;
  meetingId: string;
  activityId: string;
}

export interface McpConfig {
  serverPath: string;
  connectionTimeout: number;
}

export interface SessionConfig {
  headless: boolean;
  timeout: number;
  joinTimeout: number;
}
