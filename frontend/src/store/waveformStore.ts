/**
 * Application state store using Zustand
 */

import { create } from 'zustand';
import type { SessionInfo, SignalInfo, WaveformData } from '../api/types';
import { DEMO_SESSION, DEMO_SIGNALS, DEMO_WAVEFORM_DATA } from '../demo/demoData';

export function canParentStory(
  items: Array<{ id: string; time: number; parentId?: string | null }>,
  childId: string,
  parentId: string,
): boolean {
  if (parentId === childId) return false;
  const child = items.find(item => item.id === childId);
  const parent = items.find(item => item.id === parentId);
  if (!child || !parent || parent.time >= child.time) return false;
  return !storyContains(items, childId, parentId);
}

function storyContains(
  items: Array<{ id: string; parentId?: string | null }>,
  ancestorId: string,
  nodeId: string,
): boolean {
  let current = items.find(item => item.id === nodeId);
  const seen = new Set<string>();
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    current = items.find(item => item.id === current?.parentId);
  }
  return false;
}

function materializeRows(rows: WaveRow[], signals: SignalInfo[]): WaveRow[] {
  if (rows.length > 0 || signals.length === 0) return [...rows];
  return signals.map((signal) => ({ id: crypto.randomUUID(), type: 'signal' as const, path: signal.path }));
}

// Named marker type
export interface NamedMarker {
  id: string;
  name: string;
  time: number;
  /** Story parent. Not written to signal.rc. */
  parentId?: string | null;
}

/** A comment pinned to one signal at one time. */
export interface WaveNote {
  id: string;
  time: number;
  signalPath: string;
  text: string;
  /** Story parent. Not written to signal.rc. */
  parentId?: string | null;
}

/** Active story playback. While running, only revealedIds are drawn. */
export interface StoryPlayback {
  running: boolean;
  paused: boolean;
  revealedIds: string[];
  focusId: string | null;
}

// Signal group type
export interface SignalGroup {
  id: string;
  name: string;
  collapsed: boolean;
  signalPaths: string[];
}

/** One row in the wave list, in display order. */
export type WaveRow =
  | { id: string; type: 'group'; name: string; collapsed: boolean }
  | { id: string; type: 'divider'; name: string }
  | { id: string; type: 'signal'; path: string };

export interface RcLayout {
  signals: SignalInfo[];
  rows: WaveRow[];
  markers: NamedMarker[];
  notes: WaveNote[];
  cursorTime: number | null;
}

// Code location type (for code panel)
export interface CodeLocation {
  filePath: string;
  line: number;
  label?: string;
}

interface WaveformState {
  // Session
  currentSession: SessionInfo | null;
  setCurrentSession: (session: SessionInfo | null) => void;
  
  // Demo mode
  isDemoMode: boolean;
  loadDemoMode: () => void;
  
  // Waveform viewer
  displayedSignals: SignalInfo[];
  addSignal: (signal: SignalInfo) => void;
  addSignals: (signals: SignalInfo[]) => void;
  removeSignal: (signalPath: string) => void;
  clearSignals: () => void;
  
  // Waveform data
  waveformData: Record<string, WaveformData>;
  setWaveformData: (signalPath: string, data: WaveformData) => void;
  
  // Time range
  viewStart: number;
  viewEnd: number;
  setViewRange: (start: number, end: number) => void;
  
  // Cursor
  cursorTime: number | null;
  setCursorTime: (time: number | null) => void;
  
  // Selected scope
  selectedScope: string | null;
  setSelectedScope: (path: string | null) => void;
  
  // Named markers
  markers: NamedMarker[];
  addMarker: (name: string, time: number) => void;
  removeMarker: (id: string) => void;
  updateMarker: (id: string, updates: Partial<Omit<NamedMarker, 'id'>>) => void;

  notes: WaveNote[];
  addNote: (text: string, time: number, signalPath: string) => void;
  removeNote: (id: string) => void;
  updateNote: (id: string, text: string) => void;
  selectedNoteId: string | null;
  setSelectedNote: (id: string | null) => void;
  selectedStoryId: string | null;
  setSelectedStory: (id: string | null) => void;
  setStoryParent: (childId: string, parentId: string | null) => void;
  storyPlayback: StoryPlayback | null;
  storyPlayToken: number;
  setStoryPlayback: (playback: StoryPlayback | null) => void;
  stopStoryPlayback: () => void;
  
  // Selected signal (for highlighting)
  selectedSignal: string | null;
  setSelectedSignal: (path: string | null) => void;
  
  // Ordered wave layout (groups, dividers, signals)
  waveRows: WaveRow[];
  applyRcLayout: (layout: RcLayout) => void;
  insertGroup: (name: string) => void;
  insertDivider: (name: string) => void;
  removeWaveRow: (id: string) => void;
  moveWaveRow: (rowId: string, beforeRowId: string | null) => void;
  renameWaveRow: (id: string, name: string) => void;
  selectedDividerId: string | null;
  setSelectedDivider: (id: string | null) => void;
  
  // Signal groups
  signalGroups: SignalGroup[];
  addSignalGroup: (name: string, signalPaths: string[]) => void;
  removeSignalGroup: (id: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  updateGroup: (id: string, updates: Partial<Omit<SignalGroup, 'id'>>) => void;
  
  // Code panel
  codeLocation: CodeLocation | null;
  setCodeLocation: (location: CodeLocation | null) => void;
}

function selectStory(
  state: { notes: WaveNote[]; markers: NamedMarker[] },
  id: string | null,
) {
  if (!id) return { selectedStoryId: null, selectedNoteId: null };
  const note = state.notes.find(item => item.id === id);
  if (note) {
    return {
      selectedStoryId: id,
      selectedNoteId: id,
      selectedSignal: note.signalPath,
      selectedDividerId: null as string | null,
      cursorTime: note.time,
    };
  }
  const marker = state.markers.find(item => item.id === id);
  return {
    selectedStoryId: id,
    selectedNoteId: null,
    ...(marker ? { cursorTime: marker.time } : {}),
  };
}

export const useWaveformStore = create<WaveformState>((set) => ({
  // Session
  currentSession: null,
  setCurrentSession: (session) => set({ 
    currentSession: session,
    displayedSignals: [],
    waveRows: [],
    waveformData: {},
    viewStart: session?.min_time ?? 0,
    viewEnd: session?.max_time ?? 1000,
    cursorTime: null,
    selectedScope: null,
    selectedSignal: null,
    selectedDividerId: null,
    markers: [],
    notes: [],
    selectedNoteId: null,
    selectedStoryId: null,
    storyPlayback: null,
    storyPlayToken: 0,
    signalGroups: [],
    isDemoMode: false,
  }),
  
  // Demo mode
  isDemoMode: false,
  loadDemoMode: () => set({
    isDemoMode: true,
    currentSession: DEMO_SESSION,
    displayedSignals: DEMO_SIGNALS,
    waveformData: DEMO_WAVEFORM_DATA,
    viewStart: DEMO_SESSION.min_time,
    viewEnd: DEMO_SESSION.max_time,
    cursorTime: null,
    selectedScope: null,
    selectedSignal: null,
    markers: [
      { id: 'demo-m1', name: 'Reset', time: 50 },
      { id: 'demo-m2', name: 'Start', time: 100 },
    ],
    notes: [
      { id: 'demo-n1', time: 100, signalPath: 'tb.clk', text: 'counting starts' },
    ],
    selectedNoteId: null,
    selectedStoryId: null,
    storyPlayback: null,
    signalGroups: [
      { id: 'demo-g1', name: 'Clocks & Control', collapsed: false, signalPaths: ['tb.clk', 'tb.reset_n', 'tb.enable'] },
      { id: 'demo-g2', name: 'Data Path', collapsed: false, signalPaths: ['tb.data', 'tb.data_valid', 'tb.done'] },
    ],
    waveRows: [
      { id: 'demo-g1', type: 'group', name: 'Clocks & Control', collapsed: false },
      { id: 'demo-s1', type: 'signal', path: 'tb.clk' },
      { id: 'demo-s2', type: 'signal', path: 'tb.reset_n' },
      { id: 'demo-s3', type: 'signal', path: 'tb.enable' },
      { id: 'demo-d1', type: 'divider', name: 'data' },
      { id: 'demo-g2', type: 'group', name: 'Data Path', collapsed: false },
      { id: 'demo-s4', type: 'signal', path: 'tb.data' },
      { id: 'demo-s5', type: 'signal', path: 'tb.data_valid' },
      { id: 'demo-s6', type: 'signal', path: 'tb.done' },
    ],
    selectedDividerId: null,
  }),
  
  // Displayed signals
  displayedSignals: [],
  addSignal: (signal) => set((state) => {
    if (state.displayedSignals.some(s => s.path === signal.path)) {
      return state;
    }
    return {
      displayedSignals: [...state.displayedSignals, signal],
      waveRows: [...state.waveRows, { id: crypto.randomUUID(), type: 'signal', path: signal.path }],
    };
  }),
  addSignals: (signals) => set((state) => {
    const existingPaths = new Set(state.displayedSignals.map(s => s.path));
    const newSignals = signals.filter(s => !existingPaths.has(s.path));
    if (newSignals.length === 0) return state;
    return {
      displayedSignals: [...state.displayedSignals, ...newSignals],
      waveRows: [
        ...state.waveRows,
        ...newSignals.map((signal) => ({ id: crypto.randomUUID(), type: 'signal' as const, path: signal.path })),
      ],
    };
  }),
  removeSignal: (signalPath) => set((state) => ({
    displayedSignals: state.displayedSignals.filter(s => s.path !== signalPath),
    waveRows: state.waveRows.filter(row => row.type !== 'signal' || row.path !== signalPath),
    selectedSignal: state.selectedSignal === signalPath ? null : state.selectedSignal,
    waveformData: Object.fromEntries(
      Object.entries(state.waveformData).filter(([k]) => k !== signalPath)
    ),
  })),
  clearSignals: () => set({ displayedSignals: [], waveRows: [], waveformData: {} }),
  
  // Waveform data
  waveformData: {},
  setWaveformData: (signalPath, data) => set((state) => ({
    waveformData: { ...state.waveformData, [signalPath]: data },
  })),
  
  // Time range
  viewStart: 0,
  viewEnd: 1000,
  setViewRange: (start, end) => set({ viewStart: start, viewEnd: end }),
  
  // Cursor
  cursorTime: null,
  setCursorTime: (time) => set({ cursorTime: time }),
  
  // Selected scope
  selectedScope: null,
  setSelectedScope: (path) => set({ selectedScope: path }),
  
  // Named markers
  markers: [],
  addMarker: (name, time) => set((state) => ({
    markers: [...state.markers, { id: crypto.randomUUID(), name, time }],
  })),
  removeMarker: (id) => set((state) => ({
    markers: state.markers
      .filter(m => m.id !== id)
      .map(m => m.parentId === id ? { ...m, parentId: null } : m),
    notes: state.notes.map(n => n.parentId === id ? { ...n, parentId: null } : n),
    selectedStoryId: state.selectedStoryId === id ? null : state.selectedStoryId,
  })),
  updateMarker: (id, updates) => set((state) => ({
    markers: state.markers.map(m => m.id === id ? { ...m, ...updates } : m),
  })),

  notes: [],
  selectedNoteId: null,
  addNote: (text, time, signalPath) => set((state) => ({
    notes: [...state.notes, { id: crypto.randomUUID(), text, time, signalPath }],
  })),
  removeNote: (id) => set((state) => ({
    notes: state.notes
      .filter((note) => note.id !== id)
      .map(n => n.parentId === id ? { ...n, parentId: null } : n),
    markers: state.markers.map(m => m.parentId === id ? { ...m, parentId: null } : m),
    selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
    selectedStoryId: state.selectedStoryId === id ? null : state.selectedStoryId,
  })),
  updateNote: (id, text) => set((state) => ({
    notes: state.notes.map(note => note.id === id ? { ...note, text } : note),
  })),
  setSelectedNote: (id) => set((state) => selectStory(state, id)),
  selectedStoryId: null,
  setSelectedStory: (id) => set((state) => selectStory(state, id)),
  storyPlayback: null,
  storyPlayToken: 0,
  setStoryPlayback: (playback) => set({ storyPlayback: playback }),
  stopStoryPlayback: () => set((state) => (
    state.storyPlayback == null
      ? state
      : { storyPlayback: null, storyPlayToken: state.storyPlayToken + 1 }
  )),
  setStoryParent: (childId, parentId) => set((state) => {
    const items = [...state.markers, ...state.notes];
    if (!items.some(item => item.id === childId)) return state;
    if (parentId !== null && !canParentStory(items, childId, parentId)) return state;
    return {
      markers: state.markers.map(marker => marker.id === childId ? { ...marker, parentId } : marker),
      notes: state.notes.map(note => note.id === childId ? { ...note, parentId } : note),
    };
  }),
  
  // Selected signal
  selectedSignal: null,
  setSelectedSignal: (path) => set({
    selectedSignal: path,
    selectedDividerId: null,
    selectedNoteId: null,
    selectedStoryId: null,
  }),

  waveRows: [],
  selectedDividerId: null,
  setSelectedDivider: (id) => set(id
    ? { selectedDividerId: id, selectedSignal: null }
    : { selectedDividerId: null }),
  applyRcLayout: ({ signals, rows, markers, notes, cursorTime }) => set({
    displayedSignals: signals,
    waveRows: rows,
    markers,
    notes,
    cursorTime,
    waveformData: {},
    signalGroups: [],
    selectedSignal: null,
    selectedDividerId: null,
    selectedNoteId: null,
    selectedStoryId: null,
    storyPlayback: null,
    storyPlayToken: 0,
  }),
  insertGroup: (name) => set((state) => {
    const rows = materializeRows(state.waveRows, state.displayedSignals);
    const selectedIndex = state.selectedSignal
      ? rows.findIndex((row) => row.type === 'signal' && row.path === state.selectedSignal)
      : -1;
    const at = selectedIndex < 0 ? 0 : selectedIndex;
    rows.splice(at, 0, { id: crypto.randomUUID(), type: 'group', name, collapsed: false });
    return { waveRows: rows };
  }),
  insertDivider: (name) => set((state) => {
    const rows = materializeRows(state.waveRows, state.displayedSignals);
    const selectedIndex = state.selectedSignal
      ? rows.findIndex((row) => row.type === 'signal' && row.path === state.selectedSignal)
      : -1;
    const at = selectedIndex < 0 ? rows.length : selectedIndex + 1;
    rows.splice(at, 0, { id: crypto.randomUUID(), type: 'divider', name });
    return { waveRows: rows };
  }),
  removeWaveRow: (id) => set((state) => ({
    waveRows: state.waveRows.filter((row) => row.id !== id),
    selectedDividerId: state.selectedDividerId === id ? null : state.selectedDividerId,
  })),
  renameWaveRow: (id, name) => set((state) => ({
    waveRows: state.waveRows.map((row) =>
      row.id === id && (row.type === 'group' || row.type === 'divider') ? { ...row, name } : row,
    ),
    signalGroups: state.signalGroups.map(group => group.id === id ? { ...group, name } : group),
  })),
  moveWaveRow: (rowId, beforeRowId) => set((state) => {
    const rows = materializeRows(state.waveRows, state.displayedSignals);
    const from = rows.findIndex((row) => row.id === rowId);
    if (from < 0) return state;
    const [item] = rows.splice(from, 1);
    let to = beforeRowId == null ? rows.length : rows.findIndex((row) => row.id === beforeRowId);
    if (to < 0) to = rows.length;
    if (to === from) return state;
    rows.splice(to, 0, item);
    const byPath = new Map(state.displayedSignals.map((signal) => [signal.path, signal]));
    const displayedSignals = rows
      .filter((row): row is Extract<WaveRow, { type: 'signal' }> => row.type === 'signal')
      .map((row) => byPath.get(row.path))
      .filter((signal): signal is SignalInfo => signal != null);
    return { waveRows: rows, displayedSignals };
  }),
  
  // Signal groups
  signalGroups: [],
  addSignalGroup: (name, signalPaths) => set((state) => ({
    signalGroups: [...state.signalGroups, { id: crypto.randomUUID(), name, collapsed: false, signalPaths }],
  })),
  removeSignalGroup: (id) => set((state) => ({
    signalGroups: state.signalGroups.filter(g => g.id !== id),
  })),
  toggleGroupCollapsed: (id) => set((state) => ({
    waveRows: state.waveRows.map((row) =>
      row.type === 'group' && row.id === id ? { ...row, collapsed: !row.collapsed } : row,
    ),
    signalGroups: state.signalGroups.map(g => g.id === id ? { ...g, collapsed: !g.collapsed } : g),
  })),
  updateGroup: (id, updates) => set((state) => ({
    signalGroups: state.signalGroups.map(g => g.id === id ? { ...g, ...updates } : g),
  })),
  
  // Code panel
  codeLocation: null,
  setCodeLocation: (location) => set({ codeLocation: location }),
}));
