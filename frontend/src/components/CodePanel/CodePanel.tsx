/**
 * Code Panel - displays source code with Verilog syntax highlighting
 * 
 * Features:
 * - Minimize/maximize modes
 * - Line highlighting
 * - Scroll to line
 * - Read-only view
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, highlightSpecialChars } from '@codemirror/view';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { search, highlightSelectionMatches } from '@codemirror/search';
import { Minimize2, Maximize2, X, FileCode, Loader2, Copy } from 'lucide-react';
import { verilog } from './verilogLanguage';
import { ResizeHandle } from '../layout/Panes';

// Dark theme for editor
const darkTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
    height: '100%',
  },
  '.cm-content': {
    fontFamily: '"Fira Code", "JetBrains Mono", Consolas, monospace',
    fontSize: '13px',
    padding: '8px 0',
  },
  '.cm-gutters': {
    backgroundColor: '#181825',
    color: '#6c7086',
    border: 'none',
    borderRight: '1px solid #313244',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 16px',
  },
  '.cm-activeLine': {
    backgroundColor: '#313244',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#313244',
  },
  // Highlighted line (for jump-to-line)
  '.cm-highlighted-line': {
    backgroundColor: '#45475a !important',
    borderLeft: '3px solid #89b4fa',
  },
  '.cm-selectionMatch': {
    backgroundColor: '#45475a',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#89b4fa',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#45475a',
  },
});

// Line highlighting decoration
const highlightedLineDecoration = EditorView.baseTheme({
  '.cm-highlightedLine': {
    backgroundColor: '#45475a !important',
    borderLeft: '3px solid #89b4fa',
  },
});

export interface CodeLocation {
  filePath: string;
  line: number;
  label?: string;  // e.g., "counter.v:45 - module instantiation"
}

interface CodePanelProps {
  location: CodeLocation | null;
  content: string | null;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
}

export function CodePanel({ location, content, isLoading, error, onClose }: CodePanelProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [panelHeight, setPanelHeight] = useState(256);

  // Create/update editor when content changes or panel expands
  useEffect(() => {
    if (!editorRef.current || !content) {
      // Clean up existing view if content is null
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      return;
    }

    // Destroy existing view
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    // Create new editor state
    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightSpecialChars(),
        syntaxHighlighting(defaultHighlightStyle),
        highlightSelectionMatches(),
        search(),
        verilog(),
        darkTheme,
        highlightedLineDecoration,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    });

    // Create view
    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [content, isMinimized]); // Re-run when panel expands

  // Auto-expand when location is set (separate effect to avoid dependency on viewRef)
  useEffect(() => {
    if (location && isMinimized) {
      setIsMinimized(false);
    }
  }, [location]);

  // Scroll to line when location changes and editor is ready
  useEffect(() => {
    if (!viewRef.current || !location) return;

    const view = viewRef.current;
    const line = location.line;

    // Clamp line number
    const docLines = view.state.doc.lines;
    const targetLine = Math.max(1, Math.min(line, docLines));

    // Get line position
    const lineInfo = view.state.doc.line(targetLine);

    // Scroll to line with some context above
    view.dispatch({
      effects: EditorView.scrollIntoView(lineInfo.from, {
        y: 'center',
      }),
      selection: { anchor: lineInfo.from },
    });
  }, [location, content, isMinimized]);

  const toggleMaximize = useCallback(() => {
    setIsMaximized(prev => !prev);
    setIsMinimized(false);
  }, []);

  const toggleMinimize = useCallback(() => {
    setIsMinimized(prev => !prev);
    if (!isMinimized) {
      setIsMaximized(false);
    }
  }, [isMinimized]);

  const fileName = location?.filePath.split('/').pop() || 'No file';

  // Minimized state - just a bar
  if (isMinimized && !location) {
    return null; // Don't show at all if no location
  }

  if (isMinimized) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 bg-wave-panel border-t border-wave-border text-sm">
        <button
          onClick={toggleMinimize}
          className="flex items-center gap-2 hover:text-wave-accent"
        >
          <FileCode className="w-4 h-4" />
          <span className="font-mono text-xs">{location?.label || `${fileName}:${location?.line}`}</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleMaximize}
            className="p-1 rounded hover:bg-wave-border"
            title="Maximize"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-wave-border"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Full or maximized state
  const panelClasses = isMaximized
    ? 'fixed inset-0 z-50 flex flex-col bg-wave-bg'
    : 'flex flex-col border-t border-wave-border';

  return (
    <div className={panelClasses} style={isMaximized ? undefined : { height: panelHeight }}>
      {!isMaximized && (
        <ResizeHandle
          axis="y"
          label="Resize source"
          size={panelHeight}
          min={96}
          getMax={() => Math.max(160, window.innerHeight - 180)}
          sign={-1}
          onSize={setPanelHeight}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-wave-panel border-b border-wave-border">
        <div className="flex items-center gap-2 text-sm">
          <FileCode className="w-4 h-4 text-wave-accent" />
          <span className="font-mono text-xs text-wave-text/70">{location?.filePath || 'No file'}</span>
          {location && (
            <>
              <span className="text-wave-text/50">:</span>
              <span className="font-mono text-xs text-wave-accent">{location.line}</span>
            </>
          )}
          {location?.label && (
            <span className="text-xs text-wave-text/50 ml-2">— {location.label}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isMaximized && (
            <button
              onClick={toggleMinimize}
              className="p-1 rounded hover:bg-wave-border"
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={toggleMaximize}
            className="p-1 rounded hover:bg-wave-border"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Copy className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-wave-border"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-wave-accent" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-400 text-sm">
            {error}
          </div>
        ) : !content ? (
          <div className="flex items-center justify-center h-full text-wave-text/50 text-sm">
            Click on a module or signal to view source code
          </div>
        ) : (
          <div ref={editorRef} className="h-full overflow-auto" />
        )}
      </div>
    </div>
  );
}
