import { ReplykeClient } from "@replyke/node";
import { MessageType, ThreadChannel } from "discord.js";

export default async (
  thread: ThreadChannel<boolean>,
  replykeClient: ReplykeClient,
  entityId: string
) => {
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
        entityId: entityId,
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
};
