import { parse } from 'yaml';
import { z } from 'zod';

import type { Job, LectureTarget } from '../core/types.js';

const time = z.string().regex(/^\d{2}:\d{2}$/, 'time must use HH:MM');
const target = z
  .object({
    type: z.enum(['search', 'direct']),
    courseId: z.string().min(1).optional(),
    courseName: z.string().min(1).optional(),
    lectureQuery: z.string().min(1).optional(),
    activityUrl: z.string().url().optional(),
  })
  .superRefine((value, context) => {
    if (value.type === 'search' && !value.courseId && !value.courseName) {
      context.addIssue({
        code: 'custom',
        message: 'target.type=search requires courseId or courseName',
      });
    }
    if (
      value.type === 'direct' &&
      (value.courseId !== undefined || value.courseName !== undefined || value.lectureQuery !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'target.type=direct cannot include courseId, courseName, or lectureQuery',
      });
    }
    if (value.type === 'direct' && value.activityUrl === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'target.type=direct requires activityUrl',
      });
    }
    if (
      value.type === 'direct' &&
      value.activityUrl !== undefined &&
      !isMoodleBbbUrl(value.activityUrl)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'target.activityUrl must be an HTTPS Moodle BigBlueButton activity URL',
      });
    }
  });

const schema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  schedule: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('once'),
      date: z.iso.date(),
      joinAt: time,
      leaveAt: time,
      timezone: z.string().min(1),
    }),
    z.object({
      type: z.literal('weekly'),
      days: z
        .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
        .min(1),
      joinAt: time,
      leaveAt: time,
      timezone: z.string().min(1),
    }),
  ]),
  target,
  browser: z.object({ headless: z.boolean() }),
});

export function parseJobConfig(yaml: string): Job {
  const result = schema.safeParse(parse(yaml));
  if (!result.success)
    throw new Error(
      result.error.issues.map((issue) => issue.message).join('; '),
    );
  return result.data as Job;
}

function isMoodleBbbUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'sdo.tusur.ru' &&
      url.pathname === '/mod/bigbluebuttonbn/view.php' &&
      url.searchParams.has('id')
    );
  } catch {
    return false;
  }
}
