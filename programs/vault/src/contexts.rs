use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::state::Escrow;

// --- 1. MAKE Instruction Context ---

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Make<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mut, constraint = maker_token.mint == maker_mint.key())]
    pub maker_token: Account<'info, TokenAccount>,

    pub maker_mint: Account<'info, Mint>,

    pub taker_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = maker,
        space = Escrow::LEN,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init,
        payer = maker,
        token::mint = maker_mint,
        token::authority = escrow,
        seeds = [b"vault", escrow.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

impl<'info> Make<'info> {
    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: self.maker_token.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.maker.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)
    }

    pub fn save_escrow(&mut self, seed: u64, deposit: u64, receive: u64, bumps: &MakeBumps) -> Result<()> {
        self.escrow.seed = seed;
        self.escrow.maker = self.maker.key();
        self.escrow.maker_mint = self.maker_mint.key();
        self.escrow.taker_mint = self.taker_mint.key();
        self.escrow.deposit = deposit;
        self.escrow.receive = receive;
        self.escrow.bump = bumps.escrow;
        Ok(())
    }
}

// --- 2. REFUND Instruction Context ---

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mut, constraint = maker_token.mint == escrow.maker_mint)]
    pub maker_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        close = maker,
        seeds = [b"escrow", maker.key().as_ref(), escrow.seed.to_le_bytes().as_ref()],
        bump = escrow.bump,
        constraint = escrow.maker == maker.key()
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        token::mint = escrow.maker_mint,
        token::authority = escrow,
        seeds = [b"vault", escrow.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Refund<'info> {
    pub fn refund_and_close_vault(&mut self) -> Result<()> {
        let seed_bytes = self.escrow.seed.to_le_bytes();
        let seeds = &[
            b"escrow".as_ref(),
            self.escrow.maker.as_ref(),
            seed_bytes.as_ref(),
            &[self.escrow.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_transfer = Transfer {
            from: self.vault.to_account_info(),
            to: self.maker_token.to_account_info(),
            authority: self.escrow.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                cpi_transfer,
                signer_seeds,
            ),
            self.vault.amount,
        )?;

        let cpi_close = CloseAccount {
            account: self.vault.to_account_info(),
            destination: self.maker.to_account_info(),
            authority: self.escrow.to_account_info(),
        };

        token::close_account(CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            cpi_close,
            signer_seeds,
        ))?;

        Ok(())
    }
}

// --- 3. TAKE Instruction Context ---

#[derive(Accounts)]
pub struct Take<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(mut, constraint = taker_token.mint == escrow.taker_mint)]
    pub taker_token: Account<'info, TokenAccount>,

    #[account(mut, constraint = taker_receive_token.mint == escrow.maker_mint)]
    pub taker_receive_token: Account<'info, TokenAccount>,

    /// CHECK: Maker account
    #[account(mut)]
    pub maker: AccountInfo<'info>,

    #[account(
        mut,
        constraint = maker_receive_token.mint == escrow.taker_mint,
        constraint = maker_receive_token.owner == maker.key()
    )]
    pub maker_receive_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        close = maker,
        seeds = [b"escrow", maker.key().as_ref(), escrow.seed.to_le_bytes().as_ref()],
        bump = escrow.bump,
        constraint = escrow.maker == maker.key()
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        token::mint = escrow.maker_mint,
        token::authority = escrow,
        seeds = [b"vault", escrow.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Take<'info> {
    pub fn deposit(&mut self) -> Result<()> {
        let cpi_accounts = Transfer {
            from: self.taker_token.to_account_info(),
            to: self.maker_receive_token.to_account_info(),
            authority: self.taker.to_account_info(),
        };

        token::transfer(
            CpiContext::new(self.token_program.to_account_info(), cpi_accounts),
            self.escrow.receive,
        )
    }

    pub fn withdraw_and_close_vault(&mut self) -> Result<()> {
        let seed_bytes = self.escrow.seed.to_le_bytes();
        let seeds = &[
            b"escrow".as_ref(),
            self.escrow.maker.as_ref(),
            seed_bytes.as_ref(),
            &[self.escrow.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_transfer = Transfer {
            from: self.vault.to_account_info(),
            to: self.taker_receive_token.to_account_info(),
            authority: self.escrow.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                cpi_transfer,
                signer_seeds,
            ),
            self.vault.amount,
        )?;

        let cpi_close = CloseAccount {
            account: self.vault.to_account_info(),
            destination: self.maker.to_account_info(),
            authority: self.escrow.to_account_info(),
        };

        token::close_account(CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            cpi_close,
            signer_seeds,
        ))?;

        Ok(())
    }
}
