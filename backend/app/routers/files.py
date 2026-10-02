"""
File browser API endpoints.
Allows browsing files on the backend machine.
"""

import os
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel


router = APIRouter()


class FileEntry(BaseModel):
    """A file or directory entry"""
    name: str
    path: str
    is_dir: bool
    size: Optional[int] = None


class FileListResponse(BaseModel):
    """File listing response"""
    path: str
    parent: Optional[str]
    entries: List[FileEntry]


class FileListRequest(BaseModel):
    """File listing request"""
    path: Optional[str] = None


@router.get("", response_model=FileListResponse)
async def list_files(path: Optional[str] = Query(None, description="Directory path to list")):
    """
    List files in a directory.
    If no path is provided, lists the user's home directory.
    """
    # Default to home directory
    if not path:
        path = str(Path.home())
    
    target = Path(path)
    
    # Security: resolve to absolute path
    try:
        target = target.resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")
    
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")
    
    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")
    
    # Get parent path
    parent = str(target.parent) if target.parent != target else None
    
    entries: List[FileEntry] = []
    
    try:
        for item in sorted(target.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            # Skip hidden files (optional - could make this configurable)
            if item.name.startswith('.'):
                continue
            
            try:
                entry = FileEntry(
                    name=item.name,
                    path=str(item),
                    is_dir=item.is_dir(),
                    size=item.stat().st_size if item.is_file() else None,
                )
                entries.append(entry)
            except PermissionError:
                # Skip files we can't access
                continue
            except OSError:
                # Skip files with other issues
                continue
                
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {path}")
    
    return FileListResponse(
        path=str(target),
        parent=parent,
        entries=entries,
    )


@router.get("/roots", response_model=List[FileEntry])
async def get_roots():
    """
    Get filesystem roots (for navigation).
    On Unix: returns /
    On Windows: returns drive letters
    """
    import platform
    
    roots: List[FileEntry] = []
    
    if platform.system() == 'Windows':
        # List drive letters
        import string
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if os.path.exists(drive):
                roots.append(FileEntry(name=drive, path=drive, is_dir=True))
    else:
        # Unix - just root
        roots.append(FileEntry(name="/", path="/", is_dir=True))
        
        # Also add home directory for convenience
        home = str(Path.home())
        roots.append(FileEntry(name="~", path=home, is_dir=True))
    
    return roots


class FileContentResponse(BaseModel):
    """File content response"""
    path: str
    content: str
    language: str
    line_count: int


def detect_language(path: str) -> str:
    """Detect language from file extension"""
    ext = Path(path).suffix.lower()
    lang_map = {
        '.v': 'verilog',
        '.vh': 'verilog',
        '.sv': 'systemverilog',
        '.svh': 'systemverilog',
        '.vhd': 'vhdl',
        '.vhdl': 'vhdl',
        '.py': 'python',
        '.tcl': 'tcl',
        '.sdc': 'tcl',
        '.txt': 'text',
        '.log': 'text',
        '.rc': 'text',
    }
    return lang_map.get(ext, 'text')


@router.get("/content", response_model=FileContentResponse)
async def get_file_content(path: str = Query(..., description="File path to read")):
    """
    Get the content of a file.
    Returns the file content with detected language type.
    """
    target = Path(path)
    
    # Security: resolve to absolute path
    try:
        target = target.resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")
    
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    
    if not target.is_file():
        raise HTTPException(status_code=400, detail=f"Not a file: {path}")
    
    # Limit file size (10MB)
    max_size = 10 * 1024 * 1024
    file_size = target.stat().st_size
    if file_size > max_size:
        raise HTTPException(status_code=400, detail=f"File too large: {file_size} bytes (max {max_size})")
    
    try:
        content = target.read_text(encoding='utf-8', errors='replace')
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")
    
    return FileContentResponse(
        path=str(target),
        content=content,
        language=detect_language(str(target)),
        line_count=content.count('\n') + 1,
    )


class FileWriteRequest(BaseModel):
    """Write a signal.rc file on the backend machine."""
    path: str
    content: str


@router.put("/content", response_model=FileContentResponse)
async def write_file_content(body: FileWriteRequest):
    """
    Write an nWave signal.rc file.
    Only paths ending in .rc are accepted.
    """
    if not body.path.lower().endswith(".rc"):
        raise HTTPException(status_code=400, detail="Only .rc files can be written")

    max_size = 2 * 1024 * 1024
    encoded = body.content.encode("utf-8")
    if len(encoded) > max_size:
        raise HTTPException(status_code=400, detail=f"RC file too large (max {max_size} bytes)")

    try:
        target = Path(body.path).expanduser().resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not target.parent.is_dir():
        raise HTTPException(status_code=400, detail=f"Directory does not exist: {target.parent}")

    try:
        target.write_text(body.content, encoding="utf-8")
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {body.path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write file: {str(e)}")

    return FileContentResponse(
        path=str(target),
        content=body.content,
        language=detect_language(str(target)),
        line_count=body.content.count("\n") + 1,
    )
