// services/backfillService.ts
import Bull from "bull";
import { Client, ChannelType, ThreadChannel, MessageType } from "discord.js";
import { ReplykeClient } from "@replyke/node";
import { getReplykeClientForGuild } from "../events/logger";

/**
 * Payload for a backfill job
 */
export interface BackfillJobData {
  guildId: string;
  forumChannelId: string;
}

/**
 * Bull queue instance for backfilling forum channels
 */
export const backfillQueue = new Bull<BackfillJobData>(
  "backfill-forum",
  process.env.REDIS_URL!
);

/**
 * Initializes the processor: must be called once with your Discord client
 */
export function initBackfillProcessor(discordClient: Client) {
  backfillQueue.process(async (job) => {
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

    const active = await forum.threads.fetchActive();
    const archived = await forum.threads.fetchArchived({ type: "public" });
    const allThreads = [
      ...active.threads.values(),
      ...archived.threads.values(),
    ] as ThreadChannel[];

    const total = allThreads.length;
    let done = 0;

    // throttle one thread per second
    const { default: PQueue } = await import("p-queue");
    const throttle = new PQueue({ interval: 1000, intervalCap: 1 });

    for (const thread of allThreads) {
      throttle.add(async () => {
        try {
          await processThread(thread, replykeClient, discordClient);
        } catch (err) {
          console.error(`Error processing ${thread.id}:`, err);
        }
        done++;
        job.progress(Math.floor((done / total) * 100));
      });
    }

    await throttle.onIdle();
  });
}

/**
 * Processes a single thread: creates a Replyke entity + comments
 */
async function processThread(
  thread: ThreadChannel,
  replykeClient: ReplykeClient,
  discordClient: Client
) {
  // Fetch starter message (retry)
  let starter = null;
  for (let i = 0; i < 5; i++) {
    try {
      starter = await thread.fetchStarterMessage();
      if (starter) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  // Map or create user
  const dUser =
    starter?.author ??
    (thread.ownerId && (await discordClient.users.fetch(thread.ownerId))) ??
    null;
  if (!dUser) throw new Error(`No author for thread ${thread.id}`);

  const rUser = await replykeClient.users.fetchUserByForeignId({
    foreignId: dUser.id,
    username: dUser.username,
    avatar: dUser.displayAvatarURL({ size: 128 }),
    metadata: { displayName: dUser.globalName },
    createIfNotFound: true,
  });

  // Create entity
  const entity = await replykeClient.entities.createEntity({
    sourceId: `discord_channel_${thread.parentId}`,
    foreignId: thread.id,
    userId: rUser.id,
    title: thread.name,
    content: starter?.content,
    attachments: starter?.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      contentType: a.contentType,
      size: a.size,
    })),
    metadata: {
      starterMsgId: starter?.id,
      guildId: thread.guild.id,
      embeds: starter?.embeds.map((e) => e.data),
    },
  });
  console.log(`Entity ${entity.id} created`);

  // Paginate messages
  let lastId: string | undefined;
  while (true) {
    const batch = await thread.messages.fetch({ limit: 100, before: lastId });
    if (!batch.size) break;

    for (const msg of batch.values()) {
      if (msg.id === thread.id || msg.type === MessageType.ThreadStarterMessage)
        continue;

      const ru = await replykeClient.users.fetchUserByForeignId({
        foreignId: msg.author.id,
        username: msg.author.username,
        avatar: msg.author.displayAvatarURL({ size: 128 }),
        metadata: { displayName: msg.author.globalName },
      });

      await replykeClient.comments.createComment({
        foreignId: msg.id,
        userId: ru.id,
        entityId: entity.id,
        content: msg.content,
        referencedCommentId: msg.reference?.messageId,
        attachments: msg.attachments.map((a) => ({
          id: a.id,
          name: a.name,
          url: a.url,
          contentType: a.contentType,
          size: a.size,
        })),
        metadata: {
          guildId: msg.guildId,
          channelId: msg.channelId,
          embeds: msg.embeds.map((e) => e.data),
        },
      });
    }

    lastId = batch.last()?.id;
  }
}
