/**
 * Main application component
 * 
 * Supports URL parameters for direct connection:
 *   ?server=host:port     - Connect to backend at host:port
 *   ?server=host:port&fsdb=/path/to/file.fsdb - Connect and open an FSDB
 *   ?server=host:port&vcd=/path/to/file.vcd&design=/path/to/hierarchy.tree.json&rc_file=/path/to/waves.rc
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FolderOpen, Database, Play, Wifi, WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import { HierarchyPanel } from './components/HierarchyPanel';
import { WaveformViewer } from './components/WaveformViewer';
import { SessionDialog } from './components/SessionDialog';
import { OpenDialog } from './components/OpenDialog';
import { LogPanel, LogEntry } from './components/LogPanel';
import { CodePanel } from './components/CodePanel';
import { useWaveformStore } from './store';
import { setBackendUrl, sessionsApi, filesApi, examplesApi, type WaveExample } from './api';
import { applySignalRc } from './rc/applySignalRc';
import { loadBundledStory } from './demo/loadBundledStory';
import { applyStoryLinks } from './rc/applyStory';
import { useUrlParams, buildConnectionUrl, clearConnectionUrl, useCodePanel } from './hooks';

// Version for debugging - update when making changes
const APP_VERSION = 'v0.5.0-dev';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      refetchOnWindowFocus: false,
    },
  },
});

interface ServerConnection {
  host: string;
  port: number;
  backendUrl: string;
}

function AppContent() {
  const { currentSession, isDemoMode, demoTree, loadDemoMode, setCurrentSession } = useWaveformStore();
  const urlParams = useUrlParams();
  const codePanel = useCodePanel();
  
  const [connection, setConnection] = useState<ServerConnection | null>(null);
  const connectionRef = useRef<ServerConnection | null>(null);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [examples, setExamples] = useState<WaveExample[]>([]);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(null);

  // Add a log entry
  const addLog = useCallback((level: LogEntry['level'], message: string, details?: string) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      message,
      details,
    };
    setLogs(prev => [...prev, entry]);
  }, []);

  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Connect to server
  const connectToServer = useCallback(async (host: string, port: number) => {
    const backendUrl = `http://${host}:${port}`;
    setBackendUrl(backendUrl);
    const next = { host, port, backendUrl };
    connectionRef.current = next;
    setConnection(next);
    setConnectionError(null);
    addLog('info', `Connecting to ${host}:${port}...`);

    // Verify connection with health check
    try {
      const response = await fetch(`${backendUrl}/health`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      addLog('success', `Connected to backend at ${host}:${port}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setConnectionError(message);
      addLog('error', `Failed to connect: ${message}`);
      return false;
    }
  }, [addLog]);

  // Open a database file. designPath/storyPath null clears that URL argument.
  const openDatabase = useCallback(async (
    fsdbPath: string,
    rcPath: string | null = null,
    designPath?: string | null,
    storyPath?: string | null,
  ) => {
    const active = connectionRef.current;
    if (!active) {
      addLog('error', 'Not connected to a server');
      return;
    }

    setIsLoading(true);
    addLog('info', `Opening database: ${fsdbPath}`);

    const design = designPath === undefined ? (urlParams.design || undefined) : (designPath || undefined);
    const story = storyPath || null;

    try {
      const vendor = fsdbPath.toLowerCase().endsWith('.vcd') || (design || '').toLowerCase().endsWith('.json')
        ? 'verilator'
        : 'verdi';
      const response = await sessionsApi.create({
        vendor,
        wave_db: fsdbPath,
        design_db: design,
      });
      
      addLog('success', 'Session created successfully');
      addLog('info', `Time range: ${response.session.min_time} - ${response.session.max_time} ${response.session.time_unit}`);
      
      setCurrentSession(response.session);

      if (rcPath) {
        addLog('info', `Loading RC file: ${rcPath}`);
        try {
          const file = await filesApi.getContent(rcPath);
          const applied = await applySignalRc(response.session.id, response.session.time_unit, file.content);
          addLog(
            'success',
            `RC applied: ${applied.signalCount} signals, ${applied.groupCount} groups, ${applied.dividerCount} dividers, ${applied.markerCount} markers, ${applied.noteCount} notes`,
          );
          if (applied.missing.length > 0) {
            addLog('warn', `RC signals not in the design: ${applied.missing.join(', ')}`);
          }
        } catch (rcError) {
          const rcMsg = rcError instanceof Error ? rcError.message : 'Unknown error';
          addLog('error', 'Failed to load RC file', rcMsg);
        }
      }

      if (story) {
        try {
          const file = await filesApi.getContent(story);
          const parsed = JSON.parse(file.content) as { links?: { child: string; parent: string }[] };
          const linked = applyStoryLinks(parsed.links ?? []);
          addLog('success', `Story linked: ${linked} causes`);
        } catch (storyError) {
          const storyMsg = storyError instanceof Error ? storyError.message : 'Unknown error';
          addLog('error', 'Failed to load story', storyMsg);
        }
      }
      
      const newUrl = buildConnectionUrl(active.host, active.port, fsdbPath, design, rcPath, story);
      window.history.replaceState({}, '', newUrl);
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', 'Failed to open database', errorMsg);
      setShowSessionDialog(true);
    } finally {
      setIsLoading(false);
    }
  }, [addLog, setCurrentSession, urlParams.design]);

  const openNamedExample = useCallback(async (example: WaveExample) => {
    setActiveExampleId(example.id);
    await openDatabase(example.wave, example.rc, example.design, example.story ?? null);
  }, [openDatabase]);

  const openBundledStory = useCallback(() => {
    connectionRef.current = null;
    setConnection(null);
    setConnectionError(null);
    loadBundledStory();
    addLog('info', 'Opened the bundled FIFO story');
  }, [addLog]);

  // Handle URL params on mount. With no wave file, open the FIFO story.
  useEffect(() => {
    const initFromUrl = async () => {
      // GitHub Pages is a static site. Do not probe localhost or show the old demo.
      if (!urlParams.host && window.location.hostname.endsWith('github.io')) {
        openBundledStory();
        return;
      }
      const host = urlParams.host || '127.0.0.1';
      const port = urlParams.port || 8000;
      const connected = await connectToServer(host, port);
      if (!connected) {
        if (!urlParams.host) openBundledStory();
        return;
      }

      let catalog: WaveExample[] = [];
      try {
        const listed = await examplesApi.list();
        catalog = listed.examples;
        setExamples(listed.examples);
        if (!urlParams.fsdb) {
          const chosen = listed.examples.find((item) => item.id === listed.default) ?? listed.examples[0];
          if (chosen) {
            setActiveExampleId(chosen.id);
            await openDatabase(chosen.wave, chosen.rc, chosen.design, chosen.story ?? null);
            return;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        addLog('warn', 'Could not list examples', message);
      }

      if (urlParams.fsdb) {
        const match = catalog.find((item) => item.wave === urlParams.fsdb);
        setActiveExampleId(match?.id ?? null);
        await openDatabase(urlParams.fsdb, urlParams.rc, urlParams.design, urlParams.story);
      }
    };

    initFromUrl();
  }, []); // Only run on mount. openBundledStory is stable enough for this one-shot start.

  // Handle disconnect
  const handleDisconnect = () => {
    connectionRef.current = null;
    setConnection(null);
    setCurrentSession(null);
    setConnectionError(null);
    clearConnectionUrl();
    openBundledStory();
    addLog('info', 'Disconnected from server');
  };

  // Handle retry connection
  const handleRetryConnection = () => {
    if (urlParams.host && urlParams.port) {
      connectToServer(urlParams.host, urlParams.port).then(connected => {
        if (connected && urlParams.fsdb) {
          openDatabase(urlParams.fsdb, urlParams.rc, urlParams.design, urlParams.story);
        }
      });
    }
  };

  // Handle open from dialog
  const handleOpenFromDialog = (fsdbPath: string) => {
    setShowOpenDialog(false);
    openDatabase(fsdbPath);
  };

  return (
    <div className="h-screen flex flex-col bg-wave-bg text-wave-text">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-wave-border bg-wave-panel">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-wave-accent">Wave Browser</h1>
          <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded font-mono">{APP_VERSION}</span>
          
          {/* Connection status */}
          {!connection && isDemoMode && (
            <span className={`text-xs px-2 py-1 rounded border ${
              demoTree
                ? 'text-wave-accent bg-wave-accent/15 border-wave-accent/30'
                : 'text-yellow-400 bg-yellow-400/20 border-yellow-400/30'
            }`}>
              {demoTree ? 'FIFO story' : 'DEMO MODE'}
            </span>
          )}
          {connection && !connectionError && (
            <span className="text-xs text-green-400 px-2 py-1 bg-green-400/20 rounded border border-green-400/30 flex items-center gap-1">
              <Wifi className="w-3 h-3" />
              {connection.host}:{connection.port}
            </span>
          )}
          {connectionError && (
            <span className="text-xs text-red-400 px-2 py-1 bg-red-400/20 rounded border border-red-400/30 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Connection Error
              <button
                onClick={handleRetryConnection}
                className="ml-1 p-0.5 hover:bg-red-400/30 rounded"
                title="Retry connection"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </span>
          )}
          
          {/* Current file */}
          {currentSession && !isDemoMode && (
            <span className="text-xs text-wave-text/70 px-2 py-1 bg-wave-bg rounded">
              {currentSession.wave_db?.split('/').pop() || currentSession.design_db?.split('/').pop() || 'Session'}
            </span>
          )}
          {connection && examples.length > 0 && (
            <div className="flex items-center rounded border border-wave-border overflow-hidden text-xs">
              {examples.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  title={example.description}
                  onClick={() => openNamedExample(example)}
                  className={`px-2 py-1 ${
                    activeExampleId === example.id
                      ? 'bg-wave-accent text-wave-bg'
                      : 'hover:bg-wave-border text-wave-text'
                  }`}
                >
                  {example.name}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {connection && (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
              title="Disconnect"
            >
              <WifiOff className="w-4 h-4" />
              Disconnect
            </button>
          )}
          {!isDemoMode && !connection && (
            <button
              onClick={() => loadDemoMode()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-wave-border text-wave-text rounded hover:bg-wave-border/80"
              title="Load Demo"
            >
              <Play className="w-4 h-4" />
              Demo
            </button>
          )}
          {connection && !connectionError && (
            <button
              onClick={() => setShowOpenDialog(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-wave-accent text-wave-bg rounded hover:bg-wave-accent/80"
            >
              <FolderOpen className="w-4 h-4" />
              Open Database
            </button>
          )}
        </div>
      </header>

      {/* Connection instructions if no server */}
      {!connection && !isDemoMode && (
        <div className="bg-wave-panel/50 border-b border-wave-border px-4 py-3">
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-wave-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">No server connection</p>
              <p className="text-wave-text/70 mt-1">
                Start a backend server and add URL parameters to connect:
              </p>
              <code className="block mt-2 px-3 py-2 bg-wave-bg rounded text-xs font-mono text-wave-accent">
                ?server=hostname:8000&vcd=/path/to/file.vcd&design=/path/to/hierarchy.tree.json&rc_file=/path/to/waves.rc
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel - Hierarchy */}
          <div className="w-80 border-r border-wave-border flex-shrink-0 overflow-hidden">
            <HierarchyPanel onViewCode={codePanel.viewCode} />
          </div>

          {/* Right panel - Waveform Viewer + Code Panel */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-hidden">
              <WaveformViewer />
            </div>
            {/* Code Panel (collapsible) */}
            <CodePanel
              location={codePanel.location}
              content={codePanel.content}
              isLoading={codePanel.isLoading}
              error={codePanel.error}
              onClose={codePanel.close}
            />
          </div>
        </div>

        {/* Log panel */}
        <LogPanel logs={logs} onClear={clearLogs} isLoading={isLoading} />
      </div>

      {/* Status bar */}
      <footer className="flex items-center justify-between px-4 py-1 text-xs text-wave-text/70 border-t border-wave-border bg-wave-panel">
        <div className="flex items-center gap-4">
          {currentSession ? (
            <>
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                {currentSession.vendor}
              </span>
              <span>
                Time: {currentSession.min_time} - {currentSession.max_time} {currentSession.time_unit}
              </span>
            </>
          ) : (
            <span>No database open</span>
          )}
        </div>
        <div>
          Wave Browser {APP_VERSION}
        </div>
      </footer>

      {/* Dialogs */}
      <SessionDialog
        isOpen={showSessionDialog}
        onClose={() => setShowSessionDialog(false)}
      />
      
      <OpenDialog
        isOpen={showOpenDialog}
        onClose={() => setShowOpenDialog(false)}
        onOpen={handleOpenFromDialog}
        serverInfo={connection ? { host: connection.host, port: connection.port } : null}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
