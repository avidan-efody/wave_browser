/**
 * Pick the signal.rc that belongs next to an opened waveform.
 * Prefer <stem>.rc (waves.fsdb -> waves.rc). If that file is absent and the
 * directory has exactly one .rc file, use it. Several unmatched files is an
 * error: we will not guess.
 */

export interface RcListEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface CompanionRcChoice {
  path: string | null;
  error: string | null;
}

export function chooseCompanionRc(wavePath: string, entries: RcListEntry[]): CompanionRcChoice {
  const slash = Math.max(wavePath.lastIndexOf('/'), wavePath.lastIndexOf('\\'));
  const fileName = slash >= 0 ? wavePath.slice(slash + 1) : wavePath;
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const rcFiles = entries
    .filter((entry) => !entry.is_dir && entry.name.toLowerCase().endsWith('.rc'))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const wanted = `${stem}.rc`.toLowerCase();
  const match = rcFiles.find((entry) => entry.name.toLowerCase() === wanted);
  if (match) return { path: match.path, error: null };
  if (rcFiles.length === 1) return { path: rcFiles[0].path, error: null };
  if (rcFiles.length > 1) {
    const names = rcFiles.map((entry) => entry.name).join(', ');
    return {
      path: null,
      error: `Several RC files are next to ${fileName}, and none is named ${stem}.rc: ${names}`,
    };
  }
  return { path: null, error: null };
}
