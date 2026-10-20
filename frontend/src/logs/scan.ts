/**
 * Client-side log scan for logs shipped with the demo.
 * Remote logs go through /api/logs/search so a huge file stays on the server.
 */

import { extractTime } from './time';

export const PREVIEW_LIMIT = 200;
export const EVENT_LIMIT = 2000;

export interface LogLine {
  line: number;
  text: string;
  time: number | null;
}

export interface LogEvent {
  time: number;
  text: string;
}

export interface LogDone {
  match_count: number;
  too_wide: boolean;
  timed_count: number;
  events: LogEvent[];
}

function compile(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid regex';
    throw new Error(`Invalid regex: ${message}`);
  }
}

export function headLines(text: string, timeUnit: string, limit = PREVIEW_LIMIT): LogLine[] {
  const lines: LogLine[] = [];
  const parts = text.split('\n');
  for (let index = 0; index < parts.length && lines.length < limit; index += 1) {
    const row = parts[index].replace(/\r$/, '');
    if (index === parts.length - 1 && row === '') break;
    lines.push({
      line: index + 1,
      text: row.slice(0, 2000),
      time: extractTime(row, timeUnit),
    });
  }
  return lines;
}

export function scanText(text: string, pattern: string, timeUnit: string): { preview: LogLine[]; done: LogDone } {
  const regex = compile(pattern);
  const preview: LogLine[] = [];
  const events: LogEvent[] = [];
  let matchCount = 0;
  const parts = text.split('\n');
  for (let index = 0; index < parts.length; index += 1) {
    const row = parts[index].replace(/\r$/, '').slice(0, 2000);
    if (index === parts.length - 1 && row === '') continue;
    if (!regex.test(row)) continue;
    matchCount += 1;
    const time = extractTime(row, timeUnit);
    if (preview.length < PREVIEW_LIMIT) {
      preview.push({ line: index + 1, text: row, time });
    }
    if (time != null && events.length < EVENT_LIMIT) {
      events.push({ time, text: row.slice(0, 240) });
    }
    if (matchCount > EVENT_LIMIT) {
      return {
        preview,
        done: { match_count: matchCount, too_wide: true, timed_count: 0, events: [] },
      };
    }
  }
  events.sort((a, b) => a.time - b.time);
  return {
    preview,
    done: {
      match_count: matchCount,
      too_wide: false,
      timed_count: events.length,
      events,
    },
  };
}

/** Yield between chunks so typing in the filter is not blocked on a long scan. */
export async function scanTextProgressive(
  text: string,
  pattern: string,
  timeUnit: string,
  signal: AbortSignal,
  onPreview: (lines: LogLine[]) => void,
): Promise<LogDone> {
  const regex = compile(pattern);
  const preview: LogLine[] = [];
  const events: LogEvent[] = [];
  let matchCount = 0;
  let flushed = 0;
  const parts = text.split('\n');
  for (let index = 0; index < parts.length; index += 1) {
    if (index % 400 === 0) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      if (preview.length !== flushed) {
        flushed = preview.length;
        onPreview(preview.slice());
      }
    }
    const row = parts[index].replace(/\r$/, '').slice(0, 2000);
    if (index === parts.length - 1 && row === '') continue;
    if (!regex.test(row)) continue;
    matchCount += 1;
    const time = extractTime(row, timeUnit);
    if (preview.length < PREVIEW_LIMIT) {
      preview.push({ line: index + 1, text: row, time });
    }
    if (time != null && events.length < EVENT_LIMIT) {
      events.push({ time, text: row.slice(0, 240) });
    }
    if (matchCount > EVENT_LIMIT) {
      onPreview(preview.slice());
      return { match_count: matchCount, too_wide: true, timed_count: 0, events: [] };
    }
  }
  onPreview(preview.slice());
  events.sort((a, b) => a.time - b.time);
  return {
    match_count: matchCount,
    too_wide: false,
    timed_count: events.length,
    events,
  };
}
