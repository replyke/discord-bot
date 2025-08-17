// services/backfillService.ts
import Bull from "bull";
import { Client, ChannelType, ThreadChannel, MessageType } from "discord.js";
import { ReplykeClient } from "@replyke/node";
import PQueue from "p-queue";
import { getReplykeClientForGuild } from "../events/logger";
import { fetchStarterMessageWithRetry } from "../helpers/fetchStarterMessageWithRetry";
import { createThreadEntity } from "../helpers/createThreadEntity";
import backfillMessages from "../helpers/backfillMessages";
import { BackfillDatabase } from "./backfill-db";
import { runMigrations } from "../utils/migrate";

/**
 * Payload for a backfill job
 */
export interface BackfillJobData {
  guildId: string;
  forumChannelId: string;
  backfillJobId?: number;
  cutoffTimestamp?: string;
  resuming?: boolean;
  error?: string;
}

// producer: fail fast if Redis is down
export const backfillProducer = new Bull<BackfillJobData>(
  "backfill-forum",
  process.env.REDIS_PUBLIC_URL!,
  {
    redis: {
      maxRetriesPerRequest: 1,
    },
    defaultJobOptions: {
      removeOnComplete: { age: 3600 }, // auto-cleanup completed jobs after 1 hour
      removeOnFail: { age: 24 * 3600 }, // keep failures around for a day if you need to debug
    },
  }
);

// worker: retry forever so jobs get picked up as soon as Redis recovers
export const backfillWorker = new Bull<BackfillJobData>(
  "backfill-forum",
  process.env.REDIS_PUBLIC_URL!,
  {
    redis: {
      maxRetriesPerRequest: null, // unlimited retries
    },
  }
);

for (const queue of [backfillProducer, backfillWorker]) {
  queue.on("error", (err) => {
    console.error(`[${queue.name}] Redis/Queue error:`, err);
  });

  queue.on("failed", (job, err) => {
    console.error(
      `[${queue.name}] Job ${job.id} failed (state=${
        job.opts.repeat ? "repeated" : "one-off"
      }):`,
      err
    );
  });

  queue.on("completed", (job) => {
    console.log(`[${queue.name}] Job ${job.id} completed`);
  });

  queue.on("stalled", (job) => {
    console.warn(`[${queue.name}] Job ${job.id} stalled, will retry`);
  });
}

/**
 * Initializes the processor: must be called once with your Discord client
 */
export function initBackfillProcessor(discordClient: Client) {
  // Run migrations on startup
  runMigrations().catch(err => {
    console.error("Failed to run database migrations:", err);
  });

  backfillWorker.process(async (job) => {
    const db = new BackfillDatabase();
    
    try {
      // ensure the Discord client is ready
      if (!discordClient.isReady()) {
        await new Promise<void>((resolve) =>
          discordClient.once("ready", () => resolve())
        );
      }

      const { guildId, forumChannelId } = job.data;
      const replykeClient = await getReplykeClientForGuild(guildId);
      if (!replykeClient) {
        throw new Error(`No Replyke client for guild ${guildId}`);
      }

      // Get or create backfill job in database
      const backfillJob = await db.getOrCreateBackfillJob(
        guildId, 
        forumChannelId,
        job.data.cutoffTimestamp ? new Date(job.data.cutoffTimestamp) : undefined
      );

      // Update job data with the database ID
      await job.update({
        ...job.data,
        backfillJobId: backfillJob.id,
        cutoffTimestamp: backfillJob.cutoffTimestamp.toISOString(),
        resuming: backfillJob.status === 'paused_quota_limit'
      });

      // Mark job as running if it was paused
      if (backfillJob.status === 'paused_quota_limit') {
        await db.updateBackfillJobStatus(backfillJob.id, 'running');
      }

      // Fetch forum channel and list all threads
      const forum = await discordClient.channels.fetch(forumChannelId);
      if (!forum || forum.type !== ChannelType.GuildForum) {
        throw new Error(`Channel ${forumChannelId} is not a GuildForum`);
      }

      const active = await forum.threads.fetchActive();
      const archived = await forum.threads.fetchArchived({ type: "public" });

      const allThreads = [
        ...active.threads.values(),
        ...archived.threads.values(),
      ] as ThreadChannel[];

      // Filter threads to only those created before cutoff
      const threadsToProcess = allThreads.filter(
        thread => thread.createdAt && thread.createdAt < backfillJob.cutoffTimestamp
      );

      // Create checkpoints for all threads if this is a new job
      for (const thread of threadsToProcess) {
        await db.getOrCreateThreadCheckpoint(backfillJob.id, thread.id);
      }

      // Get unprocessed threads for resume capability
      const unprocessedThreadIds = await db.getUnprocessedThreads(backfillJob.id);
      const threadsToProcessNow = threadsToProcess.filter(
        thread => unprocessedThreadIds.includes(thread.id)
      );

      const total = threadsToProcessNow.length;
      let done = 0;

      // throttle one thread per second
      const throttle = new PQueue({ interval: 1000, intervalCap: 1 });

      for (const thread of threadsToProcessNow) {
        throttle.add(async () => {
          try {
            await processThreadWithCheckpoint(thread, replykeClient, backfillJob, db);
          } catch (err: any) {
            console.error(`Error processing ${thread.id}:`, err);
            
            // Check if this is a Replyke quota limit error
            if (isReplykeQuotaError(err)) {
              console.log(`Replyke quota limit reached, pausing backfill job ${backfillJob.id}`);
              await db.updateBackfillJobStatus(
                backfillJob.id, 
                'paused_quota_limit', 
                thread.id
              );
              throw new Error("Replyke quota limit reached - job paused for resume");
            }
            
            // Mark this specific thread as failed but continue with others
            const checkpoint = await db.getOrCreateThreadCheckpoint(backfillJob.id, thread.id);
            await db.updateThreadCheckpoint(checkpoint.id, { status: 'failed' });
          }
          done++;
          job.progress(Math.floor((done / total) * 100));
        });
      }

      await throttle.onIdle();
      
      // Mark job as completed
      await db.updateBackfillJobStatus(backfillJob.id, 'completed');
      
      // final success bump
      await job.progress(100);
    } catch (err: any) {
      console.error(`Backfill job ${job.id} failed:`, err);
      
      // Update database status if we have a job ID
      if (job.data.backfillJobId) {
        await db.updateBackfillJobStatus(job.data.backfillJobId, 'failed');
      }
      
      // push the new `error` field directly onto the job data
      await job.update({
        ...job.data,
        error: err.message,
      });
      // mark as "done" so front-end sees 100%
      await job.progress(100);
    }
  });
}

/**
 * Processes a single thread with checkpoint tracking
 */
async function processThreadWithCheckpoint(
  thread: ThreadChannel,
  replykeClient: ReplykeClient,
  backfillJob: any,
  db: BackfillDatabase
) {
  const checkpoint = await db.getOrCreateThreadCheckpoint(backfillJob.id, thread.id);
  
  try {
    // Mark thread as in progress
    await db.updateThreadCheckpoint(checkpoint.id, { status: 'in_progress' });
    
    const starter = await fetchStarterMessageWithRetry(thread);
    const entity = await createThreadEntity(thread, starter, replykeClient);
    
    // Backfill messages with checkpoint support
    await backfillMessages(
      thread, 
      replykeClient, 
      entity.id, 
      backfillJob.cutoffTimestamp,
      checkpoint
    );
    
    // Mark thread as completed
    await db.updateThreadCheckpoint(checkpoint.id, { status: 'completed' });
  } catch (err) {
    // Mark thread as failed
    await db.updateThreadCheckpoint(checkpoint.id, { status: 'failed' });
    throw err;
  }
}

/**
 * Checks if an error is related to Replyke quota limits
 */
function isReplykeQuotaError(error: any): boolean {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorStatus = error?.response?.status;
  
  // Check for common quota-related error patterns
  return (
    errorStatus === 429 || // Too Many Requests
    errorStatus === 402 || // Payment Required
    errorMessage.includes('quota') ||
    errorMessage.includes('limit') ||
    errorMessage.includes('plan') ||
    errorMessage.includes('upgrade') ||
    errorMessage.includes('allowance')
  );
}
