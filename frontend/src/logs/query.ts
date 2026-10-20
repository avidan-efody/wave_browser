/**
 * Ask the remote server for a sample of matches, or scan a bundled log locally.
 * An aborted signal drops the in-flight request so a new keystroke can start over.
 */

import { getBackendUrl } from '../api/client';
import type { SignalInfo, WaveformData } from '../api/types';
import type { LogTrace } from '../store/waveformStore';
import { bundledLogText, resolveLogPath } from './bundled';
import { type LogDone, type LogEvent, type LogLine, headLines, scanText, scanTextProgressive } from './scan';
import { extractTime } from './time';

export interface LogSearchHandlers {
  signal?: AbortSignal;
  onPreview?: (lines: LogLine[]) => void;
}

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({ detail: response.statusText }));
  return typeof body.detail === 'string' ? body.detail : 'Log search failed';
}

export async function readRemoteHead(path: string, timeUnit: string, signal?: AbortSignal): Promise<LogLine[]> {
  const url = `${getBackendUrl()}/api/logs/head?path=${encodeURIComponent(path)}&limit=200`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json() as { lines: Array<{ line: number; text: string }> };
  return body.lines.map((line) => ({
    line: line.line,
    text: line.text,
    time: extractTime(line.text, timeUnit),
  }));
}

export async function searchRemoteLog(
  path: string,
  pattern: string,
  timeUnit: string,
  handlers: LogSearchHandlers = {},
): Promise<LogDone> {
  const response = await fetch(`${getBackendUrl()}/api/logs/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      pattern,
      time_unit: timeUnit,
      preview_limit: 200,
      event_limit: 2000,
    }),
    signal: handlers.signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  if (!response.body) throw new Error('Log search returned an empty body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: LogDone | null = null;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.trim()) continue;
      const message = JSON.parse(part) as { type: string; detail?: string; matches?: LogLine[] } & Partial<LogDone>;
      if (message.type === 'preview' && message.matches) handlers.onPreview?.(message.matches);
      if (message.type === 'error') throw new Error(message.detail || 'Log search failed');
      if (message.type === 'done') {
        done = {
          match_count: message.match_count ?? 0,
          too_wide: Boolean(message.too_wide),
          timed_count: message.timed_count ?? 0,
          events: message.events ?? [],
        };
      }
    }
  }
  if (!done) throw new Error('Log search ended early');
  return done;
}

export async function loadLogPreview(
  file: { path: string; bundled: boolean; name: string },
  pattern: string,
  timeUnit: string,
  handlers: LogSearchHandlers = {},
): Promise<LogDone | null> {
  const trimmed = pattern.trim();
  if (!trimmed) {
    const lines = file.bundled
      ? headLines(bundledLogText(file.name) ?? '', timeUnit)
      : await readRemoteHead(file.path, timeUnit, handlers.signal);
    handlers.onPreview?.(lines);
    return null;
  }
  if (file.bundled) {
    const text = bundledLogText(file.name);
    if (text == null) throw new Error(`Log not in the demo: ${file.name}`);
    const signal = handlers.signal ?? new AbortController().signal;
    return scanTextProgressive(text, trimmed, timeUnit, signal, (lines) => {
      handlers.onPreview?.(lines);
    });
  }
  return searchRemoteLog(file.path, trimmed, timeUnit, handlers);
}

export async function queryLogEvents(
  file: string,
  pattern: string,
  waveDb: string | undefined,
  timeUnit: string,
  bundled: boolean,
): Promise<{ logPath: string; logName: string; done: LogDone }> {
  const logName = file.split(/[/\\]/).pop() || file;
  if (bundled) {
    const text = bundledLogText(logName);
    if (text == null) throw new Error(`Log not in the demo: ${logName}`);
    return { logPath: logName, logName, done: scanText(text, pattern, timeUnit).done };
  }
  const logPath = resolveLogPath(file, waveDb);
  const done = await searchRemoteLog(logPath, pattern, timeUnit);
  return { logPath, logName, done };
}

export function buildLogSignal(
  logName: string,
  logPath: string,
  pattern: string,
  events: LogEvent[],
  timeUnit: string,
  start: number,
  end: number,
): { trace: LogTrace; signal: SignalInfo; data: WaveformData } {
  const signalPath = `${logName}/${pattern}`;
  const signal: SignalInfo = {
    path: signalPath,
    name: signalPath,
    width: 1,
    left_range: 0,
    right_range: 0,
    direction: 'none',
    is_real: false,
    is_array: false,
    is_composite: false,
    has_members: false,
  };
  const trace: LogTrace = { signalPath, logName, logPath, pattern };
  const data: WaveformData = {
    signal_path: signalPath,
    start_time: start,
    end_time: end,
    time_unit: timeUnit,
    changes: [...events]
      .sort((a, b) => a.time - b.time)
      .map((event) => ({ time: event.time, value: event.text })),
  };
  return { trace, signal, data };
}
