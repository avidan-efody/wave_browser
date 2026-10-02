/**
 * Open the FIFO story from files shipped with the frontend.
 * GitHub Pages has no backend, so this is what the public site shows.
 */

import storyText from '../../../example/fifo_story/sim/story.json?raw';
import rcText from '../../../example/fifo_story/sim/waves.rc?raw';
import vcdText from '../../../example/fifo_story/sim/waves.vcd?raw';
import type { SignalInfo, WaveformData } from '../api/types';
import { applyStoryLinks } from '../rc/applyStory';
import { parseSignalRc } from '../rc/signalRc';
import { useWaveformStore } from '../store';
import { parseVcd } from './parseVcd';

function stubSignal(path: string): SignalInfo {
  const name = path.split('.').pop() || path;
  return {
    path,
    name,
    width: 1,
    left_range: 0,
    right_range: 0,
    direction: 'none',
    is_real: false,
    is_array: false,
    is_composite: false,
    has_members: false,
  };
}

export function loadBundledStory(): void {
  const parsed = parseVcd(vcdText);
  const rc = parseSignalRc(rcText, 'ps');
  const byPath = new Map(parsed.signals.map((signal) => [signal.info.path, signal]));
  const paths = [...new Set(rc.rows.filter((row) => row.type === 'signal').map((row) => row.path))];
  const signals = paths.map((path) => byPath.get(path)?.info ?? stubSignal(path));
  const waveformData: Record<string, WaveformData> = {};
  for (const signal of signals) {
    waveformData[signal.path] = {
      signal_path: signal.path,
      start_time: parsed.minTime,
      end_time: parsed.maxTime,
      time_unit: 'ps',
      changes: byPath.get(signal.path)?.changes ?? [],
    };
  }

  useWaveformStore.setState({
    isDemoMode: true,
    demoTree: parsed.tree,
    currentSession: {
      id: 'fifo-story',
      vendor: 'verilator',
      wave_db: 'FIFO story',
      time_unit: 'ps',
      min_time: parsed.minTime,
      max_time: parsed.maxTime,
      is_completed: true,
      created_at: new Date().toISOString(),
    },
    viewStart: parsed.minTime,
    viewEnd: parsed.maxTime,
    selectedScope: null,
    selectedSignal: null,
    storyPlayback: null,
  });
  useWaveformStore.getState().applyRcLayout({
    signals,
    rows: rc.rows,
    markers: rc.markers,
    notes: rc.notes,
    cursorTime: rc.cursorTime,
  });
  const story = JSON.parse(storyText) as { links?: { child: string; parent: string }[] };
  applyStoryLinks(story.links ?? []);
  useWaveformStore.setState({
    isDemoMode: true,
    demoTree: parsed.tree,
    waveformData,
    viewStart: parsed.minTime,
    viewEnd: parsed.maxTime,
  });
}
