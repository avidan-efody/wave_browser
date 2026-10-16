import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { HierarchyKinds } from './hierarchyKinds';

const OPTIONS: { key: keyof HierarchyKinds; label: string }[] = [
  { key: 'modules', label: 'modules' },
  { key: 'interfaces', label: 'interfaces' },
  { key: 'packages', label: 'packages' },
];

interface ScopeKindMenuProps {
  kinds: HierarchyKinds;
  onChange: (kinds: HierarchyKinds) => void;
}

export function ScopeKindMenu({ kinds, onChange }: ScopeKindMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const summary = OPTIONS.filter((option) => kinds[option.key]).map((option) => option.label).join(', ') || 'none';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 px-2 py-0.5 rounded border border-wave-border bg-wave-bg text-xs font-normal text-wave-text hover:border-wave-accent"
      >
        <span className="truncate max-w-[140px]">{summary}</span>
        <ChevronDown className="w-3 h-3 text-wave-text/60" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Hierarchy scope kinds"
          className="absolute right-0 top-full mt-1 z-30 min-w-[140px] rounded border border-wave-border bg-wave-panel shadow-lg py-1"
        >
          {OPTIONS.map((option) => (
            <label
              key={option.key}
              className="flex items-center gap-2 px-2 py-1 text-xs font-normal text-wave-text cursor-pointer hover:bg-wave-border/50"
            >
              <input
                type="checkbox"
                className="accent-[#7aa2f7]"
                checked={kinds[option.key]}
                onChange={(event) => onChange({ ...kinds, [option.key]: event.target.checked })}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
