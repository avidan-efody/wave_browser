/**
 * Right-click menu for wave rows and story events.
 */

import { useEffect, useRef, useState } from 'react';
import { useWaveformStore } from '../../store';

export interface WaveMenuTarget {
  kind: 'signal' | 'divider' | 'group' | 'marker' | 'note';
  id: string;
  text: string;
}

interface WaveContextMenuProps {
  x: number;
  y: number;
  target: WaveMenuTarget;
  onClose: () => void;
}

export function WaveContextMenu({ x, y, target, onClose }: WaveContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(target.text);
  const { removeSignal, removeWaveRow, removeMarker, removeNote, updateMarker, updateNote, renameWaveRow } = useWaveformStore();

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [onClose]);

  const canRename = target.kind !== 'signal';
  const renameLabel = target.kind === 'note' ? 'Change text' : 'Rename';
  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 120);

  const commitRename = () => {
    const next = draft.trim();
    if (target.kind !== 'divider' && !next) return;
    if (target.kind === 'marker') updateMarker(target.id, { name: next });
    else if (target.kind === 'note') updateNote(target.id, next);
    else renameWaveRow(target.id, next);
    onClose();
  };

  const deleteTarget = () => {
    if (target.kind === 'signal') removeSignal(target.id);
    else if (target.kind === 'marker') removeMarker(target.id);
    else if (target.kind === 'note') removeNote(target.id);
    else removeWaveRow(target.id);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      data-menu="wave-context"
      className="fixed z-50 min-w-[11rem] rounded border border-wave-border bg-wave-panel shadow-lg py-1"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {canRename && (
        renaming ? (
          <form
            className="px-2 py-1"
            onSubmit={(event) => {
              event.preventDefault();
              commitRename();
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename();
                }
                if (event.key === 'Escape') onClose();
              }}
              className="w-full px-2 py-1 text-xs bg-wave-bg border border-wave-border rounded focus:outline-none focus:border-wave-accent"
            />
          </form>
        ) : (
          <button
            type="button"
            data-menu-action="rename"
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-wave-border"
            onClick={() => setRenaming(true)}
          >
            {renameLabel}
          </button>
        )
      )}
      <button
        type="button"
        data-menu-action="delete"
        className="w-full text-left px-3 py-1.5 text-xs text-red-300 hover:bg-wave-border"
        onClick={deleteTarget}
      >
        Delete
      </button>
    </div>
  );
}
