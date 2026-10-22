/**
 * Main hierarchy panel component
 */

import { useRef, useState } from 'react';
import { HierarchyTree } from './HierarchyTree';
import { SignalList } from './SignalList';
import { ScopeKindMenu } from './ScopeKindMenu';
import { DEFAULT_HIERARCHY_KINDS, type HierarchyKinds } from './hierarchyKinds';
import { ExpandPaneButton, ResizeHandle, usePaneLayout } from '../layout/Panes';
import { useWaveformStore } from '../../store';

interface HierarchyPanelProps {
  onViewCode?: (path: string) => void;
}

export function HierarchyPanel({ onViewCode }: HierarchyPanelProps) {
  const { currentSession } = useWaveformStore();
  const [kinds, setKinds] = useState<HierarchyKinds>(DEFAULT_HIERARCHY_KINDS);
  const [treeHeight, setTreeHeight] = useState(220);
  const columnRef = useRef<HTMLDivElement>(null);
  const { maximized } = usePaneLayout();
  const treeFull = maximized === 'hierarchy';
  const signalsFull = maximized === 'signals';

  if (!currentSession) {
    return (
      <div className="h-full flex items-center justify-center text-wave-text/50">
        No session open
      </div>
    );
  }

  return (
    <div ref={columnRef} className="h-full flex flex-col bg-wave-panel border-r border-wave-border">
      <div
        className={treeFull ? 'fixed inset-0 z-40 flex flex-col bg-wave-bg' : 'overflow-auto'}
        style={treeFull ? undefined : { height: treeHeight }}
      >
        <div className="text-xs font-medium text-wave-text/70 px-3 py-2 border-b border-wave-border bg-wave-bg/50 sticky top-0 z-20 flex items-center justify-between gap-2">
          <span>HIERARCHY</span>
          <div className="flex items-center gap-1">
            <ScopeKindMenu kinds={kinds} onChange={setKinds} />
            <ExpandPaneButton id="hierarchy" label="hierarchy" />
          </div>
        </div>
        <HierarchyTree sessionId={currentSession.id} kinds={kinds} onViewCode={onViewCode} />
      </div>

      {!treeFull && !signalsFull && (
        <ResizeHandle
          axis="y"
          label="Resize hierarchy tree"
          size={treeHeight}
          min={96}
          getMax={() => Math.max(140, (columnRef.current?.clientHeight ?? 480) - 120)}
          onSize={setTreeHeight}
        />
      )}

      <div className={signalsFull ? 'fixed inset-0 z-40 flex flex-col bg-wave-bg' : 'flex-1 min-h-0 overflow-hidden flex flex-col'}>
        <div className="text-xs font-medium text-wave-text/70 px-3 py-2 border-b border-wave-border bg-wave-bg/50 flex items-center justify-between">
          <span>SIGNALS</span>
          <ExpandPaneButton id="signals" label="signals" />
        </div>
        <div className="flex-1 overflow-hidden">
          <SignalList sessionId={currentSession.id} onViewCode={onViewCode} />
        </div>
      </div>
    </div>
  );
}
