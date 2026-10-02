// Testbench for counter_top
`timescale 1ns/1ps

module tb_counter;

    // Signals
    reg        clk;
    reg        rst_n;
    reg        start;
    wire [7:0] count_out;
    wire       done;

    // Clock generation - 10ns period (100MHz)
    initial clk = 0;
    always #5 clk = ~clk;

    // DUT instantiation
    counter_top dut (
        .clk       (clk),
        .rst_n     (rst_n),
        .start     (start),
        .count_out (count_out),
        .done      (done)
    );

    // Test sequence
    initial begin
        // Initialize
        rst_n = 0;
        start = 0;
        
        // Reset
        #20;
        rst_n = 1;
        #10;
        
        // Start counting
        @(posedge clk);
        start = 1;
        @(posedge clk);
        start = 0;
        
        // Wait for done or timeout
        fork
            begin
                wait(done);
                $display("Counter completed! Final count: %d", count_out);
            end
            begin
                #30000;  // 30us timeout
                $display("Timeout reached");
            end
        join_any
        disable fork;
        
        #100;
        $display("Simulation finished");
        $finish;
    end

    // Dump waveforms. Verilator writes VCD; other simulators write FSDB.
    initial begin
`ifdef VERILATOR
        $dumpfile("waves.vcd");
        $dumpvars(0, tb_counter);
`else
        $fsdbDumpfile("waves.fsdb");
        $fsdbDumpvars(0, tb_counter);
        $fsdbDumpMDA();  // Dump multi-dimensional arrays
`endif
    end

endmodule
