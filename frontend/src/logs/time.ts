/**
 * Pull a timestamp out of a transaction log line.
 * The same shapes are recognized on the server in backend/app/log_scan.py.
 */

const UNIT_PS: Record<string, number> = {
  fs: 1e-3,
  ps: 1,
  ns: 1e3,
  us: 1e6,
  ms: 1e9,
  s: 1e12,
};

const TIME_RE =
  /@\s*(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|s)?|\[\s*(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|s)?\s*\]|\b(?:time|t)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|s)?|^\s*(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|s)\b|\b(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|s)\b/i;

function normUnit(unit: string | undefined): string | null {
  if (!unit) return null;
  return unit.toLowerCase().replace('µ', 'u');
}

function toDb(value: number, unit: string | undefined, dbUnit: string): number {
  const srcName = normUnit(unit);
  if (!srcName) return Math.round(value);
  const src = UNIT_PS[srcName];
  const dst = UNIT_PS[normUnit(dbUnit) ?? 'ps'];
  if (!src || !dst) return Math.round(value);
  return Math.round((value * src) / dst);
}

export function extractTime(line: string, dbUnit: string): number | null {
  TIME_RE.lastIndex = 0;
  const match = TIME_RE.exec(line);
  if (!match) return null;
  for (let index = 1; index <= 9; index += 2) {
    if (match[index] != null) {
      const value = Number(match[index]);
      if (!Number.isFinite(value)) return null;
      return toDb(value, match[index + 1], dbUnit);
    }
  }
  return null;
}

/** Drop a leading timestamp so the value column can show the message. */
export function stripTimePrefix(line: string): string {
  return line
    .replace(/^@\s*\d+(?:\.\d+)?\s*(?:fs|ps|ns|us|µs|ms|s)?\s*/i, '')
    .replace(/^\[\s*\d+(?:\.\d+)?\s*(?:fs|ps|ns|us|µs|ms|s)?\s*\]\s*/i, '')
    .replace(/^(?:time|t)\s*[:=]\s*\d+(?:\.\d+)?\s*(?:fs|ps|ns|us|µs|ms|s)?\s*/i, '')
    .replace(/^\d+(?:\.\d+)?\s*(?:fs|ps|ns|us|µs|ms|s)\s+/i, '');
}
