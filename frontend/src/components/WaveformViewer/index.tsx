/**
 * Main waveform viewer component
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight, Bookmark, Search, Save, Minus, FolderPlus, Download, MessageSquare } from 'lucide-react';
import { WaveformCanvas } from './WaveformCanvas';
import { StoryPanel } from './StoryPanel';
import { WaveContextMenu, type WaveMenuTarget } from './WaveContextMenu';
import { sessionsApi, waveformApi } from '../../api';
import { useWaveformStore } from '../../store';
import { buildLayout, layoutHeight } from '../../rc/layout';
import { formatSignalRc } from '../../rc/signalRc';
import { setRcSearchParam } from '../../hooks/useUrlParams';

export function WaveformViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [searchValue, setSearchValue] = useState('');
  const [showMarkerInput, setShowMarkerInput] = useState(false);
  const [newMarkerName, setNewMarkerName] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showDividerInput, setShowDividerInput] = useState(false);
  const [newDividerName, setNewDividerName] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: WaveMenuTarget } | null>(null);
  
  const {
    currentSession,
    displayedSignals,
    removeSignal,
    waveformData,
    setWaveformData,
    viewStart,
    viewEnd,
    setViewRange,
    cursorTime,
    setCursorTime,
    isDemoMode,
    markers,
    addMarker,
    notes,
    addNote,
    removeNote,
    removeMarker,
    selectedNoteId,
    selectedStoryId,
    selectedSignal,
    waveRows,
    insertGroup,
    insertDivider,
    selectedDividerId,
    removeWaveRow,
  } = useWaveformStore();

  const calculateCanvasHeight = useCallback(() => {
    return layoutHeight(buildLayout(waveRows, displayedSignals));
  }, [displayedSignals, waveRows]);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: calculateCanvasHeight(),
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [displayedSignals.length, waveRows, calculateCanvasHeight]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (selectedNoteId) {
        event.preventDefault();
        removeNote(selectedNoteId);
        return;
      }
      if (selectedStoryId && markers.some((marker) => marker.id === selectedStoryId)) {
        event.preventDefault();
        removeMarker(selectedStoryId);
        return;
      }
      if (selectedSignal) {
        event.preventDefault();
        removeSignal(selectedSignal);
        return;
      }
      if (selectedDividerId) {
        event.preventDefault();
        removeWaveRow(selectedDividerId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedSignal, selectedDividerId, selectedNoteId, selectedStoryId, markers, removeSignal, removeWaveRow, removeNote, removeMarker]);

  // Fetch waveform data for displayed signals (skip in demo mode)
  const signalsToFetch = displayedSignals.filter(s => !waveformData[s.path]);
  
  useQuery({
    queryKey: ['waveformBatch', currentSession?.id, signalsToFetch.map(s => s.path), viewStart, viewEnd],
    queryFn: async () => {
      if (!currentSession || signalsToFetch.length === 0) return null;
      
      const result = await waveformApi.getWaveformsBatch(currentSession.id, {
        signal_paths: signalsToFetch.map(s => s.path),
        start_time: viewStart,
        end_time: viewEnd,
      });
      
      Object.entries(result.waveforms).forEach(([path, data]) => {
        setWaveformData(path, data);
      });
      
      return result;
    },
    enabled: !!currentSession && signalsToFetch.length > 0 && !isDemoMode,
  });

  const handleZoomIn = () => {
    const center = (viewStart + viewEnd) / 2;
    const range = (viewEnd - viewStart) / 2;
    setViewRange(
      Math.round(center - range * 0.5),
      Math.round(center + range * 0.5)
    );
  };

  const handleZoomOut = () => {
    const center = (viewStart + viewEnd) / 2;
    const range = (viewEnd - viewStart) / 2;
    setViewRange(
      Math.max(0, Math.round(center - range * 2)),
      Math.round(center + range * 2)
    );
  };

  const handleFitAll = () => {
    if (currentSession) {
      setViewRange(currentSession.min_time, currentSession.max_time);
    }
  };

  // Search for value in selected signal or all signals
  const searchForValue = useCallback((direction: 'forward' | 'backward') => {
    if (!searchValue.trim()) return;
    
    const targetSignal = selectedSignal 
      ? displayedSignals.find(s => s.path === selectedSignal)
      : displayedSignals[0];
    
    if (!targetSignal) return;
    
    const waveform = waveformData[targetSignal.path];
    if (!waveform) return;
    
    const searchPattern = searchValue.toLowerCase().trim();
    const currentTime = cursorTime ?? viewStart;
    
    // Match function supporting *, x, z wildcards
    const matches = (value: string) => {
      const v = value.toLowerCase();
      if (searchPattern === '*') return true;
      if (searchPattern === 'x') return v.includes('x');
      if (searchPattern === 'z') return v.includes('z');
      return v === searchPattern || v.includes(searchPattern);
    };
    
    const changes = [...waveform.changes].sort((a, b) => a.time - b.time);
    
    if (direction === 'forward') {
      for (const change of changes) {
        if (change.time > currentTime && matches(change.value)) {
          setCursorTime(change.time);
          // Auto-scroll if needed
          if (change.time > viewEnd || change.time < viewStart) {
            const range = viewEnd - viewStart;
            setViewRange(change.time - range * 0.2, change.time + range * 0.8);
          }
          return;
        }
      }
    } else {
      for (let i = changes.length - 1; i >= 0; i--) {
        if (changes[i].time < currentTime && matches(changes[i].value)) {
          setCursorTime(changes[i].time);
          if (changes[i].time > viewEnd || changes[i].time < viewStart) {
            const range = viewEnd - viewStart;
            setViewRange(changes[i].time - range * 0.8, changes[i].time + range * 0.2);
          }
          return;
        }
      }
    }
  }, [searchValue, selectedSignal, displayedSignals, waveformData, cursorTime, viewStart, viewEnd, setCursorTime, setViewRange]);

  const handleAddMarker = () => {
    if (cursorTime !== null && newMarkerName.trim()) {
      addMarker(newMarkerName.trim(), cursorTime);
      setNewMarkerName('');
      setShowMarkerInput(false);
    }
  };

  const handleAddNote = () => {
    if (cursorTime !== null && selectedSignal && newNoteText.trim()) {
      addNote(newNoteText.trim(), cursorTime, selectedSignal);
      setNewNoteText('');
      setShowNoteInput(false);
    }
  };

  const handleAddGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    insertGroup(name);
    setNewGroupName('');
    setShowGroupInput(false);
  };

  const handleAddDivider = () => {
    insertDivider(newDividerName.trim() || ' ');
    setNewDividerName('');
    setShowDividerInput(false);
  };

  const waveFile = currentSession?.wave_db
    || new URLSearchParams(window.location.search).get('vcd')
    || new URLSearchParams(window.location.search).get('fsdb')
    || null;
  const waveKind = waveFile?.toLowerCase().endsWith('.vcd') ? 'VCD' : 'FSDB';

  const rcText = () => formatSignalRc({
    rows: waveRows,
    signals: displayedSignals,
    markers,
    notes,
    cursorTime,
    timeUnit: currentSession?.time_unit || 'ps',
  });

  const canSaveBesideWave = !isDemoMode && !!currentSession;

  const handleSaveBesideWave = async () => {
    if (!canSaveBesideWave) return;
    setShowSaveMenu(false);
    try {
      const saved = await sessionsApi.saveSignalRc(currentSession.id, rcText());
      setRcSearchParam(saved.path);
      setSaveStatus(`Saved ${saved.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      setSaveStatus(message);
    }
  };

  const handleDownloadRc = () => {
    setShowSaveMenu(false);
    const stem = waveFile
      ? waveFile.replace(/^.*[/\\]/, '').replace(/\.[^./\\]+$/, '')
      : 'signals';
    const filename = stem.toLowerCase().endsWith('.rc') ? stem : `${stem}.rc`;
    const blob = new Blob([rcText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSaveStatus('Downloaded');
  };

  const selectedDivider = waveRows.find(
    (row): row is Extract<typeof row, { type: 'divider' }> => row.type === 'divider' && row.id === selectedDividerId,
  );

  if (!currentSession) {
    return (
      <div className="h-full flex items-center justify-center text-wave-text/50 bg-wave-bg">
        Open a session to view waveforms
      </div>
    );
  }

  return (
    <div ref={containerRef} data-capture="wave-display" className="h-full flex flex-col bg-wave-bg">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-wave-border bg-wave-panel">
        {/* Zoom controls */}
        <button
          onClick={handleZoomIn}
          className="p-1.5 hover:bg-wave-border rounded"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1.5 hover:bg-wave-border rounded"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleFitAll}
          className="p-1.5 hover:bg-wave-border rounded"
          title="Fit All"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-wave-border mx-1" />

        {/* Value search */}
        <div className="flex items-center gap-1">
          <Search className="w-3.5 h-3.5 text-wave-text/50" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search value..."
            className="w-20 px-2 py-1 text-xs bg-wave-bg border border-wave-border rounded focus:outline-none focus:border-wave-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') searchForValue('forward');
            }}
          />
          <button
            onClick={() => searchForValue('backward')}
            className="p-1 hover:bg-wave-border rounded"
            title="Find Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => searchForValue('forward')}
            className="p-1 hover:bg-wave-border rounded"
            title="Find Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-5 bg-wave-border mx-1" />

        {/* Marker controls */}
        {showMarkerInput ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newMarkerName}
              onChange={(e) => setNewMarkerName(e.target.value)}
              placeholder="Marker name..."
              className="w-24 px-2 py-1 text-xs bg-wave-bg border border-wave-border rounded focus:outline-none focus:border-wave-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddMarker();
                if (e.key === 'Escape') setShowMarkerInput(false);
              }}
              autoFocus
            />
            <button
              onClick={handleAddMarker}
              className="px-2 py-1 text-xs bg-wave-accent text-wave-bg rounded hover:bg-wave-accent/80"
              disabled={!newMarkerName.trim() || cursorTime === null}
            >
              Add
            </button>
            <button
              onClick={() => setShowMarkerInput(false)}
              className="p-1 hover:bg-wave-border rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowMarkerInput(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-wave-border rounded"
            title="Add Marker at Cursor"
            disabled={cursorTime === null}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Add Marker</span>
          </button>
        )}

        {markers.length > 0 && (
          <span className="text-xs text-wave-text/50">
            ({markers.length} marker{markers.length > 1 ? 's' : ''})
          </span>
        )}

        {showNoteInput ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Note..."
              className="w-28 px-2 py-1 text-xs bg-wave-bg border border-wave-border rounded focus:outline-none focus:border-wave-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddNote();
                if (e.key === 'Escape') setShowNoteInput(false);
              }}
              autoFocus
            />
            <button
              onClick={handleAddNote}
              className="px-2 py-1 text-xs bg-wave-accent text-wave-bg rounded hover:bg-wave-accent/80"
              disabled={!newNoteText.trim() || cursorTime === null || !selectedSignal}
            >
              Add
            </button>
            <button
              onClick={() => setShowNoteInput(false)}
              className="p-1 hover:bg-wave-border rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNoteInput(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-wave-border rounded"
            title="Add a note on the selected signal at the cursor"
            disabled={cursorTime === null || !selectedSignal}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Add Note</span>
          </button>
        )}

        <div className="w-px h-5 bg-wave-border mx-1" />

        {showGroupInput ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name..."
              className="w-24 px-2 py-1 text-xs bg-wave-bg border border-wave-border rounded focus:outline-none focus:border-wave-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddGroup();
                if (e.key === 'Escape') setShowGroupInput(false);
              }}
              autoFocus
            />
            <button
              onClick={handleAddGroup}
              className="px-2 py-1 text-xs bg-wave-accent text-wave-bg rounded hover:bg-wave-accent/80"
              disabled={!newGroupName.trim()}
            >
              Add
            </button>
            <button
              onClick={() => setShowGroupInput(false)}
              className="p-1 hover:bg-wave-border rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShowDividerInput(false); setShowGroupInput(true); }}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-wave-border rounded"
            title="Insert a group before the selected signal"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Group</span>
          </button>
        )}

        {showDividerInput ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newDividerName}
              onChange={(e) => setNewDividerName(e.target.value)}
              placeholder="Divider label..."
              className="w-24 px-2 py-1 text-xs bg-wave-bg border border-wave-border rounded focus:outline-none focus:border-wave-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddDivider();
                if (e.key === 'Escape') setShowDividerInput(false);
              }}
              autoFocus
            />
            <button
              onClick={handleAddDivider}
              className="px-2 py-1 text-xs bg-wave-accent text-wave-bg rounded hover:bg-wave-accent/80"
            >
              Add
            </button>
            <button
              onClick={() => setShowDividerInput(false)}
              className="p-1 hover:bg-wave-border rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShowGroupInput(false); setShowDividerInput(true); }}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-wave-border rounded"
            title="Insert a divider after the selected signal"
          >
            <Minus className="w-3.5 h-3.5" />
            <span>Divider</span>
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowSaveMenu((open) => !open)}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-wave-border rounded"
            title="Save the displayed signals as a signal.rc file"
            disabled={waveRows.length === 0 && displayedSignals.length === 0}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save RC</span>
          </button>
          {showSaveMenu && (
            <div className="absolute left-0 top-full mt-1 z-20 min-w-[11rem] rounded border border-wave-border bg-wave-panel shadow-lg py-1">
              <button
                onClick={handleSaveBesideWave}
                disabled={!canSaveBesideWave}
                className="w-full text-left px-3 py-1.5 text-xs text-wave-accent hover:bg-wave-border disabled:opacity-40 disabled:hover:bg-transparent"
                title={canSaveBesideWave ? `Write signal.rc next to the open ${waveKind}` : 'No waveform file is open'}
              >
                Save next to {waveKind}
              </button>
              <button
                onClick={handleDownloadRc}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-wave-border"
                title="Download the RC file to this computer"
              >
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3 h-3" />
                  Download
                </span>
              </button>
            </div>
          )}
        </div>
        {saveStatus && (
          <span className="text-xs text-wave-text/50 max-w-[16rem] truncate" title={saveStatus}>
            {saveStatus}
          </span>
        )}
        
        <div className="flex-1" />
        
        <div className="text-xs text-wave-text/70">
          Time: {viewStart} - {viewEnd} {currentSession.time_unit}
        </div>
        
        {cursorTime !== null && (
          <div className="text-xs text-wave-signal-0">
            Cursor: {cursorTime} {currentSession.time_unit}
          </div>
        )}
      </div>

      {/* Waveform display */}
      <div className="flex-1 overflow-auto">
        {displayedSignals.length === 0 && waveRows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-wave-text/50">
            Add signals from the hierarchy panel
          </div>
        ) : (
          <WaveformCanvas
            signals={displayedSignals}
            waveforms={waveformData}
            width={dimensions.width}
            height={dimensions.height}
            onContextMenuTarget={(x, y, target) => setContextMenu({ x, y, target })}
          />
        )}
      </div>

      <StoryPanel onContextMenu={(x, y, target) => setContextMenu({ x, y, target })} />

      {contextMenu && (
        <WaveContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          target={contextMenu.target}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Status bar - shows selected signal full path */}
      <div className="border-t border-wave-border bg-wave-panel px-4 py-1.5 flex items-center justify-between">
        <div className="text-xs text-wave-text/70">
          {selectedDivider ? (
            <span className="flex items-center gap-2">
              <span className="text-wave-accent">Divider:</span>{' '}
              <span className="font-mono">{selectedDivider.name || '(blank)'}</span>
              <button
                onClick={() => removeWaveRow(selectedDivider.id)}
                className="p-0.5 hover:bg-wave-border rounded"
                title="Remove divider"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ) : selectedSignal ? (
            <span>
              <span className="text-wave-accent">Selected:</span>{' '}
              <span className="font-mono">{selectedSignal}</span>
            </span>
          ) : (
            <span>Drag a name to reorder. Right-click a row to delete or rename.</span>
          )}
        </div>
        {displayedSignals.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {displayedSignals.map((signal) => (
              <div
                key={signal.path}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer transition-colors ${
                  selectedSignal === signal.path 
                    ? 'bg-wave-accent/20 text-wave-accent border border-wave-accent/30' 
                    : 'bg-wave-bg hover:bg-wave-border'
                }`}
                onClick={() => useWaveformStore.getState().setSelectedSignal(signal.path)}
              >
                <span>{signal.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSignal(signal.path); }}
                  className="p-0.5 hover:bg-wave-border rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
