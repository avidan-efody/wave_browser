// 16-entry, 32-bit synchronous FIFO.
`timescale 1ns/1ps

module fifo16 (
    input  logic        clk,
    input  logic        rst_n,
    input  logic        push,
    input  logic [31:0] wdata,
    input  logic        pop,
    output logic [31:0] rdata,
    output logic        full,
    output logic        empty,
    output logic [4:0]  count
);
    logic [31:0] mem [0:15];
    logic [3:0]  wr_ptr;
    logic [3:0]  rd_ptr;
    logic [4:0]  count_q;

    wire do_push = push && !full;
    wire do_pop  = pop  && !empty;

    assign full  = (count_q == 5'd16);
    assign empty = (count_q == 5'd0);
    assign count = count_q;
    assign rdata = mem[rd_ptr];

    integer i;
    always_ff @(posedge clk) begin
        if (!rst_n) begin
            wr_ptr  <= 4'd0;
            rd_ptr  <= 4'd0;
            count_q <= 5'd0;
            for (i = 0; i < 16; i = i + 1) mem[i] <= 32'd0;
        end else begin
            if (do_push) begin
                mem[wr_ptr] <= wdata;
                wr_ptr <= wr_ptr + 4'd1;
            end
            if (do_pop) rd_ptr <= rd_ptr + 4'd1;
            case ({do_push, do_pop})
                2'b10: count_q <= count_q + 5'd1;
                2'b01: count_q <= count_q - 5'd1;
                default: ;
            endcase
        end
    end
endmodule
