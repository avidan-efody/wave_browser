/**
 * LogPanel Component
 * 
 * Displays log messages from connection and loading operations.
 * Shows at the bottom of the main window.
 */

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Terminal, Trash2 } from 'lucide-react';
import { ExpandPaneButton, ResizeHandle, usePaneLayout } from './layout/Panes';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: string;
}

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
  isLoading?: boolean;
}

export function LogPanel({ logs, onClear, isLoading }: LogPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [height, setHeight] = useState(150);
  const logEndRef = useRef<HTMLDivElement>(null);
  const { maximized } = usePaneLayout();
  const full = maximized === 'output';

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logEndRef.current && isExpanded) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  // Auto-expand when loading starts
  useEffect(() => {
    if (isLoading) {
      setIsExpanded(true);
    }
  }, [isLoading]);

  const getLevelColor = (level: LogEntry['level']): string => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'success': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const getLevelIcon = (level: LogEntry['level']): string => {
    switch (level) {
      case 'error': return '✗';
      case 'warn': return '⚠';
      case 'success': return '✓';
      default: return '›';
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const header = (
    <div
      className="flex items-center justify-between px-3 py-1.5 bg-gray-800 cursor-pointer hover:bg-gray-750"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center gap-2">
        <Terminal className={`w-4 h-4 ${logs.length === 0 && !isLoading ? 'text-gray-500' : 'text-wave-accent'}`} />
        <span className={`text-sm ${logs.length === 0 && !isLoading ? 'text-gray-500' : 'font-medium'}`}>Output</span>
        {isLoading && (
          <span className="text-xs text-blue-400 animate-pulse">● Loading...</span>
        )}
        {!isLoading && logs.length > 0 && (
          <span className="text-xs text-gray-500">({logs.length} messages)</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <ExpandPaneButton id="output" label="output" />
        {logs.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="p-1 hover:bg-gray-700 rounded"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
          </button>
        )}
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        )}
      </div>
    </div>
  );

  const showBody = full || (isExpanded && (logs.length > 0 || isLoading));

  return (
    <div className={full ? 'fixed inset-0 z-40 flex flex-col bg-gray-900' : 'border-t border-wave-border bg-wave-panel flex flex-col'}>
      {showBody && !full && (
        <ResizeHandle
          axis="y"
          label="Resize output"
          size={height}
          min={72}
          getMax={() => Math.max(120, window.innerHeight - 200)}
          sign={-1}
          onSize={setHeight}
        />
      )}
      {header}
      {showBody && (
        <div
          className="overflow-auto font-mono text-xs bg-gray-900"
          style={full ? { flex: 1 } : { height: `${height}px` }}
        >
          <div className="p-2 space-y-0.5">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-gray-600 flex-shrink-0">
                  [{formatTime(log.timestamp)}]
                </span>
                <span className={`flex-shrink-0 ${getLevelColor(log.level)}`}>
                  {getLevelIcon(log.level)}
                </span>
                <span className="text-gray-300 break-all">
                  {log.message}
                  {log.details && (
                    <span className="text-gray-500 ml-2">{log.details}</span>
                  )}
                </span>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2 animate-pulse">
                <span className="text-gray-600 flex-shrink-0">
                  [{formatTime(new Date())}]
                </span>
                <span className="text-blue-400 flex-shrink-0">●</span>
                <span className="text-gray-500">Waiting for response...</span>
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
