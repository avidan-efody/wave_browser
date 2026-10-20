"""
Stream a log file and collect regex matches without loading the whole file.

Wide patterns stop once they pass the event cap, so a `.*` against a huge log
returns a short sample instead of walking the rest of the file.
"""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Callable, Iterator, Optional

PREVIEW_LIMIT = 200
EVENT_LIMIT = 2000
_CHUNK = 1024 * 1024
_LINE_CAP = 2000

_UNIT_PS = {
    "fs": 1e-3,
    "ps": 1.0,
    "ns": 1e3,
    "us": 1e6,
    "ms": 1e9,
    "s": 1e12,
}

# First alternative that matches wins. A missing unit means the number is
# already in the waveform database's time unit.
_TIME_RE = re.compile(
    r"@\s*(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|s)?"
    r"|\[\s*(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|s)?\s*\]"
    r"|\b(?:time|t)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|s)?"
    r"|^\s*(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|s)\b"
    r"|\b(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|µs|ms|s)\b",
    re.IGNORECASE,
)


def _norm_unit(unit: Optional[str]) -> Optional[str]:
    if not unit:
        return None
    text = unit.lower().replace("µ", "u")
    return text


def to_db_time(value: float, unit: Optional[str], db_unit: str) -> int:
    """Convert a timestamp into the waveform database time unit."""
    src_name = _norm_unit(unit)
    if src_name is None:
        return int(round(value))
    src = _UNIT_PS.get(src_name)
    dst = _UNIT_PS.get(_norm_unit(db_unit) or "ps")
    if not src or not dst:
        return int(round(value))
    return int(round(value * src / dst))


def extract_time(line: str, db_unit: str) -> Optional[int]:
    """Pull the first timestamp out of a log line. None when there is no time."""
    match = _TIME_RE.search(line)
    if not match:
        return None
    for index in range(1, 11, 2):
        if match.group(index) is not None:
            return to_db_time(float(match.group(index)), match.group(index + 1), db_unit)
    return None


def _iter_lines(path: Path, cancel: Optional[Callable[[], bool]]) -> Iterator[tuple[int, str]]:
    line_no = 0
    pending = b""
    with path.open("rb") as handle:
        while True:
            if cancel is not None and cancel():
                return
            block = handle.read(_CHUNK)
            if not block:
                if pending:
                    line_no += 1
                    yield line_no, pending.decode("utf-8", "replace").replace("\r", "")[:_LINE_CAP]
                return
            pending += block
            parts = pending.split(b"\n")
            pending = parts.pop()
            for raw in parts:
                line_no += 1
                yield line_no, raw.decode("utf-8", "replace").replace("\r", "")[:_LINE_CAP]


def read_head(path: Path, limit: int = PREVIEW_LIMIT) -> list[dict]:
    """First `limit` lines. Stops reading once that many newlines are in hand."""
    capped = max(1, min(limit, 500))
    lines: list[dict] = []
    for line_no, text in _iter_lines(path, None):
        lines.append({"line": line_no, "text": text, "time": None})
        if len(lines) >= capped:
            break
    return lines


def scan_log(
    path: Path,
    pattern: str,
    db_unit: str,
    *,
    preview_limit: int = PREVIEW_LIMIT,
    event_limit: int = EVENT_LIMIT,
    cancel: Optional[Callable[[], bool]] = None,
) -> Iterator[dict]:
    """
    Yield NDJSON-ready objects:

    - ``{"type": "preview", "matches": [...]}`` one or more times
    - ``{"type": "done", ...}`` once, unless the scan is cancelled
    - ``{"type": "error", "detail": "..."}`` on timeout
    """
    regex = re.compile(pattern)
    preview_cap = max(1, min(preview_limit, 500))
    event_cap = max(1, min(event_limit, EVENT_LIMIT))
    preview: list[dict] = []
    events: list[dict] = []
    match_count = 0
    preview_sent_full = False
    last_flushed = 0
    started = time.monotonic()

    def preview_msg() -> dict:
        return {"type": "preview", "matches": list(preview)}

    for line_no, text in _iter_lines(path, cancel):
        if cancel is not None and line_no % 200 == 0 and cancel():
            return
        if line_no % 200 == 0 and time.monotonic() - started > 180:
            yield {"type": "error", "detail": "Search timed out"}
            return
        if regex.search(text) is None:
            if line_no % 5000 == 0 and preview and not preview_sent_full and len(preview) != last_flushed:
                last_flushed = len(preview)
                yield preview_msg()
            continue
        match_count += 1
        parsed = extract_time(text, db_unit)
        if len(preview) < preview_cap:
            preview.append({"line": line_no, "text": text, "time": parsed})
        if parsed is not None and len(events) < event_cap:
            events.append({"time": parsed, "text": text[:240]})
        if len(preview) >= preview_cap and not preview_sent_full:
            preview_sent_full = True
            last_flushed = len(preview)
            yield preview_msg()
        if match_count > event_cap:
            yield {
                "type": "done",
                "match_count": match_count,
                "too_wide": True,
                "timed_count": 0,
                "events": [],
            }
            return

    if not preview_sent_full or len(preview) != last_flushed:
        yield preview_msg()
    events.sort(key=lambda item: item["time"])
    yield {
        "type": "done",
        "match_count": match_count,
        "too_wide": False,
        "timed_count": len(events),
        "events": events,
    }
