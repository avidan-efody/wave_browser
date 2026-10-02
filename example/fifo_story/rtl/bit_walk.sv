// Walk a captured word out one bit per clock, LSB first, for five cycles.
// Halfway through — after two good bits — the low byte is inverted.
`timescale 1ns/1ps

module bit_walk (
    input  logic        clk,
    input  logic        rst_n,
    input  logic        load,
    input  logic [31:0] data_in,
    output logic        bit_out,
    output logic        bit_expected,
    output logic        bit_valid,
    output logic [31:0] shift_reg,
    output logic        corrupt
);
    logic [31:0] golden;
    logic [2:0]  emitted;
    logic        active;
    logic        smashed;

    always_ff @(posedge clk) begin
        if (!rst_n) begin
            shift_reg    <= 32'd0;
            golden       <= 32'd0;
            emitted      <= 3'd0;
            active       <= 1'b0;
            smashed      <= 1'b0;
            bit_out      <= 1'b0;
            bit_expected <= 1'b0;
            bit_valid    <= 1'b0;
            corrupt      <= 1'b0;
        end else if (load) begin
            shift_reg    <= data_in;
            golden       <= data_in;
            emitted      <= 3'd0;
            active       <= 1'b1;
            smashed      <= 1'b0;
            bit_valid    <= 1'b0;
            corrupt      <= 1'b0;
        end else if (active && !smashed && emitted == 3'd2) begin
            // Two bits have already left intact. Smash the byte still inside.
            shift_reg[7:0] <= shift_reg[7:0] ^ 8'hFF;
            smashed        <= 1'b1;
            corrupt        <= 1'b1;
            bit_valid      <= 1'b0;
        end else if (active) begin
            bit_out      <= shift_reg[0];
            bit_expected <= golden[0];
            bit_valid    <= 1'b1;
            corrupt      <= 1'b0;
            shift_reg    <= {1'b0, shift_reg[31:1]};
            golden       <= {1'b0, golden[31:1]};
            emitted      <= emitted + 3'd1;
            if (emitted == 3'd4) active <= 1'b0;
        end else begin
            bit_valid <= 1'b0;
            corrupt   <= 1'b0;
        end
    end
endmodule
