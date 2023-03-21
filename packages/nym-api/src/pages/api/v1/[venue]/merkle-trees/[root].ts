import prisma from "../../../../../lib/prisma";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
) {
  const { venue, root } = req.query;
  // Todo: Get the leaves from the DB
  const leaves: string[] = [];
  res.status(200).json({ leaves });
}
