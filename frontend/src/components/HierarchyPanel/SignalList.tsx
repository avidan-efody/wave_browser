/**
 * Signal list component showing signals in the selected scope
 * Features: search, filter by type, multi-select, add to wave
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Signal, Plus, Search, Filter, ArrowRight, ArrowLeft, ArrowLeftRight, Hash, Check } from 'lucide-react';
import { hierarchyApi } from '../../api';
import type { SignalInfo } from '../../api/types';
import { useWaveformStore } from '../../store';
import { DEMO_SCOPE_SIGNALS, type SignalType, type DemoSignalInfo } from '../../demo/demoData';
import clsx from 'clsx';

// Filter types
type FilterType = 'all' | 'input' | 'output' | 'inout' | 'internal' | 'parameter';

const FILTER_OPTIONS: { value: FilterType; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: <Filter className="w-3 h-3" /> },
  { value: 'input', label: 'Inputs', icon: <ArrowRight className="w-3 h-3" /> },
  { value: 'output', label: 'Outputs', icon: <ArrowLeft className="w-3 h-3" /> },
  { value: 'inout', label: 'InOut', icon: <ArrowLeftRight className="w-3 h-3" /> },
  { value: 'internal', label: 'Internal', icon: <Signal className="w-3 h-3" /> },
  { value: 'parameter', label: 'Params', icon: <Hash className="w-3 h-3" /> },
];

interface SignalItemProps {
  signal: DemoSignalInfo | SignalInfo;
  isDisplayed: boolean;
  isSelected: boolean;
  onSelect: (signal: DemoSignalInfo | SignalInfo, ctrlKey: boolean, shiftKey: boolean) => void;
}

function SignalItem({ signal, isDisplayed, isSelected, onSelect }: SignalItemProps) {
  const signalType: SignalType = 'signalType' in signal ? signal.signalType : (signal.direction === 'none' ? 'internal' : signal.direction as SignalType);
  
  const typeColors: Record<SignalType, string> = {
    input: 'text-green-400',
    output: 'text-red-400',
    inout: 'text-yellow-400',
    internal: 'text-blue-400',
    parameter: 'text-purple-400',
  };

  const typeIcons: Record<SignalType, React.ReactNode> = {
    input: <ArrowRight className={clsx('w-3 h-3', typeColors.input)} />,
    output: <ArrowLeft className={clsx('w-3 h-3', typeColors.output)} />,
    inout: <ArrowLeftRight className={clsx('w-3 h-3', typeColors.inout)} />,
    internal: <Signal className={clsx('w-3 h-3', typeColors.internal)} />,
    parameter: <Hash className={clsx('w-3 h-3', typeColors.parameter)} />,
  };

  const handleClick = (e: React.MouseEvent) => {
    onSelect(signal, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 hover:bg-wave-border/50 rounded cursor-pointer group',
        isSelected && 'bg-wave-accent/30 border-l-2 border-wave-accent',
        isDisplayed && !isSelected && 'bg-wave-accent/10'
      )}
      onClick={handleClick}
    >
      {/* Selection checkbox */}
      <div className={clsx(
        'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
        isSelected ? 'bg-wave-accent border-wave-accent' : 'border-wave-border'
      )}>
        {isSelected && <Check className="w-3 h-3 text-wave-bg" />}
      </div>
      
      {/* Signal type icon */}
      {typeIcons[signalType]}
      
      {/* Signal name */}
      <span className="text-sm flex-1 truncate">{signal.name}</span>
      
      {/* Width indicator */}
      {signal.width > 1 && (
        <span className="text-xs text-wave-text/50">
          [{signal.left_range}:{signal.right_range}]
        </span>
      )}
      
      {/* Already displayed indicator */}
      {isDisplayed && (
        <span className="text-xs text-wave-accent/70 px-1 rounded bg-wave-accent/10">
          in wave
        </span>
      )}
    </div>
  );
}

interface SignalListProps {
  sessionId: string;
  onViewCode?: (signalPath: string) => void;
}

export function SignalList({ sessionId, onViewCode }: SignalListProps) {
  const { selectedScope, displayedSignals, addSignals, isDemoMode, demoTree } = useWaveformStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedSignals, setSelectedSignals] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Fetch signals (for non-demo mode)
  const { data: apiSignals, isLoading, error } = useQuery({
    queryKey: ['signals', sessionId, selectedScope],
    queryFn: () => hierarchyApi.getSignals(sessionId, selectedScope!),
    enabled: !isDemoMode && !!sessionId && !!selectedScope,
  });

  // Get signals based on mode
  const allSignals: (DemoSignalInfo | SignalInfo)[] = useMemo(() => {
    if (isDemoMode && selectedScope) {
      return demoTree?.signals[selectedScope] ?? DEMO_SCOPE_SIGNALS[selectedScope] ?? [];
    }
    return apiSignals?.signals || [];
  }, [isDemoMode, selectedScope, apiSignals?.signals, demoTree]);

  // Filter and search signals
  const filteredSignals = useMemo(() => {
    return allSignals.filter(signal => {
      // Search filter
      if (searchQuery && !signal.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      // Type filter
      if (activeFilter !== 'all') {
        const signalType: SignalType = 'signalType' in signal 
          ? signal.signalType 
          : (signal.direction === 'none' ? 'internal' : signal.direction as SignalType);
        
        if (signalType !== activeFilter) {
          return false;
        }
      }
      
      return true;
    });
  }, [allSignals, searchQuery, activeFilter]);

  // Track displayed signal paths
  const displayedPaths = useMemo(() => 
    new Set(displayedSignals.map(s => s.path)), 
    [displayedSignals]
  );

  // Handle signal selection
  const handleSignalSelect = useCallback((signal: DemoSignalInfo | SignalInfo, ctrlKey: boolean, shiftKey: boolean) => {
    const signalIndex = filteredSignals.findIndex(s => s.path === signal.path);
    
    setSelectedSignals(prev => {
      const newSelected = new Set(prev);
      
      if (shiftKey && lastSelectedIndex !== null) {
        // Shift-click: select range
        const start = Math.min(lastSelectedIndex, signalIndex);
        const end = Math.max(lastSelectedIndex, signalIndex);
        for (let i = start; i <= end; i++) {
          newSelected.add(filteredSignals[i].path);
        }
      } else if (ctrlKey) {
        // Ctrl-click: toggle selection
        if (newSelected.has(signal.path)) {
          newSelected.delete(signal.path);
        } else {
          newSelected.add(signal.path);
        }
      } else {
        // Regular click: single select
        newSelected.clear();
        newSelected.add(signal.path);
        // Trigger code view for single selection
        onViewCode?.(signal.path);
      }
      
      return newSelected;
    });
    
    setLastSelectedIndex(signalIndex);
  }, [filteredSignals, lastSelectedIndex, onViewCode]);

  // Handle add to wave
  const handleAddToWave = useCallback(() => {
    const signalsToAdd = filteredSignals
      .filter(s => selectedSignals.has(s.path))
      .map(s => {
        // Remove signalType if present to convert to SignalInfo
        if ('signalType' in s) {
          const { signalType, ...rest } = s;
          return rest;
        }
        return s;
      });
    
    if (signalsToAdd.length > 0) {
      addSignals(signalsToAdd);
      setSelectedSignals(new Set());
    }
  }, [filteredSignals, selectedSignals, addSignals]);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (selectedSignals.size === filteredSignals.length) {
      setSelectedSignals(new Set());
    } else {
      setSelectedSignals(new Set(filteredSignals.map(s => s.path)));
    }
  }, [filteredSignals, selectedSignals.size]);

  if (!selectedScope) {
    return (
      <div className="p-4 text-wave-text/50 text-sm">
        Select a scope to view signals
      </div>
    );
  }

  if (!isDemoMode && isLoading) {
    return (
      <div className="p-4 text-wave-text/50 text-sm">
        Loading signals...
      </div>
    );
  }

  if (!isDemoMode && error) {
    return (
      <div className="p-4 text-red-400 text-sm">
        Error: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search box */}
      <div className="p-2 border-b border-wave-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-wave-text/50" />
          <input
            type="text"
            placeholder="Search signals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1 bg-wave-bg border border-wave-border rounded text-xs text-wave-text placeholder:text-wave-text/40 focus:outline-none focus:border-wave-accent"
          />
        </div>
      </div>

      {/* Filter buttons */}
      <div className="px-2 py-1 border-b border-wave-border flex flex-wrap gap-1">
        {FILTER_OPTIONS.map(filter => (
          <button
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            className={clsx(
              'px-2 py-0.5 text-xs rounded flex items-center gap-1 transition-colors',
              activeFilter === filter.value
                ? 'bg-wave-accent text-wave-bg'
                : 'bg-wave-border/50 text-wave-text/70 hover:bg-wave-border'
            )}
          >
            {filter.icon}
            {filter.label}
          </button>
        ))}
      </div>

      {/* Selection toolbar */}
      <div className="px-2 py-1 border-b border-wave-border flex items-center gap-2 text-xs">
        <button
          onClick={handleSelectAll}
          className="text-wave-text/70 hover:text-wave-accent"
        >
          {selectedSignals.size === filteredSignals.length && filteredSignals.length > 0 ? 'Deselect All' : 'Select All'}
        </button>
        <span className="text-wave-text/50">|</span>
        <span className="text-wave-text/50">
          {selectedSignals.size} selected / {filteredSignals.length} signals
        </span>
        {selectedSignals.size > 0 && (
          <>
            <span className="flex-1" />
            <button
              onClick={handleAddToWave}
              className="px-2 py-0.5 bg-wave-accent text-wave-bg rounded flex items-center gap-1 hover:bg-wave-accent/80"
            >
              <Plus className="w-3 h-3" />
              Add to Wave
            </button>
          </>
        )}
      </div>

      {/* Scope path */}
      <div className="px-3 py-1 text-xs text-wave-text/50 font-medium border-b border-wave-border/50 bg-wave-bg/30">
        {selectedScope}
      </div>

      {/* Signal list */}
      <div className="flex-1 overflow-auto py-1">
        {filteredSignals.length === 0 ? (
          <div className="px-3 py-2 text-wave-text/50 text-sm">
            {allSignals.length === 0 ? 'No signals in this scope' : 'No signals match filter'}
          </div>
        ) : (
          filteredSignals.map((signal) => (
            <SignalItem
              key={signal.path}
              signal={signal}
              isDisplayed={displayedPaths.has(signal.path)}
              isSelected={selectedSignals.has(signal.path)}
              onSelect={handleSignalSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
