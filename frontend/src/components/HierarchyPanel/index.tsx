/**
 * Main hierarchy panel component
 */

import { useState } from 'react';
import { HierarchyTree } from './HierarchyTree';
import { SignalList } from './SignalList';
import { ScopeKindMenu } from './ScopeKindMenu';
import { DEFAULT_HIERARCHY_KINDS, type HierarchyKinds } from './hierarchyKinds';
import { useWaveformStore } from '../../store';

interface HierarchyPanelProps {
  onViewCode?: (path: string) => void;
}

export function HierarchyPanel({ onViewCode }: HierarchyPanelProps) {
  const { currentSession } = useWaveformStore();
  const [kinds, setKinds] = useState<HierarchyKinds>(DEFAULT_HIERARCHY_KINDS);

  if (!currentSession) {
    return (
      <div className="h-full flex items-center justify-center text-wave-text/50">
        No session open
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-wave-panel">
      {/* Hierarchy tree */}
      <div className="h-1/3 min-h-[120px] overflow-auto border-b border-wave-border">
        <div className="text-xs font-medium text-wave-text/70 px-3 py-2 border-b border-wave-border bg-wave-bg/50 sticky top-0 z-20 flex items-center justify-between gap-2">
          <span>HIERARCHY</span>
          <ScopeKindMenu kinds={kinds} onChange={setKinds} />
        </div>
        <HierarchyTree sessionId={currentSession.id} kinds={kinds} onViewCode={onViewCode} />
      </div>

      {/* Signal list */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="text-xs font-medium text-wave-text/70 px-3 py-2 border-b border-wave-border bg-wave-bg/50">
          SIGNALS
        </div>
        <div className="flex-1 overflow-hidden">
          <SignalList sessionId={currentSession.id} onViewCode={onViewCode} />
        </div>
      </div>
    </div>
  );
}
