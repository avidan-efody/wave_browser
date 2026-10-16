// Small design with a package, an interface, and ordinary modules.
// The hierarchy filter should hide the interface instance and the package
// until those kinds are checked.
`timescale 1ns/1ps

package bus_pkg;
    typedef logic [7:0] data_t;
    parameter int WIDTH = 8;
endpackage

interface bus_if;
    logic valid;
    logic [7:0] data;
    modport src (output valid, data);
    modport dst (input valid, data);
endinterface

module source (
    input  logic clk,
    bus_if.src bus
);
    import bus_pkg::data_t;
    data_t next_data;
    always_comb next_data = 8'hA5;
    always @(posedge clk) begin
        bus.valid <= 1'b1;
        bus.data  <= next_data;
    end
endmodule

module sink (
    input logic clk,
    bus_if.dst bus
);
    logic [7:0] seen;
    always @(posedge clk) begin
        if (bus.valid)
            seen <= bus.data;
    end
endmodule

module tb_bus;
    logic clk;
    bus_if bus ();

    source u_src (
        .clk (clk),
        .bus (bus)
    );

    sink u_snk (
        .clk (clk),
        .bus (bus)
    );

    initial clk = 1'b0;
    always #5 clk = ~clk;

    initial begin
`ifdef VERILATOR
        $dumpfile("waves.vcd");
        $dumpvars(0, tb_bus);
`else
        $fsdbDumpfile("waves.fsdb");
        $fsdbDumpvars(0, tb_bus);
`endif
        repeat (4) @(posedge clk);
        $finish;
    end
endmodule
