/**
 * Shared pane chrome: draggable splitters and a control that fills the screen.
 */

import { createContext, useContext, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface PaneLayoutValue {
  maximized: string | null;
  toggle: (id: string) => void;
}

const PaneLayoutContext = createContext<PaneLayoutValue | null>(null);

export function PaneLayoutProvider({ children }: { children: ReactNode }) {
  const [maximized, setMaximized] = useState<string | null>(null);
  const toggle = (id: string) => {
    setMaximized((current) => (current === id ? null : id));
  };

  useEffect(() => {
    if (!maximized) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      setMaximized(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized]);

  return (
    <PaneLayoutContext.Provider value={{ maximized, toggle }}>
      {children}
    </PaneLayoutContext.Provider>
  );
}

export function usePaneLayout(): PaneLayoutValue {
  const value = useContext(PaneLayoutContext);
  if (!value) {
    throw new Error('Pane controls must sit inside PaneLayoutProvider');
  }
  return value;
}

export function ExpandPaneButton({ id, label }: { id: string; label: string }) {
  const { maximized, toggle } = usePaneLayout();
  const active = maximized === id;
  const text = active ? `Restore ${label}` : `Expand ${label} to the screen`;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        toggle(id);
      }}
      className="p-1 rounded hover:bg-wave-border text-wave-text/80 shrink-0"
      title={text}
      aria-label={text}
      aria-pressed={active}
    >
      {active ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
    </button>
  );
}

/** Magnifying glass with 100 inside. Fit-to-window is separate from pane expand. */
export function FitAllIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <circle cx="10" cy="10" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M14.9 14.9 L20.2 20.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <text
        x="10"
        y="11.7"
        textAnchor="middle"
        fontSize="5.5"
        fontWeight="700"
        fill="currentColor"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        100
      </text>
    </svg>
  );
}

interface ResizeHandleProps {
  axis: 'x' | 'y';
  label: string;
  size: number;
  min: number;
  getMax: () => number;
  /** 1 grows the pane when the pointer moves down or right. -1 grows it the other way. */
  sign?: 1 | -1;
  onSize: (size: number) => void;
}

export function ResizeHandle({ axis, label, size, min, getMax, sign = 1, onSize }: ResizeHandleProps) {
  const drag = useRef<{ start: number; size: number } | null>(null);
  const horizontal = axis === 'x';

  const end = () => {
    drag.current = null;
    document.body.style.cursor = '';
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    drag.current = { start: horizontal ? event.clientX : event.clientY, size };
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize';
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone, or this event was synthesized. Moves still update the size.
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    const point = horizontal ? event.clientX : event.clientY;
    const next = current.size + sign * (point - current.start);
    const max = Math.max(min, getMax());
    onSize(Math.min(max, Math.max(min, next)));
  };

  return (
    <button
      type="button"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-label={label}
      className={
        horizontal
          ? 'w-1.5 min-w-[6px] self-stretch shrink-0 cursor-col-resize bg-wave-border hover:bg-wave-accent/80 p-0 border-0 touch-none'
          : 'h-1.5 min-h-[6px] w-full shrink-0 cursor-row-resize bg-wave-border hover:bg-wave-accent/80 p-0 border-0 touch-none'
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}
