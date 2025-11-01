import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorEscrow } from "../target/types/anchor_escrow";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
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

  it("Should create escrow successfully", async () => {
    console.log("🚀 Make...\n");

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

    // Print all addresses and hashes
    console.log("════════════════════════════════════════");
    console.log("📋 TRANSACTION DETAILS");
    console.log("════════════════════════════════════════");
    console.log(`Maker Mint:  ${makerMint.toString()}`);
    console.log(`Taker Mint:  ${takerMint.toString()}`);
    console.log(`Make TX Hash: ${tx}`);
    console.log("════════════════════════════════════════\n");
  });
});
