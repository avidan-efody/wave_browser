/**
 * Canvas-based waveform renderer
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { WaveformData, SignalInfo } from '../../api/types';
import { stripTimePrefix } from '../../logs/time';
import { useWaveformStore, type NamedMarker, type WaveNote } from '../../store';
import type { WaveMenuTarget } from './WaveContextMenu';
import {
  buildLayout,
  dropTarget,
  entryHeight,
  RULER_HEIGHT,
  SIGNAL_HEIGHT,
  GROUP_HEADER_HEIGHT,
  DIVIDER_HEIGHT,
} from '../../rc/layout';

const PADDING = 4;
const VALUE_WIDTH = 80;

const LOG_POPUP_COLOR = { fill: '#e5f7fb', stroke: '#0e7490', ink: '#12343a' };

const NOTE_COLORS = [
  { fill: '#e8f1ff', stroke: '#3b6fd8', ink: '#1c2a4a' },
  { fill: '#e5f6ec', stroke: '#1f8a4c', ink: '#143322' },
  { fill: '#fff3e4', stroke: '#c26a12', ink: '#3d2912' },
  { fill: '#f3e8ff', stroke: '#7a45b5', ink: '#2c1a42' },
  { fill: '#e5f6f6', stroke: '#0f766e', ink: '#12302e' },
];
const NOTE_LINE_HEIGHT = 14;
const NOTE_PAD = 6;

interface NoteBubble {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  above: boolean;
  lines: string[];
  emphasis: boolean;
  lineHeight: number;
  pad: number;
  rowTop: number;
  color: { fill: string; stroke: string; ink: string };
}

function wrapNote(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 24 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function noteBubbles(
  notes: WaveNote[],
  rows: Parameters<typeof buildLayout>[0],
  signals: Parameters<typeof buildLayout>[1],
  timeToX: (time: number) => number,
  waveAreaStart: number,
  canvasWidth: number,
  emphasisId: string | null = null,
): NoteBubble[] {
  const yByPath = new Map<string, number>();
  let currentY = RULER_HEIGHT;
  for (const entry of buildLayout(rows, signals)) {
    if (entry.kind === 'signal' && !yByPath.has(entry.signal.path)) {
      yByPath.set(entry.signal.path, currentY + SIGNAL_HEIGHT / 2);
    }
    currentY += entryHeight(entry);
  }

  const bubbles: NoteBubble[] = [];
  notes.forEach((note, index) => {
    const anchorY = yByPath.get(note.signalPath);
    if (anchorY == null) return;
    const anchorX = timeToX(note.time);
    if (anchorX < waveAreaStart - 40 || anchorX > canvasWidth + 40) return;
    const lines = wrapNote(note.text);
    const emphasis = note.id === emphasisId;
    const pad = emphasis ? 8 : NOTE_PAD;
    const lineHeight = emphasis ? 18 : NOTE_LINE_HEIGHT;
    const textWidth = Math.max(...lines.map((line) => line.length * (emphasis ? 8.4 : 6.6)), 24);
    const w = Math.min(240, textWidth + pad * 2);
    const h = lines.length * lineHeight + pad * 2;
    const rowTop = anchorY - SIGNAL_HEIGHT / 2;
    const aboveY = rowTop - h - 12;
    const above = aboveY >= 2;
    const y = above ? aboveY : rowTop + SIGNAL_HEIGHT + 12;
    // Sit left of the event so the leader from the card's right corner runs rightward.
    let x = anchorX - w - 18;
    if (x < 4) x = 4;
    if (x + w > canvasWidth - 4) x = Math.max(4, canvasWidth - 4 - w);
    bubbles.push({
      id: note.id,
      x,
      y,
      w,
      h,
      anchorX,
      anchorY,
      above,
      lines,
      emphasis,
      lineHeight,
      pad,
      rowTop,
      color: NOTE_COLORS[index % NOTE_COLORS.length],
    });
  });
  return bubbles;
}

function drawNoteBubble(ctx: CanvasRenderingContext2D, bubble: NoteBubble, selected: boolean) {
  const { x, y, w, h, anchorX, above, lines, emphasis, lineHeight, pad, rowTop, color } = bubble;
  const fill = emphasis ? '#d7e6ff' : color.fill;
  const stroke = emphasis ? '#1e66f5' : color.stroke;
  const ink = emphasis ? '#102a56' : color.ink;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = emphasis ? 2.5 : selected ? 2 : 1.25;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = stroke;
  ctx.fillRect(x, y, 3, h);

  const tipX = anchorX;
  const tipY = above ? rowTop + 1 : rowTop + SIGNAL_HEIGHT - 1;
  const fromX = x + w - 7;
  const fromY = above ? y + h : y;
  const dx = tipX - fromX;
  const dy = tipY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.min(14, Math.max(10, len * 0.45));
  const spread = 8;
  const baseX = tipX - ux * headLen;
  const baseY = tipY - uy * headLen;
  const px = -uy * spread;
  const py = ux * spread;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();
  ctx.fillStyle = stroke;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + px, baseY + py);
  ctx.lineTo(baseX - px, baseY - py);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = ink;
  ctx.font = emphasis ? 'bold 14px monospace' : '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, index) => {
    ctx.fillText(line, x + pad + 2, y + pad + index * lineHeight, w - pad * 2 - 2);
  });
}

function messageBubble(
  text: string,
  anchorX: number,
  rowTop: number,
  canvasWidth: number,
): NoteBubble {
  const lines = wrapNote(stripTimePrefix(text) || text).slice(0, 4);
  const pad = NOTE_PAD;
  const lineHeight = NOTE_LINE_HEIGHT;
  const textWidth = Math.max(...lines.map((line) => line.length * 6.6), 24);
  const w = Math.min(280, textWidth + pad * 2 + 4);
  const h = lines.length * lineHeight + pad * 2;
  const aboveY = rowTop - h - 12;
  const above = aboveY >= 2;
  const y = above ? aboveY : rowTop + SIGNAL_HEIGHT + 12;
  let x = anchorX - w - 18;
  if (x < 4) x = 4;
  if (x + w > canvasWidth - 4) x = Math.max(4, canvasWidth - 4 - w);
  return {
    id: 'log-hover',
    x,
    y,
    w,
    h,
    anchorX,
    anchorY: rowTop + SIGNAL_HEIGHT / 2,
    above,
    lines,
    emphasis: false,
    lineHeight,
    pad,
    rowTop,
    color: LOG_POPUP_COLOR,
  };
}

function nearestChange(
  changes: { time: number; value: string }[],
  timeToX: (time: number) => number,
  x: number,
  limit: number,
): { time: number; value: string } | null {
  let best: { time: number; value: string } | null = null;
  let bestDist = limit;
  for (const change of changes) {
    const dist = Math.abs(timeToX(change.time) - x);
    if (dist <= bestDist) {
      best = change;
      bestDist = dist;
    }
  }
  return best;
}

interface WaveformCanvasProps {
  signals: SignalInfo[];
  waveforms: Record<string, WaveformData>;
  width: number;
  height: number;
  onContextMenuTarget?: (x: number, y: number, target: WaveMenuTarget) => void;
}

function hitMarker(
  markers: NamedMarker[],
  timeToX: (time: number) => number,
  x: number,
  y: number,
  waveAreaStart: number,
  width: number,
): NamedMarker | null {
  let best: NamedMarker | null = null;
  let bestDist = Infinity;
  for (const marker of markers) {
    const markerX = timeToX(marker.time);
    if (markerX < waveAreaStart - 8 || markerX > width) continue;
    const inRuler = y < RULER_HEIGHT;
    const nameEnd = markerX + 12 + Math.min(marker.name.length, 8) * 5.5;
    const hit = inRuler
      ? x >= markerX - 4 && x <= nameEnd
      : Math.abs(x - markerX) <= 5;
    const dist = Math.abs(x - markerX);
    if (hit && dist < bestDist) {
      best = marker;
      bestDist = dist;
    }
  }
  return best;
}

// Get value at a specific time from waveform data
function getValueAtTime(waveform: WaveformData | undefined, time: number): string {
  if (!waveform || waveform.changes.length === 0) return '-';
  
  let value = waveform.changes[0].value;
  for (const change of waveform.changes) {
    if (change.time > time) break;
    value = change.value;
  }
  return value;
}

// Calculate nice grid intervals based on visible range
function calculateGridInterval(range: number): number {
  const targetTicks = 8;
  const rawInterval = range / targetTicks;
  
  // Round to nice numbers: 1, 2, 5, 10, 20, 50, 100, ...
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  const normalized = rawInterval / magnitude;
  
  let niceInterval: number;
  if (normalized <= 1.5) niceInterval = 1;
  else if (normalized <= 3) niceInterval = 2;
  else if (normalized <= 7) niceInterval = 5;
  else niceInterval = 10;
  
  return niceInterval * magnitude;
}

export function WaveformCanvas({ signals, waveforms, width, height, onContextMenuTarget }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { 
    viewStart, viewEnd, cursorTime, setCursorTime, setViewRange,
    markers, selectedSignal, setSelectedSignal,
    notes, selectedNoteId, setSelectedNote,
    selectedStoryId, setSelectedStory,
    storyPlayback, stopStoryPlayback,
    waveRows, toggleGroupCollapsed, setSelectedDivider, moveWaveRow,
    logTraces, selectedLogEvent, selectLogEvent,
  } = useWaveformStore();

  const playing = storyPlayback?.running ?? false;
  const focusId = playing ? storyPlayback?.focusId ?? null : null;
  const drawnNotes = playing
    ? notes.filter((note) => storyPlayback?.revealedIds.includes(note.id))
    : notes;
  const drawnMarkers = playing
    ? markers.filter((marker) => storyPlayback?.revealedIds.includes(marker.id))
    : markers;

  const logPaths = new Set(logTraces.map((trace) => trace.signalPath));
  const nameWidth = logPaths.size > 0 ? 260 : 150;
  const [logHover, setLogHover] = useState<{ path: string; time: number; text: string } | null>(null);
  const hoverKey = useRef('');
  const waveAreaStart = nameWidth + VALUE_WIDTH;

  useEffect(() => {
    if (!playing || !selectedSignal) return;
    const scroller = canvasRef.current?.parentElement;
    if (!scroller) return;
    let rowTop = RULER_HEIGHT;
    for (const entry of buildLayout(waveRows, signals)) {
      if (entry.kind === 'signal' && entry.signal.path === selectedSignal) {
        const rowBottom = rowTop + SIGNAL_HEIGHT;
        const viewTop = scroller.scrollTop;
        const viewBottom = viewTop + scroller.clientHeight;
        if (rowTop < viewTop || rowBottom > viewBottom) {
          scroller.scrollTop = Math.max(0, rowTop - RULER_HEIGHT);
        }
        return;
      }
      rowTop += entryHeight(entry);
    }
  }, [playing, selectedSignal, waveRows, signals]);

  // Drag selection state (zoom in the waveform area)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragCurrentX, setDragCurrentX] = useState<number | null>(null);

  // Reorder drag in the name column
  const rowDragRef = useRef<{ rowId: string; startY: number; currentY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [rowDropY, setRowDropY] = useState<number | null>(null);

  const timeToX = useCallback((time: number): number => {
    const waveWidth = width - waveAreaStart;
    return waveAreaStart + ((time - viewStart) / (viewEnd - viewStart)) * waveWidth;
  }, [viewStart, viewEnd, width, waveAreaStart]);

  const xToTime = useCallback((x: number): number => {
    const waveWidth = width - waveAreaStart;
    return viewStart + ((x - waveAreaStart) / waveWidth) * (viewEnd - viewStart);
  }, [viewStart, viewEnd, width, waveAreaStart]);

  // Draw waveforms
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, width, height);

    // === Draw Time Ruler ===
    const timeRange = viewEnd - viewStart;
    const gridInterval = calculateGridInterval(timeRange);
    const firstTick = Math.ceil(viewStart / gridInterval) * gridInterval;

    // Ruler background
    ctx.fillStyle = '#252536';
    ctx.fillRect(0, 0, width, RULER_HEIGHT);
    
    // Ruler label area
    ctx.fillStyle = '#c0c0d0';
    ctx.font = '10px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('Time', 8, RULER_HEIGHT / 2);

    // Value column header
    ctx.fillStyle = '#2a2a3d';
    ctx.fillRect(nameWidth, 0, VALUE_WIDTH, RULER_HEIGHT);
    ctx.fillStyle = '#c0c0d0';
    ctx.fillText('Value', nameWidth + 8, RULER_HEIGHT / 2);

    // Separator lines
    ctx.strokeStyle = '#3a3a4d';
    ctx.beginPath();
    ctx.moveTo(nameWidth, 0);
    ctx.lineTo(nameWidth, RULER_HEIGHT);
    ctx.moveTo(waveAreaStart, 0);
    ctx.lineTo(waveAreaStart, RULER_HEIGHT);
    ctx.moveTo(0, RULER_HEIGHT);
    ctx.lineTo(width, RULER_HEIGHT);
    ctx.stroke();

    // Draw time ticks and grid lines
    for (let t = firstTick; t <= viewEnd; t += gridInterval) {
      const x = timeToX(t);
      if (x < waveAreaStart) continue;
      
      // Tick mark
      ctx.strokeStyle = '#6a6a8d';
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT - 6);
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.stroke();

      // Time label
      ctx.fillStyle = '#a0a0c0';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${t}`, x, RULER_HEIGHT - 10);

      // Grid line (lighter, through waveform area)
      ctx.strokeStyle = '#2e2e3e';
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.textAlign = 'left';

    const layout = buildLayout(waveRows, signals);
    let currentY = RULER_HEIGHT;

    for (const entry of layout) {
      if (entry.kind === 'group') {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, currentY, width, GROUP_HEADER_HEIGHT);

        ctx.fillStyle = '#89b4fa';
        ctx.font = '10px monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(entry.collapsed ? '▶' : '▼', 6, currentY + GROUP_HEADER_HEIGHT / 2 + 1);

        ctx.fillStyle = '#89b4fa';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(entry.name, 20, currentY + GROUP_HEADER_HEIGHT / 2 + 1);

        ctx.fillStyle = '#6a6a8d';
        ctx.font = '9px monospace';
        ctx.fillText(`(${entry.signalCount})`, 20 + ctx.measureText(entry.name).width + 8, currentY + GROUP_HEADER_HEIGHT / 2 + 1);

        ctx.strokeStyle = '#3a3a5d';
        ctx.beginPath();
        ctx.moveTo(0, currentY + GROUP_HEADER_HEIGHT);
        ctx.lineTo(width, currentY + GROUP_HEADER_HEIGHT);
        ctx.stroke();

        currentY += GROUP_HEADER_HEIGHT;
        continue;
      }

      if (entry.kind === 'divider') {
        const mid = currentY + DIVIDER_HEIGHT / 2;
        ctx.fillStyle = '#161622';
        ctx.fillRect(0, currentY, width, DIVIDER_HEIGHT);
        ctx.strokeStyle = '#5a5a78';
        ctx.beginPath();
        ctx.moveTo(8, mid);
        ctx.lineTo(width - 8, mid);
        ctx.stroke();
        if (entry.name) {
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const label = ` ${entry.name} `;
          const labelWidth = ctx.measureText(label).width;
          ctx.fillStyle = '#161622';
          ctx.fillRect(nameWidth / 2 - labelWidth / 2, currentY, labelWidth, DIVIDER_HEIGHT);
          ctx.fillStyle = '#c0c0d0';
          ctx.fillText(entry.name, nameWidth / 2, mid);
          ctx.textAlign = 'left';
        }
        currentY += DIVIDER_HEIGHT;
        continue;
      }

      const signal = entry.signal;
      const inGroup = entry.inGroup;
      const y = currentY;
      const waveform = waveforms[signal.path];
      const isSelected = selectedSignal === signal.path;
      const isLog = logPaths.has(signal.path);

      // Draw signal name background (highlight if selected)
      ctx.fillStyle = isSelected ? '#3a3a5d' : '#252536';
      ctx.fillRect(0, y, nameWidth, SIGNAL_HEIGHT);
      
      // Draw selection indicator
      if (isSelected) {
        ctx.fillStyle = isLog ? '#89dceb' : '#a6e3a1';
        ctx.fillRect(0, y, 3, SIGNAL_HEIGHT);
      }

      // Draw signal name (indent if in group)
      ctx.fillStyle = isSelected ? (isLog ? '#89dceb' : '#a6e3a1') : '#c0c0d0';
      ctx.font = isSelected ? 'bold 12px monospace' : '12px monospace';
      ctx.textBaseline = 'middle';
      const indent = inGroup ? 12 : 8;
      let label = signal.name;
      const maxLabel = nameWidth - indent - 6;
      if (ctx.measureText(label).width > maxLabel) {
        while (label.length > 1 && ctx.measureText(`${label}…`).width > maxLabel) label = label.slice(0, -1);
        label = `${label}…`;
      }
      ctx.fillText(label, indent, y + SIGNAL_HEIGHT / 2);

      // Draw value column background
      ctx.fillStyle = isSelected ? '#3a3a5d' : '#2a2a3d';
      ctx.fillRect(nameWidth, y, VALUE_WIDTH, SIGNAL_HEIGHT);

      // Draw value at cursor
      if (cursorTime !== null) {
        const raw = getValueAtTime(waveform, cursorTime);
        const value = isLog ? stripTimePrefix(raw) : raw;
        ctx.fillStyle = isLog ? '#89dceb' : '#f9e2af';
        ctx.font = '11px monospace';
        ctx.save();
        ctx.beginPath();
        ctx.rect(nameWidth + 4, y, VALUE_WIDTH - 8, SIGNAL_HEIGHT);
        ctx.clip();
        ctx.fillText(value, nameWidth + 4, y + SIGNAL_HEIGHT / 2);
        ctx.restore();
      } else {
        ctx.fillStyle = '#6a6a8d';
        ctx.font = '11px monospace';
        ctx.fillText('-', nameWidth + 8, y + SIGNAL_HEIGHT / 2);
      }

      // Draw separator lines
      ctx.strokeStyle = '#3a3a4d';
      ctx.beginPath();
      ctx.moveTo(nameWidth, y);
      ctx.lineTo(nameWidth, y + SIGNAL_HEIGHT);
      ctx.moveTo(waveAreaStart, y);
      ctx.lineTo(waveAreaStart, y + SIGNAL_HEIGHT);
      ctx.stroke();

      // Draw waveform background. A reached note tints its signal row.
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(waveAreaStart, y, width - waveAreaStart, SIGNAL_HEIGHT);
      if (isSelected) {
        ctx.fillStyle = 'rgba(166, 227, 161, 0.14)';
        ctx.fillRect(waveAreaStart, y, width - waveAreaStart, SIGNAL_HEIGHT);
      }

      // Draw waveform data. Log traces are arrows at each timed message.
      if (isLog) {
        const midY = y + SIGNAL_HEIGHT / 2;
        ctx.strokeStyle = '#45456a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(waveAreaStart, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();
        for (const change of waveform?.changes ?? []) {
          const x = timeToX(change.time);
          if (x < waveAreaStart - 2 || x > width + 2) continue;
          const chosen = selectedLogEvent?.signalPath === signal.path && selectedLogEvent.time === change.time;
          const top = y + (chosen ? 2 : 4);
          const bot = y + SIGNAL_HEIGHT - 5;
          ctx.strokeStyle = chosen ? '#f9e2af' : '#89dceb';
          ctx.lineWidth = chosen ? 2.6 : 1.4;
          ctx.beginPath();
          ctx.moveTo(x, bot);
          ctx.lineTo(x, top + 5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x - (chosen ? 5 : 4), top + (chosen ? 7 : 6));
          ctx.lineTo(x, top);
          ctx.lineTo(x + (chosen ? 5 : 4), top + (chosen ? 7 : 6));
          ctx.stroke();
        }
      } else if (waveform && waveform.changes.length > 0) {
        const isBus = signal.width > 1;
        const midY = y + SIGNAL_HEIGHT / 2;
        const highY = y + PADDING;
        const lowY = y + SIGNAL_HEIGHT - PADDING;

        // Helper to check if value is X or Z
        const isX = (v: string) => v.toLowerCase().includes('x');
        const isZ = (v: string) => v.toLowerCase().includes('z');
        
        // Helper to get color for value
        const getColor = (v: string) => {
          if (isX(v)) return '#f38ba8'; // Red for X
          if (isZ(v)) return '#fab387'; // Orange for Z
          return '#a6e3a1'; // Green for valid
        };

        let lastX = waveAreaStart;
        let lastValue = waveform.changes[0]?.value || '0';
        
        // Find initial value before view
        for (const change of waveform.changes) {
          if (timeToX(change.time) >= waveAreaStart) break;
          lastValue = change.value;
        }

        if (isBus) {
          // === Draw Bus (multi-bit) ===
          waveform.changes.forEach((change, i) => {
            const x = timeToX(change.time);
            const nextChange = waveform.changes[i + 1];
            const nextX = nextChange ? Math.min(timeToX(nextChange.time), width) : width;
            
            if (nextX < waveAreaStart) {
              lastValue = change.value;
              return;
            }
            
            const drawX = Math.max(x, waveAreaStart);
            const boxWidth = nextX - drawX;
            
            if (boxWidth < 2) return;

            const color = getColor(change.value);
            
            // Draw bus box
            ctx.strokeStyle = color;
            ctx.fillStyle = isX(change.value) ? 'rgba(243, 139, 168, 0.15)' : 
                            isZ(change.value) ? 'rgba(250, 179, 135, 0.15)' : 
                            'rgba(166, 227, 161, 0.1)';
            ctx.lineWidth = 1;
            
            // Diamond transitions at edges
            ctx.beginPath();
            ctx.moveTo(drawX + 4, midY);
            ctx.lineTo(drawX, highY);
            ctx.lineTo(drawX, lowY);
            ctx.lineTo(drawX + 4, midY);
            ctx.lineTo(nextX - 4, midY);
            ctx.lineTo(nextX, highY);
            ctx.lineTo(nextX, lowY);
            ctx.lineTo(nextX - 4, midY);
            ctx.closePath();
            ctx.fill();
            
            // Top and bottom lines
            ctx.beginPath();
            ctx.moveTo(drawX, highY);
            ctx.lineTo(nextX, highY);
            ctx.moveTo(drawX, lowY);
            ctx.lineTo(nextX, lowY);
            ctx.stroke();
            
            // Draw value text if enough space
            if (boxWidth > 30) {
              ctx.fillStyle = color;
              ctx.font = '10px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const displayVal = isX(change.value) ? 'X' : 
                                isZ(change.value) ? 'Z' : 
                                change.value.toUpperCase();
              ctx.fillText(displayVal.slice(0, Math.floor(boxWidth / 8)), (drawX + nextX) / 2, midY);
              ctx.textAlign = 'left';
            }

            lastValue = change.value;
          });
        } else {
          // === Draw Single-bit Signal ===
          ctx.lineWidth = 1;

          waveform.changes.forEach((change) => {
            const x = timeToX(change.time);
            
            if (x < waveAreaStart) {
              lastValue = change.value;
              lastX = waveAreaStart;
              return;
            }

            const color = getColor(lastValue);
            ctx.strokeStyle = color;
            ctx.beginPath();

            // Get Y positions
            const getYForValue = (v: string) => {
              if (isX(v) || isZ(v)) return midY;
              return v === '0' ? lowY : highY;
            };

            const prevY = getYForValue(lastValue);
            const newY = getYForValue(change.value);

            // Draw horizontal line from last position
            ctx.moveTo(lastX, prevY);
            ctx.lineTo(x, prevY);
            ctx.stroke();

            // Draw X/Z hatching if needed
            if (isX(lastValue)) {
              ctx.fillStyle = 'rgba(243, 139, 168, 0.3)';
              ctx.fillRect(lastX, highY, x - lastX, lowY - highY);
            } else if (isZ(lastValue)) {
              ctx.fillStyle = 'rgba(250, 179, 135, 0.3)';
              ctx.fillRect(lastX, highY, x - lastX, lowY - highY);
            }

            // Draw vertical transition
            ctx.strokeStyle = getColor(change.value);
            ctx.beginPath();
            ctx.moveTo(x, prevY);
            ctx.lineTo(x, newY);
            ctx.stroke();

            lastX = x;
            lastValue = change.value;
          });

          // Draw to end
          const color = getColor(lastValue);
          ctx.strokeStyle = color;
          ctx.beginPath();
          const lastY = isX(lastValue) || isZ(lastValue) ? midY : (lastValue === '0' ? lowY : highY);
          ctx.moveTo(lastX, lastY);
          ctx.lineTo(width, lastY);
          ctx.stroke();

          // Fill X/Z region to end
          if (isX(lastValue)) {
            ctx.fillStyle = 'rgba(243, 139, 168, 0.3)';
            ctx.fillRect(lastX, highY, width - lastX, lowY - highY);
          } else if (isZ(lastValue)) {
            ctx.fillStyle = 'rgba(250, 179, 135, 0.3)';
            ctx.fillRect(lastX, highY, width - lastX, lowY - highY);
          }
        }
      }

      // Draw row separator
      ctx.strokeStyle = '#3a3a4d';
      ctx.beginPath();
      ctx.moveTo(0, y + SIGNAL_HEIGHT);
      ctx.lineTo(width, y + SIGNAL_HEIGHT);
      ctx.stroke();
      
      currentY += SIGNAL_HEIGHT;
    }

    // === Draw Named Markers ===
    drawnMarkers.forEach((marker, idx) => {
      const markerX = timeToX(marker.time);
      if (markerX >= waveAreaStart && markerX <= width) {
        // Marker colors cycle through palette
        const colors = ['#89b4fa', '#f9e2af', '#a6e3a1', '#fab387', '#cba6f7'];
        const color = colors[idx % colors.length];
        const focused = marker.id === focusId;
        const selected = marker.id === selectedStoryId;
        
        ctx.strokeStyle = focused ? '#1e66f5' : selected ? '#ffffff' : color;
        ctx.lineWidth = focused ? 5 : selected ? 4 : 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(markerX, RULER_HEIGHT);
        ctx.lineTo(markerX, height);
        ctx.stroke();
        
        // Draw marker flag in ruler
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(markerX, 2);
        ctx.lineTo(markerX + 8, 6);
        ctx.lineTo(markerX, 10);
        ctx.closePath();
        ctx.fill();
        
        // Draw marker name
        ctx.font = focused ? 'bold 12px monospace' : 'bold 9px monospace';
        ctx.fillText(marker.name.slice(0, focused ? 16 : 8), markerX + 10, focused ? 14 : 8);
      }
    });

    // === Draw Cursor ===
    if (cursorTime !== null) {
      const cursorX = timeToX(cursorTime);
      if (cursorX >= waveAreaStart && cursorX <= width) {
        ctx.strokeStyle = '#f38ba8';
        ctx.lineWidth = playing ? 2 : 1;
        ctx.setLineDash(playing ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(cursorX, RULER_HEIGHT);
        ctx.lineTo(cursorX, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw cursor time in ruler
        ctx.fillStyle = '#f38ba8';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${cursorTime}`, cursorX, RULER_HEIGHT - 10);
        ctx.textAlign = 'left';
      }
    }

    for (const bubble of noteBubbles(drawnNotes, waveRows, signals, timeToX, waveAreaStart, width, focusId)) {
      drawNoteBubble(ctx, bubble, bubble.id === selectedNoteId);
    }

    if (logHover) {
      let rowTop = RULER_HEIGHT;
      for (const entry of buildLayout(waveRows, signals)) {
        if (entry.kind === 'signal' && entry.signal.path === logHover.path) {
          drawNoteBubble(ctx, messageBubble(logHover.text, timeToX(logHover.time), rowTop, width), false);
          break;
        }
        rowTop += entryHeight(entry);
      }
    }

    // === Draw Drag Selection Overlay ===
    if (isDragging && dragStartX !== null && dragCurrentX !== null) {
      const minX = Math.max(waveAreaStart, Math.min(dragStartX, dragCurrentX));
      const maxX = Math.min(width, Math.max(dragStartX, dragCurrentX));
      
      // Draw semi-transparent selection box
      ctx.fillStyle = 'rgba(137, 180, 250, 0.2)';
      ctx.fillRect(minX, RULER_HEIGHT, maxX - minX, height - RULER_HEIGHT);
      
      // Draw dashed border
      ctx.strokeStyle = '#89b4fa';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(minX, RULER_HEIGHT, maxX - minX, height - RULER_HEIGHT);
      ctx.setLineDash([]);
      
      // Draw time labels at selection edges
      const startTime = xToTime(minX);
      const endTime = xToTime(maxX);
      
      ctx.fillStyle = '#89b4fa';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(startTime)}`, minX, RULER_HEIGHT - 2);
      ctx.fillText(`${Math.round(endTime)}`, maxX, RULER_HEIGHT - 2);
      ctx.textAlign = 'left';
    }

    if (rowDropY !== null) {
      const target = dropTarget(buildLayout(waveRows, signals), rowDropY);
      ctx.strokeStyle = '#89b4fa';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, target.y);
      ctx.lineTo(width, target.y);
      ctx.stroke();
    }
  }, [signals, waveforms, width, height, viewStart, viewEnd, cursorTime, timeToX, xToTime, waveAreaStart, drawnMarkers, drawnNotes, focusId, playing, selectedNoteId, selectedStoryId, selectedSignal, waveRows, logTraces, selectedLogEvent, logHover, isDragging, dragStartX, dragCurrentX, rowDropY]);

  // Find nearest edge in a waveform to a given time
  const findNearestEdge = useCallback((waveform: WaveformData | undefined, time: number): number | null => {
    if (!waveform || waveform.changes.length === 0) return null;
    
    let nearestTime = waveform.changes[0].time;
    let minDiff = Math.abs(time - nearestTime);
    
    for (const change of waveform.changes) {
      const diff = Math.abs(time - change.time);
      if (diff < minDiff) {
        minDiff = diff;
        nearestTime = change.time;
      }
    }
    return nearestTime;
  }, []);

  // Get element at Y position (group header or signal)
  const getElementAtY = useCallback((clickY: number):
    | { type: 'group'; id: string }
    | { type: 'divider'; id: string; name: string }
    | { type: 'signal'; id: string; signal: SignalInfo }
    | null => {
    if (clickY < RULER_HEIGHT) return null;

    let currentY = RULER_HEIGHT;
    for (const entry of buildLayout(waveRows, signals)) {
      const rowHeight = entryHeight(entry);
      if (clickY >= currentY && clickY < currentY + rowHeight) {
        if (entry.kind === 'group') return { type: 'group', id: entry.id };
        if (entry.kind === 'divider') return { type: 'divider', id: entry.id, name: entry.name };
        return { type: 'signal', id: entry.id, signal: entry.signal };
      }
      currentY += rowHeight;
    }

    return null;
  }, [signals, waveRows]);

  const finishRowDrag = useCallback((pointerY: number) => {
    const drag = rowDragRef.current;
    rowDragRef.current = null;
    setRowDropY(null);
    if (!drag?.moved) return;
    suppressClickRef.current = true;
    const target = dropTarget(buildLayout(waveRows, signals), pointerY);
    if (target.beforeId === drag.rowId) return;
    moveWaveRow(drag.rowId, target.beforeId);
  }, [moveWaveRow, signals, waveRows]);

  // Handle mouse down - reorder from the name column, or zoom-drag in the waveform area
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    stopStoryPlayback();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const bubbleHit = noteBubbles(drawnNotes, waveRows, signals, timeToX, waveAreaStart, width)
      .find((bubble) => x >= bubble.x && x <= bubble.x + bubble.w && y >= bubble.y && y <= bubble.y + bubble.h);
    if (bubbleHit) {
      setSelectedNote(bubbleHit.id);
      return;
    }

    const markerHit = hitMarker(drawnMarkers, timeToX, x, y, waveAreaStart, width);
    if (markerHit) {
      setSelectedStory(markerHit.id);
      return;
    }

    if (x <= waveAreaStart) {
      const element = getElementAtY(y);
      if (element?.type === 'signal' || element?.type === 'divider') {
        rowDragRef.current = { rowId: element.id, startY: y, currentY: y, moved: false };
        if (element.type === 'signal') setSelectedSignal(element.signal.path);
        else setSelectedDivider(element.id);
        return;
      }
    }
    
    // Only start drag in waveform area
    if (x > waveAreaStart) {
      setIsDragging(true);
      setDragStartX(x);
      setDragCurrentX(x);
    }
  }, [waveAreaStart, getElementAtY, setSelectedSignal, setSelectedDivider, drawnNotes, drawnMarkers, waveRows, signals, timeToX, width, setSelectedNote, setSelectedStory, stopStoryPlayback]);

  // Handle mouse move - update drag selection
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const drag = rowDragRef.current;
    if (drag) {
      drag.currentY = y;
      if (Math.abs(y - drag.startY) > 3) {
        drag.moved = true;
        setRowDropY(y);
      }
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      return;
    }

    if (canvasRef.current && !isDragging) {
      const overBubble = noteBubbles(drawnNotes, waveRows, signals, timeToX, waveAreaStart, width)
        .some((bubble) => x >= bubble.x && x <= bubble.x + bubble.w && y >= bubble.y && y <= bubble.y + bubble.h);
      const overMarker = hitMarker(drawnMarkers, timeToX, x, y, waveAreaStart, width);
      const element = x > waveAreaStart ? getElementAtY(y) : null;
      const signal = element?.type === 'signal' ? element.signal : null;
      const waveform = signal && logPaths.has(signal.path) ? waveforms[signal.path] : undefined;
      const hit = waveform ? nearestChange(waveform.changes, timeToX, x, 10) : null;
      const key = hit && signal ? `${signal.path}@${hit.time}` : '';
      if (hoverKey.current !== key) {
        hoverKey.current = key;
        setLogHover(hit && signal ? { path: signal.path, time: hit.time, text: hit.value } : null);
      }
      canvasRef.current.style.cursor = overBubble || overMarker || hit ? 'pointer' : x <= waveAreaStart ? 'grab' : 'crosshair';
    }

    if (!isDragging) return;
    setDragCurrentX(x);
  }, [isDragging, waveAreaStart, drawnNotes, drawnMarkers, waveRows, signals, timeToX, width, getElementAtY, logPaths, waveforms]);

  // Handle mouse up - apply zoom to selected range, or commit a row reorder
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (rowDragRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      const y = rect ? e.clientY - rect.top : rowDragRef.current.currentY;
      finishRowDrag(y);
      return;
    }

    if (!isDragging || dragStartX === null) {
      setIsDragging(false);
      return;
    }
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      setIsDragging(false);
      return;
    }
    
    const x = e.clientX - rect.left;
    const startTime = xToTime(Math.max(waveAreaStart, Math.min(dragStartX, x)));
    const endTime = xToTime(Math.min(width, Math.max(dragStartX, x)));
    
    // Only zoom if selection is meaningful (more than 10 pixels)
    if (Math.abs(x - dragStartX) > 10) {
      setViewRange(Math.round(startTime), Math.round(endTime));
    }
    
    setIsDragging(false);
    setDragStartX(null);
    setDragCurrentX(null);
  }, [isDragging, dragStartX, xToTime, waveAreaStart, width, setViewRange, finishRowDrag]);

  // Handle click - snap to nearest edge of hovered signal and select it
  const handleClick = useCallback((e: React.MouseEvent) => {
    stopStoryPlayback();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const bubbleHit = noteBubbles(drawnNotes, waveRows, signals, timeToX, waveAreaStart, width)
      .find((bubble) => x >= bubble.x && x <= bubble.x + bubble.w && y >= bubble.y && y <= bubble.y + bubble.h);
    if (bubbleHit) {
      setSelectedNote(bubbleHit.id);
      return;
    }

    const markerHit = hitMarker(drawnMarkers, timeToX, x, y, waveAreaStart, width);
    if (markerHit) {
      setSelectedStory(markerHit.id);
      return;
    }

    const element = getElementAtY(y);
    if (!element) return;
    
    if (element.type === 'group') {
      toggleGroupCollapsed(element.id);
      return;
    }

    if (element.type === 'divider') {
      setSelectedDivider(element.id);
      return;
    }
    
    const signal = element.signal;

    if (logPaths.has(signal.path) && x > waveAreaStart) {
      const waveform = waveforms[signal.path];
      const nearestEdge = findNearestEdge(waveform, xToTime(x));
      const change = waveform?.changes.find((item) => item.time === nearestEdge);
      if (change) {
        selectLogEvent({ signalPath: signal.path, time: change.time, text: change.value });
        return;
      }
    }
    
    // Always select the signal when clicking on its row
    setSelectedSignal(signal.path);
    
    // Only snap to edge if clicking in the waveform area
    if (x > waveAreaStart) {
      const waveform = waveforms[signal.path];
      const clickTime = xToTime(x);
      
      const nearestEdge = findNearestEdge(waveform, clickTime);
      if (nearestEdge !== null) {
        setCursorTime(nearestEdge);
      }
    }
  }, [xToTime, waveAreaStart, waveforms, findNearestEdge, getElementAtY, setCursorTime, setSelectedSignal, selectLogEvent, logPaths, toggleGroupCollapsed, setSelectedDivider, drawnNotes, drawnMarkers, waveRows, signals, timeToX, width, setSelectedNote, setSelectedStory, stopStoryPlayback]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    stopStoryPlayback();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !onContextMenuTarget) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const bubbleHit = noteBubbles(drawnNotes, waveRows, signals, timeToX, waveAreaStart, width)
      .find((bubble) => x >= bubble.x && x <= bubble.x + bubble.w && y >= bubble.y && y <= bubble.y + bubble.h);
    if (bubbleHit) {
      const note = notes.find((item) => item.id === bubbleHit.id);
      setSelectedNote(bubbleHit.id);
      onContextMenuTarget(e.clientX, e.clientY, { kind: 'note', id: bubbleHit.id, text: note?.text ?? '' });
      return;
    }

    const markerHit = hitMarker(drawnMarkers, timeToX, x, y, waveAreaStart, width);
    if (markerHit) {
      setSelectedStory(markerHit.id);
      onContextMenuTarget(e.clientX, e.clientY, { kind: 'marker', id: markerHit.id, text: markerHit.name });
      return;
    }

    const element = getElementAtY(y);
    if (!element) return;
    if (element.type === 'group') {
      const row = waveRows.find((item) => item.id === element.id && item.type === 'group');
      onContextMenuTarget(e.clientX, e.clientY, {
        kind: 'group',
        id: element.id,
        text: row && row.type === 'group' ? row.name : '',
      });
      return;
    }
    if (element.type === 'divider') {
      setSelectedDivider(element.id);
      onContextMenuTarget(e.clientX, e.clientY, { kind: 'divider', id: element.id, text: element.name });
      return;
    }
    setSelectedSignal(element.signal.path);
    onContextMenuTarget(e.clientX, e.clientY, {
      kind: 'signal',
      id: element.signal.path,
      text: element.signal.name,
    });
  }, [onContextMenuTarget, notes, drawnNotes, drawnMarkers, waveRows, signals, timeToX, waveAreaStart, width, getElementAtY, setSelectedNote, setSelectedStory, setSelectedDivider, setSelectedSignal, stopStoryPlayback]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const time = xToTime(x);
    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;

    const newStart = time - (time - viewStart) * zoomFactor;
    const newEnd = time + (viewEnd - time) * zoomFactor;

    setViewRange(Math.max(0, Math.round(newStart)), Math.round(newEnd));
  }, [viewStart, viewEnd, xToTime, setViewRange]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={(event) => {
        if (hoverKey.current) {
          hoverKey.current = '';
          setLogHover(null);
        }
        handleMouseUp(event);
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      className="block cursor-crosshair"
    />
  );
}
