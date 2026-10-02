"""
Session management API endpoints.
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from ..models import (
    SessionCreate, SessionInfo, SessionResponse, SessionListResponse
)
from ..services import session_manager
from ..logging_config import session_logger as logger

router = APIRouter()


@router.get("", response_model=SessionListResponse)
async def list_sessions():
    """List all active database sessions."""
    sessions = session_manager.list_sessions()
    return SessionListResponse(
        sessions=[
            SessionInfo(
                id=s.id,
                vendor=s.vendor,
                wave_db=s.wave_db,
                design_db=s.design_db,
                time_unit=s.info.time_unit,
                min_time=s.info.min_time,
                max_time=s.info.max_time,
                is_completed=s.info.is_completed,
                created_at=s.created_at
            )
            for s in sessions
        ]
    )


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(request: SessionCreate):
    """Create a new database session."""
    logger.info(
        f"Creating session: vendor={request.vendor}, "
        f"design_db={request.design_db}, wave_db={request.wave_db}"
    )
    try:
        session = session_manager.create_session(
            vendor=request.vendor,
            wave_db=request.wave_db,
            design_db=request.design_db
        )
        logger.info(f"Session created successfully: id={session.id}")
        return SessionResponse(
            session=SessionInfo(
                id=session.id,
                vendor=session.vendor,
                wave_db=session.wave_db,
                design_db=session.design_db,
                time_unit=session.info.time_unit,
                min_time=session.info.min_time,
                max_time=session.info.max_time,
                is_completed=session.info.is_completed,
                created_at=session.created_at
            )
        )
    except FileNotFoundError as e:
        logger.error(f"Database file not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create session: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to open database: {e}")


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """Get information about a specific session."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return SessionResponse(
        session=SessionInfo(
            id=session.id,
            vendor=session.vendor,
            wave_db=session.wave_db,
            design_db=session.design_db,
            time_unit=session.info.time_unit,
            min_time=session.info.min_time,
            max_time=session.info.max_time,
            is_completed=session.info.is_completed,
            created_at=session.created_at
        )
    )


class SignalRcSaveRequest(BaseModel):
    """RC text to write beside the session waveform."""
    content: str


class SignalRcSaveResponse(BaseModel):
    """Path of the RC file written next to the waveform."""
    path: str


@router.post("/{session_id}/signal-rc", response_model=SignalRcSaveResponse)
async def save_signal_rc(session_id: str, body: SignalRcSaveRequest):
    """Write signal.rc next to the session's FSDB or VCD file."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.wave_db:
        raise HTTPException(status_code=400, detail="Session has no waveform file")

    encoded = body.content.encode("utf-8")
    if len(encoded) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="RC file too large")

    try:
        wave = Path(session.wave_db).expanduser().resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid waveform path")

    if not wave.parent.is_dir():
        raise HTTPException(status_code=400, detail=f"Directory does not exist: {wave.parent}")

    target = wave.with_suffix(".rc")
    try:
        target.write_text(body.content, encoding="utf-8")
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {target}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write RC file: {e}")

    logger.info(f"Saved signal RC for session {session_id} to {target}")
    return SignalRcSaveResponse(path=str(target))


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def close_session(session_id: str):
    """Close a database session."""
    if not session_manager.close_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
