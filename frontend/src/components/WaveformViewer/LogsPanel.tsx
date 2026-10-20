/**
 * Logs beside the story panel.
 * The file list is the directory of the open waveform. The text pane shows a
 * sample of the selected log, narrowed by the regex as the server reports it.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { filesApi } from '../../api';
import { bundledLogList, waveDirectory, type ListedLog } from '../../logs/bundled';
import { buildLogSignal, loadLogPreview } from '../../logs/query';
import type { LogDone, LogLine } from '../../logs/scan';
import { useWaveformStore } from '../../store';

type Phase = 'idle' | 'scanning' | 'ready' | 'wide' | 'error';

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function sameMessage(lineText: string, eventText: string): boolean {
  return lineText === eventText || lineText.startsWith(eventText) || eventText.startsWith(lineText);
}

function highlight(text: string, pattern: string): ReactNode {
  const trimmed = pattern.trim();
  if (!trimmed) return text;
  let regex: RegExp;
  try {
    regex = new RegExp(trimmed, 'g');
  } catch {
    return text;
  }
  const parts: ReactNode[] = [];
  let last = 0;
  let guard = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) && guard < 40) {
    guard += 1;
    if (match[0] === '') {
      regex.lastIndex += 1;
      continue;
    }
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <mark key={`${match.index}-${guard}`} className="bg-amber-300/40 text-inherit rounded-sm">
        {match[0]}
      </mark>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
}

export function LogsPanel() {
  const {
    currentSession,
    isDemoMode,
    logsExpanded,
    setLogsExpanded,
    logTraces,
    addLogSignal,
    selectedLogEvent,
    selectLogEvent,
    viewStart,
    viewEnd,
    setViewRange,
  } = useWaveformStore();
  const [files, setFiles] = useState<ListedLog[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [pattern, setPattern] = useState('');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [events, setEvents] = useState<LogDone['events']>([]);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);
  const activeRow = useRef<HTMLDivElement | null>(null);

  const timeUnit = currentSession?.time_unit || 'ps';
  const waveDb = currentSession?.wave_db;
  const selected = files.find((file) => file.path === selectedPath) ?? null;

  useEffect(() => {
    seeded.current = false;
    setSelectedPath(null);
    setPattern('');
  }, [currentSession?.id]);

  useEffect(() => {
    if (seeded.current || logTraces.length === 0) return;
    seeded.current = true;
    setPattern(logTraces[0].pattern);
    setSelectedPath(logTraces[0].logPath);
  }, [logTraces]);

  useEffect(() => {
    if (!selectedLogEvent) return;
    const trace = logTraces.find((item) => item.signalPath === selectedLogEvent.signalPath);
    if (!trace) return;
    setSelectedPath(trace.logPath);
    setPattern(trace.pattern);
  }, [selectedLogEvent, logTraces]);

  useEffect(() => {
    let cancelled = false;
    const directory = waveDirectory(waveDb);
    if (isDemoMode || !directory) {
      setFiles(bundledLogList());
      setListError(null);
      return;
    }
    filesApi.list(directory)
      .then((listing) => {
        if (cancelled) return;
        const logs = listing.entries
          .filter((entry) => !entry.is_dir && /\.log$/i.test(entry.name))
          .map((entry) => ({
            name: entry.name,
            path: entry.path,
            size: entry.size ?? 0,
            bundled: false,
          }));
        setFiles(logs);
        setListError(logs.length === 0 ? 'No .log files next to the waveform' : null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setFiles([]);
        setListError(reason instanceof Error ? reason.message : 'Could not list logs');
      });
    return () => {
      cancelled = true;
    };
  }, [waveDb, isDemoMode]);

  useEffect(() => {
    if (selectedPath && files.some((file) => file.path === selectedPath)) return;
    if (files.length > 0) setSelectedPath(files[0].path);
  }, [files, selectedPath]);

  useEffect(() => {
    if (!selected) {
      setLines([]);
      setPhase('idle');
      return;
    }
    const controller = new AbortController();
    const trimmed = pattern;
    const timer = window.setTimeout(() => {
      setPhase(trimmed.trim() ? 'scanning' : 'idle');
      setError(null);
      if (!trimmed.trim()) setEvents([]);
      loadLogPreview(selected, trimmed, timeUnit, {
        signal: controller.signal,
        onPreview: (preview) => {
          if (!controller.signal.aborted) setLines(preview);
        },
      }).then((done) => {
        if (controller.signal.aborted) return;
        if (!done) {
          setPhase('idle');
          setMatchCount(null);
          setEvents([]);
          return;
        }
        setMatchCount(done.match_count);
        setEvents(done.events);
        setPhase(done.too_wide ? 'wide' : 'ready');
      }).catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setPhase('error');
        setEvents([]);
        setError(reason instanceof Error ? reason.message : 'Search failed');
      });
    }, trimmed.trim() ? 280 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selected, pattern, timeUnit]);

  const shownLines = useMemo(() => {
    if (!selectedLogEvent || !selected) return lines;
    const trace = logTraces.find((item) => item.signalPath === selectedLogEvent.signalPath);
    if (!trace || trace.logPath !== selected.path || trace.pattern !== pattern.trim()) return lines;
    const present = lines.some(
      (line) => line.time === selectedLogEvent.time && sameMessage(line.text, selectedLogEvent.text),
    );
    if (present) return lines;
    return [
      { line: 0, time: selectedLogEvent.time, text: selectedLogEvent.text },
      ...lines,
    ];
  }, [lines, selected, selectedLogEvent, logTraces, pattern]);

  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedLogEvent, shownLines]);

  const signalPath = selected && pattern.trim() ? `${selected.name}/${pattern.trim()}` : '';
  const alreadyAdded = signalPath !== '' && logTraces.some((trace) => trace.signalPath === signalPath);
  const canAdd = phase === 'ready' && signalPath !== '' && !alreadyAdded;

  const status = useMemo(() => {
    if (phase === 'scanning') return 'scanning…';
    if (phase === 'wide') return 'match is too wide';
    if (phase === 'error') return error || 'Search failed';
    if (phase === 'ready' && matchCount != null) {
      return `${matchCount} matches`;
    }
    return '';
  }, [phase, matchCount, error]);

  const addToWave = () => {
    if (!selected || !canAdd || !currentSession) return;
    const built = buildLogSignal(
      selected.name,
      selected.path,
      pattern.trim(),
      events,
      timeUnit,
      currentSession.min_time,
      currentSession.max_time,
    );
    addLogSignal(built.trace, built.signal, built.data);
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-wave-panel" data-panel="logs">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-wave-border">
        <span className="text-[11px] uppercase tracking-wide text-wave-text/50 shrink-0">Logs</span>
        <input
          value={pattern}
          onChange={(event) => {
            const next = event.target.value;
            setPattern(next);
            setPhase(next.trim() ? 'scanning' : 'idle');
            setError(null);
          }}
          placeholder="Filter regex"
          spellCheck={false}
          className="flex-1 min-w-0 bg-wave-bg border border-wave-border rounded px-2 py-1 text-xs font-mono"
          aria-label="Log regex filter"
        />
        <button
          type="button"
          onClick={addToWave}
          disabled={!canAdd}
          className="shrink-0 px-2 py-1 text-xs rounded bg-wave-accent text-wave-bg disabled:opacity-40"
          title={alreadyAdded ? 'This log and regex are already on the wave' : 'Add an arrow for each timed match'}
        >
          {alreadyAdded ? 'On wave' : 'Add to wave'}
        </button>
        <span
          className={`shrink-0 text-[11px] max-w-[9rem] truncate ${phase === 'wide' || phase === 'error' ? 'text-amber-300' : 'text-wave-text/50'}`}
          title={status}
        >
          {status}
        </span>
        <button
          type="button"
          onClick={() => setLogsExpanded(!logsExpanded)}
          className="shrink-0 p-1 hover:bg-wave-border rounded"
          title={logsExpanded ? 'Show the wave' : 'Expand logs over the wave'}
        >
          {logsExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-auto font-mono text-[11px] leading-5">
          {shownLines.length === 0 ? (
            <div className="px-3 py-3 text-wave-text/40">
              {selected ? 'No lines to show' : 'Select a log'}
            </div>
          ) : (
            shownLines.map((line) => {
              const chosen = Boolean(
                selectedLogEvent
                && signalPath === selectedLogEvent.signalPath
                && line.time === selectedLogEvent.time
                && sameMessage(line.text, selectedLogEvent.text),
              );
              const onWave = signalPath !== '' && logTraces.some((trace) => trace.signalPath === signalPath);
              return (
                <div
                  key={`${line.line}-${line.time ?? 'x'}`}
                  ref={(node) => {
                    if (chosen) activeRow.current = node;
                  }}
                  onClick={() => {
                    if (line.time == null || !onWave) return;
                    selectLogEvent({
                      signalPath,
                      time: line.time,
                      text: line.text.slice(0, 240),
                    });
                    if (line.time < viewStart || line.time > viewEnd) {
                      const range = Math.max(1, viewEnd - viewStart);
                      setViewRange(Math.round(line.time - range * 0.35), Math.round(line.time + range * 0.65));
                    }
                  }}
                  className={`flex gap-2 px-2 ${
                    chosen ? 'bg-amber-300/25' : 'hover:bg-wave-bg/60'
                  } ${line.time != null && onWave ? 'cursor-pointer' : ''}`}
                >
                  <span className="w-10 shrink-0 text-right text-wave-text/30">{line.line || ''}</span>
                  <span className={`w-16 shrink-0 text-right ${line.time == null ? 'text-wave-text/25' : 'text-sky-300/80'}`}>
                    {line.time == null ? (pattern.trim() ? 'no time' : '') : line.time}
                  </span>
                  <span className="min-w-0 whitespace-pre text-wave-text/90">{highlight(line.text, pattern)}</span>
                </div>
              );
            })
          )}
          {phase === 'ready' && matchCount != null && matchCount > lines.length && (
            <div className="px-3 py-1 text-wave-text/40">Showing the first {lines.length} matches</div>
          )}
        </div>
        <div className="w-44 shrink-0 border-l border-wave-border overflow-auto">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-wave-text/40 border-b border-wave-border">
            Files
          </div>
          {listError && files.length === 0 && (
            <div className="px-2 py-2 text-[11px] text-wave-text/50">{listError}</div>
          )}
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedPath(file.path)}
              className={`w-full text-left px-2 py-1.5 border-b border-wave-border/60 ${
                file.path === selectedPath ? 'bg-wave-accent/15 text-wave-accent' : 'hover:bg-wave-bg'
              }`}
            >
              <div className="text-xs truncate">{file.name}</div>
              <div className="text-[10px] text-wave-text/40">{formatSize(file.size)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
