import { Request as ExReq, Response as ExRes } from "express";
import { backfillQueue } from "../services/backfill-service";

export default async (req: ExReq, res: ExRes) => {
  const job = await backfillQueue.getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const state = await job.getState();
  const progress = await job.progress();
  res.json({ id: job.id, state, progress });
};
