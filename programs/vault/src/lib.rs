#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod contexts;
use contexts::*;

pub mod state;
pub use state::*;

// This is a placeholder. We will replace it in Part 3.
declare_id!("5dF3PhfLpFoN3cTdEj7DpDNAtroSJRJ4uFZbVysZnrQm");

#[program]
pub mod anchor_escrow {
    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, deposit: u64, receive: u64) -> Result<()> {
        // First: deposit tokens to vault
        ctx.accounts.deposit(deposit)?;
        
        // Second: save escrow with the deposit amount parameter
        // NOT with self.vault.amount (which may not be updated yet)
        ctx.accounts.save_escrow(seed, deposit, receive, &ctx.bumps)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        ctx.accounts.refund_and_close_vault()
    }

    pub fn take(ctx: Context<Take>) -> Result<()> {
        ctx.accounts.deposit()?;
        ctx.accounts.withdraw_and_close_vault()
    }
}
