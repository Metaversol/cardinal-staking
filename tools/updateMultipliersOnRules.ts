import { connectionFor, tryGetAccount } from "@cardinal/common";
import { utils } from "@project-serum/anchor";
import { SignerWallet } from "@saberhq/solana-contrib";
import type { Connection } from "@solana/web3.js";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { BN } from "bn.js";
import * as fs from "fs";

import { executeTransaction } from "../src";
import {
  getRewardDistributor,
  getRewardEntries,
} from "../src/programs/rewardDistributor/accounts";
import {
  findRewardDistributorId,
  findRewardEntryId,
} from "../src/programs/rewardDistributor/pda";
import {
  withInitRewardEntry,
  withUpdateRewardEntry,
} from "../src/programs/rewardDistributor/transaction";
import {
  getActiveStakeEntriesForPool,
  getStakeEntries,
} from "../src/programs/stakePool/accounts";
import { findStakeEntryId } from "../src/programs/stakePool/pda";
import { fetchMetadata } from "./getMetadataForPoolTokens";
import { bronze } from "./passes/bronze_stringified";

export const saveJsonAsTsFileStringy = (
  filename: string,
  jsonToSave: object
) => {
  console.log("Saving file: " + __dirname + filename);
  const contentString = `export const ${filename}= ${JSON.stringify(
    jsonToSave,
    null,
    4
  )}`;
  const options = { flag: "wx" };
  fs.writeFile(
    `${__dirname}/${filename}_stringified.ts`,
    contentString,
    options,
    function (err) {
      if (err) {
        return console.error(err);
      }
    }
  );
  console.log("File created!");
  console.log(`${__dirname}/${filename}_stringified.ts`);
};

const secret = process.env.SECRET_KEY as string;
const wallet2 = Keypair.fromSecretKey(utils.bytes.bs58.decode(secret));
const wallet = new SignerWallet(wallet2);
const cuPool = "4Nmq5mM747qbA53Yik6KFw4G4nvoSRPsJqRSSGJUwWVa"; //swrm wallet
const capsPool = "79ZGVZuP93wChsjiqvpCUZtTq6xYc8Edaid4ng8BHxp1";
const POOL_ID = new PublicKey(cuPool);
const CLUSTER = "mainnet";
const BATCH_SIZE = 8;

export type UpdateRule = {
  volume?: { volumeUpperBound: number; multiplier: number }[];
  metadata?: { traitType: string; value: string; multiplier: number }[];
  combination?: {
    primaryMint: PublicKey[];
    secondaryMints: PublicKey[];
    multiplier: number;
  };
};

interface UpdateRuleVolumeWithApplicableMints extends UpdateRule {
  volume?: {
    volumeUpperBound: number;
    multiplier: number;
    applicableMints: string[];
  }[];
}

// const SELECTED_MINTS = bronze.slice(1999, 2500); // 3363
// const SELECTED_MINTS = bronze.slice(2499, 3000); // 3363
const SELECTED_MINTS = bronze; // 3363
// const SELECTED_MINTS = bronze.slice(2999); // 3363

const UPDATE_RULES: UpdateRule[] = [
  {
    volume: [{ volumeUpperBound: 1, multiplier: 2 }],
  },
  // { volumeUpperBound: 4, multiplier: 3 },
  // { volumeUpperBound: 7, multiplier: 6 },
  // { volumeUpperBound: 9, multiplier: 7 },
  // { volumeUpperBound: 15, multiplier: 10 },
  // { volumeUpperBound: 29, multiplier: 20 },
  // { volumeUpperBound: 39, multiplier: 25 },
  // { volumeUpperBound: 40, multiplier: 30 },
  //   ],
  // },
  // {
  // metadata: [{ traitType: "Pass Type", value: "Bronze", multiplier: 2 }],
  // },
];

const updateMultipliersOnRules = async (
  stakePoolId: PublicKey,
  cluster: string,
  snapshot: boolean
) => {
  const connection = connectionFor(cluster);

  // get all active stake entries
  const activeStakeEntriesAll = await getActiveStakeEntriesForPool(
    connection,
    stakePoolId
  );
  console.dir(activeStakeEntriesAll);
  console.log("active entries: ", activeStakeEntriesAll.length);

  const activeStakeEntries = activeStakeEntriesAll.filter((entry) =>
    SELECTED_MINTS.includes(entry.parsed.originalMint.toBase58())
  );
  // console.dir(activeStakeEntries);
  // console.log("active activeStakeEntries: ", activeStakeEntries.length);
  const volumeLogs: { [user: string]: PublicKey[] } = {};
  for (const entry of activeStakeEntriesAll) {
    const user = entry.parsed.lastStaker.toString();
    if (volumeLogs[user]) {
      console.log("pushing for user", user);
      volumeLogs[user]!.push(entry.pubkey);
    } else {
      volumeLogs[user] = [entry.pubkey];
    }
  }
  if (snapshot) {
    saveJsonAsTsFileStringy("volumeLogs", volumeLogs);
    return;
  }
  const stakers = Object.keys(volumeLogs);
  console.log("stakers", stakers);
  console.log(stakers.length);
  for (const rule of UPDATE_RULES) {
    let dataToSubmit: { mint: PublicKey; multiplier: number }[] = [];

    // metadata
    if (rule.metadata) {
      console.log("Fetching metadata...");
      const [metadata] = await fetchMetadata(
        connection,
        activeStakeEntries.map((entry) => entry.parsed.originalMint)
      );
      console.log("Constructing multipliers...");
      const metadataLogs: { [multiplier: number]: PublicKey[] } = {};
      for (let index = 0; index < metadata.length; index++) {
        const md = metadata[index]!;
        for (const mdRule of rule.metadata) {
          if (
            md.attributes.find(
              (attr) =>
                attr.trait_type === mdRule.traitType &&
                attr.value === mdRule.value
            )
          ) {
            if (metadataLogs[mdRule.multiplier]) {
              metadataLogs[mdRule.multiplier]!.push(
                activeStakeEntries[index]!.pubkey
              );
            } else {
              metadataLogs[mdRule.multiplier] = [
                activeStakeEntries[index]!.pubkey,
              ];
            }
          }
        }
      }

      // Update multiplier of mints
      for (const [multiplierToSet, entries] of Object.entries(metadataLogs)) {
        if (entries.length > 0) {
          for (let index = 0; index < entries.length; index++) {
            const entry = entries[index]!;
            dataToSubmit.push({
              mint: entry,
              multiplier: Number(multiplierToSet),
            });
            if (
              dataToSubmit.length > BATCH_SIZE ||
              index === entries.length - 1
            ) {
              await updateMultipliers(
                connection,
                stakePoolId,
                dataToSubmit.map((entry) => entry.mint),
                dataToSubmit.map((entry) => entry.multiplier)
              );
              dataToSubmit = [];
            }
          }
        }
      }
    } else if (rule.volume) {
      // volume
      console.log("Fetching volume...");
      console.dir(activeStakeEntries);
      const volumeLogs: { [user: string]: PublicKey[] } = {};
      for (const entry of activeStakeEntries) {
        const user = entry.parsed.lastStaker.toString();
        if (volumeLogs[user]) {
          console.log("pushing for user", user);
          volumeLogs[user]!.push(entry.pubkey);
        } else {
          volumeLogs[user] = [entry.pubkey];
        }
      }
      const stakers = Object.keys(volumeLogs);
      console.log("stakers", stakers);
      console.log(stakers.length);
      for (const [_, entries] of Object.entries(volumeLogs)) {
        if (entries.length > 0) {
          // find multiplier for volume
          const volume = entries.length;
          let multiplierToSet = 1;
          for (const volumeRule of rule.volume) {
            multiplierToSet = volumeRule.multiplier;
            if (volume <= volumeRule.volumeUpperBound) {
              break;
            }
            console.log("volume: ", volume);
          }

          // Update multiplier of mints
          for (const entry of entries) {
            console.log("updating multiplier for mint", entry.toString());
            dataToSubmit.push({
              mint: entry,
              multiplier: multiplierToSet,
            });
            console.log(dataToSubmit.length);
            if (dataToSubmit.length > BATCH_SIZE) {
              console.log("updating multipliers");
              await updateMultipliers(
                connection,
                stakePoolId,
                dataToSubmit.map((entry) => entry.mint),
                dataToSubmit.map((entry) => entry.multiplier)
              );
              dataToSubmit = [];
            }
          }
        }
      }
    } else if (rule.combination) {
      // combinations
      const primaryMints = rule.combination.primaryMint;
      const secondaryMints = rule.combination.secondaryMints;
      const combinationLogs: { [user: string]: string[] } = {};

      for (const entry of activeStakeEntries) {
        const user = entry.parsed.lastStaker.toString();
        if (combinationLogs[user]) {
          combinationLogs[user]!.push(entry.pubkey.toString());
        } else {
          combinationLogs[user] = [entry.pubkey.toString()];
        }
      }
      for (const [_, entries] of Object.entries(combinationLogs)) {
        let multiplierToSet = 0;
        let validCombination = true;
        // Calculate if multiplier for primary mints
        for (const mint of primaryMints) {
          if (!entries.includes(mint.toString())) {
            validCombination = false;
            break;
          }
        }
        for (const mint of secondaryMints) {
          if (!entries.includes(mint.toString()) || !validCombination) {
            validCombination = false;
            break;
          }
        }

        if (validCombination) {
          multiplierToSet = rule.combination.multiplier;
        }

        // Update multiplier of primary mints
        for (const primaryMint of primaryMints) {
          const [stakeEntryId] = await findStakeEntryId(
            wallet.publicKey,
            stakePoolId,
            primaryMint,
            false
          );
          dataToSubmit.push({
            mint: stakeEntryId,
            multiplier: multiplierToSet,
          });
          if (dataToSubmit.length > BATCH_SIZE) {
            await updateMultipliers(
              connection,
              stakePoolId,
              dataToSubmit.map((entry) => entry.mint),
              dataToSubmit.map((entry) => entry.multiplier)
            );
            dataToSubmit = [];
          }
        }
      }
    }
  }
};

const updateMultipliers = async (
  connection: Connection,
  stakePoolId: PublicKey,
  stakeEntryIds: PublicKey[],
  multipliers: number[]
): Promise<void> => {
  const transaction = new Transaction();
  // update multipliers
  const [rewardDistributorId] = await findRewardDistributorId(stakePoolId);
  const rewardDistributorData = await tryGetAccount(() =>
    getRewardDistributor(connection, rewardDistributorId)
  );
  if (!rewardDistributorData) {
    console.log("No reward distributor found");
    return;
  }

  const multipliersToSet = multipliers.map(
    (ml) => ml * 10 ** rewardDistributorData.parsed.multiplierDecimals
  );

  const rewardEntryIds = (
    await Promise.all(
      stakeEntryIds.map((stakeEntryId) =>
        findRewardEntryId(rewardDistributorId, stakeEntryId)
      )
    )
  ).map((r) => r[0]);
  const stakeEntryDatas = await getStakeEntries(connection, stakeEntryIds);
  const rewardEntryDatas = await getRewardEntries(connection, rewardEntryIds);
  // Add init reward entry instructions
  await Promise.all(
    rewardEntryDatas.map((rewardEntryData, index) => {
      if (!rewardEntryData.parsed) {
        const stakeEntryId = stakeEntryIds[index]!;
        return withInitRewardEntry(transaction, connection, wallet, {
          stakeEntryId: stakeEntryId,
          rewardDistributorId: rewardDistributorId,
        });
      }
    })
  );

  // Add update instruction if needed
  await Promise.all(
    rewardEntryDatas.map((rewardEntryData, index) => {
      const multiplierToSet = multipliersToSet[index]!;
      const stakeEntryId = stakeEntryIds[index]!;
      if (
        !rewardEntryData.parsed ||
        (rewardEntryData.parsed &&
          rewardEntryData.parsed.multiplier.toNumber() !== multiplierToSet)
      ) {
        console.log(
          `Updating multiplier for mint ${stakeEntryDatas[
            index
          ]!.parsed.originalMint.toString()} from ${
            rewardEntryData.parsed
              ? rewardEntryData.parsed.multiplier.toString()
              : "100"
          } to ${multiplierToSet}`
        );
        return withUpdateRewardEntry(transaction, connection, wallet, {
          stakePoolId: stakePoolId,
          rewardDistributorId: rewardDistributorId,
          stakeEntryId: stakeEntryId,
          multiplier: new BN(multiplierToSet),
        });
      }
    })
  );

  // Execute transaction
  if (transaction.instructions.length > 0) {
    console.log("executing transaction");
    const txId = await executeTransaction(connection, wallet, transaction, {});
    console.log(`Successfully executed transaction ${txId}\n`);
  } else {
    console.log("No instructions provided\n");
  }
};

updateMultipliersOnRules(POOL_ID, CLUSTER, true).catch((e) => console.log(e));
