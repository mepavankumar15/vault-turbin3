import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorEscrow } from "../target/types/anchor_escrow";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";

describe("atomic_swap_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AnchorEscrow as Program<AnchorEscrow>;

  let maker: anchor.web3.Keypair;
  let taker: anchor.web3.Keypair;
  let makerMint: anchor.web3.PublicKey;
  let takerMint: anchor.web3.PublicKey;
  let makerTokenAccount: any;
  let takerTokenAccount: any;

  const seed = new anchor.BN(999);
  const depositAmount = new anchor.BN(1000);
  const receiveAmount = new anchor.BN(500);

  before(async () => {
    console.log("\n🔧 Setup...");

    maker = anchor.web3.Keypair.generate();
    taker = anchor.web3.Keypair.generate();

    await provider.connection.requestAirdrop(
      maker.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      taker.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    makerMint = await createMint(
      provider.connection,
      maker,
      maker.publicKey,
      null,
      6
    );

    takerMint = await createMint(
      provider.connection,
      taker,
      taker.publicKey,
      null,
      6
    );

    makerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      maker,
      makerMint,
      maker.publicKey
    );

    takerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      taker,
      takerMint,
      taker.publicKey
    );

    await mintTo(
      provider.connection,
      maker,
      makerMint,
      makerTokenAccount.address,
      maker,
      10000
    );

    await mintTo(
      provider.connection,
      taker,
      takerMint,
      takerTokenAccount.address,
      taker,
      10000
    );

    console.log("✓ Done\n");
  });

  it("Should create escrow and lock tokens in vault", async () => {
    console.log("🚀 Make...\n");

    // Derive PDA addresses
    const [escrowPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        maker.publicKey.toBuffer(),
        seed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrowPDA.toBuffer()],
      program.programId
    );

    // Check maker's balance BEFORE
    const makerBalanceBefore = await getAccount(
      provider.connection,
      makerTokenAccount.address
    );
    console.log(`📊 Maker balance BEFORE: ${Number(makerBalanceBefore.amount)} tokens\n`);

    // Call make instruction
    const tx = await program.methods
      .make(seed, depositAmount, receiveAmount)
      .accounts({
        maker: maker.publicKey,
        makerToken: makerTokenAccount.address,
        makerMint: makerMint,
        takerMint: takerMint,
      } as any)
      .signers([maker])
      .rpc();

    console.log("✅ Escrow Created Successfully\n");

    // CHECK 1: Verify maker's balance decreased
    const makerBalanceAfter = await getAccount(
      provider.connection,
      makerTokenAccount.address
    );
    const tokensSent = Number(makerBalanceBefore.amount) - Number(makerBalanceAfter.amount);
    console.log(`📊 Maker balance AFTER: ${Number(makerBalanceAfter.amount)} tokens`);
    console.log(`📤 Tokens sent: ${tokensSent}\n`);

    // CHECK 2: Verify vault has the locked tokens
    const vaultBalance = await getAccount(provider.connection, vaultPDA);
    const tokensLocked = Number(vaultBalance.amount);
    console.log(`🔐 Vault balance: ${tokensLocked} tokens (LOCKED)\n`);

    // CHECK 3: Verify escrow account was created
    const escrowAccount = await program.account.escrow.fetch(escrowPDA);
    console.log(`✅ Escrow account created with:`);
    console.log(`   - Deposit amount: ${Number(escrowAccount.deposit)}`);
    console.log(`   - Receive amount: ${Number(escrowAccount.receive)}\n`);

    // ASSERTIONS - Tests will fail if these are wrong
    if (tokensSent !== 1000) {
      throw new Error(`❌ Expected 1000 tokens sent, got ${tokensSent}`);
    }
    
    if (tokensLocked !== 1000) {
      throw new Error(`❌ Expected 1000 tokens locked in vault, got ${tokensLocked}`);
    }

    if (Number(escrowAccount.deposit) !== 1000) {
      throw new Error(`❌ Expected escrow deposit 1000, got ${Number(escrowAccount.deposit)}`);
    }

    // Print summary
    console.log("════════════════════════════════════════");
    console.log("📋 TRANSACTION DETAILS");
    console.log("════════════════════════════════════════");
    console.log(`Maker Mint:    ${makerMint.toString()}`);
    console.log(`Taker Mint:    ${takerMint.toString()}`);
    console.log(`Make TX Hash:  ${tx}`);
    console.log("════════════════════════════════════════");
    console.log("\n🔐 VAULT (TOKENS LOCKED)");
    console.log("════════════════════════════════════════");
    console.log(`Vault Address: ${vaultPDA.toString()}`);
    console.log(`Tokens Locked: ${tokensLocked}`);
    console.log(`Status: ✅ SECURE\n`);
    console.log("════════════════════════════════════════\n");
  });
});
