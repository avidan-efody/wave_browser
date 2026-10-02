"""
Verilator adapter.

Reads a VCD waveform (``--trace``) and, when present, the design hierarchy
from ``verilator --json-only`` (``.tree.json``).
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from .base import (
    BaseAdapter,
    DatabaseInfo,
    ScopeInfo,
    ScopeType,
    SignalDirection,
    SignalInfo,
    ValueChange,
    WaveformData,
)

_KEEP_VAR_TYPES = {"PORT", "WIRE", "VAR", "LOGIC", "BIT", "REG", "TRI", "TRIREG"}
_DIRECTION = {
    "INPUT": SignalDirection.INPUT,
    "OUTPUT": SignalDirection.OUTPUT,
    "INOUT": SignalDirection.INOUT,
}


class _Scope:
    def __init__(self, path: str, name: str, scope_type: ScopeType, def_name: Optional[str]):
        self.path = path
        self.name = name
        self.scope_type = scope_type
        self.def_name = def_name
        self.children: Dict[str, _Scope] = {}
        self.signals: Dict[str, _Signal] = {}

    @property
    def info(self) -> ScopeInfo:
        return ScopeInfo(
            path=self.path,
            name=self.name,
            scope_type=self.scope_type,
            def_name=self.def_name,
            has_children=bool(self.children),
            has_signals=bool(self.signals),
        )


class _Signal:
    def __init__(self, info: SignalInfo):
        self.info = info
        self.changes: List[Tuple[int, str]] = []


class VerilatorAdapter(BaseAdapter):
    """Hierarchy from Verilator JSON, value changes from VCD."""

    def __init__(self) -> None:
        self._wave_path: Optional[str] = None
        self._design_path: Optional[str] = None
        self._info: Optional[DatabaseInfo] = None
        self._tops: List[_Scope] = []
        self._scopes: Dict[str, _Scope] = {}
        self._signals: Dict[str, _Signal] = {}

    def open(self, wave_db: Optional[str], design_db: Optional[str] = None) -> bool:
        self.close()
        wave_path = Path(wave_db).expanduser() if wave_db else None
        design_path = Path(design_db).expanduser() if design_db else None

        if wave_path is not None and not wave_path.is_file():
            raise FileNotFoundError(f"Wave database not found: {wave_path}")
        if design_path is not None and not design_path.is_file():
            raise FileNotFoundError(f"Design database not found: {design_path}")

        if wave_path is not None and design_path is None:
            sibling = wave_path.parent / "hierarchy.tree.json"
            if sibling.is_file():
                design_path = sibling

        if wave_path is None and design_path is None:
            raise ValueError("A VCD wave file or Verilator hierarchy JSON is required")

        vcd_tops: List[_Scope] = []
        vcd_scopes: Dict[str, _Scope] = {}
        vcd_signals: Dict[str, _Signal] = {}
        time_unit = "ns"
        min_time = 0
        max_time = 0

        if wave_path is not None:
            if wave_path.suffix.lower() != ".vcd":
                raise ValueError(
                    f"Verilator adapter reads VCD waves, got {wave_path.name}. "
                    "Re-run with --trace (VCD), not --trace-fst."
                )
            vcd_tops, vcd_scopes, vcd_signals, time_unit, min_time, max_time = _parse_vcd(wave_path)

        if design_path is not None:
            tree = json.loads(design_path.read_text())
            if not isinstance(tree, dict) or "modulesp" not in tree:
                raise ValueError(f"Not a Verilator hierarchy JSON file: {design_path}")
            self._tops, self._scopes, self._signals = _hierarchy_from_json(tree)
            _attach_waves(self._signals, vcd_signals)
            if not time_unit or time_unit == "ns" and wave_path is None:
                time_unit = _time_unit(tree.get("timeunit")) or time_unit
        else:
            self._tops, self._scopes, self._signals = vcd_tops, vcd_scopes, vcd_signals

        if wave_path is None:
            min_time = 0
            max_time = 0

        self._wave_path = str(wave_path) if wave_path else None
        self._design_path = str(design_path) if design_path else None
        self._info = DatabaseInfo(
            file_path=self._wave_path or self._design_path or "",
            time_unit=time_unit,
            min_time=min_time,
            max_time=max_time,
            simulator="Verilator",
            is_completed=True,
        )
        return True

    def close(self) -> None:
        self._wave_path = None
        self._design_path = None
        self._info = None
        self._tops = []
        self._scopes = {}
        self._signals = {}

    def get_info(self) -> DatabaseInfo:
        if self._info is None:
            raise RuntimeError("No database open")
        return self._info

    def get_top_scopes(self) -> List[ScopeInfo]:
        return [scope.info for scope in self._tops]

    def get_child_scopes(self, scope_path: str) -> List[ScopeInfo]:
        scope = self._require_scope(scope_path)
        return [child.info for child in scope.children.values()]

    def get_scope_info(self, scope_path: str) -> Optional[ScopeInfo]:
        scope = self._scopes.get(scope_path)
        return scope.info if scope else None

    def get_signals(self, scope_path: str) -> List[SignalInfo]:
        scope = self._require_scope(scope_path)
        return [sig.info for sig in scope.signals.values()]

    def get_signal_info(self, signal_path: str) -> Optional[SignalInfo]:
        sig = self._signals.get(signal_path)
        return sig.info if sig else None

    def search_signals(
        self, pattern: str, scope_path: Optional[str] = None, limit: int = 100
    ) -> List[SignalInfo]:
        needle = pattern.lower()
        use_glob = any(ch in pattern for ch in "*?[]")
        results: List[SignalInfo] = []
        for path, sig in self._signals.items():
            if scope_path and path != scope_path and not path.startswith(scope_path + "."):
                continue
            name = sig.info.name
            if use_glob:
                import fnmatch
                if not (fnmatch.fnmatch(path, pattern) or fnmatch.fnmatch(name, pattern)):
                    continue
            elif needle not in path.lower() and needle not in name.lower():
                continue
            results.append(sig.info)
            if len(results) >= limit:
                break
        return results

    def get_waveform(
        self, signal_path: str, start_time: int, end_time: int, max_changes: int = 10000
    ) -> WaveformData:
        info = self.get_info()
        sig = self._signals.get(signal_path)
        if sig is None:
            raise ValueError(f"Signal not found: {signal_path}")
        return WaveformData(
            signal_path=signal_path,
            start_time=start_time,
            end_time=end_time,
            time_unit=info.time_unit,
            changes=_window(sig.changes, start_time, end_time, max_changes),
        )

    def get_value_at_time(self, signal_path: str, time: int) -> Optional[str]:
        sig = self._signals.get(signal_path)
        if sig is None or not sig.changes:
            return None
        value = sig.changes[0][1]
        for change_time, change_value in sig.changes:
            if change_time > time:
                break
            value = change_value
        return value

    def get_waveforms_batch(
        self,
        signal_paths: List[str],
        start_time: int,
        end_time: int,
        max_changes: int = 10000,
    ) -> Dict[str, WaveformData]:
        info = self.get_info()
        results: Dict[str, WaveformData] = {}
        for path in signal_paths:
            sig = self._signals.get(path)
            changes = [] if sig is None else _window(sig.changes, start_time, end_time, max_changes)
            results[path] = WaveformData(
                signal_path=path,
                start_time=start_time,
                end_time=end_time,
                time_unit=info.time_unit,
                changes=changes,
            )
        return results

    def _require_scope(self, scope_path: str) -> _Scope:
        scope = self._scopes.get(scope_path)
        if scope is None:
            raise ValueError(f"Scope not found: {scope_path}")
        return scope


def _window(
    changes: List[Tuple[int, str]], start_time: int, end_time: int, max_changes: int
) -> List[ValueChange]:
    """Include the value in force at start_time, then changes through end_time."""
    if not changes:
        return []
    start_index = 0
    for index, (change_time, _) in enumerate(changes):
        if change_time <= start_time:
            start_index = index
        else:
            break
    selected = []
    for change_time, value in changes[start_index:]:
        if change_time > end_time:
            break
        selected.append(ValueChange(time=change_time, value=value))
        if len(selected) >= max_changes:
            break
    return selected


def _parse_vcd(
    path: Path,
) -> Tuple[List[_Scope], Dict[str, _Scope], Dict[str, _Signal], str, int, int]:
    text = path.read_text(errors="replace")
    scopes: Dict[str, _Scope] = {}
    signals: Dict[str, _Signal] = {}
    by_code: Dict[str, List[_Signal]] = {}
    stack: List[_Scope] = []
    tops: List[_Scope] = []
    time_unit = "ns"
    time_scale = 1
    in_defs = True
    cur_time = 0
    min_time: Optional[int] = None
    max_time = 0

    raw_lines = text.splitlines()
    index = 0
    while index < len(raw_lines):
        line = raw_lines[index].strip()
        index += 1
        if line.startswith("$") and "$end" not in line:
            while index < len(raw_lines) and "$end" not in line:
                line += " " + raw_lines[index].strip()
                index += 1
        if not line:
            continue
        if in_defs:
            if line.startswith("$timescale"):
                unit_text = line
                if "$end" not in line:
                    continue
                match = re.search(r"(\d+)\s*(fs|ps|ns|us|ms|s)", unit_text)
                if match:
                    time_scale = int(match.group(1))
                    time_unit = match.group(2)
                continue
            if line.startswith("$scope"):
                parts = line.replace("$end", "").split()
                # $scope <type> <name> $end
                if len(parts) >= 3:
                    scope_name = parts[2]
                    parent = stack[-1].path if stack else ""
                    scope_path = f"{parent}.{scope_name}" if parent else scope_name
                    scope = _Scope(scope_path, scope_name, ScopeType.MODULE, None)
                    scopes[scope_path] = scope
                    if stack:
                        stack[-1].children[scope_name] = scope
                    else:
                        tops.append(scope)
                    stack.append(scope)
                continue
            if line.startswith("$upscope"):
                if stack:
                    stack.pop()
                continue
            if line.startswith("$var"):
                signal = _parse_var(line, stack[-1] if stack else None)
                if signal is None:
                    continue
                parent = stack[-1] if stack else None
                if parent is None:
                    continue
                parent.signals[signal.info.name] = signal
                signals[signal.info.path] = signal
                code = line.split()[3]
                by_code.setdefault(code, []).append(signal)
                continue
            if line.startswith("$enddefinitions"):
                in_defs = False
            continue

        if line.startswith("#"):
            try:
                cur_time = int(line[1:].split()[0]) * time_scale
            except ValueError:
                continue
            if min_time is None:
                min_time = cur_time
            max_time = cur_time
            continue
        if line.startswith("$"):
            continue
        _apply_change(line, by_code, cur_time)
        if min_time is None:
            min_time = cur_time

    if min_time is None:
        min_time = 0
    return tops, scopes, signals, time_unit, min_time, max_time


def _parse_var(line: str, parent: Optional[_Scope]) -> Optional[_Signal]:
    body = line.replace("$end", "").strip()
    parts = body.split()
    # $var type width code name [msb:lsb]
    if len(parts) < 5 or parent is None:
        return None
    try:
        width = int(parts[2])
    except ValueError:
        width = 1
    name = parts[4]
    left = width - 1
    right = 0
    if len(parts) >= 6:
        match = re.match(r"\[(-?\d+):(-?\d+)\]", parts[5])
        if match:
            left = int(match.group(1))
            right = int(match.group(2))
            width = abs(left - right) + 1
    path = f"{parent.path}.{name}"
    info = SignalInfo(
        path=path,
        name=name,
        width=width,
        left_range=left,
        right_range=right,
        direction=SignalDirection.NONE,
    )
    return _Signal(info)


def _apply_change(line: str, by_code: Dict[str, List[_Signal]], time: int) -> None:
    if not line:
        return
    if line[0] in "bBrR":
        chunks = line.split()
        if len(chunks) < 2:
            return
        raw = chunks[0][1:]
        code = chunks[1]
    else:
        raw = line[0]
        code = line[1:].strip()
    if not code:
        return
    for sig in by_code.get(code, []):
        value = _format_value(raw, sig.info.width)
        if sig.changes and sig.changes[-1][1] == value and sig.changes[-1][0] == time:
            continue
        sig.changes.append((time, value))


def _format_value(raw: str, width: int) -> str:
    bits = raw.strip().lower()
    if width <= 1:
        return bits[:1] if bits else "x"
    if any(ch in bits for ch in "xz"):
        return bits
    try:
        digits = (width + 3) // 4
        return f"{int(bits, 2):0{digits}x}"
    except ValueError:
        return bits


def _hierarchy_from_json(
    tree: dict,
) -> Tuple[List[_Scope], Dict[str, _Scope], Dict[str, _Signal]]:
    by_addr: Dict[str, dict] = {}

    def index(node: object) -> None:
        if isinstance(node, dict):
            addr = node.get("addr")
            if isinstance(addr, str):
                by_addr[addr] = node
            for value in node.values():
                index(value)
        elif isinstance(node, list):
            for item in node:
                index(item)

    index(tree)

    modules = [
        mod
        for mod in tree.get("modulesp", [])
        if isinstance(mod, dict) and _is_user_module(mod)
    ]
    referenced = set()
    for mod in modules:
        for cell in _cells(mod):
            modp = cell.get("modp")
            if isinstance(modp, str):
                referenced.add(modp)

    tops_mods = [mod for mod in modules if mod.get("addr") not in referenced]
    if not tops_mods:
        tops_mods = modules[:1]

    scopes: Dict[str, _Scope] = {}
    signals: Dict[str, _Signal] = {}
    tops: List[_Scope] = []
    for mod in tops_mods:
        scope = _add_module_scope(mod, parent_path="", scopes=scopes, signals=signals, by_addr=by_addr)
        tops.append(scope)
    return tops, scopes, signals


def _is_user_module(mod: dict) -> bool:
    if mod.get("type") != "MODULE":
        return False
    name = str(mod.get("name") or "")
    if not name or name.startswith("@") or name.startswith("$"):
        return False
    if mod.get("dead") or mod.get("inLibrary"):
        return False
    return True


def _add_module_scope(
    mod: dict,
    parent_path: str,
    instance_name: Optional[str] = None,
    scopes: Dict[str, _Scope] = None,
    signals: Dict[str, _Signal] = None,
    by_addr: Dict[str, dict] = None,
) -> _Scope:
    assert scopes is not None and signals is not None and by_addr is not None
    name = instance_name or str(mod.get("origName") or mod.get("name"))
    path = f"{parent_path}.{name}" if parent_path else name
    def_name = str(mod.get("origName") or mod.get("name") or name)
    scope = _Scope(path, name, ScopeType.MODULE, def_name)
    scopes[path] = scope
    _walk_stmts(mod, scope, scopes, signals, by_addr)
    return scope


def _walk_stmts(
    node: dict,
    scope: _Scope,
    scopes: Dict[str, _Scope],
    signals: Dict[str, _Signal],
    by_addr: Dict[str, dict],
) -> None:
    for child in node.get("stmtsp") or []:
        if not isinstance(child, dict):
            continue
        kind = child.get("type")
        if kind == "VAR":
            _add_var(child, scope, signals, by_addr)
        elif kind == "CELL":
            _add_cell(child, scope, scopes, signals, by_addr)
        elif kind == "BEGIN":
            if child.get("generate") or _contains_cell(child):
                block_name = str(child.get("name") or "genblk")
                block_path = f"{scope.path}.{block_name}"
                block = _Scope(block_path, block_name, ScopeType.GENERATE, None)
                scopes[block_path] = block
                scope.children[block_name] = block
                _walk_stmts(child, block, scopes, signals, by_addr)
            else:
                _walk_stmts(child, scope, scopes, signals, by_addr)
        else:
            _walk_stmts(child, scope, scopes, signals, by_addr)


def _contains_cell(node: dict) -> bool:
    for child in node.get("stmtsp") or []:
        if isinstance(child, dict) and child.get("type") == "CELL":
            return True
    return False


def _cells(mod: dict) -> Iterable[dict]:
    found: List[dict] = []

    def walk(node: dict) -> None:
        for child in node.get("stmtsp") or []:
            if not isinstance(child, dict):
                continue
            if child.get("type") == "CELL":
                found.append(child)
            else:
                walk(child)

    walk(mod)
    return found


def _add_cell(
    cell: dict,
    parent: _Scope,
    scopes: Dict[str, _Scope],
    signals: Dict[str, _Signal],
    by_addr: Dict[str, dict],
) -> None:
    inst_name = str(cell.get("name") or "inst")
    mod = by_addr.get(cell.get("modp"))
    if not isinstance(mod, dict):
        child = _Scope(f"{parent.path}.{inst_name}", inst_name, ScopeType.MODULE, None)
        scopes[child.path] = child
        parent.children[inst_name] = child
        return
    child = _add_module_scope(
        mod,
        parent_path=parent.path,
        instance_name=inst_name,
        scopes=scopes,
        signals=signals,
        by_addr=by_addr,
    )
    parent.children[inst_name] = child


def _add_var(
    var: dict,
    scope: _Scope,
    signals: Dict[str, _Signal],
    by_addr: Dict[str, dict],
) -> None:
    name = str(var.get("name") or "")
    if not name or name.startswith("__"):
        return
    if var.get("isParam") or var.get("isGParam"):
        return
    var_type = str(var.get("varType") or "")
    direction_name = str(var.get("direction") or "NONE")
    if var_type not in _KEEP_VAR_TYPES and direction_name not in _DIRECTION:
        return
    width, left, right = _var_width(var, by_addr)
    path = f"{scope.path}.{name}"
    info = SignalInfo(
        path=path,
        name=name,
        width=width,
        left_range=left,
        right_range=right,
        direction=_DIRECTION.get(direction_name, SignalDirection.NONE),
    )
    sig = _Signal(info)
    scope.signals[name] = sig
    signals[path] = sig


def _var_width(var: dict, by_addr: Dict[str, dict]) -> Tuple[int, int, int]:
    dtype = by_addr.get(var.get("dtypep"))
    if isinstance(dtype, dict):
        packed = dtype.get("range")
        if isinstance(packed, str) and ":" in packed:
            left_s, right_s = packed.split(":", 1)
            left, right = int(left_s), int(right_s)
            return abs(left - right) + 1, left, right
    return 1, 0, 0


def _attach_waves(design_signals: Dict[str, _Signal], vcd_signals: Dict[str, _Signal]) -> None:
    waves: Dict[str, _Signal] = {}
    for path, sig in vcd_signals.items():
        waves[path] = sig
        if path.startswith("TOP."):
            waves[path[4:]] = sig
    for path, sig in design_signals.items():
        traced = waves.get(path)
        if traced is None:
            continue
        sig.changes = traced.changes
        if traced.info.width > sig.info.width:
            sig.info.width = traced.info.width
            sig.info.left_range = traced.info.left_range
            sig.info.right_range = traced.info.right_range


def _time_unit(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    match = re.search(r"(fs|ps|ns|us|ms|s)", raw)
    return match.group(1) if match else None
