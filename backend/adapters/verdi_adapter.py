"""
Verdi NPI Adapter - Implementation of BaseAdapter using Synopsys NPI.

This adapter provides access to FSDB waveform files and KDB design databases
without launching the Verdi GUI.
"""

import os
import re
import fnmatch
import logging
from typing import List, Optional, Dict, Any
from contextlib import contextmanager

from .base import (
    BaseAdapter, DatabaseInfo, ScopeInfo, SignalInfo, 
    WaveformData, ValueChange, SignalDirection, ScopeType
)

# Configure logging for NPI operations
logger = logging.getLogger("wave_browser.npi")

# Import NPI - requires proper environment setup
try:
    from pynpi import npisys, waveform, wave, netlist
    NPI_AVAILABLE = True
    logger.info("pynpi loaded successfully")
except ImportError as e:
    NPI_AVAILABLE = False
    logger.warning(f"pynpi not available: {e}. Set VERDI_HOME and PYTHONPATH correctly.")


def _map_scope_type(npi_type: int) -> ScopeType:
    """Map NPI scope type to our generic ScopeType enum."""
    scope_map = {
        wave.ScopeSvModule: ScopeType.MODULE,
        wave.ScopeSvTask: ScopeType.TASK,
        wave.ScopeSvFunction: ScopeType.FUNCTION,
        wave.ScopeSvBegin: ScopeType.BLOCK,
        wave.ScopeSvFork: ScopeType.BLOCK,
        wave.ScopeSvGenerate: ScopeType.GENERATE,
        wave.ScopeSvInterface: ScopeType.INTERFACE,
        wave.ScopeVhArchitecture: ScopeType.ARCHITECTURE,
        wave.ScopeVhProcess: ScopeType.PROCESS,
        wave.ScopeVhBlock: ScopeType.BLOCK,
        wave.ScopeScModule: ScopeType.MODULE,
    }
    return scope_map.get(npi_type, ScopeType.UNKNOWN)


def _map_direction(npi_dir: int) -> SignalDirection:
    """Map NPI direction to our generic SignalDirection enum."""
    dir_map = {
        wave.DirInput: SignalDirection.INPUT,
        wave.DirOutput: SignalDirection.OUTPUT,
        wave.DirInout: SignalDirection.INOUT,
        wave.DirNone: SignalDirection.NONE,
    }
    return dir_map.get(npi_dir, SignalDirection.NONE)


def _npi_value(result, default=0):
    """Extract a value from a low-level NPI API return.

    Low-level pynpi.wave helpers return either a bare value or a
    (status, value) tuple/list where status == 1 indicates success.
    """
    if isinstance(result, (list, tuple)):
        if len(result) >= 2:
            status, value = result[0], result[1]
            if status == 1:
                return value
            return default
        if len(result) == 1:
            return result[0]
    if result is None:
        return default
    return result


def _npi_time_value(result, default: int = 0) -> int:
    """Extract a time integer from a low-level NPI API return value."""
    return int(_npi_value(result, default))


class VerdiAdapter(BaseAdapter):
    """
    Adapter for Synopsys Verdi FSDB/KDB databases using NPI.
    
    Usage:
        adapter = VerdiAdapter()
        adapter.open("/path/to/waves.fsdb")
        
        # Browse hierarchy
        for scope in adapter.get_top_scopes():
            print(scope.name)
            
        # Get waveform data
        waveform = adapter.get_waveform("top.clk", 0, 1000)
        for change in waveform.changes:
            print(f"{change.time}: {change.value}")
            
        adapter.close()
    """
    
    def __init__(self):
        if not NPI_AVAILABLE:
            raise RuntimeError(
                "pynpi is not available. Ensure VERDI_HOME is set and "
                "PYTHONPATH includes $VERDI_HOME/share/NPI/python"
            )
        
        self._file_handle = None
        self._design_handle = None
        self._wave_path: Optional[str] = None
        self._design_path: Optional[str] = None
        self._initialized = False
        
        # Cache for scope handles
        self._scope_cache: Dict[str, Any] = {}
        
    def _ensure_initialized(self):
        """Initialize NPI if not already done."""
        if not self._initialized:
            npisys.init([])
            self._initialized = True
    
    def open(self, wave_db: Optional[str] = None, design_db: Optional[str] = None) -> bool:
        """Open FSDB waveform file and/or KDB design database.
        
        Args:
            wave_db: Path to FSDB waveform file (optional)
            design_db: Path to KDB design database, RTL source files, or directory
                      of RTL files (optional). Can be:
                      - Single file: "top.v" or "design.f"
                      - Multiple files: "mod1.v mod2.v" (space-separated)
                      - Directory: Loads all .v/.sv files in directory
            
        At least one of wave_db or design_db must be provided.
        """
        logger.info(f"Opening database: wave_db={wave_db}, design_db={design_db}")
        self._ensure_initialized()
        
        if not wave_db and not design_db:
            raise ValueError("At least one of wave_db or design_db must be provided")
        
        # Open waveform database (FSDB)
        if wave_db:
            if not os.path.exists(wave_db):
                logger.error(f"Wave database not found: {wave_db}")
                raise FileNotFoundError(f"Wave database not found: {wave_db}")
            
            logger.info(f"Opening FSDB waveform: {wave_db}")
            self._wave_path = wave_db
            self._file_handle = wave.open(wave_db)
            
            if self._file_handle is None:
                logger.error(f"Failed to open wave database: {wave_db}")
                raise RuntimeError(f"Failed to open wave database: {wave_db}")
            logger.info(f"FSDB opened successfully, handle={self._file_handle}")
        
        # Load design database 
        if design_db:
            self._design_path = design_db
            
            # Determine how to load the design
            load_args = self._build_load_design_args(design_db)
            logger.info(f"Loading design with args: {load_args}")
            
            result = npisys.load_design(load_args)
            logger.info(f"load_design returned: {result}")
            if result == 1:
                self._design_handle = True  # Mark as loaded
                logger.info("Design loaded successfully")
            else:
                logger.warning(f"load_design returned non-success value: {result}")
            
        return True
    
    def _build_load_design_args(self, design_db: str) -> List[str]:
        """Build arguments for npisys.load_design based on design_db type."""
        logger.debug(f"Building load_design args for: {design_db}")
        
        # Check if it's a space-separated list of files
        if ' ' in design_db:
            files = design_db.split()
            logger.debug(f"Detected space-separated file list: {files}")
            # Verify all files exist
            for f in files:
                if not os.path.exists(f):
                    logger.error(f"File not found: {f}")
                    raise FileNotFoundError(f"Design file not found: {f}")
            return ['-sverilog'] + files
        
        # Check if path exists
        if not os.path.exists(design_db):
            logger.error(f"Design database path not found: {design_db}")
            raise FileNotFoundError(f"Design database not found: {design_db}")
        
        # If it's a directory, find all Verilog/SystemVerilog files
        if os.path.isdir(design_db):
            logger.debug(f"Design path is a directory: {design_db}")
            v_files = []
            for root, _, files in os.walk(design_db):
                for f in files:
                    if f.endswith(('.v', '.sv', '.vh', '.svh')):
                        v_files.append(os.path.join(root, f))
            if v_files:
                logger.debug(f"Found {len(v_files)} Verilog files in directory")
                return ['-sverilog'] + v_files
            else:
                # Maybe it's a pre-compiled library
                logger.debug("No Verilog files found, assuming pre-compiled database")
                return ['-ssf', design_db]
        
        # Single file - check extension
        if design_db.endswith(('.v', '.sv', '.vh', '.svh')):
            logger.debug(f"Single Verilog file: {design_db}")
            return ['-sverilog', design_db]
        elif design_db.endswith('.f'):
            logger.debug(f"File list: {design_db}")
            return ['-f', design_db]
        else:
            # Assume it's a pre-compiled database
            logger.debug(f"Assuming pre-compiled database: {design_db}")
            return ['-ssf', design_db]
    
    def close(self) -> None:
        """Close all open databases."""
        if self._file_handle:
            wave.close(self._file_handle)
            self._file_handle = None
        
        # Note: KDB is loaded globally via npisys.load_design and persists
        # until npisys.end() is called. For proper cleanup in a multi-session
        # environment, we'd need to track design state more carefully.
        self._design_handle = None
        
        self._scope_cache.clear()
        self._wave_path = None
        self._design_path = None
    
    def get_info(self) -> DatabaseInfo:
        """Get metadata about the open database(s)."""
        if not self._file_handle and not self._design_handle:
            raise RuntimeError("No database open")
        
        # If we have FSDB, get timing info from it
        if self._file_handle:
            time_unit = wave.file_property_str(wave.FileScaleUnit, self._file_handle) or "ns"
            min_time = _npi_time_value(wave.min_time(self._file_handle))
            max_time = _npi_time_value(wave.max_time(self._file_handle))
            version = wave.file_property_str(wave.FileVersion, self._file_handle)
            is_completed = _npi_value(wave.file_property(wave.FileIsCompleted, self._file_handle)) == 1
        else:
            # Design-only mode - no timing information
            time_unit = "ns"
            min_time = 0
            max_time = 0
            version = None
            is_completed = True
            
        return DatabaseInfo(
            file_path=self._wave_path or self._design_path or "",
            time_unit=time_unit,
            min_time=min_time,
            max_time=max_time,
            version=version,
            is_completed=is_completed
        )
    
    # -------------------------------------------------------------------------
    # Hierarchy Navigation
    # -------------------------------------------------------------------------
    
    def get_top_scopes(self) -> List[ScopeInfo]:
        """Get list of top-level scopes from FSDB or KDB."""
        # Use FSDB if available (has waveform data)
        if self._file_handle:
            scopes = []
            scope_iter = wave.iter_top_scope(self._file_handle)
            
            while True:
                scope = wave.iter_scope_next(scope_iter)
                if scope is None:
                    break
                scopes.append(self._scope_to_info(scope))
                
            wave.iter_scope_stop(scope_iter)
            return scopes
        
        # Fall back to netlist API for design-only mode
        if self._design_handle:
            scopes = []
            top_list = netlist.get_top_inst_list()
            for inst in top_list:
                scopes.append(self._inst_to_scope_info(inst))
            return scopes
            
        raise RuntimeError("No database open")
    
    def get_child_scopes(self, scope_path: str) -> List[ScopeInfo]:
        """Get child scopes of a given scope."""
        # Use FSDB if available
        if self._file_handle:
            parent_scope = self._get_scope_handle(scope_path)
            if not parent_scope:
                return []
                
            scopes = []
            scope_iter = wave.iter_child_scope(parent_scope)
            
            while True:
                scope = wave.iter_scope_next(scope_iter)
                if scope is None:
                    break
                scopes.append(self._scope_to_info(scope))
                
            wave.iter_scope_stop(scope_iter)
            return scopes
        
        # Fall back to netlist API for design-only mode
        if self._design_handle:
            inst = self._get_inst_handle(scope_path)
            if not inst:
                return []
            
            scopes = []
            for child in inst.inst_list():
                # Filter out internal compiler-generated instances
                child_name = child.name()
                if child.def_name() and not '#' in child_name:
                    scopes.append(self._inst_to_scope_info(child))
            return scopes
            
        raise RuntimeError("No database open")
    
    def get_scope_info(self, scope_path: str) -> Optional[ScopeInfo]:
        """Get information about a specific scope."""
        scope = self._get_scope_handle(scope_path)
        if scope:
            return self._scope_to_info(scope)
        return None
    
    def _get_scope_handle(self, scope_path: str) -> Optional[Any]:
        """Get NPI scope handle by path, using cache."""
        if scope_path in self._scope_cache:
            return self._scope_cache[scope_path]
            
        scope = wave.scope_by_name(self._file_handle, scope_path, None)
        if scope:
            self._scope_cache[scope_path] = scope
        return scope
    
    def _scope_to_info(self, scope) -> ScopeInfo:
        """Convert NPI scope handle to ScopeInfo."""
        name = wave.scope_property_str(wave.ScopeName, scope) or ""
        full_name = wave.scope_property_str(wave.ScopeFullName, scope) or ""
        def_name = wave.scope_property_str(wave.ScopeDefName, scope)
        scope_type_val = _npi_value(wave.scope_property(wave.ScopeType, scope))
        
        # Check if has children
        child_iter = wave.iter_child_scope(scope)
        has_children = wave.iter_scope_next(child_iter) is not None
        wave.iter_scope_stop(child_iter)
        
        # Check if has signals
        sig_iter = wave.iter_sig(scope)
        has_signals = wave.iter_sig_next(sig_iter) is not None
        wave.iter_sig_stop(sig_iter)
        
        return ScopeInfo(
            path=full_name,
            name=name,
            scope_type=_map_scope_type(scope_type_val),
            def_name=def_name,
            has_children=has_children,
            has_signals=has_signals
        )
    
    def _inst_to_scope_info(self, inst) -> ScopeInfo:
        """Convert netlist InstHdl to ScopeInfo (for design-only mode)."""
        name = inst.name()
        full_name = inst.full_name()
        def_name = inst.def_name()
        
        # Get child instances (for has_children check)
        children = inst.inst_list()
        # Filter out compiler-generated instances
        real_children = [c for c in children if c.def_name() and '#' not in c.name()]
        
        # Get nets (for has_signals check)  
        nets = inst.net_list()
        
        return ScopeInfo(
            path=full_name,
            name=name,
            scope_type=ScopeType.MODULE,
            def_name=def_name,
            has_children=len(real_children) > 0,
            has_signals=len(nets) > 0
        )
    
    def _get_inst_handle(self, path: str):
        """Get netlist instance handle by path (for design-only mode)."""
        # Use netlist API to find instance
        inst = netlist.get_inst(path)
        return inst
    
    # -------------------------------------------------------------------------
    # Signal Access
    # -------------------------------------------------------------------------
    
    def get_signals(self, scope_path: str) -> List[SignalInfo]:
        """Get signals in a given scope."""
        # Use FSDB if available
        if self._file_handle:
            scope = self._get_scope_handle(scope_path)
            if not scope:
                return []
                
            signals = []
            sig_iter = wave.iter_sig(scope)
            
            while True:
                sig = wave.iter_sig_next(sig_iter)
                if sig is None:
                    break
                signals.append(self._signal_to_info(sig))
                
            wave.iter_sig_stop(sig_iter)
            return signals
        
        # Fall back to netlist API for design-only mode
        if self._design_handle:
            inst = self._get_inst_handle(scope_path)
            if not inst:
                return []
            
            signals = []
            for net in inst.net_list():
                signals.append(self._net_to_signal_info(net, scope_path))
            return signals
            
        raise RuntimeError("No database open")
    
    def get_signal_info(self, signal_path: str) -> Optional[SignalInfo]:
        """Get information about a specific signal."""
        sig = wave.sig_by_name(self._file_handle, signal_path, None)
        if sig:
            return self._signal_to_info(sig)
        return None
    
    def _signal_to_info(self, sig) -> SignalInfo:
        """Convert NPI signal handle to SignalInfo."""
        name = wave.sig_property_str(wave.SigName, sig) or ""
        full_name = wave.sig_property_str(wave.SigFullName, sig) or ""
        
        left = _npi_value(wave.sig_property(wave.SigLeftRange, sig))
        right = _npi_value(wave.sig_property(wave.SigRightRange, sig))
        width = _npi_value(wave.sig_property(wave.SigRangeSize, sig), 1) or 1

        direction = _map_direction(_npi_value(wave.sig_property(wave.SigDirection, sig)))
        is_real = _npi_value(wave.sig_property(wave.SigIsReal, sig)) == 1
        has_members = _npi_value(wave.sig_property(wave.SigHasMember, sig)) == 1
        
        return SignalInfo(
            path=full_name,
            name=name,
            width=width,
            left_range=left,
            right_range=right,
            direction=direction,
            is_real=is_real,
            has_members=has_members
        )
    
    def _net_to_signal_info(self, net, scope_path: str) -> SignalInfo:
        """Convert netlist NetHdl to SignalInfo (for design-only mode)."""
        name = net.name()
        full_name = f"{scope_path}.{name}" if scope_path else name
        
        # Parse bus range from name like "count_out[7:0]"
        width = 1
        left = 0
        right = 0
        
        bus_match = re.match(r'(.+)\[(\d+):(\d+)\]', name)
        if bus_match:
            name = bus_match.group(1)
            left = int(bus_match.group(2))
            right = int(bus_match.group(3))
            width = abs(left - right) + 1
        
        return SignalInfo(
            path=full_name,
            name=name,
            width=width,
            left_range=left,
            right_range=right,
            direction=SignalDirection.NONE,
            is_real=False,
            has_members=False
        )
    
    def search_signals(self, pattern: str, scope_path: Optional[str] = None,
                       limit: int = 100) -> List[SignalInfo]:
        """Search for signals matching a pattern."""
        results = []
        
        # Convert pattern to regex
        regex_pattern = fnmatch.translate(pattern)
        regex = re.compile(regex_pattern, re.IGNORECASE)
        
        # Use FSDB if available
        if self._file_handle:
            return self._search_signals_wave(pattern, regex, scope_path, limit)
        
        # Fall back to netlist API for design-only mode
        if self._design_handle:
            return self._search_signals_netlist(pattern, regex, scope_path, limit)
            
        return results
    
    def _search_signals_wave(self, pattern: str, regex, scope_path: Optional[str],
                              limit: int) -> List[SignalInfo]:
        """Search signals using wave API (FSDB mode)."""
        results = []
        
        def search_in_scope(scope, depth=0):
            nonlocal results
            if len(results) >= limit:
                return
                
            # Search signals in this scope
            sig_iter = wave.iter_sig(scope)
            while True:
                sig = wave.iter_sig_next(sig_iter)
                if sig is None:
                    break
                    
                full_name = wave.sig_property_str(wave.SigFullName, sig) or ""
                if regex.match(full_name) or pattern.lower() in full_name.lower():
                    results.append(self._signal_to_info(sig))
                    if len(results) >= limit:
                        break
                        
            wave.iter_sig_stop(sig_iter)
            
            if len(results) >= limit:
                return
                
            # Recurse into child scopes
            child_iter = wave.iter_child_scope(scope)
            while True:
                child = wave.iter_scope_next(child_iter)
                if child is None:
                    break
                search_in_scope(child, depth + 1)
                if len(results) >= limit:
                    break
            wave.iter_scope_stop(child_iter)
        
        if scope_path:
            scope = self._get_scope_handle(scope_path)
            if scope:
                search_in_scope(scope)
        else:
            # Search all top scopes
            scope_iter = wave.iter_top_scope(self._file_handle)
            while True:
                scope = wave.iter_scope_next(scope_iter)
                if scope is None:
                    break
                search_in_scope(scope)
            wave.iter_scope_stop(scope_iter)
        
        return results
    
    def _search_signals_netlist(self, pattern: str, regex, scope_path: Optional[str],
                                 limit: int) -> List[SignalInfo]:
        """Search signals using netlist API (design-only mode)."""
        results = []
        
        def search_in_inst(inst, depth=0):
            nonlocal results
            if len(results) >= limit:
                return
            
            inst_path = inst.full_name()
            
            # Search nets in this instance
            for net in inst.net_list():
                net_name = net.name()
                full_name = f"{inst_path}.{net_name}"
                if regex.match(full_name) or pattern.lower() in full_name.lower():
                    results.append(self._net_to_signal_info(net, inst_path))
                    if len(results) >= limit:
                        return
            
            # Recurse into child instances
            for child in inst.inst_list():
                if child.def_name() and '#' not in child.name():
                    search_in_inst(child, depth + 1)
                    if len(results) >= limit:
                        return
        
        if scope_path:
            inst = self._get_inst_handle(scope_path)
            if inst:
                search_in_inst(inst)
        else:
            # Search all top instances
            for top in netlist.get_top_inst_list():
                search_in_inst(top)
                if len(results) >= limit:
                    break
        
        return results
    
    # -------------------------------------------------------------------------
    # Waveform Data
    # -------------------------------------------------------------------------
    
    def get_waveform(self, signal_path: str, start_time: int, 
                     end_time: int, max_changes: int = 10000) -> WaveformData:
        """Get waveform data for a signal within a time range."""
        if not self._file_handle:
            raise RuntimeError("No database open")
        
        sig = wave.sig_by_name(self._file_handle, signal_path, None)
        if not sig:
            raise ValueError(f"Signal not found: {signal_path}")
        
        info = self.get_info()
        changes = []

        # Load value changes for the requested window before iterating
        wave.load_vc_by_range(self._file_handle, start_time, end_time)
        
        # Create VCT iterator for the signal
        vct = wave.create_vct(sig)
        
        # Go to start time
        wave.goto_time(vct, start_time)
        
        count = 0
        while count < max_changes:
            time = _npi_time_value(wave.vct_time(vct))
            if time > end_time:
                break
                
            value = wave.get_value_str(vct, wave.HexStrVal, wave.VCT, 0)
            changes.append(ValueChange(time=time, value=value or ""))
            count += 1
            
            if not _npi_value(wave.goto_next(vct)):
                break
        
        wave.release_vct(vct)
        
        return WaveformData(
            signal_path=signal_path,
            start_time=start_time,
            end_time=end_time,
            time_unit=info.time_unit,
            changes=changes
        )
    
    def get_value_at_time(self, signal_path: str, time: int) -> Optional[str]:
        """Get signal value at a specific time."""
        if not self._file_handle:
            raise RuntimeError("No database open")
        
        sig = wave.sig_by_name(self._file_handle, signal_path, None)
        if not sig:
            return None
        
        vct = wave.create_vct(sig)
        wave.goto_time(vct, time)
        value = wave.get_value_str(vct, wave.HexStrVal, wave.VCT, 0)
        wave.release_vct(vct)
        
        return value
    
    def get_waveforms_batch(self, signal_paths: List[str], start_time: int,
                            end_time: int, max_changes: int = 10000) -> Dict[str, WaveformData]:
        """Get waveform data for multiple signals."""
        if not self._file_handle:
            raise RuntimeError("No database open")

        # Load value changes once for the whole time window
        wave.load_vc_by_range(self._file_handle, start_time, end_time)

        results: Dict[str, WaveformData] = {}
        for path in signal_paths:
            try:
                results[path] = self.get_waveform(
                    path, start_time, end_time, max_changes
                )
            except ValueError:
                info = self.get_info()
                results[path] = WaveformData(
                    signal_path=path,
                    start_time=start_time,
                    end_time=end_time,
                    time_unit=info.time_unit,
                    changes=[],
                )

        return results


# Factory function to get the right adapter
def get_adapter(vendor: str = "verdi") -> BaseAdapter:
    """Factory function to create a vendor-specific adapter."""
    if vendor.lower() == "verdi":
        return VerdiAdapter()
    else:
        raise ValueError(f"Unsupported vendor: {vendor}")
