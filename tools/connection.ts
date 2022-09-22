import { Connection } from "@solana/web3.js";

const networkURLs: { [key: string]: string } = {
  ["mainnet-beta"]:
    "https://long-lively-sky.solana-mainnet.quiknode.pro/e69b5cd15d858823ae4e5c8e491743cabfe931d0/",
  mainnet:
    "https://long-lively-sky.solana-mainnet.quiknode.pro/e69b5cd15d858823ae4e5c8e491743cabfe931d0/",
  devnet: "https://api.devnet.solana.com/",
  testnet: "https://api.testnet.solana.com/",
  localnet: "http://localhost:8899/",
};

export const connectionFor = (cluster: string, defaultCluster = "mainnet") => {
  return new Connection(
    process.env.RPC_URL || networkURLs[cluster || defaultCluster] || "",
    "recent"
  );
};
