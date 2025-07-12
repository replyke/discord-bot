// services/backfillService.ts
import Bull from "bull";
import { Client, ChannelType, ThreadChannel, MessageType } from "discord.js";
import { ReplykeClient } from "@replyke/node";
import PQueue from "p-queue";
import { getReplykeClientForGuild } from "../events/logger";
import { fetchStarterMessageWithRetry } from "../helpers/fetchStarterMessageWithRetry";
import { createThreadEntity } from "../helpers/createThreadEntity";
import backfillMessages from "../helpers/backfillMessages";

/**
 * Payload for a backfill job
 */
export interface BackfillJobData {
  guildId: string;
  forumChannelId: string;
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
  backfillWorker.process(async (job) => {
    try {
      console.log(`Job ${job.id}: waiting for Discord ready…`);

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

      // Fetch forum channel and list all threads
      const forum = await discordClient.channels.fetch(forumChannelId);
      if (!forum || forum.type !== ChannelType.GuildForum) {
        throw new Error(`Channel ${forumChannelId} is not a GuildForum`);
      }
      console.log(`Job ${job.id}: fetched forum:`, forum?.id, forum?.type);

      const active = await forum.threads.fetchActive();
      console.log(`Job ${job.id}: ${active.threads.size} active threads`);

      const archived = await forum.threads.fetchArchived({ type: "public" });
      console.log(`Job ${job.id}: ${archived.threads.size} archived threads`);

      const allThreads = [
        ...active.threads.values(),
        ...archived.threads.values(),
      ] as ThreadChannel[];

      const total = allThreads.length;
      let done = 0;

      // throttle one thread per second
      const throttle = new PQueue({ interval: 1000, intervalCap: 1 });

      for (const thread of allThreads) {
        throttle.add(async () => {
          console.log(`Job ${job.id}: processing thread ${thread.id}`);

          try {
            await processThread(thread, replykeClient);
          } catch (err) {
            console.error(`Error processing ${thread.id}:`, err);
          }
          console.log(`Job ${job.id}: finished thread ${thread.id}`);
          done++;
          job.progress(Math.floor((done / total) * 100));
        });
      }

      await throttle.onIdle();
      // final success bump
      await job.progress(100);
    } catch (err: any) {
      console.error(`Backfill job ${job.id} failed:`, err);
      // push the new `error` field directly onto the job data
      await job.update({
        ...job.data,
        error: err.message,
      });
      // mark as “done” so front-end sees 100%
      await job.progress(100);
    }
  });
}

/**
 * Processes a single thread: creates a Replyke entity + comments
 */
async function processThread(
  thread: ThreadChannel,
  replykeClient: ReplykeClient
) {
  const starter = await fetchStarterMessageWithRetry(thread);
  const entity = await createThreadEntity(thread, starter, replykeClient);
  try {
    await backfillMessages(thread, replykeClient, entity.id);
  } catch (err) {
    console.error(`Error backfilling messages for ${thread.id}:`, err);
  }
}
