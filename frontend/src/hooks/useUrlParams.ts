/**
 * Hook for parsing URL parameters for server/fsdb connection
 * 
 * Supports:
 *   ?server=host:port&fsdb=/path/to/file.fsdb
 *   ?server=host:port&vcd=/path/to/file.vcd&design=/path/to/hierarchy.tree.json&rc_file=/path/to/waves.rc
 */

import { useMemo } from 'react';

export interface UrlConnectionParams {
  server: string | null;   // host:port format
  host: string | null;     // just the host
  port: number | null;     // just the port
  fsdb: string | null;     // waveform path (.fsdb or .vcd)
  design: string | null;   // design hierarchy path (KDB or Verilator JSON)
  rc: string | null;       // nWave signal.rc layout (?rc_file=)
  story: string | null;    // story parent links (?story_file=), not part of the RC
  backendUrl: string | null; // full backend URL
}

export function useUrlParams(): UrlConnectionParams {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const server = params.get('server');
    const fsdb = params.get('fsdb') || params.get('vcd');
    const design = params.get('design');
    const rc = params.get('rc_file') || params.get('rc');
    const story = params.get('story_file');
    
    let host: string | null = null;
    let port: number | null = null;
    let backendUrl: string | null = null;
    
    if (server) {
      const parts = server.split(':');
      host = parts[0] || null;
      port = parts[1] ? parseInt(parts[1], 10) : 8000; // Default port 8000
      
      if (host) {
        backendUrl = `http://${host}:${port}`;
      }
    }
    
    return {
      server,
      host,
      port,
      fsdb,
      design,
      rc,
      story,
      backendUrl,
    };
  }, []);
}

/**
 * Build a URL with server and waveform params.
 * VCD files use ?vcd=. FSDB files use ?fsdb=.
 */
export function buildConnectionUrl(
  host: string,
  port: number,
  wavePath?: string,
  design?: string,
  rc?: string | null,
  story?: string | null,
): string {
  const url = new URL(window.location.href);
  url.searchParams.set('server', `${host}:${port}`);
  url.searchParams.delete('fsdb');
  url.searchParams.delete('vcd');
  if (wavePath) {
    const key = wavePath.toLowerCase().endsWith('.vcd') ? 'vcd' : 'fsdb';
    url.searchParams.set(key, wavePath);
  }
  if (design) url.searchParams.set('design', design);
  else url.searchParams.delete('design');
  url.searchParams.delete('rc');
  if (rc) url.searchParams.set('rc_file', rc);
  else url.searchParams.delete('rc_file');
  if (story) url.searchParams.set('story_file', story);
  else url.searchParams.delete('story_file');
  return url.toString();
}

/** Remember the RC path on the current page so a reload restores the layout. */
export function setRcSearchParam(rcPath: string): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('rc');
  url.searchParams.set('rc_file', rcPath);
  window.history.replaceState({}, '', url.toString());
}

/**
 * Clear URL params (for disconnect)
 */
export function clearConnectionUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('server');
  url.searchParams.delete('fsdb');
  url.searchParams.delete('vcd');
  url.searchParams.delete('design');
  url.searchParams.delete('rc');
  url.searchParams.delete('rc_file');
  url.searchParams.delete('story_file');
  window.history.replaceState({}, '', url.toString());
}
