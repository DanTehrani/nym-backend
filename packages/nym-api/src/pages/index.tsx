import axiosBase from "axios";
import {
  MembershipProver,
  Tree,
  Poseidon,
  defaultPubkeyMembershipPConfig,
  MembershipVerifier,
  defaultPubkeyMembershipVConfig
} from "@personaelabs/spartan-ecdsa";
import {
  ecrecover,
  ecsign,
  hashPersonalMessage,
  privateToPublic
} from "@ethereumjs/util";

const venue = "nouns";
const axios = axiosBase.create({
  baseURL: `http://localhost:3000/api/v1/${venue}`
});

const privKey = Buffer.from("".padStart(16, "🧙"), "utf16le");

export default function Home() {
  const postDoxed = async () => {
    const title = "doxed post title";
    const content = `doxed post content ${Math.random()}`;
    // @ts-ignore
    const parentId = document.getElementById("parentId")?.value;
    console.log({ parentId });

    const msgHash = hashPersonalMessage(
      Buffer.from(
        JSON.stringify({
          content,
          title,
          parentId
        }),
        "utf8"
      )
    );

    const { r, v, s } = ecsign(msgHash, privKey);
    const sig = `${r.toString("hex")}${s.toString("hex")}${v.toString(16)}`;
    const result = await axios.post(`/posts`, {
      content,
      sig,
      title,
      parentId
    });
    console.log({ postId: result.data.postId });
  };

  const postPseudo = async () => {
    const privKey = Buffer.from("".padStart(16, "🧙"), "utf16le");
    const msg = Buffer.from(Math.random().toString());
    const msgHash = hashPersonalMessage(msg);

    const { v, r, s } = ecsign(msgHash, privKey);
    const pubKey = ecrecover(msgHash, v, r, s);
    const sig = `0x${r.toString("hex")}${s.toString("hex")}${v.toString(16)}`;

    const poseidon = new Poseidon();
    await poseidon.initWasm();

    const treeDepth = 20;
    const pubKeyTree = new Tree(treeDepth, poseidon);

    const proverPubKeyHash = poseidon.hashPubKey(pubKey);

    pubKeyTree.insert(proverPubKeyHash);

    // Insert other members into the tree
    for (const member of ["🕵️", "🥷", "👩‍🔬"]) {
      const pubKey = privateToPublic(
        Buffer.from("".padStart(16, member), "utf16le")
      );
      pubKeyTree.insert(poseidon.hashPubKey(pubKey));
    }

    const index = pubKeyTree.indexOf(proverPubKeyHash);
    const merkleProof = pubKeyTree.createProof(index);

    const prover = new MembershipProver({
      ...defaultPubkeyMembershipPConfig,
      enableProfiler: true
    });

    await prover.initWasm();

    const { proof, publicInput } = await prover.prove(
      sig,
      msgHash,
      merkleProof
    );

    console.log({ proof: proof[0], publicInput: publicInput.serialize()[0] });

    const verifier = new MembershipVerifier({
      ...defaultPubkeyMembershipVConfig,
      enableProfiler: true
    });

    await verifier.initWasm();
    const proofVerified = await verifier.verify(proof, publicInput.serialize());
    console.log("proof verified?", proofVerified);

    const proofString = JSON.stringify({
      proof: Buffer.from(proof).toString("hex"),
      publicInput: Buffer.from(publicInput.serialize()).toString("hex")
    });

    await axios.post(`posts`, {
      title: "pusedo post title",
      content: "pusedo post content",
      parentId: null,
      proof: proofString
    });
  };

  const upvote = async () => {
    const { data: posts } = await axios.get("/posts", {
      params: {
        offset: 0,
        limit: 1
      }
    });
    const postId = posts[0].hash;

    const msg = Buffer.from(postId.toString());
    const msgHash = hashPersonalMessage(msg);
    const { r, v, s } = ecsign(msgHash, privKey);

    const sig = `${r.toString("hex")}${s.toString("hex")}${v.toString(16)}`;

    const result = await axios.post(`/posts/${postId}/upvote`, { sig });
    console.log(result);
  };

  const getPosts = async () => {
    const { data: posts } = await axios.get("/posts", {
      params: {
        offset: 0,
        limit: 10
      }
    });
    console.log(posts);
  };

  const getThread = async () => {
    // @ts-ignore
    const postId = document.getElementById("postId")?.value;
    const { data: thread } = await axios.get(`/posts/${postId}`);
    console.log(thread);
  };

  return (
    <div>
      <div>
        <button onClick={postDoxed}>Doxed post</button>
        <input type="text" id="parentId" placeholder="optional" />
      </div>
      <button onClick={postPseudo}>Pseudo post</button>
      <button onClick={upvote}>upvote</button>
      <div>
        <button onClick={getThread}>getThread</button>
        <input type="text" id="postId"></input>
      </div>
    </div>
  );
}
