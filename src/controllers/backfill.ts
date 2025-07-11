import { Request as ExReq, Response as ExRes } from "express";
import { backfillQueue } from "../services/backfill-service";

export default async (req: ExReq, res: ExRes) => {
  const { guildId, forumChannelId } = req.body;
  if (!guildId || !forumChannelId) {
    res.status(400).json({ error: "Missing guildId or forumChannelId" });
    return;
  }
  const job = await backfillQueue.add({ guildId, forumChannelId });
  res.json({ jobId: job.id });
};
