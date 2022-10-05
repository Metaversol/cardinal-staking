import {
  Creator,
  DataV2,
  Metadata,
  UpdateMetadataV2,
} from "@metaplex-foundation/mpl-token-metadata";
import { utils } from "@project-serum/anchor";
import {
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  Transaction,
} from "@solana/web3.js";

import { connectionFor } from "./connection";

const wallet = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.AIRDROP_KEY || "")
);

const MINT_PUBLIC_KEY = new PublicKey("");

export const updateFungibleToken = async (cluster = "devnet") => {
  const connection = connectionFor(cluster);
  try {
    const metadataId = await Metadata.getPDA(MINT_PUBLIC_KEY);
    const metadataTx = new UpdateMetadataV2(
      { feePayer: wallet.publicKey },
      {
        metadata: metadataId,
        metadataData: new DataV2({
          name: "",
          symbol: "",
          uri: "",
          sellerFeeBasisPoints: 0,
          creators: [
            new Creator({
              address: wallet.publicKey.toString(),
              verified: true,
              share: 100,
            }),
          ],
          collection: null,
          uses: null,
        }),
        isMutable: true,
        newUpdateAuthority: wallet.publicKey,
        primarySaleHappened: false,
        updateAuthority: wallet.publicKey,
      }
    );

    const transaction = new Transaction();
    transaction.instructions = [...metadataTx.instructions];
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = (
      await connection.getRecentBlockhash("max")
    ).blockhash;
    transaction.sign(wallet);
    const txid = await sendAndConfirmRawTransaction(
      connection,
      transaction.serialize(),
      {
        commitment: "confirmed",
      }
    );
    console.log(
      `Token updated mintId=(${MINT_PUBLIC_KEY.toString()}) metadataId=(${metadataId.toString()}) with transaction https://explorer.solana.com/tx/${txid}?cluster=${cluster}`
    );
  } catch (e) {
    console.log("Failed", e);
  }
};

updateFungibleToken().catch((e) => {
  console.log(e);
});
