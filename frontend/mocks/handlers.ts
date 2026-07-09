/**
 * MSW (Mock Service Worker) API handlers for frontend standalone testing.
 */

import { http, HttpResponse, delay } from 'msw';
import {
  mockSessions,
  topScopes,
  scopeChildrenMap,
  scopeSignalsMap,
  allSignals,
  getWaveformData,
} from './data';
import type { SessionCreate, SessionInfo } from '../src/api/types';

// Simulated sessions storage
let sessions: SessionInfo[] = [...mockSessions];
let sessionIdCounter = 1;

export const handlers = [
  // ============================================================================
  // Health Check
  // ============================================================================
  http.get('/health', () => {
    return HttpResponse.json({ status: 'healthy' });
  }),

  // ============================================================================
  // Sessions API
  // ============================================================================
  
  // List sessions
  http.get('/api/sessions', async () => {
    await delay(100); // Simulate network latency
    return HttpResponse.json({ sessions });
  }),

  // Create session
  http.post('/api/sessions', async ({ request }) => {
    await delay(200);
    const body = await request.json() as SessionCreate;
    
    const newSession: SessionInfo = {
      id: `mock-session-${String(++sessionIdCounter).padStart(3, '0')}`,
      vendor: body.vendor,
      wave_db: body.wave_db,
      design_db: body.design_db,
      time_unit: 'ns',
      min_time: 0,
      max_time: 10000,
      is_completed: true,
      created_at: new Date().toISOString(),
    };
    
    sessions.push(newSession);
    
    return HttpResponse.json({ session: newSession }, { status: 201 });
  }),

  // Get session
  http.get('/api/sessions/:sessionId', async ({ params }) => {
    await delay(50);
    const session = sessions.find(s => s.id === params.sessionId);
    
    if (!session) {
      return HttpResponse.json(
        { detail: 'Session not found' },
        { status: 404 }
      );
    }
    
    return HttpResponse.json({ session });
  }),

  // Delete session
  http.delete('/api/sessions/:sessionId', async ({ params }) => {
    await delay(50);
    const index = sessions.findIndex(s => s.id === params.sessionId);
    
    if (index === -1) {
      return HttpResponse.json(
        { detail: 'Session not found' },
        { status: 404 }
      );
    }
    
    sessions.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ============================================================================
  // Hierarchy API
  // ============================================================================
  
  // Get top scopes
  http.get('/api/hierarchy/:sessionId/scopes', async ({ params }) => {
    await delay(50);
    const session = sessions.find(s => s.id === params.sessionId);
    
    if (!session) {
      return HttpResponse.json(
        { detail: 'Session not found' },
        { status: 404 }
      );
    }
    
    return HttpResponse.json({ scopes: topScopes });
  }),

  // Get child scopes
  http.get('/api/hierarchy/:sessionId/scopes/:scopePath/children', async ({ params }) => {
    await delay(50);
    const scopePath = decodeURIComponent(params.scopePath as string);
    const children = scopeChildrenMap[scopePath] ?? [];
    
    return HttpResponse.json({ scopes: children });
  }),

  // Get signals in scope
  http.get('/api/hierarchy/:sessionId/scopes/:scopePath/signals', async ({ params }) => {
    await delay(50);
    const scopePath = decodeURIComponent(params.scopePath as string);
    const signals = scopeSignalsMap[scopePath] ?? [];
    
    return HttpResponse.json({ signals });
  }),

  // Get scope info
  http.get('/api/hierarchy/:sessionId/scopes/:scopePath', async ({ params }) => {
    await delay(50);
    const scopePath = decodeURIComponent(params.scopePath as string);
    
    // Find scope in all scopes
    const allScopes = [...topScopes, ...Object.values(scopeChildrenMap).flat()];
    const scope = allScopes.find(s => s.path === scopePath);
    
    if (!scope) {
      return HttpResponse.json(
        { detail: 'Scope not found' },
        { status: 404 }
      );
    }
    
    return HttpResponse.json(scope);
  }),

  // Get signal info
  http.get('/api/hierarchy/:sessionId/signals/:signalPath', async ({ params }) => {
    await delay(50);
    const signalPath = decodeURIComponent(params.signalPath as string);
    const signal = allSignals.find(s => s.path === signalPath);
    
    if (!signal) {
      return HttpResponse.json(
        { detail: 'Signal not found' },
        { status: 404 }
      );
    }
    
    return HttpResponse.json(signal);
  }),

  // Search signals
  http.post('/api/hierarchy/:sessionId/signals/search', async ({ request }) => {
    await delay(100);
    const body = await request.json() as { pattern: string; limit?: number };
    const pattern = body.pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(pattern, 'i');
    const limit = body.limit ?? 100;
    
    const matches = allSignals
      .filter(s => regex.test(s.path) || regex.test(s.name))
      .slice(0, limit);
    
    return HttpResponse.json({ signals: matches });
  }),

  // ============================================================================
  // Waveform API
  // ============================================================================
  
  // Get waveform
  http.get('/api/waveform/:sessionId/signals/:signalPath', async ({ params, request }) => {
    await delay(100);
    const signalPath = decodeURIComponent(params.signalPath as string);
    const url = new URL(request.url);
    const start = parseInt(url.searchParams.get('start') ?? '0');
    const end = parseInt(url.searchParams.get('end') ?? '1000');
    
    const waveform = getWaveformData(signalPath, start, end);
    return HttpResponse.json({ waveform });
  }),

  // Batch waveforms
  http.post('/api/waveform/:sessionId/batch', async ({ request }) => {
    await delay(150);
    const body = await request.json() as {
      signal_paths: string[];
      start_time: number;
      end_time: number;
    };

    const waveforms: Record<string, ReturnType<typeof getWaveformData>> = {};
    for (const signalPath of body.signal_paths ?? []) {
      waveforms[signalPath] = getWaveformData(
        signalPath,
        body.start_time,
        body.end_time
      );
    }

    return HttpResponse.json({ waveforms });
  }),

  // Get value at time
  http.get('/api/waveform/:sessionId/value/:signalPath', async ({ params, request }) => {
    await delay(50);
    const signalPath = decodeURIComponent(params.signalPath as string);
    const url = new URL(request.url);
    const time = parseInt(url.searchParams.get('time') ?? '0');
    
    // Get waveform and find value at time
    const waveformData = getWaveformData(signalPath, 0, time + 1);
    const lastChange = waveformData.changes.filter(c => c.time <= time).pop();
    
    return HttpResponse.json({
      signal_path: signalPath,
      time,
      value: lastChange?.value ?? 'x',
    });
  }),

  // ============================================================================
  // Files API
  // ============================================================================
  
  // Get filesystem roots
  http.get('/api/files/roots', async () => {
    await delay(50);
    return HttpResponse.json([
      { name: '/', path: '/', is_dir: true },
      { name: '~', path: '/home/user', is_dir: true },
    ]);
  }),

  // List files in a directory
  http.get('/api/files', async ({ request }) => {
    await delay(100);
    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '/home/user';
    
    // Mock file structure
    const mockFiles: Record<string, Array<{ name: string; path: string; is_dir: boolean; size?: number }>> = {
      '/home/user': [
        { name: 'projects', path: '/home/user/projects', is_dir: true },
        { name: 'simulations', path: '/home/user/simulations', is_dir: true },
        { name: 'notes.txt', path: '/home/user/notes.txt', is_dir: false, size: 1024 },
      ],
      '/home/user/projects': [
        { name: 'counter', path: '/home/user/projects/counter', is_dir: true },
        { name: 'processor', path: '/home/user/projects/processor', is_dir: true },
      ],
      '/home/user/projects/counter': [
        { name: 'sim', path: '/home/user/projects/counter/sim', is_dir: true },
        { name: 'rtl', path: '/home/user/projects/counter/rtl', is_dir: true },
      ],
      '/home/user/projects/counter/sim': [
        { name: 'dump.fsdb', path: '/home/user/projects/counter/sim/dump.fsdb', is_dir: false, size: 10485760 },
        { name: 'waveform.vcd', path: '/home/user/projects/counter/sim/waveform.vcd', is_dir: false, size: 5242880 },
      ],
      '/home/user/simulations': [
        { name: 'test1.fsdb', path: '/home/user/simulations/test1.fsdb', is_dir: false, size: 2097152 },
        { name: 'test2.fsdb', path: '/home/user/simulations/test2.fsdb', is_dir: false, size: 3145728 },
      ],
      '/': [
        { name: 'home', path: '/home', is_dir: true },
        { name: 'tmp', path: '/tmp', is_dir: true },
      ],
      '/home': [
        { name: 'user', path: '/home/user', is_dir: true },
      ],
    };
    
    const entries = mockFiles[path] || [];
    const parent = path === '/' ? null : path.split('/').slice(0, -1).join('/') || '/';
    
    return HttpResponse.json({
      path,
      parent,
      entries,
    });
  }),

  // Get file content
  http.get('/api/files/content', async ({ request }) => {
    await delay(100);
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    
    if (!path) {
      return HttpResponse.json(
        { detail: 'Path parameter required' },
        { status: 400 }
      );
    }
    
    // Import demo source files dynamically to avoid circular dependencies
    const { DEMO_SOURCE_FILES } = await import('../src/demo/demoSourceCode');
    
    const file = DEMO_SOURCE_FILES[path];
    if (!file) {
      return HttpResponse.json(
        { detail: `File not found: ${path}` },
        { status: 404 }
      );
    }
    
    return HttpResponse.json({
      path,
      content: file.content,
      language: file.language,
      line_count: file.content.split('\n').length,
    });
  }),
];

// Reset sessions to initial state (useful for tests)
export function resetMockState() {
  sessions = [...mockSessions];
  sessionIdCounter = 1;
}
