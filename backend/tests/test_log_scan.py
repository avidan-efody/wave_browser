"""Log scan: time extraction, preview cap, and the wide-match stop."""

import re
from pathlib import Path

import pytest

from app.log_scan import extract_time, read_head, scan_log


def _write(tmp_path: Path, lines: list[str]) -> Path:
    path = tmp_path / "trace.log"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _collect(path: Path, pattern: str, unit: str = "ps", **kwargs) -> list[dict]:
    return list(scan_log(path, pattern, unit, **kwargs))


def test_extracts_common_timestamp_forms():
    assert extract_time("@120000ps CPU opcode=ADD", "ps") == 120000
    assert extract_time("@1.5 ns PCIE MemWr", "ps") == 1500
    assert extract_time("[180000 ps] PCIE MemRd", "ps") == 180000
    assert extract_time("time=200000ps AXI AW", "ps") == 200000
    assert extract_time("240000ps AXI R data=1", "ps") == 240000
    assert extract_time("@5000 CPU opcode=ADD", "ps") == 5000
    assert extract_time("INFO link up", "ps") is None


def test_preview_and_events_skip_lines_without_time(tmp_path: Path):
    path = _write(tmp_path, [
        "INFO cpu trace opened",
        "@10000ps CPU opcode=ADD rd=x1",
        "WARN dropped",
        "@20000ps CPU opcode=LW rd=x2",
    ])
    messages = _collect(path, "CPU|INFO|WARN")
    kinds = [item["type"] for item in messages]
    assert kinds[-1] == "done"
    done = messages[-1]
    assert done["too_wide"] is False
    assert done["match_count"] == 4
    assert done["timed_count"] == 2
    assert [event["time"] for event in done["events"]] == [10000, 20000]
    preview = next(item for item in messages if item["type"] == "preview")
    assert len(preview["matches"]) == 4
    assert preview["matches"][0]["time"] is None


def test_wide_pattern_stops_and_omits_events(tmp_path: Path):
    lines = [f"@{(index + 1) * 10}ps CPU opcode=NOP seq={index}" for index in range(30)]
    path = _write(tmp_path, lines)
    messages = _collect(path, ".*", preview_limit=5, event_limit=10)
    done = messages[-1]
    assert done["type"] == "done"
    assert done["too_wide"] is True
    assert done["match_count"] == 11
    assert done["events"] == []
    preview = next(item for item in messages if item["type"] == "preview")
    assert len(preview["matches"]) == 5
    # Stopped at the cap: the last line of a 30-line file was not a match we kept.
    assert preview["matches"][-1]["line"] == 5


def test_invalid_regex_raises(tmp_path: Path):
    path = _write(tmp_path, ["@1ps hello"])
    with pytest.raises(re.error):
        _collect(path, "(")


def test_cancel_stops_before_the_end(tmp_path: Path):
    path = _write(tmp_path, [f"@{(index + 1)}ps hit {index}" for index in range(5000)])
    seen = {"n": 0}

    def cancel() -> bool:
        seen["n"] += 1
        return seen["n"] > 2

    messages = _collect(path, "hit", cancel=cancel)
    assert all(item["type"] != "done" or item["match_count"] < 5000 for item in messages)
    assert not any(item["type"] == "done" and item["match_count"] == 5000 for item in messages)


def test_head_does_not_need_the_whole_file(tmp_path: Path):
    path = _write(tmp_path, [f"line {index}" for index in range(50)])
    lines = read_head(path, limit=3)
    assert [item["text"] for item in lines] == ["line 0", "line 1", "line 2"]
