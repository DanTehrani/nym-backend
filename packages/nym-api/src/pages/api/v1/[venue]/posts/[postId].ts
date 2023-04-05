import prisma from "../../../../../lib/prisma";
import type { NextApiRequest, NextApiResponse } from "next";

const handleGetPost = async (req: NextApiRequest, res: NextApiResponse) => {
  const posts = await prisma.$queryRaw`
  WITH RECURSIVE thread AS (
	SELECT
		"hash",
		"parentHash"
	FROM
		"DoxedPost"
	WHERE
		"hash" = ${req.query.postId}
	UNION
	SELECT
		d. "hash",
		d. "parentHash"
	FROM
		"DoxedPost" d
		INNER JOIN thread t ON d. "parentHash" = t. "hash"
    )
    SELECT
    	*
    FROM
    	thread;
  `;

  res.send(posts);
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method == "GET") {
    await handleGetPost(req, res);
  } else {
    res.status(400).send("Unsupported method");
  }
}
