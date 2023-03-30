import "dotenv/config";
import { executeQuery, buildDelegatesQuery, buildOwnersQuery } from "./graphql";
import { Account as Owner, Delegate } from "../.graphclient";
import { getOwners } from "./multisig";
import { Poseidon, Tree } from "@personaelabs/spartan-ecdsa";
import { getPubkey } from "./pubkey";

import { PrismaClient } from "@prisma/client";
import alchemy from "./alchemy";
const prisma = new PrismaClient();
const poseidon = new Poseidon();

let poseidonInitialized = false;

type Account = {
  address: string;
  tokenBalance: number | null;
  delegatedVotes: number | null;
  pubKey: Buffer;
  code: string;
};

async function initTree() {
  // ########################################################
  // Fetch owners and delegates from the subgraph
  // ########################################################

  console.time("fetching owners and delegates from subgraph");
  const owners: Owner[] = (await executeQuery(buildOwnersQuery())).accounts;
  const delegates: Delegate[] = (await executeQuery(buildDelegatesQuery()))
    .delegates;
  console.timeEnd("fetching owners and delegates from subgraph");

  const accounts = Array.from(new Set([...owners, ...delegates]));
  const treeNodes = await prisma.treeNode.findMany();

  let numNoPubKey = 0;
  const allAccounts: Account[] = [];
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const address = account.id;
    console.log(i);

    // Search address code from the database
    const node = treeNodes.find(node => node.address === address);
    let code = node?.code;

    // Get code from state
    if (!code) {
      code = await alchemy.core.getCode(address);
    }

    // If the address is a multisig wallet, fetch the owners
    if (code !== "0x") {
      const owners = await getOwners(address);

      for (let j = 0; j < owners.length; j++) {
        let ownerPubKey;
        const ownerNode = treeNodes.find(node => node.address === owners[j]);

        if (ownerNode?.value) {
          ownerPubKey = Buffer.from(
            BigInt(ownerNode?.value).toString(16),
            "hex"
          );
        } else {
          ownerPubKey = await getPubkey(owners[j]);
        }

        if (ownerPubKey) {
          allAccounts.push({
            address: owners[j],
            tokenBalance: (account as Owner).tokenBalance || null,
            delegatedVotes: (account as Delegate).delegatedVotes || null,
            pubKey: ownerPubKey,
            code: "0x"
          });
        } else {
          numNoPubKey++;
        }
      }
    } else {
      let pubKey;
      if (node?.value) {
        pubKey = Buffer.from(BigInt(node?.value).toString(16), "hex");
      } else {
        pubKey = await getPubkey(address);
      }

      if (pubKey) {
        allAccounts.push({
          address,
          tokenBalance: (account as Owner).tokenBalance || null,
          delegatedVotes: (account as Delegate).delegatedVotes || null,
          pubKey,
          code
        });
      } else {
        numNoPubKey++;
      }
    }
  }

  console.log("numAccounts", allAccounts.length);
  console.log("numNoPubKey", numNoPubKey);

  const anonSet1 = allAccounts.filter(
    account =>
      (account.tokenBalance !== null && account.tokenBalance > 1) ||
      (account.delegatedVotes !== null && account.delegatedVotes > 1)
  );

  const anonSet2 = allAccounts.filter(
    account =>
      (account.tokenBalance !== null && account.tokenBalance > 2) ||
      (account.delegatedVotes !== null && account.delegatedVotes > 2)
  );

  // ########################################################
  // Create the pubkey trees
  // ########################################################

  if (!poseidonInitialized) {
    await poseidon.initWasm();
    poseidonInitialized = true;
  }

  console.time("creating the pubkey trees");
  const treeDepth = 20; // Spartan-ecdsa only supports tree depth = 20
  const anonSet1Tree = new Tree(treeDepth, poseidon);
  const anonSet2Tree = new Tree(treeDepth, poseidon);

  anonSet1.forEach(account => {
    const hashedPubKey = poseidon.hashPubKey(account.pubKey);
    anonSet1Tree.insert(hashedPubKey);
  });

  anonSet2.forEach(account => {
    const hashedPubKey = poseidon.hashPubKey(account.pubKey);
    anonSet2Tree.insert(hashedPubKey);
  });
  console.timeEnd("creating the pubkey trees");

  // ########################################################
  // Write all nodes in the public keys trees into the database
  // ########################################################

  await prisma.treeNode.deleteMany({});

  await prisma.treeNode.createMany({
    data: allAccounts.map(account => ({
      address: account.address,
      value: "0x" + account.pubKey.toString("hex"),
      code: account.code
    }))
  });
}

initTree();
