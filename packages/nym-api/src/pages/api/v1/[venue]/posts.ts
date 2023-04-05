import prisma from "../../../../lib/prisma";
import { hashFingerPrint } from "../../../../lib/hasher";
import type { NextApiRequest, NextApiResponse } from "next";
import { ecrecover, hashPersonalMessage, pubToAddress } from "@ethereumjs/util";
import { MembershipVerifier } from "@personaelabs/spartan-ecdsa";

type PostBase = {
  content: string;
  title: string;
  parentId?: string;
};

type PseudoPost = {
  proof: string;
} & PostBase;

type DoxedPost = {
  sig: string;
} & PostBase;

const handleGetPosts = async (req: NextApiRequest, res: NextApiResponse) => {
  const skip = req.query.offset ? parseInt(req.query.offset as string) : 0;
  const take = req.query.limit ? parseInt(req.query.limit as string) : 10;

  const posts = await prisma.doxedPost.findMany({
    where: {
      venue: req.query.venue as string,
      parentHash: req.query.parentId as string
    },
    skip: skip as number,
    take: take as number
  });

  res.send(posts);
};

const handleCreateDoxedPost = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const post: DoxedPost = req.body;

  const hash = await hashFingerPrint(Buffer.from(post.sig, "hex"));

  const msg = Buffer.from(
    JSON.stringify({
      content: post.content,
      title: post.title,
      parentHash: post.parentId
    }),
    "utf8"
  );

  const sig = post.sig;

  const msgHash = hashPersonalMessage(msg);

  const r = Buffer.from(sig.slice(0, 64), "hex");
  const s = Buffer.from(sig.slice(64, 128), "hex");
  const v = BigInt("0x" + sig.slice(128, 130));

  const pubkey = ecrecover(msgHash, v, r, s);
  const address = pubToAddress(pubkey);

  await prisma.doxedPost.create({
    data: {
      title: post.title,
      content: post.content,
      parentHash: post.parentId,
      venue: req.query.venue as string,
      hash,
      sig,
      address: address.toString("hex")
    }
  });

  res.status(200).send({ postId: hash });
};

/*
import fs from "fs";
const downloadCircuit = async () => {
  const res = await fetch(defaultPubkeyMembershipVConfig.circuit);
  const circuit = await res.text();
  fs.writeFileSync("pubkey_membership.circuit", circuit);
  console.log("downloaded!");
};
*/

const handleCreatePseudoPost = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const post: PseudoPost = req.body;

  const hash = await hashFingerPrint(Buffer.from(JSON.parse(post.proof).proof));

  const verifierConfig = {
    circuit: "./pubkey_membership.circuit"
  };

  const verifier = new MembershipVerifier({
    ...verifierConfig,
    enableProfiler: true
  });
  let verifierInitialized = false;

  if (!verifierInitialized) {
    await verifier.initWasm();
    console.log("Verifier initialized on server!");
    verifierInitialized = true;
  }

  const proofParsed = JSON.parse(post.proof);
  const proof = Buffer.from(proofParsed.proof);
  const publicInput = Buffer.from(proofParsed.publicInput);

  const proofVerified = await verifier.verify(proof, publicInput);

  if (!proofVerified) {
    console.log("Proof verification failed!");
    res.status(400).send("Invalid proof!");
  } else {
    console.log("Proof verified");
    await prisma.psuedoPost.create({
      data: {
        title: post.title,
        content: post.content,
        venue: req.query.venue as string,
        proof: post.proof,
        hash,
        parentHash: post.parentId
      }
    });
    res.send("OK");
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method == "POST") {
    if (req.body.proof) {
      await handleCreatePseudoPost(req, res);
    } else if (req.body.sig) {
      await handleCreateDoxedPost(req, res);
    } else {
      res.status(400).send("Either provide proof or sig in request body");
    }
  } else if (req.method == "GET") {
    await handleGetPosts(req, res);
  } else {
    res.status(400).send("Unsupported method");
  }
}
