import { utils } from "@project-serum/anchor";
import { SignerWallet } from "@saberhq/solana-contrib";
import { Keypair, Transaction } from "@solana/web3.js";

import { executeTransaction } from "../src";
import {
  getAllRewardEntries,
  getRewardDistributor,
  getRewardEntry,
} from "../src/programs/rewardDistributor/accounts";
import { findRewardEntryId } from "../src/programs/rewardDistributor/pda";
import { getAllStakeEntries } from "../src/programs/stakePool/accounts";
import { connectionFor } from "./connection";
// import { findStakeEntryIdFromMint } from "../src/programs/stakePool/utils";

const wallet = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(process.env.CRANK_SOLANA_KEY || "")
);

const migrateRewardEntries = async (cluster: string) => {
  const connection = connectionFor(cluster);

  const allRewardEntries = await getAllRewardEntries(connection);
  const allStakeEntries = await getAllStakeEntries(connection);
  const _stakeEntryIds = allStakeEntries.map((stakeEntry) =>
    stakeEntry.pubkey.toString()
  );
  // const filteredRewardEntries = allRewardEntries.filter(
  //   (rewardEntry) => !stakeEntryIds.includes(rewardEntry.parsed.mint.toString())
  // );
  const filteredRewardEntries = allRewardEntries;

  console.log(`Migrating ${filteredRewardEntries.length} entries`);
  for (let i = 0; i < filteredRewardEntries.length; i++) {
    try {
      console.log(
        `Migrating reward entry ${i + 1} of ${filteredRewardEntries.length}`
      );
      const rewardEntryData = filteredRewardEntries[i]!;
      const rewardDistributorData = await getRewardDistributor(
        connection,
        rewardEntryData?.parsed.rewardDistributor
      );

      // MINT used to be on the rewardEntry
      const stakeEntryId = rewardEntryData.parsed.stakeEntry;
      // const [stakeEntryId] = await findStakeEntryIdFromMint(
      //   connection,
      //   wallet.publicKey,
      //   rewardDistributorData.parsed.stakePool,
      //   rewardEntryData.parsed.mint
      // );

      console.log("Reward entry before: ", rewardEntryData);
      const transaction = new Transaction();
      transaction
        .add
        // await migrateRewardEntry(connection, new SignerWallet(wallet), {
        //   rewardEntryV0Id: rewardEntryData.pubkey,
        //   stakeEntryId: stakeEntryId,
        //   rewardDistributorId: rewardDistributorData.pubkey,
        // })
        ();
      const txid = await executeTransaction(
        connection,
        new SignerWallet(wallet),
        transaction,
        {}
      );
      console.log(
        `Succesfully migrated entry ${rewardEntryData.pubkey.toString()} with transaction ${txid} (https://explorer.solana.com/tx/${txid}?cluster=${cluster})`
      );

      const [rewardEntryId] = await findRewardEntryId(
        rewardDistributorData.pubkey,
        stakeEntryId
      );
      const rewardEntry = await getRewardEntry(connection, rewardEntryId);
      console.log("New entry", rewardEntry);
    } catch (e) {
      console.log(e);
    }
  }
};

migrateRewardEntries("mainnet").catch((e) => console.log(e));
