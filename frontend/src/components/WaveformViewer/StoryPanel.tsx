/**
 * Causality list of markers and notes. Parent links stay in the viewer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Circle, MessageSquare, Pause, Play } from 'lucide-react';
import { canParentStory, useWaveformStore, type NamedMarker, type WaveNote } from '../../store';
import type { WaveMenuTarget } from './WaveContextMenu';
import { DisplayCapture } from './displayCapture';

interface StoryItem {
  id: string;
  kind: 'marker' | 'note';
  time: number;
  label: string;
  detail: string;
  parentId: string | null;
}

interface StoryNode {
  item: StoryItem;
  children: StoryNode[];
}

function storyItems(markers: NamedMarker[], notes: WaveNote[]): StoryItem[] {
  return [
    ...markers.map((marker) => ({
      id: marker.id,
      kind: 'marker' as const,
      time: marker.time,
      label: marker.name,
      detail: '',
      parentId: marker.parentId ?? null,
    })),
    ...notes.map((note) => ({
      id: note.id,
      kind: 'note' as const,
      time: note.time,
      label: note.text,
      detail: note.signalPath.split('.').pop() ?? note.signalPath,
      parentId: note.parentId ?? null,
    })),
  ];
}

function buildForest(items: StoryItem[]): StoryNode[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string, StoryItem[]>();
  const roots: StoryItem[] = [];

  const parentIdOf = (item: StoryItem): string | null => {
    if (!item.parentId) return null;
    const seen = new Set<string>([item.id]);
    let parent = byId.get(item.parentId);
    while (parent) {
      if (seen.has(parent.id) || parent.time >= item.time) return null;
      seen.add(parent.id);
      if (!parent.parentId) return item.parentId;
      parent = byId.get(parent.parentId);
    }
    return byId.has(item.parentId) ? item.parentId : null;
  };

  for (const item of items) {
    const parentId = parentIdOf(item);
    if (!parentId) {
      roots.push(item);
      continue;
    }
    const list = children.get(parentId) ?? [];
    list.push(item);
    children.set(parentId, list);
  }

  const byTime = (a: StoryItem, b: StoryItem) => a.time - b.time || a.label.localeCompare(b.label);
  const toNode = (item: StoryItem): StoryNode => ({
    item,
    children: (children.get(item.id) ?? []).sort(byTime).map(toNode),
  });
  return roots.sort(byTime).map(toNode);
}

function formatTime(time: number): string {
  return Number.isInteger(time) ? String(time) : String(Math.round(time * 1000) / 1000);
}

const HOLD_MS = 1000;

function travelMs(count: number): number {
  if (count <= 1) return 500;
  return (500 * count) / (count - 1);
}

function flattenForest(nodes: StoryNode[]): StoryItem[] {
  const out: StoryItem[] = [];
  const walk = (node: StoryNode) => {
    out.push(node.item);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

interface PlaybackFrame {
  revealed: string[];
  focusId: string | null;
  cursor: number;
  done: boolean;
}

/** Hold 1s on each event. The remaining 0.5s per event is the travel between them. */
function playbackFrame(elapsed: number, sequence: StoryItem[]): PlaybackFrame {
  const count = sequence.length;
  if (count === 0) return { revealed: [], focusId: null, cursor: 0, done: true };
  const travel = travelMs(count);
  if (elapsed < 0) {
    return { revealed: [], focusId: null, cursor: sequence[0].time, done: false };
  }
  let remaining = elapsed;
  const revealed: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const item = sequence[index];
    if (remaining < HOLD_MS) {
      revealed.push(item.id);
      return { revealed, focusId: item.id, cursor: item.time, done: false };
    }
    remaining -= HOLD_MS;
    revealed.push(item.id);
    const next = sequence[index + 1];
    if (!next) {
      if (count === 1 && remaining < travel) {
        return { revealed, focusId: item.id, cursor: item.time, done: false };
      }
      return { revealed, focusId: item.id, cursor: item.time, done: true };
    }
    if (remaining < travel) {
      const fraction = remaining / travel;
      return {
        revealed,
        focusId: null,
        cursor: item.time + (next.time - item.time) * fraction,
        done: false,
      };
    }
    remaining -= travel;
  }
  const last = sequence[count - 1];
  return {
    revealed: sequence.map((item) => item.id),
    focusId: last.id,
    cursor: last.time,
    done: true,
  };
}

interface PlayClock {
  token: number;
  paused: boolean;
  origin: number;
  pauseStarted: number | null;
  sequence: StoryItem[];
  timer: number;
  revealedKey: string;
}

interface StoryPanelProps {
  onContextMenu: (x: number, y: number, target: WaveMenuTarget) => void;
}

export function StoryPanel({ onContextMenu }: StoryPanelProps) {
  const {
    markers,
    notes,
    selectedStoryId,
    setSelectedStory,
    setStoryParent,
    storyPlayback,
    storyPlayToken,
    viewStart,
    viewEnd,
    setViewRange,
  } = useWaveformStore();
  const dragIdRef = useRef<string | null>(null);
  const playRef = useRef<PlayClock | null>(null);
  const captureRef = useRef(new DisplayCapture());
  const recordStatusRef = useRef<'idle' | 'armed' | 'recording' | 'ready'>('idle');
  const endingRef = useRef(false);
  const [recordStatus, setRecordStatus] = useState(recordStatusRef.current);
  const [recordError, setRecordError] = useState<string | null>(null);

  const setRecord = (status: typeof recordStatusRef.current) => {
    recordStatusRef.current = status;
    setRecordStatus(status);
  };

  const endRecording = async () => {
    if (recordStatusRef.current !== 'recording' || endingRef.current) return;
    endingRef.current = true;
    try {
      const blob = await captureRef.current.stop();
      setRecord(blob && blob.size > 0 ? 'ready' : 'idle');
      if (!blob || blob.size === 0) setRecordError('Recording was empty');
    } catch (error) {
      setRecord('idle');
      setRecordError(error instanceof Error ? error.message : 'Recording failed');
    } finally {
      endingRef.current = false;
    }
  };

  const items = useMemo(() => storyItems(markers, notes), [markers, notes]);
  const forest = useMemo(() => buildForest(items), [items]);
  const focusId = storyPlayback?.running ? storyPlayback.focusId : null;

  useEffect(() => {
    const id = focusId || selectedStoryId;
    if (!id) return;
    document.getElementById(`story-${id}`)?.scrollIntoView({ block: 'nearest' });
  }, [focusId, selectedStoryId]);

  useEffect(() => {
    const play = playRef.current;
    if (play && play.token !== storyPlayToken) {
      window.clearTimeout(play.timer);
      playRef.current = null;
      void endRecording();
    }
  }, [storyPlayToken]);

  useEffect(() => {
    return () => {
      const play = playRef.current;
      if (play) {
        window.clearTimeout(play.timer);
        playRef.current = null;
        useWaveformStore.setState((state) => (
          state.storyPlayToken === play.token
            ? { storyPlayback: null, storyPlayToken: state.storyPlayToken + 1 }
            : {}
        ));
      }
      if (recordStatusRef.current === 'recording') void endRecording();
    };
  }, [forest]);

  const follow = (time: number) => {
    const state = useWaveformStore.getState();
    if (time >= state.viewStart && time <= state.viewEnd) return;
    const span = Math.max(state.viewEnd - state.viewStart, 1);
    state.setViewRange(
      Math.max(0, Math.round(time - span * 0.35)),
      Math.round(time + span * 0.65),
    );
  };

  const tick = () => {
    const play = playRef.current;
    if (!play || play.paused) return;
    const state = useWaveformStore.getState();
    if (state.storyPlayToken !== play.token) {
      playRef.current = null;
      return;
    }
    const frame = playbackFrame(performance.now() - play.origin, play.sequence);
    const cursor = Math.round(frame.cursor);
    if (state.cursorTime !== cursor) state.setCursorTime(cursor);
    follow(frame.cursor);
    const key = `${frame.revealed.join('\0')}|${frame.focusId ?? ''}`;
    if (key !== play.revealedKey) {
      play.revealedKey = key;
      const note = state.notes.find((item) => item.id === frame.focusId);
      useWaveformStore.setState({
        storyPlayback: frame.done ? null : {
          running: true,
          paused: false,
          revealedIds: frame.revealed,
          focusId: frame.focusId,
        },
        selectedStoryId: frame.focusId,
        selectedNoteId: note ? frame.focusId : null,
        selectedSignal: note ? note.signalPath : null,
        selectedDividerId: null,
      });
    }
    if (frame.done) {
      playRef.current = null;
      useWaveformStore.setState({ storyPlayback: null });
      void endRecording();
      return;
    }
    play.timer = window.setTimeout(tick, 16);
  };

  const startFromBeginning = () => {
    const sequence = flattenForest(forest);
    if (sequence.length === 0) return;
    if (playRef.current) window.clearTimeout(playRef.current.timer);
    const token = useWaveformStore.getState().storyPlayToken + 1;
    const clock: PlayClock = {
      token,
      paused: false,
      origin: performance.now(),
      pauseStarted: null,
      sequence,
      timer: 0,
      revealedKey: '',
    };
    playRef.current = clock;
    useWaveformStore.setState({
      storyPlayToken: token,
      storyPlayback: { running: true, paused: false, revealedIds: [], focusId: null },
      selectedStoryId: null,
      selectedNoteId: null,
      selectedSignal: null,
      selectedDividerId: null,
      cursorTime: sequence[0].time,
    });
    follow(sequence[0].time);
    clock.timer = window.setTimeout(() => {
      if (playRef.current !== clock) return;
      clock.origin = performance.now();
      tick();
    }, 32);
  };

  const pause = () => {
    const play = playRef.current;
    if (!play || play.paused) return;
    play.paused = true;
    play.pauseStarted = performance.now();
    window.clearTimeout(play.timer);
    const current = useWaveformStore.getState().storyPlayback;
    if (current) {
      useWaveformStore.setState({ storyPlayback: { ...current, paused: true } });
    }
  };

  const onPlay = async () => {
    const play = playRef.current;
    if (play?.paused) {
      play.origin += performance.now() - (play.pauseStarted ?? performance.now());
      play.paused = false;
      play.pauseStarted = null;
      const current = useWaveformStore.getState().storyPlayback;
      if (current) {
        useWaveformStore.setState({ storyPlayback: { ...current, paused: false } });
      }
      play.timer = window.setTimeout(tick, 16);
      return;
    }
    if (recordStatusRef.current === 'armed') {
      const element = document.querySelector('[data-capture="wave-display"]');
      if (!(element instanceof HTMLElement)) {
        setRecord('idle');
        setRecordError('Display is not ready');
      } else {
        try {
          await captureRef.current.start(element);
          setRecord('recording');
          setRecordError(null);
        } catch (error) {
          setRecord('idle');
          const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError');
          const message = error instanceof Error ? error.message : '';
          setRecordError(
            denied
              ? 'Share this tab to record the display'
              : /not supported/i.test(message)
                ? 'This browser cannot record the tab. Open Wave Browser in Chrome and share this tab.'
                : (message || 'Could not record'),
          );
        }
      }
    } else {
      setRecordError(null);
    }
    startFromBeginning();
  };

  const onRecord = () => {
    setRecordError(null);
    if (recordStatusRef.current === 'recording') {
      void endRecording();
      return;
    }
    if (recordStatusRef.current === 'armed') {
      setRecord('idle');
      return;
    }
    if (recordStatusRef.current === 'ready') captureRef.current.discard();
    setRecord('armed');
  };

  const onSaveRecording = async () => {
    try {
      const result = await captureRef.current.save('wave-story.mp4');
      if (result === 'saved') setRecord('idle');
      if (result === 'empty') {
        setRecord('idle');
        setRecordError('Recording was empty');
      }
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : 'Could not save the recording');
    }
  };

  const reveal = (time: number) => {
    if (time >= viewStart && time <= viewEnd) return;
    const span = Math.max(viewEnd - viewStart, 1);
    setViewRange(Math.max(0, Math.round(time - span * 0.35)), Math.round(time + span * 0.65));
  };

  const renderNode = (node: StoryNode, depth: number) => {
    const { item } = node;
    const playing = storyPlayback?.running ?? false;
    const focused = playing && storyPlayback?.focusId === item.id;
    const revealed = !playing || (storyPlayback?.revealedIds.includes(item.id) ?? false);
    const selected = !focused && item.id === selectedStoryId;
    return (
      <div key={item.id}>
        <div
          id={`story-${item.id}`}
          role="button"
          tabIndex={0}
          aria-label={`${item.kind} ${item.label}`}
          data-story-id={item.id}
          data-story-kind={item.kind}
          draggable
          onDragStart={(event) => {
            dragIdRef.current = item.id;
            event.dataTransfer.setData('text/plain', item.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={(event) => {
            dragIdRef.current = null;
            event.currentTarget.classList.remove('ring-1', 'ring-wave-accent');
          }}
          onDragOver={(event) => {
            event.stopPropagation();
            const childId = dragIdRef.current;
            if (!childId || !canParentStory(items, childId, item.id)) {
              event.dataTransfer.dropEffect = 'none';
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            event.currentTarget.classList.add('ring-1', 'ring-wave-accent');
          }}
          onDragLeave={(event) => {
            event.currentTarget.classList.remove('ring-1', 'ring-wave-accent');
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.classList.remove('ring-1', 'ring-wave-accent');
            const childId = dragIdRef.current;
            if (childId && canParentStory(items, childId, item.id)) setStoryParent(childId, item.id);
            dragIdRef.current = null;
          }}
          onClick={() => {
            useWaveformStore.getState().stopStoryPlayback();
            setSelectedStory(item.id);
            reveal(item.time);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedStory(item.id);
            onContextMenu(event.clientX, event.clientY, {
              kind: item.kind,
              id: item.id,
              text: item.label,
            });
          }}
          className={`flex items-center gap-2 px-2 py-0.5 rounded cursor-pointer ${
            focused
              ? 'bg-wave-accent/35 text-wave-accent ring-1 ring-wave-accent font-semibold text-sm'
              : revealed
                ? `text-xs ${selected ? 'bg-wave-accent/20 text-wave-accent' : 'hover:bg-wave-border'}`
                : 'text-xs opacity-35'
          }`}
          style={{ marginLeft: depth * 16 }}
          title={depth > 0 ? 'Caused by the event above' : 'Drag onto an earlier event to nest it'}
        >
          {item.kind === 'marker' ? (
            <Bookmark className="w-3 h-3 flex-shrink-0" />
          ) : (
            <MessageSquare className="w-3 h-3 flex-shrink-0" />
          )}
          <span className="font-mono text-wave-text/50 w-16 flex-shrink-0">{formatTime(item.time)}</span>
          <span className="truncate">{item.label || '(blank)'}</span>
          {item.detail && <span className="text-wave-text/40 truncate">{item.detail}</span>}
        </div>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="h-64 shrink-0 border-t border-wave-border bg-wave-panel flex flex-col" data-panel="story">
      <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-wave-text/50 border-b border-wave-border flex items-center justify-between">
        <span>Story</span>
        <span className="normal-case tracking-normal">Drag a later event onto an earlier one</span>
      </div>
      <div className="flex-1 overflow-auto px-1 py-1">
        {forest.length === 0 ? (
          <div className="px-2 py-3 text-xs text-wave-text/40">Markers and notes appear here in time order.</div>
        ) : (
          forest.map((node) => renderNode(node, 0))
        )}
        <div
          data-story-drop="root"
          onDragOver={(event) => {
            if (!dragIdRef.current) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            event.currentTarget.classList.add('border-wave-accent', 'text-wave-accent');
          }}
          onDragLeave={(event) => {
            event.currentTarget.classList.remove('border-wave-accent', 'text-wave-accent');
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.currentTarget.classList.remove('border-wave-accent', 'text-wave-accent');
            if (dragIdRef.current) setStoryParent(dragIdRef.current, null);
            dragIdRef.current = null;
          }}
          className="mx-2 mt-1 px-2 py-1 text-xs rounded border border-dashed border-wave-border text-wave-text/40"
        >
          Drop here to make a root
        </div>
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5 border-t border-wave-border">
        <button
          type="button"
          data-story-action="play"
          disabled={forest.length === 0}
          onClick={onPlay}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-wave-accent/20 text-wave-accent hover:bg-wave-accent/30 disabled:opacity-40"
        >
          <Play className="w-3 h-3" /> Play
        </button>
        <button
          type="button"
          data-story-action="pause"
          disabled={!storyPlayback?.running || storyPlayback.paused}
          onClick={pause}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-wave-border disabled:opacity-40"
        >
          <Pause className="w-3 h-3" /> Pause
        </button>
        <button
          type="button"
          data-story-action="record"
          onClick={onRecord}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-wave-border ${
            recordStatus === 'armed' || recordStatus === 'recording' ? 'text-red-400' : ''
          }`}
          title={
            recordStatus === 'recording'
              ? 'Stop and keep the recording'
              : 'Record the wave display the next time Play runs, then save an MP4'
          }
        >
          <Circle className={`w-3 h-3 ${recordStatus === 'armed' || recordStatus === 'recording' ? 'fill-red-400' : ''}`} />
          {recordStatus === 'recording' ? 'Stop' : 'Record'}
        </button>
        {recordStatus === 'ready' && (
          <button
            type="button"
            data-story-action="save-recording"
            onClick={() => { void onSaveRecording(); }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-wave-accent/20 text-wave-accent hover:bg-wave-accent/30"
            title="Save the recorded display as an MP4 video"
          >
            Save
          </button>
        )}
        {recordError && (
          <span className="text-xs text-red-400 truncate" title={recordError}>{recordError}</span>
        )}
      </div>
    </div>
  );
}
