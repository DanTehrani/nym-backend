import { execute } from "../.graphclient";
import { DocumentNode } from "graphql";
import { gql } from "graphql-tag";

export function buildOwnersQuery() {
  return gql`
    query {
      accounts(first: 3, where: { tokenBalance_gte: 1 }) {
        id
        tokenBalance
      }
    }
  `;
}

export function buildDelegatesQuery() {
  return gql`
    query {
      delegates(first: 3, where: { delegatedVotes_gte: 1 }) {
        id
        delegatedVotes
      }
    }
  `;
}

// TODO: error handling
export async function executeQuery(query: DocumentNode) {
  const res = await execute(query, {});
  return res["data"];
}
