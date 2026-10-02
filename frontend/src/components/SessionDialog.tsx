/**
 * Session dialog for opening databases
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, X, AlertCircle } from 'lucide-react';
import { sessionsApi, ApiError } from '../api';
import { useWaveformStore } from '../store';
import { sessionLogger } from '../utils/logging';

// Default path to example KDB (RTL source files)
const DEFAULT_DESIGN_DB = '/u/avidan/workspaces/wave_browser/example/rtl/counter.v /u/avidan/workspaces/wave_browser/example/rtl/tb_counter.v';

interface SessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SessionDialog({ isOpen, onClose }: SessionDialogProps) {
  const [designDb, setDesignDb] = useState(DEFAULT_DESIGN_DB);
  const [waveDb, setWaveDb] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { setCurrentSession } = useWaveformStore();
  const queryClient = useQueryClient();

  const createSession = useMutation({
    mutationFn: sessionsApi.create,
    onSuccess: (data) => {
      sessionLogger.info('Session created successfully', data.session);
      setCurrentSession(data.session);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onClose();
    },
    onError: (error) => {
      sessionLogger.error('Failed to create session', error as Error);
    },
  });

  if (!isOpen) return null;

  // Format error message for display
  const getErrorMessage = () => {
    if (!createSession.error) return null;
    
    const error = createSession.error;
    if (error instanceof ApiError) {
      return error.message;
    }
    return (error as Error).message || 'Unknown error occurred';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sessionLogger.info('Opening database', { designDb, waveDb: waveDb || undefined });
    const wave = waveDb.trim();
    const design = designDb.trim();
    const isVerilator = wave.toLowerCase().endsWith('.vcd') || design.toLowerCase().endsWith('.json');
    createSession.mutate({
      vendor: isVerilator ? 'verilator' : 'verdi',
      wave_db: wave || undefined,
      design_db: isVerilator
        ? (design.toLowerCase().endsWith('.json') ? design : undefined)
        : (design || undefined),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-wave-panel border border-wave-border rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-wave-border">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-wave-accent" />
            <h2 className="font-medium">Open Design Database</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-wave-border rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Design Database (KDB / RTL files)
            </label>
            <input
              type="text"
              value={designDb}
              onChange={(e) => setDesignDb(e.target.value)}
              placeholder="/path/to/design.kdb or /path/to/file1.v /path/to/file2.v"
              className="w-full px-3 py-2 bg-wave-bg border border-wave-border rounded text-sm focus:outline-none focus:border-wave-accent font-mono text-xs"
            />
            <p className="mt-1 text-xs text-wave-text/50">
              Path to KDB, RTL directory, or space-separated list of Verilog files
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-wave-accent hover:underline"
          >
            {showAdvanced ? '▼ Hide Advanced' : '▶ Show Advanced Options'}
          </button>

          {showAdvanced && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Waveform Database (FSDB) - Optional
              </label>
              <input
                type="text"
                value={waveDb}
                onChange={(e) => setWaveDb(e.target.value)}
                placeholder="/path/to/waves.fsdb"
                className="w-full px-3 py-2 bg-wave-bg border border-wave-border rounded text-sm focus:outline-none focus:border-wave-accent font-mono text-xs"
              />
            </div>
          )}

          {createSession.error && (
            <div className="flex items-start gap-2 text-red-400 text-sm bg-red-400/10 p-3 rounded border border-red-400/20">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Failed to open database</div>
                <div className="text-red-300/80 mt-1">{getErrorMessage()}</div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-wave-border rounded hover:bg-wave-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createSession.isPending || (!designDb && !waveDb)}
              className="px-4 py-2 text-sm bg-wave-accent text-wave-bg rounded hover:bg-wave-accent/80 disabled:opacity-50"
            >
              {createSession.isPending ? 'Opening...' : 'OK'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
