/**
 * Transaction logs shipped beside the FIFO story.
 * GitHub Pages has no backend, so the panel reads these directly.
 */

import cpuText from '../../../example/fifo_story/sim/cpu_instr.log?raw';
import pcieText from '../../../example/fifo_story/sim/pcie_tlp.log?raw';
import ambaText from '../../../example/fifo_story/sim/amba_axi.log?raw';

const TEXTS: Record<string, string> = {
  'cpu_instr.log': cpuText,
  'pcie_tlp.log': pcieText,
  'amba_axi.log': ambaText,
};

export interface ListedLog {
  name: string;
  path: string;
  size: number;
  bundled: boolean;
}

export function bundledLogList(): ListedLog[] {
  return Object.entries(TEXTS).map(([name, text]) => ({
    name,
    path: name,
    size: text.length,
    bundled: true,
  }));
}

export function bundledLogText(name: string): string | null {
  const base = name.split(/[/\\]/).pop() || name;
  return TEXTS[base] ?? null;
}

export function waveDirectory(waveDb: string | undefined): string | null {
  if (!waveDb) return null;
  const slash = Math.max(waveDb.lastIndexOf('/'), waveDb.lastIndexOf('\\'));
  if (slash <= 0) return null;
  return waveDb.slice(0, slash);
}

export function resolveLogPath(file: string, waveDb: string | undefined): string {
  if (file.startsWith('/') || /^[A-Za-z]:[\\/]/.test(file)) return file;
  const directory = waveDirectory(waveDb);
  if (!directory) return file.split(/[/\\]/).pop() || file;
  return `${directory}/${file.split(/[/\\]/).pop()}`;
}
