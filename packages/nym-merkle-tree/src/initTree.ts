import "dotenv/config";
import { executeQuery, buildDelegatesQuery, buildOwnersQuery } from "./graphql";
import { Account, Delegate } from "../.graphclient";
import { isMultiSig, getOwners } from "./multisig";
import { Poseidon, Tree } from "@personaelabs/spartan-ecdsa";
import { getPubkey } from "./pubkey";

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function initTree() {
  // ########################################################
  // Fetch owner and delegates from the subgraph
  // ########################################################

  const owners: Account[] = (await executeQuery(buildOwnersQuery())).accounts;
  const delegates: Delegate[] = (await executeQuery(buildDelegatesQuery()))
    .delegates;

  const anonSet1: string[] = Array.from(
    new Set([...delegates.map(d => d.id), ...owners.map(d => d.id)])
  );

  const anonSet2: string[] = Array.from(
    new Set([
      ...delegates.filter(d => d.delegatedVotes >= 2).map(d => d.id),
      ...owners.filter(d => d.tokenBalance >= 2).map(d => d.id)
    ])
  );

  // ########################################################
  // Fetch owners of multisig wallets
  // ########################################################

  const anonSet1MultiSigOwners: string[] = [];
  for (let i = 0; i < anonSet1.length; i++) {
    const address = anonSet1[i];
    if (await isMultiSig(address)) {
      const safeOwners = await getOwners(address);
      anonSet1MultiSigOwners.push(...safeOwners);
    }
  }

  const anonSet2MultiSigOwners: string[] = [];
  for (let i = 0; i < anonSet1.length; i++) {
    const address = anonSet1[i];
    if (await isMultiSig(address)) {
      const safeOwners = await getOwners(address);
      anonSet2MultiSigOwners.push(...safeOwners);
    }
  }

  // ########################################################
  // Merge multisig owners into anon sets
  // ########################################################

  const anonSet1WithMultiSigOwners = Array.from(
    new Set([...anonSet1, ...anonSet1MultiSigOwners])
  );

  const anonSet2WithMultiSigOwners = Array.from(
    new Set([...anonSet2, ...anonSet2MultiSigOwners])
  );

  // ########################################################
  // Extract the public keys from the addresses
  // ########################################################

  const anonSet1PubKeys: Buffer[] = [];
  for (let i = 0; i < anonSet1WithMultiSigOwners.length; i++) {
    const address = anonSet1WithMultiSigOwners[i];
    // There is a chance that the public key is not extractable
    const pubKey = await getPubkey(address);
    if (pubKey) {
      anonSet1PubKeys.push(pubKey);
    }
  }

  const anonSet2PubKeys: Buffer[] = [];
  for (let i = 0; i < anonSet2WithMultiSigOwners.length; i++) {
    const address = anonSet2WithMultiSigOwners[i];
    // There is a chance that the public key is not extractable
    const pubKey = await getPubkey(address);
    if (pubKey) {
      anonSet2PubKeys.push(pubKey);
    }
  }

  // ########################################################
  // Create the pubkey trees
  // ########################################################

  const poseidon = new Poseidon();
  await poseidon.initWasm();

  const treeDepth = 20; // Spartan-ecdsa only supports tree depth = 20
  const anonSet1Tree = new Tree(treeDepth, poseidon);
  const anonSet2Tree = new Tree(treeDepth, poseidon);

  anonSet1PubKeys.forEach(pubKey => {
    // TODO: Keep track of the nodes here!
    anonSet1Tree.insert(poseidon.hashPubKey(pubKey));
  });
  anonSet2PubKeys.forEach(pubKey =>
    anonSet2Tree.insert(poseidon.hashPubKey(pubKey))
  );

  // ########################################################
  // Write all nodes in the public keys trees into the database
  // ########################################################

  // TODO: Get all nodes in the tree and write them into the database
}

initTree();
