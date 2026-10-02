"""Built-in waveform examples that ship with the repo."""

from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# backend/app/routers/examples.py -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]


class WaveExample(BaseModel):
    id: str
    name: str
    description: str
    wave: str
    design: str
    rc: str
    story: Optional[str] = None


class WaveExampleList(BaseModel):
    default: str
    examples: List[WaveExample]


_SPECS = [
    {
        "id": "fifo-story",
        "name": "FIFO story",
        "description": "One word enters a 16-deep FIFO, the FIFO fills, the word leaves, and a shifter corrupts a byte halfway through a 5-bit walk.",
        "wave": "example/fifo_story/sim/waves.vcd",
        "design": "example/fifo_story/sim/hierarchy.tree.json",
        "rc": "example/fifo_story/sim/waves.rc",
        "story": "example/fifo_story/sim/story.json",
    },
    {
        "id": "counter",
        "name": "Counter",
        "description": "Small counter with clock, reset, and a note.",
        "wave": "example/sim/waves.vcd",
        "design": "example/sim/hierarchy.tree.json",
        "rc": "example/sim/waves.rc",
        "story": None,
    },
]


def _existing(relative: Optional[str]) -> Optional[Path]:
    if not relative:
        return None
    path = (REPO_ROOT / relative).resolve()
    return path if path.is_file() else None


@router.get("", response_model=WaveExampleList)
async def list_examples():
    examples: List[WaveExample] = []
    for spec in _SPECS:
        wave = _existing(spec["wave"])
        design = _existing(spec["design"])
        rc = _existing(spec["rc"])
        if wave is None or design is None or rc is None:
            continue
        story = _existing(spec["story"])
        examples.append(WaveExample(
            id=spec["id"],
            name=spec["name"],
            description=spec["description"],
            wave=str(wave),
            design=str(design),
            rc=str(rc),
            story=str(story) if story else None,
        ))
    default = "fifo-story" if any(item.id == "fifo-story" for item in examples) else (examples[0].id if examples else "")
    return WaveExampleList(default=default, examples=examples)
