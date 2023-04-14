import "dotenv/config";
import { executeQuery, buildDelegatesQuery, buildOwnersQuery } from "./graphql";
import { Account as Owner, Delegate } from "../.graphclient";
import { getOwners } from "./multisig";
import { Poseidon, Tree } from "@personaelabs/spartan-ecdsa";
import { getPubkey } from "./pubkey";

import { PrismaClient, GroupType } from "@prisma/client";
import alchemy from "./alchemy";
const prisma = new PrismaClient();
const poseidon = new Poseidon();

const DEV_ACCOUNTS: EOA[] = [
  {
    address: "57628b342f1cffbe5cf6cdd8ebf6ea0bb9176ea4",
    pubKey: Buffer.from(
      "73703d822b3a4bf694d7c29e9200e6e20ba00068a33886cb393a7a908012e1b3fd9467081aa964663cb75e399fa545ba1932dbebae97da9fdd841994df77e69c",
      "hex"
    ),
    tokenBalance: 2,
    delegatedVotes: null
  }
];

let poseidonInitialized = false;

type EOA = {
  address: string;
  tokenBalance: number | null;
  delegatedVotes: number | null;
  pubKey: Buffer;
};

type MultiSigAccount = {
  address: string;
  code: string;
};

const isManyNounsAccount = (account: EOA) =>
  (account.tokenBalance !== null && account.tokenBalance >= 2) ||
  (account.delegatedVotes !== null && account.delegatedVotes >= 2);

const treeExists = async (root: string): Promise<boolean> =>
  (await prisma.tree.findFirst({
    where: {
      root
    }
  }))
    ? true
    : false;

async function saveTree(blockHeight: number) {
  console.log("Saving tree to database at block", blockHeight);
  // ########################################################
  // Fetch owners and delegates from the The Graph
  // ########################################################

  console.time("fetching owners and delegates from subgraph");
  const owners: Owner[] = (await executeQuery(buildOwnersQuery(blockHeight)))
    .accounts;
  const delegates: Delegate[] = (
    await executeQuery(buildDelegatesQuery(blockHeight))
  ).delegates;
  console.timeEnd("fetching owners and delegates from subgraph");

  const accounts: (Owner | Delegate)[] = owners;

  for (let i = 0; i < delegates.length; i++) {
    if (!accounts.find(account => account.id === delegates[i].id)) {
      accounts.push(delegates[i]);
    }
  }

  const cachedAccounts = await prisma.cachedEOA.findMany();
  const cachedMultiSigAccounts = await prisma.cachedMultiSig.findMany();

  let numNoPubKey = 0;
  const allAccounts: EOA[] = [];
  const multiSigAccounts: MultiSigAccount[] = [];

  for (let i = 0; i < accounts.length; i++) {
    console.log(`Processing account ${i + 1} of ${accounts.length}`);
    const account = accounts[i];
    const address = account.id.replace("0x", ""); // Lowercase

    // Search address code from the database
    let code = cachedMultiSigAccounts.find(
      cached => cached.address === address
    )?.code;

    // Get code from state
    if (!code) {
      code = await alchemy.core.getCode(address);
    }

    // If the address is a multisig wallet, fetch the owners
    if (code !== "0x") {
      multiSigAccounts.push({
        address,
        code
      });

      // Owners that are not yet in the allAccounts array
      const owners = (await getOwners(address)).filter(
        owner => !allAccounts.find(a => a.address === owner)
      ); // Lowercase

      for (let j = 0; j < owners.length; j++) {
        let ownerPubKey;
        const ownerAccount = cachedAccounts.find(
          cachedAccount => cachedAccount.address === owners[j]
        );

        if (ownerAccount) {
          ownerPubKey = Buffer.from(
            BigInt("0x" + ownerAccount.pubkey).toString(16),
            "hex"
          );
        } else {
          ownerPubKey = await getPubkey(owners[j], blockHeight);
        }

        if (ownerPubKey) {
          allAccounts.push({
            address: owners[j],
            tokenBalance: (account as Owner).tokenBalance || null,
            delegatedVotes: (account as Delegate).delegatedVotes || null,
            pubKey: ownerPubKey
          });
        }

        if (ownerPubKey === null) {
          numNoPubKey++;
        }
      }
      // Only process the account if it has not been processed yet
    } else if (!allAccounts.find(a => a.address === address)) {
      const cachedAccount = cachedAccounts.find(
        cached => cached.address === address
      );

      let pubKey;
      if (cachedAccount) {
        pubKey = Buffer.from(
          BigInt("0x" + cachedAccount.pubkey).toString(16),
          "hex"
        );
      } else {
        pubKey = await getPubkey(address, blockHeight);
      }

      if (pubKey) {
        allAccounts.push({
          address,
          tokenBalance: (account as Owner).tokenBalance || null,
          delegatedVotes: (account as Delegate).delegatedVotes || null,
          pubKey
        });
      }

      if (pubKey === null) {
        numNoPubKey++;
      }
    }
  }

  // ########################################################
  // Cache newly detected accounts and multisigs
  // ########################################################

  const newAccounts = allAccounts.filter(
    account =>
      !cachedAccounts.find(cached => cached.address === account.address)
  );

  await prisma.cachedEOA.createMany({
    data: newAccounts.map(account => ({
      address: account.address,
      pubkey: account.pubKey.toString("hex")
    }))
  });

  const newMultiSigAccounts = multiSigAccounts.filter(
    account =>
      !cachedMultiSigAccounts.find(cached => cached.address === account.address)
  );

  await prisma.cachedMultiSig.createMany({
    data: newMultiSigAccounts.map(account => ({
      address: account.address,
      code: account.code
    }))
  });

  allAccounts.push(...DEV_ACCOUNTS);

  console.log("numAccounts", allAccounts.length);
  console.log("numNoPubKey", numNoPubKey);

  const sortedAccounts = allAccounts.sort((a, b) =>
    b.pubKey.toString("hex") > a.pubKey.toString("hex") ? -1 : 1
  );

  const anonSet1 = sortedAccounts;
  const anonSet2 = sortedAccounts.filter(account =>
    isManyNounsAccount(account)
  );

  // TODO: Sanity check the size of the sets

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
  // Save trees to the database
  // ########################################################
  const anonSet1Root = anonSet1Tree.root().toString(16);
  const anonSet2Root = anonSet2Tree.root().toString(16);

  // Save only if this is a new tree
  if (!(await treeExists(anonSet1Root))) {
    console.log("Creating new tree for anon set 1");
    await prisma.tree.create({
      data: {
        type: GroupType.OneNoun,
        root: anonSet1Root
      }
    });

    await prisma.treeNode.deleteMany({
      where: {
        type: GroupType.OneNoun
      }
    });

    await prisma.treeNode.createMany({
      data: anonSet1.map(account => ({
        pubkey: account.pubKey.toString("hex"),
        type: GroupType.OneNoun
      }))
    });
  }

  // Save only if this is a new tree
  if (!(await treeExists(anonSet2Root))) {
    console.log("Creating new tree for anon set 2");
    await prisma.tree.create({
      data: {
        type: GroupType.ManyNouns,
        root: anonSet2Root
      }
    });

    await prisma.treeNode.deleteMany({
      where: {
        type: GroupType.ManyNouns
      }
    });

    await prisma.treeNode.createMany({
      data: anonSet2.map(account => ({
        pubkey: account.pubKey.toString("hex"),
        type: GroupType.ManyNouns
      }))
    });
  }
}

const run = async () => {
  const blockHeight = await alchemy.core.getBlockNumber();
  await saveTree(blockHeight);
};

run();
