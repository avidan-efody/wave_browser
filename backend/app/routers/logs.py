"""
Log browser for the directory that holds the open waveform.

Search streams a short sample first, then the match count. The scan stops
after 2001 matches so a very wide pattern does not walk a huge file.
"""

import asyncio
import json
import re
import threading
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..log_scan import EVENT_LIMIT, PREVIEW_LIMIT, read_head, scan_log

router = APIRouter()


def _resolve_file(path: str) -> Path:
    try:
        target = Path(path).expanduser().resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    if not target.is_file():
        raise HTTPException(status_code=400, detail=f"Not a file: {path}")
    return target


class LogHeadResponse(BaseModel):
    path: str
    lines: list


@router.get("/head", response_model=LogHeadResponse)
async def log_head(
    path: str = Query(..., description="Log file on the server"),
    limit: int = Query(PREVIEW_LIMIT, ge=1, le=500),
):
    """Return the first lines of a log without reading the rest of the file."""
    target = _resolve_file(path)
    return LogHeadResponse(path=str(target), lines=read_head(target, limit))


class LogSearchRequest(BaseModel):
    path: str
    pattern: str
    time_unit: str = "ps"
    preview_limit: int = PREVIEW_LIMIT
    event_limit: int = EVENT_LIMIT


@router.post("/search")
async def search_log(body: LogSearchRequest, request: Request):
    """
    Stream newline-delimited JSON.

    A ``preview`` object carries the first matching lines as soon as they are
    known. A ``done`` object follows with the count, and with event times when
    the match is not too wide.
    """
    pattern = body.pattern
    if not pattern.strip():
        raise HTTPException(status_code=400, detail="Pattern is empty")
    if len(pattern) > 500:
        raise HTTPException(status_code=400, detail="Pattern is too long")
    try:
        re.compile(pattern)
    except re.error as exc:
        raise HTTPException(status_code=400, detail=f"Invalid regex: {exc}")

    target = _resolve_file(body.path)
    cancel = threading.Event()
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def publish(item: Optional[dict]) -> None:
        try:
            loop.call_soon_threadsafe(queue.put_nowait, item)
        except RuntimeError:
            cancel.set()

    def work() -> None:
        try:
            for item in scan_log(
                target,
                pattern,
                body.time_unit or "ps",
                preview_limit=body.preview_limit,
                event_limit=body.event_limit,
                cancel=cancel.is_set,
            ):
                if cancel.is_set():
                    break
                publish(item)
        except re.error as exc:
            publish({"type": "error", "detail": f"Invalid regex: {exc}"})
        except Exception as exc:
            publish({"type": "error", "detail": str(exc)})
        finally:
            publish(None)

    async def generate():
        runner = asyncio.create_task(asyncio.to_thread(work))
        try:
            while True:
                if await request.is_disconnected():
                    cancel.set()
                    break
                try:
                    item = await asyncio.wait_for(queue.get(), 0.25)
                except asyncio.TimeoutError:
                    continue
                if item is None:
                    break
                yield json.dumps(item) + "\n"
        finally:
            cancel.set()
            runner.cancel()

    return StreamingResponse(generate(), media_type="application/x-ndjson")
