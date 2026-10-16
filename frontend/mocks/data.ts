/**
 * Mock data fixtures for frontend standalone testing.
 * 
 * This data represents a counter design with:
 * - tb_counter (testbench)
 *   - dut (counter_top instance)
 *     - u_counter (counter instance)
 */

import type { SessionInfo, ScopeInfo, SignalInfo, WaveformData } from '../src/api/types';

// ============================================================================
// Sessions
// ============================================================================

export const mockSession: SessionInfo = {
  id: 'mock-session-001',
  vendor: 'verdi',
  wave_db: undefined,
  design_db: '/mock/design/counter.v /mock/design/tb_counter.v',
  time_unit: 'ns',
  min_time: 0,
  max_time: 10000,
  is_completed: true,
  created_at: new Date().toISOString(),
};

export const mockSessions: SessionInfo[] = [mockSession];

// ============================================================================
// Hierarchy - Scopes
// ============================================================================

export const topScopes: ScopeInfo[] = [
  {
    name: 'tb_counter',
    path: 'tb_counter',
    def_name: 'tb_counter',
    scope_type: 'module',
    has_children: true,
    has_signals: true,
  },
  {
    name: 'bus_pkg',
    path: 'bus_pkg',
    def_name: 'bus_pkg',
    scope_type: 'package',
    has_children: false,
    has_signals: false,
  },
];

export const tbCounterChildren: ScopeInfo[] = [
  {
    name: 'dut',
    path: 'tb_counter.dut',
    def_name: 'counter_top',
    scope_type: 'module',
    has_children: true,
    has_signals: true,
  },
  {
    name: 'bus',
    path: 'tb_counter.bus',
    def_name: 'bus_if',
    scope_type: 'interface',
    has_children: false,
    has_signals: true,
  },
];

export const dutChildren: ScopeInfo[] = [
  {
    name: 'u_counter',
    path: 'tb_counter.dut.u_counter',
    def_name: 'counter',
    scope_type: 'module',
    has_children: false,
    has_signals: true,
  },
];

export const scopeChildrenMap: Record<string, ScopeInfo[]> = {
  'tb_counter': tbCounterChildren,
  'tb_counter.dut': dutChildren,
  'tb_counter.dut.u_counter': [],
};

// ============================================================================
// Hierarchy - Signals
// ============================================================================

export const tbCounterSignals: SignalInfo[] = [
  {
    name: 'clk',
    path: 'tb_counter.clk',
    width: 1,
    direction: 'none',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'rst_n',
    path: 'tb_counter.rst_n',
    width: 1,
    direction: 'none',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'start',
    path: 'tb_counter.start',
    width: 1,
    direction: 'none',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'done',
    path: 'tb_counter.done',
    width: 1,
    direction: 'none',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'count_out',
    path: 'tb_counter.count_out[7:0]',
    width: 8,
    direction: 'none',
    left_range: 7,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
];

export const dutSignals: SignalInfo[] = [
  {
    name: 'clk',
    path: 'tb_counter.dut.clk',
    width: 1,
    direction: 'input',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'rst_n',
    path: 'tb_counter.dut.rst_n',
    width: 1,
    direction: 'input',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'start',
    path: 'tb_counter.dut.start',
    width: 1,
    direction: 'input',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'done',
    path: 'tb_counter.dut.done',
    width: 1,
    direction: 'output',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'count',
    path: 'tb_counter.dut.count[7:0]',
    width: 8,
    direction: 'output',
    left_range: 7,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
];

export const counterSignals: SignalInfo[] = [
  {
    name: 'clk',
    path: 'tb_counter.dut.u_counter.clk',
    width: 1,
    direction: 'input',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'rst_n',
    path: 'tb_counter.dut.u_counter.rst_n',
    width: 1,
    direction: 'input',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'enable',
    path: 'tb_counter.dut.u_counter.enable',
    width: 1,
    direction: 'input',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'count',
    path: 'tb_counter.dut.u_counter.count[7:0]',
    width: 8,
    direction: 'output',
    left_range: 7,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
  {
    name: 'overflow',
    path: 'tb_counter.dut.u_counter.overflow',
    width: 1,
    direction: 'output',
    left_range: 0,
    right_range: 0,
    is_array: false,
    is_composite: false,
    is_real: false,
    has_members: false,
  },
];

export const scopeSignalsMap: Record<string, SignalInfo[]> = {
  'tb_counter': tbCounterSignals,
  'tb_counter.dut': dutSignals,
  'tb_counter.dut.u_counter': counterSignals,
};

// All signals for search
export const allSignals: SignalInfo[] = [
  ...tbCounterSignals,
  ...dutSignals,
  ...counterSignals,
];

// ============================================================================
// Waveforms
// ============================================================================

// Generate clock waveform: toggles every 5ns
function generateClockWaveform(startTime: number, endTime: number): WaveformData {
  const changes: { time: number; value: string }[] = [];
  let value = 0;
  for (let t = startTime; t <= endTime; t += 5) {
    changes.push({ time: t, value: String(value) });
    value = value === 0 ? 1 : 0;
  }
  return {
    signal_path: 'tb_counter.clk',
    time_unit: 'ns',
    start_time: startTime,
    end_time: endTime,
    changes,
  };
}

// Generate reset waveform: low for first 20ns, then high
function generateResetWaveform(startTime: number, endTime: number): WaveformData {
  const changes: { time: number; value: string }[] = [];
  if (startTime <= 0) {
    changes.push({ time: 0, value: '0' });
  }
  if (startTime <= 20 && endTime >= 20) {
    changes.push({ time: 20, value: '1' });
  }
  return {
    signal_path: 'tb_counter.rst_n',
    time_unit: 'ns',
    start_time: startTime,
    end_time: endTime,
    changes,
  };
}

// Generate counter waveform: increments on each clock edge
function generateCounterWaveform(startTime: number, endTime: number): WaveformData {
  const changes: { time: number; value: string }[] = [];
  let count = 0;
  for (let t = Math.max(25, startTime); t <= endTime; t += 10) {
    changes.push({ time: t, value: count.toString(16).padStart(2, '0') });
    count = (count + 1) % 256;
  }
  return {
    signal_path: 'tb_counter.count_out[7:0]',
    time_unit: 'ns',
    start_time: startTime,
    end_time: endTime,
    changes,
  };
}

export function getWaveformData(signalPath: string, startTime: number, endTime: number): WaveformData {
  if (signalPath.includes('clk')) {
    return { ...generateClockWaveform(startTime, endTime), signal_path: signalPath };
  }
  if (signalPath.includes('rst')) {
    return { ...generateResetWaveform(startTime, endTime), signal_path: signalPath };
  }
  if (signalPath.includes('count')) {
    return { ...generateCounterWaveform(startTime, endTime), signal_path: signalPath };
  }
  // Default: single value
  return {
    signal_path: signalPath,
    time_unit: 'ns',
    start_time: startTime,
    end_time: endTime,
    changes: [{ time: startTime, value: '0' }],
  };
}
