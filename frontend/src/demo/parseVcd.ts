/**
 * Small VCD reader for the bundled FIFO story. Values match the Verilator adapter:
 * 1-bit signals stay 0/1/x/z, wider signals become hex.
 */

import type { ScopeInfo, SignalInfo } from '../api/types';
import type { DemoTree } from '../store/waveformStore';

export interface ParsedSignal {
  info: SignalInfo;
  changes: { time: number; value: string }[];
}

export interface ParsedVcd {
  signals: ParsedSignal[];
  tree: DemoTree;
  minTime: number;
  maxTime: number;
}

interface ScopeNode {
  info: ScopeInfo;
  signals: SignalInfo[];
  children: ScopeNode[];
}

function formatValue(raw: string, width: number): string {
  const bits = raw.trim().toLowerCase();
  if (width <= 1) return bits.slice(0, 1) || 'x';
  if (/[xz]/.test(bits)) return bits;
  const digits = Math.ceil(width / 4);
  const parsed = Number.parseInt(bits, 2);
  if (!Number.isFinite(parsed)) return bits;
  return parsed.toString(16).padStart(digits, '0');
}

export function parseVcd(text: string): ParsedVcd {
  const roots: ScopeNode[] = [];
  const visible: ScopeNode[] = [];
  const names: string[] = [];
  const byCode = new Map<string, ParsedSignal[]>();
  const signals: ParsedSignal[] = [];
  let time = 0;
  let maxTime = 0;

  const visiblePath = () => names.filter((name) => !name.startsWith('$')).join('.');

  const openScope = (name: string) => {
    names.push(name);
    if (name.startsWith('$')) return;
    const path = visiblePath();
    const node: ScopeNode = {
      info: {
        path,
        name,
        scope_type: 'module',
        def_name: name,
        has_children: false,
        has_signals: false,
      },
      signals: [],
      children: [],
    };
    const parent = visible[visible.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    visible.push(node);
  };

  const closeScope = () => {
    const name = names.pop();
    if (name && !name.startsWith('$')) visible.pop();
  };

  const addChange = (code: string, raw: string) => {
    const group = byCode.get(code);
    if (!group) return;
    for (const signal of group) {
      const value = formatValue(raw, signal.info.width);
      const last = signal.changes[signal.changes.length - 1];
      if (last && last.time === time && last.value === value) continue;
      if (last && last.value === value) continue;
      signal.changes.push({ time, value });
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('$comment')) continue;
    if (line.startsWith('$scope')) {
      const parts = line.split(/\s+/);
      openScope(parts[2] || 'scope');
      continue;
    }
    if (line.startsWith('$upscope')) {
      closeScope();
      continue;
    }
    if (line.startsWith('$var')) {
      const match = line.match(/^\$var\s+\S+\s+(\d+)\s+(\S+)\s+(\S+)/);
      if (!match) continue;
      const width = Number(match[1]);
      const code = match[2];
      const name = match[3].replace(/^\\/, '');
      const scope = visible[visible.length - 1];
      const path = scope ? `${scope.info.path}.${name}` : name;
      const range = line.match(/\[(\d+):(\d+)\]/);
      const info: SignalInfo = {
        path,
        name,
        width,
        left_range: range ? Number(range[1]) : Math.max(width - 1, 0),
        right_range: range ? Number(range[2]) : 0,
        direction: 'none',
        is_real: false,
        is_array: false,
        is_composite: false,
        has_members: false,
      };
      const signal: ParsedSignal = { info, changes: [] };
      signals.push(signal);
      const group = byCode.get(code) ?? [];
      group.push(signal);
      byCode.set(code, group);
      if (scope) {
        scope.signals.push(info);
        scope.info.has_signals = true;
      }
      continue;
    }
    if (line.startsWith('#')) {
      time = Number(line.slice(1));
      if (time > maxTime) maxTime = time;
      continue;
    }
    if (line.startsWith('$')) continue;
    if (line[0] === 'b' || line[0] === 'B') {
      const [bits, code] = line.slice(1).split(/\s+/);
      if (code) addChange(code, bits);
      continue;
    }
    if (/^[01xzXZ]/.test(line)) addChange(line.slice(1), line[0]);
  }

  const children: Record<string, ScopeInfo[]> = {};
  const scopeSignals: Record<string, SignalInfo[]> = {};
  const visit = (node: ScopeNode) => {
    node.info.has_children = node.children.length > 0;
    node.info.has_signals = node.signals.length > 0;
    if (node.children.length > 0) children[node.info.path] = node.children.map((child) => child.info);
    if (node.signals.length > 0) scopeSignals[node.info.path] = node.signals;
    node.children.forEach(visit);
  };
  roots.forEach(visit);

  return {
    signals,
    tree: { roots: roots.map((node) => node.info), children, signals: scopeSignals },
    minTime: 0,
    maxTime,
  };
}
