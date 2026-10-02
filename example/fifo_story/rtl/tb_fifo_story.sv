// Story: one random word enters a 16-deep FIFO, the FIFO fills while that
// word is still queued, the same word comes out intact, then a shifter walks
// it out one bit per cycle. Halfway through, the low byte is inverted.
`timescale 1ns/1ps

module tb_fifo_story;
    localparam logic [31:0] TRACKED = 32'hA5C319E7;

    logic        clk;
    logic        rst_n;
    logic        push;
    logic        pop;
    logic        load;
    logic [31:0] wdata;
    logic [31:0] rdata;
    logic        full;
    logic        empty;
    logic [4:0]  count;
    logic        bit_out;
    logic        bit_expected;
    logic        bit_valid;
    logic [31:0] shift_reg;
    logic        corrupt;

    fifo16 u_fifo (
        .clk   (clk),
        .rst_n (rst_n),
        .push  (push),
        .wdata (wdata),
        .pop   (pop),
        .rdata (rdata),
        .full  (full),
        .empty (empty),
        .count (count)
    );

    bit_walk u_shift (
        .clk          (clk),
        .rst_n        (rst_n),
        .load         (load),
        .data_in      (rdata),
        .bit_out      (bit_out),
        .bit_expected (bit_expected),
        .bit_valid    (bit_valid),
        .shift_reg    (shift_reg),
        .corrupt      (corrupt)
    );

    initial clk = 1'b0;
    always #5 clk = ~clk;

    logic [31:0] words [0:15];
    integer n;

    task automatic push_word(input logic [31:0] data);
        @(negedge clk);
        push  = 1'b1;
        pop   = 1'b0;
        load  = 1'b0;
        wdata = data;
        @(posedge clk);
    endtask

    task automatic pop_word(input logic capture);
        @(negedge clk);
        push = 1'b0;
        pop  = 1'b1;
        load = capture;
        @(posedge clk);
    endtask

    initial begin
        words[0]  = 32'h4B1D77A2;
        words[1]  = 32'hE03C19F5;
        words[2]  = 32'h18F06C2D;
        words[3]  = 32'h91AA004E;
        words[4]  = 32'h77E2B318;
        words[5]  = 32'h0D5FC6A1;
        words[6]  = 32'hB3402E99;
        words[7]  = 32'h55C18D07;
        words[8]  = TRACKED;
        words[9]  = 32'h6E214AF0;
        words[10] = 32'hC8B703D4;
        words[11] = 32'h13DE90AB;
        words[12] = 32'hF04A6621;
        words[13] = 32'h2B9CE154;
        words[14] = 32'h80F37C6E;
        words[15] = 32'hD17625B8;

        rst_n = 1'b0;
        push  = 1'b0;
        pop   = 1'b0;
        load  = 1'b0;
        wdata = 32'd0;

        repeat (3) @(posedge clk);
        @(negedge clk);
        rst_n = 1'b1;

        // Eight words, then the one we follow, then seven more until full.
        for (n = 0; n < 16; n = n + 1) push_word(words[n]);

        // Drain the eight words ahead of the tracked one.
        for (n = 0; n < 8; n = n + 1) pop_word(1'b0);

        // The tracked word is at the head. Pop it into the shifter.
        pop_word(1'b1);
        @(negedge clk);
        push = 1'b0;
        pop  = 1'b0;
        load = 1'b0;

        // Two good bits, the byte smash, then three damaged bits.
        repeat (8) @(posedge clk);
        $finish;
    end

    initial begin
        $dumpfile("waves.vcd");
        $dumpvars(0, tb_fifo_story);
    end
endmodule
