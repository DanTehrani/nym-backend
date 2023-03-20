import "dotenv/config";

import * as nerman from "nerman";
const Nouns = new nerman.Nouns(process.env.JSON_RPC_API_URL);

Nouns.on("Transfer", async (data: nerman.EventData.Transfer) => {
  console.log(
    "NounsToken | Transfer | from:" +
      data.from.id +
      ", to: " +
      data.to.id +
      ", tokenId: " +
      data.tokenId
  );

  // TODO: Update the Merkle tree!
});
