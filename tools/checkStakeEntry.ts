import { Keypair, PublicKey } from "@solana/web3.js";

import { getRewardEntry } from "../src/programs/rewardDistributor/accounts";
import {
  findRewardDistributorId,
  findRewardEntryId,
} from "../src/programs/rewardDistributor/pda";
import { getStakeEntry } from "../src/programs/stakePool/accounts";
import { findStakeEntryIdFromMint } from "../src/programs/stakePool/utils";
import { connectionFor } from "./connection";

const checkStakeEntry = async (
  cluster: string,
  stakePoolId: PublicKey,
  mintId: PublicKey
) => {
  const connection = connectionFor(cluster);
  const [stakeEntryId] = await findStakeEntryIdFromMint(
    connection,
    Keypair.generate().publicKey,
    stakePoolId,
    mintId,
    false
  );

  const stakeEntry = await getStakeEntry(connection, stakeEntryId);
  console.log(stakeEntry);
  const [rewardDistributorId] = await findRewardDistributorId(stakePoolId);

  const [rewardEntryId] = await findRewardEntryId(
    rewardDistributorId,
    stakeEntryId
  );

  const rewardEntry = await getRewardEntry(connection, rewardEntryId);
  console.log(rewardEntry);
};

checkStakeEntry(
  "mainnet-beta",
  new PublicKey("79ZGVZuP93wChsjiqvpCUZtTq6xYc8Edaid4ng8BHxp1"),
  new PublicKey("6zoA37hfYtb9W9c33b5Qexz75gLVF66GxT34qqJuJt1G")
).catch((e) => console.log(e));
