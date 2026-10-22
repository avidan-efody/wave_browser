/**
 * Resolve signal.rc paths against the open session and install the layout.
 */

import type { SignalInfo } from '../api/types';
import { hierarchyApi } from '../api';
import { buildLogSignal, queryLogEvents } from '../logs/query';
import { useWaveformStore } from '../store';
import { parseSignalRc } from './signalRc';

export interface ApplySignalRcResult {
  signalCount: number;
  groupCount: number;
  dividerCount: number;
  markerCount: number;
  noteCount: number;
  logCount: number;
  logWarnings: string[];
  missing: string[];
}

export async function applySignalRc(
  sessionId: string,
  timeUnit: string,
  content: string,
): Promise<ApplySignalRcResult> {
  const parsed = parseSignalRc(content, timeUnit);
  const paths = parsed.rows.filter((row) => row.type === 'signal').map((row) => row.path);
  const unique = [...new Set(paths)];
  const missing: string[] = [];
  const resolved: SignalInfo[] = [];

  for (const path of unique) {
    try {
      resolved.push(await hierarchyApi.getSignalInfo(sessionId, path));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'lookup failed';
      missing.push(`${path} (${message})`);
    }
  }

  const present = new Set(resolved.map((signal) => signal.path));
  const rows = parsed.rows.filter((row) => row.type !== 'signal' || present.has(row.path));

  const store = useWaveformStore.getState();
  store.applyRcLayout({
    signals: resolved,
    rows,
    markers: parsed.markers,
    notes: parsed.notes,
    cursorTime: parsed.cursorTime,
  });

  const logWarnings: string[] = [];
  let logCount = 0;
  const session = useWaveformStore.getState().currentSession;
  for (const spec of parsed.logs) {
    try {
      const found = await queryLogEvents(
        spec.file,
        spec.pattern,
        session?.wave_db,
        timeUnit,
        useWaveformStore.getState().isDemoMode,
      );
      if (found.done.too_wide) {
        logWarnings.push(`${spec.file}: match is too wide`);
        continue;
      }
      const built = buildLogSignal(
        found.logName,
        found.logPath,
        spec.pattern,
        found.done.events,
        timeUnit,
        session?.min_time ?? 0,
        session?.max_time ?? 0,
      );
      useWaveformStore.getState().addLogSignal(built.trace, built.signal, built.data, true);
      logCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Log search failed';
      logWarnings.push(`${spec.file}: ${message}`);
    }
  }

  return {
    signalCount: resolved.length,
    groupCount: rows.filter((row) => row.type === 'group').length,
    dividerCount: rows.filter((row) => row.type === 'divider').length,
    markerCount: parsed.markers.length,
    noteCount: parsed.notes.length,
    logCount,
    logWarnings,
    missing,
  };
}
