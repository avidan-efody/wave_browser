"""
Pydantic models for API requests and responses.
"""

from pydantic import BaseModel, Field, model_validator
from typing import List, Optional
from datetime import datetime
from enum import Enum


# ============================================================================
# Enums
# ============================================================================

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


class ValueFormat(str, Enum):
    BIN = "bin"
    OCT = "oct"
    DEC = "dec"
    HEX = "hex"


# ============================================================================
# Session Models
# ============================================================================

class SessionCreate(BaseModel):
    """Request to create a new session."""
    vendor: str = Field(default="verdi", description="Database vendor (verdi, vcd, etc.)")
    wave_db: Optional[str] = Field(None, description="Path to waveform database")
    design_db: Optional[str] = Field(None, description="Path to design database")
    
    @model_validator(mode='after')
    def check_at_least_one_db(self):
        if not self.wave_db and not self.design_db:
            raise ValueError("At least one of wave_db or design_db must be provided")
        return self


class SessionInfo(BaseModel):
    """Information about an open session."""
    id: str
    vendor: str
    wave_db: Optional[str]
    design_db: Optional[str]
    time_unit: str
    min_time: int
    max_time: int
    is_completed: bool
    created_at: datetime


class SessionResponse(BaseModel):
    """Response containing session information."""
    session: SessionInfo


class SessionListResponse(BaseModel):
    """Response containing list of sessions."""
    sessions: List[SessionInfo]


# ============================================================================
# Hierarchy Models
# ============================================================================

class ScopeInfo(BaseModel):
    """Information about a scope (module, interface, etc.)."""
    path: str
    name: str
    scope_type: ScopeType
    def_name: Optional[str] = None
    has_children: bool = False
    has_signals: bool = False


class ScopeListResponse(BaseModel):
    """Response containing list of scopes."""
    scopes: List[ScopeInfo]


class SignalInfo(BaseModel):
    """Information about a signal."""
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


class SignalListResponse(BaseModel):
    """Response containing list of signals."""
    signals: List[SignalInfo]


class SignalSearchRequest(BaseModel):
    """Request to search for signals."""
    pattern: str = Field(..., description="Search pattern (supports wildcards)")
    scope_path: Optional[str] = Field(None, description="Scope to search within")
    limit: int = Field(100, ge=1, le=1000, description="Maximum results")


# ============================================================================
# Waveform Models
# ============================================================================

class ValueChange(BaseModel):
    """A single value change event."""
    time: int
    value: str


class WaveformData(BaseModel):
    """Waveform data for a signal."""
    signal_path: str
    start_time: int
    end_time: int
    time_unit: str
    changes: List[ValueChange]


class WaveformResponse(BaseModel):
    """Response containing waveform data."""
    waveform: WaveformData


class WaveformBatchRequest(BaseModel):
    """Request for waveform data of multiple signals."""
    signal_paths: List[str] = Field(..., description="List of signal paths")
    start_time: int = Field(..., description="Start time")
    end_time: int = Field(..., description="End time")
    max_changes: int = Field(10000, ge=1, le=100000, description="Max changes per signal")
    format: ValueFormat = Field(ValueFormat.HEX, description="Value format")


class WaveformBatchResponse(BaseModel):
    """Response containing waveform data for multiple signals."""
    waveforms: dict[str, WaveformData]


class ValueAtTimeRequest(BaseModel):
    """Request for signal value at a specific time."""
    signal_path: str
    time: int
    format: ValueFormat = ValueFormat.HEX


class ValueAtTimeResponse(BaseModel):
    """Response containing signal value at a time."""
    signal_path: str
    time: int
    value: Optional[str]
