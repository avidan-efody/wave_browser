/**
 * API Types - TypeScript interfaces matching backend models
 */

// Enums
export type SignalDirection = 'input' | 'output' | 'inout' | 'none';
export type ScopeType = 'module' | 'task' | 'function' | 'block' | 'generate' | 'interface' | 'package' | 'process' | 'architecture' | 'unknown';
export type ValueFormat = 'bin' | 'oct' | 'dec' | 'hex';

// Session
export interface SessionCreate {
  vendor: string;
  wave_db?: string;
  design_db?: string;
}

export interface SessionInfo {
  id: string;
  vendor: string;
  wave_db?: string;
  design_db?: string;
  time_unit: string;
  min_time: number;
  max_time: number;
  is_completed: boolean;
  created_at: string;
}

export interface SessionResponse {
  session: SessionInfo;
}

export interface SessionListResponse {
  sessions: SessionInfo[];
}

// Hierarchy
export interface ScopeInfo {
  path: string;
  name: string;
  scope_type: ScopeType;
  def_name?: string;
  has_children: boolean;
  has_signals: boolean;
}

export interface ScopeListResponse {
  scopes: ScopeInfo[];
}

export interface SignalInfo {
  path: string;
  name: string;
  width: number;
  left_range: number;
  right_range: number;
  direction: SignalDirection;
  is_real: boolean;
  is_array: boolean;
  is_composite: boolean;
  has_members: boolean;
}

export interface SignalListResponse {
  signals: SignalInfo[];
}

export interface SignalSearchRequest {
  pattern: string;
  scope_path?: string;
  limit?: number;
}

// Waveform
export interface ValueChange {
  time: number;
  value: string;
}

export interface WaveformData {
  signal_path: string;
  start_time: number;
  end_time: number;
  time_unit: string;
  changes: ValueChange[];
}

export interface WaveformResponse {
  waveform: WaveformData;
}

export interface WaveformBatchRequest {
  signal_paths: string[];
  start_time: number;
  end_time: number;
  max_changes?: number;
  format?: ValueFormat;
}

export interface WaveformBatchResponse {
  waveforms: Record<string, WaveformData>;
}

export interface ValueAtTimeResponse {
  signal_path: string;
  time: number;
  value?: string;
}

// File Browser
export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
}

export interface FileListResponse {
  path: string;
  parent?: string;
  entries: FileEntry[];
}

export interface FileContentResponse {
  path: string;
  content: string;
  language: string;
  line_count: number;
}
