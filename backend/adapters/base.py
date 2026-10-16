"""
Abstract base class for vendor-specific wave/design database adapters.
All vendor adapters must implement this interface.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum


class SignalDirection(str, Enum):
    INPUT = "input"
    OUTPUT = "output"
    INOUT = "inout"
    NONE = "none"


class ScopeType(str, Enum):
    MODULE = "module"
    TASK = "task"
    FUNCTION = "function"
    BLOCK = "block"
    GENERATE = "generate"
    INTERFACE = "interface"
    PACKAGE = "package"
    PROCESS = "process"
    ARCHITECTURE = "architecture"
    UNKNOWN = "unknown"


@dataclass
class DatabaseInfo:
    """Metadata about an open database"""
    file_path: str
    time_unit: str
    min_time: int
    max_time: int
    version: Optional[str] = None
    simulator: Optional[str] = None
    is_completed: bool = True


@dataclass
class ScopeInfo:
    """Information about a scope (module, interface, etc.)"""
    path: str
    name: str
    scope_type: ScopeType
    def_name: Optional[str] = None
    has_children: bool = False
    has_signals: bool = False


@dataclass  
class SignalInfo:
    """Information about a signal"""
    path: str
    name: str
    width: int
    left_range: int
    right_range: int
    direction: SignalDirection
    is_real: bool = False
    is_array: bool = False
    is_composite: bool = False
    has_members: bool = False


@dataclass
class ValueChange:
    """A single value change event"""
    time: int
    value: str
    

@dataclass
class WaveformData:
    """Waveform data for a signal over a time range"""
    signal_path: str
    start_time: int
    end_time: int
    time_unit: str
    changes: List[ValueChange]


class BaseAdapter(ABC):
    """
    Abstract base class for wave/design database adapters.
    
    Each vendor (Verdi, Questa, VCS, etc.) should implement this interface
    to provide access to their specific database formats.
    """
    
    @abstractmethod
    def open(self, wave_db: str, design_db: Optional[str] = None) -> bool:
        """
        Open wave and optionally design database files.
        
        Args:
            wave_db: Path to waveform database (e.g., FSDB, VCD)
            design_db: Path to design database (e.g., KDB), optional
            
        Returns:
            True if successful, False otherwise
        """
        pass
    
    @abstractmethod
    def close(self) -> None:
        """Close all open databases and release resources."""
        pass
    
    @abstractmethod
    def get_info(self) -> DatabaseInfo:
        """Get metadata about the open database."""
        pass
    
    # -------------------------------------------------------------------------
    # Hierarchy Navigation
    # -------------------------------------------------------------------------
    
    @abstractmethod
    def get_top_scopes(self) -> List[ScopeInfo]:
        """Get list of top-level scopes."""
        pass
    
    @abstractmethod
    def get_child_scopes(self, scope_path: str) -> List[ScopeInfo]:
        """
        Get child scopes of a given scope.
        
        Args:
            scope_path: Full hierarchical path to parent scope
            
        Returns:
            List of child scopes
        """
        pass
    
    @abstractmethod
    def get_scope_info(self, scope_path: str) -> Optional[ScopeInfo]:
        """
        Get information about a specific scope.
        
        Args:
            scope_path: Full hierarchical path
            
        Returns:
            ScopeInfo or None if not found
        """
        pass
    
    # -------------------------------------------------------------------------
    # Signal Access
    # -------------------------------------------------------------------------
    
    @abstractmethod
    def get_signals(self, scope_path: str) -> List[SignalInfo]:
        """
        Get signals in a given scope.
        
        Args:
            scope_path: Full hierarchical path to scope
            
        Returns:
            List of signals in the scope
        """
        pass
    
    @abstractmethod
    def get_signal_info(self, signal_path: str) -> Optional[SignalInfo]:
        """
        Get information about a specific signal.
        
        Args:
            signal_path: Full hierarchical path to signal
            
        Returns:
            SignalInfo or None if not found
        """
        pass
    
    @abstractmethod
    def search_signals(self, pattern: str, scope_path: Optional[str] = None, 
                       limit: int = 100) -> List[SignalInfo]:
        """
        Search for signals matching a pattern.
        
        Args:
            pattern: Search pattern (supports wildcards)
            scope_path: Optional scope to search within
            limit: Maximum number of results
            
        Returns:
            List of matching signals
        """
        pass
    
    # -------------------------------------------------------------------------
    # Waveform Data
    # -------------------------------------------------------------------------
    
    @abstractmethod
    def get_waveform(self, signal_path: str, start_time: int, 
                     end_time: int, max_changes: int = 10000) -> WaveformData:
        """
        Get waveform data for a signal within a time range.
        
        Args:
            signal_path: Full hierarchical path to signal
            start_time: Start time in database time units
            end_time: End time in database time units
            max_changes: Maximum number of value changes to return
            
        Returns:
            WaveformData containing value changes
        """
        pass
    
    @abstractmethod
    def get_value_at_time(self, signal_path: str, time: int) -> Optional[str]:
        """
        Get signal value at a specific time.
        
        Args:
            signal_path: Full hierarchical path to signal
            time: Time point in database time units
            
        Returns:
            Value as string or None if not found
        """
        pass
    
    @abstractmethod
    def get_waveforms_batch(self, signal_paths: List[str], start_time: int,
                            end_time: int, max_changes: int = 10000) -> Dict[str, WaveformData]:
        """
        Get waveform data for multiple signals (more efficient than individual calls).
        
        Args:
            signal_paths: List of signal paths
            start_time: Start time
            end_time: End time
            max_changes: Maximum changes per signal
            
        Returns:
            Dictionary mapping signal paths to WaveformData
        """
        pass
