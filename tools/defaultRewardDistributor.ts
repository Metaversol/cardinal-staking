import { tryGetAccount } from "@cardinal/common";
import { utils } from "@project-serum/anchor";
import { SignerWallet } from "@saberhq/solana-contrib";
import { Keypair, Transaction } from "@solana/web3.js";

import { getRewardDistributor } from "../src/programs/rewardDistributor/accounts";
import { findRewardDistributorId } from "../src/programs/rewardDistributor/pda";
// import { withDefaultRewardDistributor } from "../src/programs/rewardDistributor/transaction";
import { getAllStakePools } from "../src/programs/stakePool/accounts";
import { executeTransaction } from "../src/utils";
import { connectionFor } from "./connection";

const wallet = Keypair.fromSecretKey(utils.bytes.bs58.decode("SECRET_KEY"));

const main = async (cluster = "mainnet") => {
  const connection = connectionFor(cluster);
  const allStakePools = await getAllStakePools(connection);

  for (const pool of allStakePools) {
    const [rewardDistributorId] = await findRewardDistributorId(pool.pubkey);
    const rewardDistrubutorData = await tryGetAccount(() =>
      getRewardDistributor(connection, rewardDistributorId)
    );
    if (rewardDistrubutorData) {
      if (rewardDistrubutorData.parsed.defaultMultiplier.toNumber() !== 1) {
        console.log(
          `Defaulting reward distributor ${rewardDistrubutorData.pubkey.toString()}`
        );
        const transaction = new Transaction();
        // await withDefaultRewardDistributor(
        //   transaction,
        //   connection,
        //   new SignerWallet(wallet),
        //   {
        //     stakePoolId: pool.pubkey,
        //   }
        // );

        try {
          await executeTransaction(
            connection,
            new SignerWallet(wallet),
            transaction,
            {}
          );
          console.log(
            `Succesfully updated reward distributor ${rewardDistrubutorData.pubkey.toString()}!`
          );
        } catch (e) {
          console.log(
            `Error with reward distributor ${rewardDistrubutorData.pubkey.toString()}`
          );
          console.log(e);
          break;
        }
      }
    }
  }
};
main().catch((e) => console.log(e));
