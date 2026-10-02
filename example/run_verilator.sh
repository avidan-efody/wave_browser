#!/bin/bash
# Compile and run the counter example with Verilator.
# Writes:
#   sim/hierarchy.tree.json  - elaborated design hierarchy
#   sim/waves.vcd            - VCD waveform
#
# Usage: ./run_verilator.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
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

echo "========================================="
echo "Using $VERILATOR_BIN"
"$VERILATOR_BIN" --version
echo "========================================="
echo "Writing design hierarchy..."
echo "========================================="

"$VERILATOR_BIN" --json-only --timing \
    --json-only-output "$SIM_DIR/hierarchy.tree.json" \
    --json-only-meta-output "$SIM_DIR/hierarchy.meta.json" \
    --top-module tb_counter \
    --timescale 1ns/1ps \
    -Wno-fatal \
    "$RTL_DIR/counter.v" \
    "$RTL_DIR/tb_counter.v"

echo ""
echo "========================================="
echo "Compiling and running with VCD trace..."
echo "========================================="

"$VERILATOR_BIN" --binary --timing --trace -j 0 \
    --timescale 1ns/1ps \
    --top-module tb_counter \
    -Wno-fatal \
    -Mdir "$SIM_DIR/obj_dir" \
    -o Vtb_counter \
    "$RTL_DIR/counter.v" \
    "$RTL_DIR/tb_counter.v"

# $dumpfile is relative to the process working directory.
./obj_dir/Vtb_counter

echo ""
echo "========================================="
echo "Simulation complete!"
echo "========================================="
echo ""
echo "Generated files:"
echo "  Hierarchy: $SIM_DIR/hierarchy.tree.json"
echo "  Waves:     $SIM_DIR/waves.vcd"
echo ""
echo "Open in Wave Browser with vendor=verilator:"
echo "  wave_db:   $SIM_DIR/waves.vcd"
echo "  design_db: $SIM_DIR/hierarchy.tree.json"
