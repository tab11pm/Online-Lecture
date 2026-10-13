export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type JobSource = 'manual' | 'timetable';

export interface JobOrigin {
  faculty: string;
  group: string;
  discipline: string;
  sdoCourseId: string;
}

export interface ImportedOccurrence {
  date: string; // YYYY-MM-DD
  joinAt: string; // HH:MM
  leaveAt: string; // HH:MM
  room?: string;
  edited?: boolean;
  suppressed?: boolean;
}

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
    }
  | {
      type: 'imported';
      timezone: string;
      occurrences: ImportedOccurrence[];
    };

export type LectureTarget =
  | {
      type: 'search';
      courseId?: string;
      courseName?: string;
      lectureQuery?: string;
    }
  | {
      type: 'direct';
      activityUrl: string;
    };

export interface Job {
  id: string;
  enabled: boolean;
  source?: JobSource;
  origin?: JobOrigin;
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
  listAll?(): Promise<Job[]>;
  delete?(id: string): Promise<void>;
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
export interface Course {
  id: string;
  name: string;
  url?: string;
}

export interface OnlineLectureCandidate {
  id: string;
  name: string;
  courseUrl: string;
  activityUrl: string;
  type: 'lecture' | 'practical';
}

export type OnlineLectureResolution =
  | { status: 'resolved'; course: Course; module: OnlineLectureCandidate }
  | { status: 'ambiguous'; candidates: OnlineLectureCandidate[] }
  | { status: 'not_found' }
  | { status: 'auth_required' };

export interface OnlineLectureResolver {
  resolveOnlineLecture(input: {
    courseUrl?: string;
    courseQuery?: string;
    lectureQuery?: string;
  }): Promise<OnlineLectureResolution>;
}

/** Where the SDO MCP server command came from, in priority order. */
export type McpServerSource = 'env' | 'bundled' | 'user-install' | 'path';

export interface McpConfig {
  serverPath: string;
  source?: McpServerSource;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  connectionTimeout?: number;
}

export interface SessionConfig {
  headless?: boolean;
  timeout?: number;
  joinTimeout?: number;
  skipAudioSetup?: boolean;
  skipVideoSetup?: boolean;
}

export interface SessionState {
  isConnected: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  participantsCount?: number;
  meetingStatus: 'waiting_room' | 'connected' | 'ended' | 'error';
}

export interface BbbSession {
  page: any; // Playwright Page object
  status:
    | 'starting'
    | 'started'
    | 'joining'
    | 'joined'
    | 'monitoring'
    | 'leaving'
    | 'left'
    | 'error';
  url: string;
  meetingId?: string;
  startedAt: Date;
}
