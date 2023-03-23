import { AssetTransfersCategory } from "alchemy-sdk";
import { ecrecover } from "@ethereumjs/util";
import { Transaction } from "@ethereumjs/tx";
import alchemy from "./alchemy";

export const getPubkey = async (address: string): Promise<Buffer | null> => {
  const result = await alchemy.core.getAssetTransfers({
    fromAddress: address,
    category: [AssetTransfersCategory.EXTERNAL]
  });

  const txHash = result.transfers[0].hash;
  const tx = await alchemy.core.getTransaction(txHash);

  let pubKey;
  if (tx) {
    const txData = {
      from: tx.from,
      nonce: tx.nonce,
      gasPrice: tx.gasPrice?.toBigInt(),
      gasLimit: tx.gasLimit?.toBigInt(),
      to: tx.to,
      value: tx.value.toBigInt(),
      data: tx.data
    };
    const msgHash = Transaction.fromTxData(txData).getMessageToSign(true);

    const s = Buffer.from(tx.s?.replace("0x", "") as string, "hex");
    const r = Buffer.from(tx.r?.replace("0x", "") as string, "hex");
    const v = BigInt(tx.v as number);

    pubKey = ecrecover(msgHash, v, r, s, BigInt(1));
  }

  return pubKey || null;
};
