import prisma from "../../../../../lib/prisma";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
) {
  console.log("req", req.query);
  const result = await prisma.treeNode.findMany({});
  console.log("result", result);

  res.status(200).json(result);
}
