"""Scope kinds parsed from a Verilator --json-only hierarchy."""

from pathlib import Path

import pytest

from adapters.verilator_adapter import VerilatorAdapter

REPO = Path(__file__).resolve().parents[2]
BUS_JSON = REPO / "example" / "bus" / "sim" / "hierarchy.tree.json"
BUS_VCD = REPO / "example" / "bus" / "sim" / "waves.vcd"


def test_bus_example_tags_interface_and_package():
    if not BUS_JSON.is_file():
        pytest.skip("run example/bus/run_verilator.sh first")
    adapter = VerilatorAdapter()
    adapter.open(str(BUS_VCD) if BUS_VCD.is_file() else None, str(BUS_JSON))

    tops = {scope.name: scope.scope_type.value for scope in adapter.get_top_scopes()}
    assert tops["tb_bus"] == "module"
    assert tops["bus_pkg"] == "package"
    assert "bus_if" not in tops

    children = {scope.name: scope.scope_type.value for scope in adapter.get_child_scopes("tb_bus")}
    assert children["bus"] == "interface"
    assert children["u_src"] == "module"
    assert children["u_snk"] == "module"

    shown = [
        name for name, kind in children.items()
        if kind == "module"
    ]
    assert "bus" not in shown
    adapter.close()
