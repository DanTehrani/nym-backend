# nym-merkle-tree

_Draft!_

Create and store a Merkle tree of public keys of the following users.

- Noun owners
- Noun delegates
- Guardians of the delegates/owners' multisig wallets

## Initializing the Merkle tree

The initialization fetches all the above users, extracts the public keys, and stores the resulting Merkle tree in the database; the initialization is expected to only be called once, though it is idempotent.
Updates to the Merkle tree are handled incrementally as follows.

## Updating the Merkle tree

_We store \*all of the nodes in the Merkle tree\* (not only the leaves) in the database as described in [this blog post](https://www.baeldung.com/cs/storing-tree-in-rdb), to efficiently update the Merkle tree (without reconstructing it from scratch every time)._

The Merkle tree is updated as a result of the following events.

- Noun is created
- Noun is transferred
- Delegates are updated
- Multisig owners are updated

We use [nerman](https://www.npmjs.com/package/nerman) to handle Nouns related events, and use Alchemy's webhooks to handle multisig-related events.
