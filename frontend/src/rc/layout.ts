/**
 * Ordered wave rows: group headers, dividers, and signals.
 * A collapsed group hides following rows until the next group header.
 */

import type { SignalInfo } from '../api/types';
import type { WaveRow } from '../store/waveformStore';

export const RULER_HEIGHT = 24;
export const SIGNAL_HEIGHT = 30;
export const GROUP_HEADER_HEIGHT = 22;
export const DIVIDER_HEIGHT = 16;

export type LayoutEntry =
  | { kind: 'group'; id: string; name: string; collapsed: boolean; signalCount: number }
  | { kind: 'divider'; id: string; name: string }
  | { kind: 'signal'; id: string; signal: SignalInfo; inGroup: boolean };

export function buildLayout(rows: WaveRow[], signals: SignalInfo[]): LayoutEntry[] {
  const byPath = new Map(signals.map((signal) => [signal.path, signal]));
  const source: WaveRow[] = rows.length > 0
    ? rows
    : signals.map((signal) => ({ id: signal.path, type: 'signal' as const, path: signal.path }));

  const counts = new Map<string, number>();
  let currentGroup: string | null = null;
  for (const row of source) {
    if (row.type === 'group') {
      currentGroup = row.id;
      counts.set(row.id, 0);
    } else if (row.type === 'signal' && currentGroup) {
      counts.set(currentGroup, (counts.get(currentGroup) || 0) + 1);
    }
  }

  const entries: LayoutEntry[] = [];
  let collapsed = false;
  let inGroup = false;
  for (const row of source) {
    if (row.type === 'group') {
      collapsed = row.collapsed;
      inGroup = true;
      entries.push({
        kind: 'group',
        id: row.id,
        name: row.name,
        collapsed: row.collapsed,
        signalCount: counts.get(row.id) || 0,
      });
      continue;
    }
    if (collapsed) continue;
    if (row.type === 'divider') {
      entries.push({ kind: 'divider', id: row.id, name: row.name });
      continue;
    }
    const signal = byPath.get(row.path);
    if (!signal) continue;
    entries.push({ kind: 'signal', id: row.id, signal, inGroup });
  }
  return entries;
}

export function layoutHeight(entries: LayoutEntry[]): number {
  let height = RULER_HEIGHT;
  for (const entry of entries) {
    if (entry.kind === 'group') height += GROUP_HEADER_HEIGHT;
    else if (entry.kind === 'divider') height += DIVIDER_HEIGHT;
    else height += SIGNAL_HEIGHT;
  }
  return Math.max(400, height + 30);
}

export function entryHeight(entry: LayoutEntry): number {
  if (entry.kind === 'group') return GROUP_HEADER_HEIGHT;
  if (entry.kind === 'divider') return DIVIDER_HEIGHT;
  return SIGNAL_HEIGHT;
}

/** Y of the gap where a dragged row would land, and the row it should be inserted before. */
export function dropTarget(
  entries: LayoutEntry[],
  pointerY: number,
): { y: number; beforeId: string | null } {
  let currentY = RULER_HEIGHT;
  for (const entry of entries) {
    const height = entryHeight(entry);
    if (pointerY < currentY + height / 2) {
      return { y: currentY, beforeId: entry.id };
    }
    currentY += height;
  }
  return { y: currentY, beforeId: null };
}
