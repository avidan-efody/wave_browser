/**
 * Hierarchy tree component for browsing scopes
 */

import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { hierarchyApi } from '../../api';
import type { ScopeInfo, SignalInfo } from '../../api/types';
import { useWaveformStore } from '../../store';
import { DEMO_HIERARCHY, DEMO_CHILD_SCOPES, DEMO_SCOPE_SIGNALS } from '../../demo/demoData';
import clsx from 'clsx';

interface ScopeNodeProps {
  scope: ScopeInfo;
  sessionId: string;
  level: number;
  isDemoMode: boolean;
  onDoubleClick: (scopePath: string) => void;
  onViewCode?: (scopePath: string) => void;
}

function ScopeNode({ scope, sessionId, level, isDemoMode, onDoubleClick, onViewCode }: ScopeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { selectedScope, setSelectedScope } = useWaveformStore();
  const isSelected = selectedScope === scope.path;

  // Use demo data when in demo mode
  const demoTree = useWaveformStore((state) => state.demoTree);
  const demoChildScopes = isDemoMode
    ? (demoTree?.children[scope.path] ?? DEMO_CHILD_SCOPES[scope.path] ?? [])
    : [];
  
  const { data: childScopes, isLoading: loadingChildren } = useQuery({
    queryKey: ['childScopes', sessionId, scope.path],
    queryFn: () => hierarchyApi.getChildScopes(sessionId, scope.path),
    enabled: !isDemoMode && isExpanded && scope.has_children,
  });

  const actualChildScopes = isDemoMode ? demoChildScopes : (childScopes?.scopes || []);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (scope.has_children) {
      setIsExpanded(!isExpanded);
    }
  }, [scope.has_children, isExpanded]);

  const handleSelect = useCallback(() => {
    setSelectedScope(scope.path);
    onViewCode?.(scope.path);
  }, [scope.path, setSelectedScope, onViewCode]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick(scope.path);
  }, [scope.path, onDoubleClick]);

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-wave-border/50 rounded',
          isSelected && 'bg-wave-accent/20 text-wave-accent'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleSelect}
        onDoubleClick={handleDoubleClick}
      >
        <button
          onClick={handleToggle}
          className="w-4 h-4 flex items-center justify-center"
        >
          {scope.has_children ? (
            isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )
          ) : (
            <span className="w-3" />
          )}
        </button>
        
        {isExpanded ? (
          <FolderOpen className="w-4 h-4 text-wave-accent" />
        ) : (
          <Folder className="w-4 h-4 text-wave-text/70" />
        )}
        
        <span className="text-sm truncate">{scope.name}</span>
        
        {scope.def_name && scope.def_name !== scope.name && (
          <span className="text-xs text-wave-text/50">({scope.def_name})</span>
        )}
      </div>

      {isExpanded && scope.has_children && (
        <div>
          {!isDemoMode && loadingChildren ? (
            <div
              className="text-xs text-wave-text/50 py-1"
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
            >
              Loading...
            </div>
          ) : (
            actualChildScopes.map((child) => (
              <ScopeNode
                key={child.path}
                scope={child}
                sessionId={sessionId}
                level={level + 1}
                isDemoMode={isDemoMode}
                onDoubleClick={onDoubleClick}
                onViewCode={onViewCode}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface HierarchyTreeProps {
  sessionId: string;
  onViewCode?: (path: string) => void;
}

export function HierarchyTree({ sessionId, onViewCode }: HierarchyTreeProps) {
  const { isDemoMode, addSignals, demoTree } = useWaveformStore();
  
  const { data: topScopes, isLoading, error } = useQuery({
    queryKey: ['topScopes', sessionId],
    queryFn: () => hierarchyApi.getTopScopes(sessionId),
    enabled: !isDemoMode && !!sessionId,
  });

  // Use demo hierarchy when in demo mode
  const actualTopScopes = isDemoMode ? (demoTree?.roots ?? DEMO_HIERARCHY) : (topScopes?.scopes || []);

  // Handle double-click on scope: add all signals from that scope to waveform
  const handleScopeDoubleClick = useCallback((scopePath: string) => {
    if (isDemoMode) {
      const scopeSignals = demoTree?.signals[scopePath] ?? DEMO_SCOPE_SIGNALS[scopePath];
      if (scopeSignals) {
        // Strip the signalType property to convert DemoSignalInfo to SignalInfo
        const signals: SignalInfo[] = scopeSignals.map((signal) => {
          if (!('signalType' in signal)) return signal;
          const { signalType, ...rest } = signal;
          void signalType;
          return rest;
        });
        addSignals(signals);
      }
      return;
    }
    hierarchyApi.getSignals(sessionId, scopePath).then((result) => {
      addSignals(result.signals);
    });
  }, [isDemoMode, addSignals, sessionId, demoTree]);

  if (!isDemoMode && isLoading) {
    return (
      <div className="p-4 text-wave-text/50">
        Loading hierarchy...
      </div>
    );
  }

  if (!isDemoMode && error) {
    return (
      <div className="p-4 text-red-400">
        Error loading hierarchy: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="py-2">
      {actualTopScopes.map((scope) => (
        <ScopeNode
          key={scope.path}
          scope={scope}
          sessionId={sessionId}
          level={0}
          isDemoMode={isDemoMode}
          onDoubleClick={handleScopeDoubleClick}
          onViewCode={onViewCode}
        />
      ))}
    </div>
  );
}
