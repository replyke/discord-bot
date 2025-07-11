import { Router } from "express";
import { backfill, backfillCheckProgress } from "./controllers";

const router = Router();

router.post("/backfill", backfill);

router.get("/backfill/:jobId", backfillCheckProgress);

export default router;
