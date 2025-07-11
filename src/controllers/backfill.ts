import { Request as ExReq, Response as ExRes } from "express";
import { backfillProducer } from "../services/backfill-service";

export default async (req: ExReq, res: ExRes) => {
  const { guildId, forumChannelId } = req.body;
  if (!guildId || !forumChannelId) {
    res.status(400).json({ error: "Missing guildId or forumChannelId" });
    return;
  }

  try {
    const job = await backfillProducer.add({ guildId, forumChannelId });
    return res.json({ jobId: job.id });
  } catch (err) {
    console.error("Failed to enqueue backfill job:", err);
    return res
      .status(500)
      .json({ error: "Could not schedule backfill (see server logs)" });
  }
};
