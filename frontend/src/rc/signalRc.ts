/**
 * nWave signal.rc parser and writer.
 *
 * Covers the layout commands used to restore a wave view:
 * groups (addGroup), dividers (addBlank / addSignal -divider),
 * signals (addSignal, including -holdScope), and named markers (userMarker).
 * Radix, color, height, and zoom are accepted and ignored.
 */

import type { SignalInfo } from '../api/types';
import type { NamedMarker, WaveNote, WaveRow } from '../store/waveformStore';

export interface ParsedSignalRc {
  rows: WaveRow[];
  markers: NamedMarker[];
  notes: WaveNote[];
  cursorTime: number | null;
  /** Time unit declared by windowTimeUnit, if any. */
  timeUnit: string | null;
}

const UNIT_PS: Record<string, number> = {
  fs: 1e-3,
  ps: 1,
  ns: 1e3,
  us: 1e6,
  ms: 1e9,
  s: 1e12,
};

const FLAGS_WITH_VALUE = new Set([
  '-h',
  '-height',
  '-color',
  '-c',
  '-n',
  '-alias',
  '-risingDelay',
  '-fallingDelay',
]);

function newId(): string {
  return crypto.randomUUID();
}

function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
    if (i >= line.length) break;
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let value = '';
      while (j < line.length && line[j] !== ch) {
        if (line[j] === '\\' && j + 1 < line.length) {
          value += line[j + 1];
          j += 2;
          continue;
        }
        value += line[j];
        j++;
      }
      tokens.push(value);
      i = j + 1;
      continue;
    }
    if (ch === '{') {
      let j = i + 1;
      let value = '';
      while (j < line.length && line[j] !== '}') {
        value += line[j];
        j++;
      }
      tokens.push(value);
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] !== ' ' && line[j] !== '\t') j++;
    tokens.push(line.slice(i, j));
    i = j;
  }
  return tokens;
}

function parseWindowUnit(tokens: string[]): string | null {
  const raw = tokens.slice(1).join('');
  const match = raw.match(/[0-9.]*\s*(fs|ps|ns|us|ms|s)$/i);
  return match ? match[1].toLowerCase() : null;
}

export function toDatabaseTime(value: number, rcUnit: string | null, dbUnit: string): number {
  const from = rcUnit ? UNIT_PS[rcUnit] : undefined;
  const to = UNIT_PS[dbUnit];
  if (!from || !to || rcUnit === dbUnit) return Math.round(value);
  return Math.round((value * from) / to);
}

function rcPathToBrowser(path: string, delimiter: string): string {
  let text = path.trim();
  if (text.startsWith(delimiter)) text = text.slice(delimiter.length);
  if (delimiter === '.') return text;
  return text.split(delimiter).join('.');
}

function parentOf(path: string): string {
  const parts = path.split('.');
  parts.pop();
  return parts.join('.');
}

function quote(value: string): string {
  if (value === '' || /[\s"';{}]/.test(value) || value.startsWith('-')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

function parseAddNote(
  line: string,
  delimiter: string,
  scale: (value: number) => number,
): WaveNote | null {
  const body = line.replace(/^#--addNote\s+/, '');
  const match = body.match(/^(\S+)\s+(\S+)\s+([\s\S]+)$/);
  if (!match) return null;
  const time = scale(Number(match[1]));
  if (!Number.isFinite(time)) return null;
  let signal = match[2];
  let text = match[3].trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (signal.includes(delimiter) || signal.startsWith(delimiter)) {
    signal = rcPathToBrowser(signal, delimiter);
  }
  return { id: newId(), time, signalPath: signal, text };
}

function readDelimiter(lines: string[]): string {
  for (const line of lines) {
    const tokens = tokenize(line);
    if (tokens.length === 0) continue;
    const cmd = tokens[0];
    if (cmd !== 'openDirFile' && cmd !== 'setPathDelim' && cmd !== 'pathDelim') continue;
    const flag = tokens.indexOf('-d');
    if (flag >= 0 && tokens[flag + 1]) return tokens[flag + 1];
    if (cmd !== 'openDirFile' && tokens[1]) return tokens[1];
  }
  return '/';
}

function parseAddSignal(
  tokens: string[],
  delimiter: string,
  lastParent: string,
): { kind: 'divider'; name: string } | { kind: 'signal'; path: string; parent: string } | null {
  let holdScope = false;
  let divider: string | null = null;
  let pathToken: string | null = null;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '-divider' || token === '-blank' || token === '-separator') {
      const next = tokens[i + 1];
      if (next && !next.startsWith('-')) {
        divider = next;
        i++;
      } else {
        divider = '';
      }
      continue;
    }
    if (token === '-holdScope') {
      holdScope = true;
      continue;
    }
    if (FLAGS_WITH_VALUE.has(token)) {
      i++;
      continue;
    }
    if (token.startsWith('-')) continue;
    pathToken = token;
  }

  if (divider !== null && !pathToken) {
    return { kind: 'divider', name: divider };
  }
  if (!pathToken) return null;

  const isRelative = holdScope || (!pathToken.includes(delimiter) && !pathToken.startsWith(delimiter));
  let path: string;
  if (isRelative) {
    const name = pathToken.replace(/^[/\\]/, '');
    path = lastParent ? `${lastParent}.${name}` : name;
  } else {
    path = rcPathToBrowser(pathToken, delimiter);
  }
  return { kind: 'signal', path, parent: parentOf(path) };
}

export function parseSignalRc(content: string, dbTimeUnit: string): ParsedSignalRc {
  const logical: string[] = [];
  let pending = '';
  for (const raw of content.split(/\r?\n/)) {
    const trimmedEnd = raw.replace(/\s+$/, '');
    if (trimmedEnd.endsWith('\\')) {
      pending += trimmedEnd.slice(0, -1) + ' ';
      continue;
    }
    logical.push(pending + raw);
    pending = '';
  }
  if (pending) logical.push(pending);

  const delimiter = readDelimiter(
    logical.map((line) => line.trim()).filter((line) => line && !line.startsWith(';')),
  );

  const rows: WaveRow[] = [];
  const markers: NamedMarker[] = [];
  const notes: WaveNote[] = [];
  let cursorTime: number | null = null;
  let timeUnit: string | null = null;
  let lastParent = '';

  for (const rawLine of logical) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const tokens = tokenize(line);
    if (tokens[0] === 'windowTimeUnit') {
      timeUnit = parseWindowUnit(tokens);
      break;
    }
  }

  const scale = (value: number) => toDatabaseTime(value, timeUnit, dbTimeUnit);

  for (const rawLine of logical) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('#--addNote')) {
      const note = parseAddNote(line, delimiter, scale);
      if (note) notes.push(note);
      continue;
    }
    if (line.startsWith('#')) continue;
    const tokens = tokenize(line);
    if (tokens.length === 0) continue;
    const cmd = tokens[0];

    if (cmd === 'windowTimeUnit') {
      timeUnit = parseWindowUnit(tokens);
      continue;
    }
    if (cmd === 'cursor') {
      const value = Number(tokens[1]);
      if (Number.isFinite(value)) cursorTime = scale(value);
      continue;
    }
    if (cmd === 'userMarker') {
      const value = Number(tokens[1]);
      if (!Number.isFinite(value)) continue;
      const name = tokens.slice(2).join(' ') || 'marker';
      markers.push({ id: newId(), name, time: scale(value) });
      continue;
    }
    if (cmd === 'marker') {
      const value = Number(tokens[1]);
      if (!Number.isFinite(value)) continue;
      markers.push({ id: newId(), name: 'Marker', time: scale(value) });
      continue;
    }
    if (cmd === 'addGroup' || cmd === 'group') {
      const name = tokens.find((token, index) => index > 0 && !token.startsWith('-')) || 'Group';
      const collapsed = tokens.includes('-closed') || tokens.includes('-collapsed');
      rows.push({ id: newId(), type: 'group', name, collapsed });
      continue;
    }
    if (cmd === 'addBlank' || cmd === 'blank' || cmd === 'addDivider' || cmd === 'divider') {
      const name = tokens.find((token, index) => index > 0 && !token.startsWith('-')) || '';
      rows.push({ id: newId(), type: 'divider', name });
      continue;
    }
    if (cmd === 'addSignal' || cmd === 'signal') {
      const parsed = parseAddSignal(tokens, delimiter, lastParent);
      if (!parsed) continue;
      if (parsed.kind === 'divider') {
        rows.push({ id: newId(), type: 'divider', name: parsed.name });
        continue;
      }
      rows.push({ id: newId(), type: 'signal', path: parsed.path });
      lastParent = parsed.parent;
    }
  }

  return { rows, markers, notes, cursorTime, timeUnit };
}

export interface FormatSignalRcInput {
  rows: WaveRow[];
  signals: SignalInfo[];
  markers: NamedMarker[];
  notes: WaveNote[];
  cursorTime: number | null;
  timeUnit: string;
}

export function formatSignalRc(input: FormatSignalRcInput): string {
  const delimiter = '/';
  const widthByPath = new Map(input.signals.map((signal) => [signal.path, signal.width]));
  const lines: string[] = [
    'Magic 271485',
    'Revision WaveBrowser',
    '',
    `; Window Layout`,
    'openDirFile -d /',
    `windowTimeUnit 1${input.timeUnit || 'ps'}`,
  ];

  if (input.cursorTime !== null) {
    lines.push(`cursor ${input.cursorTime.toFixed(6)}`);
  }

  lines.push('', '; user define markers', '; userMarker time_pos marker_name');
  const markers = [...input.markers].sort((a, b) => a.time - b.time);
  for (const marker of markers) {
    lines.push(`userMarker ${marker.time.toFixed(6)} ${quote(marker.name)}`);
  }
  const notes = [...input.notes].sort((a, b) => a.time - b.time);
  for (const note of notes) {
    const rcPath = '/' + note.signalPath.split('.').join('/');
    lines.push(`#--addNote ${note.time.toFixed(6)} ${rcPath} ${quote(note.text)}`);
  }
  lines.push('');

  let lastParent = '';
  for (const row of input.rows) {
    if (row.type === 'group') {
      lines.push(`addGroup ${quote(row.name)}${row.collapsed ? ' -closed' : ''}`);
      continue;
    }
    if (row.type === 'divider') {
      lines.push(`addBlank ${quote(row.name)}`);
      continue;
    }
    const parts = row.path.split('.');
    const name = parts.pop() || row.path;
    const parent = parts.join('.');
    const width = widthByPath.get(row.path) ?? 1;
    const radix = width > 1 ? ' -UNSIGNED -HEX' : '';
    if (parent && parent === lastParent) {
      lines.push(`addSignal -h 15${radix} -holdScope ${quote(name)}`);
    } else {
      const full = delimiter + [...parts, name].join(delimiter);
      lines.push(`addSignal -h 15${radix} ${full}`);
    }
    lastParent = parent;
  }

  lines.push('');
  return lines.join('\n');
}
