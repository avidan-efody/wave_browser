#!/bin/bash
# Compile and run the FIFO story example with Verilator.
# Writes sim/hierarchy.tree.json and sim/waves.vcd.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RTL_DIR="$SCRIPT_DIR/rtl"
SIM_DIR="$SCRIPT_DIR/sim"
LOCAL_VERILATOR="$REPO_DIR/.tools/bin/verilator"

if [[ -n "${VERILATOR:-}" ]]; then
    VERILATOR_BIN="$VERILATOR"
elif [[ -x "$LOCAL_VERILATOR" ]]; then
    VERILATOR_BIN="$LOCAL_VERILATOR"
else
    VERILATOR_BIN="$(command -v verilator || true)"
fi

if [[ -z "$VERILATOR_BIN" || ! -x "$VERILATOR_BIN" ]]; then
    echo "verilator not found. Build it into $REPO_DIR/.tools or set VERILATOR." >&2
    exit 1
fi

mkdir -p "$SIM_DIR"
cd "$SIM_DIR"

echo "Using $VERILATOR_BIN"
"$VERILATOR_BIN" --version

"$VERILATOR_BIN" --json-only --timing \
    --json-only-output "$SIM_DIR/hierarchy.tree.json" \
    --json-only-meta-output "$SIM_DIR/hierarchy.meta.json" \
    --top-module tb_fifo_story \
    --timescale 1ns/1ps \
    -Wno-fatal \
    "$RTL_DIR/fifo16.sv" \
    "$RTL_DIR/bit_walk.sv" \
    "$RTL_DIR/tb_fifo_story.sv"

"$VERILATOR_BIN" --binary --timing --trace -j 0 \
    --timescale 1ns/1ps \
    --top-module tb_fifo_story \
    -Wno-fatal \
    -Mdir "$SIM_DIR/obj_dir" \
    -o Vtb_fifo_story \
    "$RTL_DIR/fifo16.sv" \
    "$RTL_DIR/bit_walk.sv" \
    "$RTL_DIR/tb_fifo_story.sv"

./obj_dir/Vtb_fifo_story

echo "Hierarchy: $SIM_DIR/hierarchy.tree.json"
echo "Waves:     $SIM_DIR/waves.vcd"
