import { ChannelType, Message, ThreadChannel } from "discord.js";
import { getReplykeClientForGuild } from "./logger";
import handleError from "../utils/handle-error";

export default async (thread: ThreadChannel) => {
  if (thread.parent?.type !== ChannelType.GuildForum) return;

  const replykeClient = await getReplykeClientForGuild(thread.guild.id);
  if (!replykeClient) {
    console.error("Issue initializing client for project");
    return;
  }

  async function fetchStarterWithRetry(thread: ThreadChannel) {
    for (let i = 0; i < 5; i++) {
      try {
        const msg = await thread.fetchStarterMessage();
        if (msg) return msg;
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }

  /* ── fetch starter‑message so we can capture its author, text,
            attachments, etc.  (May throw if the thread was created
            without a starter message – so wrap in try/catch.) ── */
  let starterMsg: Message | null = null;
  try {
    starterMsg = await fetchStarterWithRetry(thread);
  } catch (_) {
    /* no starter message (rare) */
  }
  const authorDiscord =
    starterMsg?.author ??
    (thread.ownerId ? await thread.client.users.fetch(thread.ownerId) : null);

  if (!authorDiscord) {
    console.error("Issue getting thread author");
    return;
  }

  try {
    const replykeUser = await replykeClient.users.fetchUserByForeignId({
      foreignId: authorDiscord.id,
      username: authorDiscord.username,
      avatar: authorDiscord.displayAvatarURL({ size: 128 }),
      metadata: { displayName: authorDiscord.globalName },
      createIfNotFound: true,
    });

    if (replykeUser) {
      await replykeClient.entities.createEntity({
        sourceId: `discord_channel_${thread.parent.id}`,
        foreignId: thread.id,
        userId: replykeUser.id,
        title: thread.name,

        content: starterMsg?.content,
        attachments: starterMsg?.attachments.map((a) => ({
          id: a.id,
          name: a.name,
          url: a.url,
          contentType: a.contentType,
          size: a.size,
        })),
        metadata: {
          starterMsgId: starterMsg?.id,
          guildId: thread.guild.id,
          embeds: starterMsg?.embeds.map((e) => e.data),
        },
      });
    }
  } catch (err) {
    handleError(err, "Thread Created");
  }
};
