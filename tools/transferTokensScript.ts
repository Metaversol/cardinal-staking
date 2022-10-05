import { withFindOrInitAssociatedTokenAccount } from "@cardinal/common";
import { utils } from "@project-serum/anchor";
import { SignerWallet } from "@saberhq/solana-contrib";
import * as splToken from "@solana/spl-token";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";

import { executeTransaction } from "../src";
import { connectionFor } from "./connection";

const wallet = Keypair.fromSecretKey(utils.bytes.bs58.decode("")); // your wallet's secret key
const mint = new PublicKey("");
const poolId = new PublicKey("");
const amount = 0;
const decimals = 0;

const main = async () => {
  const connection = connectionFor("mainnet");
  const transaction = new Transaction();

  const ownerAtaId = await withFindOrInitAssociatedTokenAccount(
    transaction,
    connection,
    mint,
    wallet.publicKey,
    wallet.publicKey,
    true
  );
  const poolAtaId = await withFindOrInitAssociatedTokenAccount(
    transaction,
    connection,
    mint,
    poolId,
    wallet.publicKey,
    true
  );

  transaction.add(
    splToken.Token.createTransferCheckedInstruction(
      splToken.TOKEN_PROGRAM_ID,
      ownerAtaId,
      mint,
      poolAtaId,
      wallet.publicKey,
      [],
      amount,
      decimals
    )
  );

  await executeTransaction(
    connection,
    new SignerWallet(wallet),
    transaction,
    {}
  );
};

main().catch((e) => console.log(e));
