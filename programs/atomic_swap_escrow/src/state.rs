use anchor_lang::prelude::*;

#[account]
pub struct Escrow {
    pub seed: u64,
    pub maker: Pubkey,
    pub maker_mint: Pubkey,
    pub taker_mint: Pubkey,
    pub deposit: u64,
    pub receive: u64,
    pub bump: u8,
}

impl Escrow {
    // 8 (Discriminator) + 8 (seed) + 32 (maker) + 32 (maker_mint) + 32 (taker_mint) + 8 (deposit) + 8 (receive) + 1 (bump)
    pub const LEN: usize = 8 + 8 + 32 + 32 + 32 + 8 + 8 + 1;
}