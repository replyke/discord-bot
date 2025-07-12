import { ThreadChannel, Message } from "discord.js";
import { ReplykeClient } from "@replyke/node";

export async function createThreadEntity(
  thread: ThreadChannel,
  starter: Message | null,
  replykeClient: ReplykeClient
) {
  if (!starter && !thread.ownerId) {
    throw new Error(`No author for thread ${thread.id}`);
  }

  // map or create the user in Replyke
  const dUser =
    starter?.author ?? (await thread.client.users.fetch(thread.ownerId!));
  const rUser = await replykeClient.users.fetchUserByForeignId({
    foreignId: dUser.id,
    username: dUser.username,
    avatar: dUser.displayAvatarURL({ size: 128 }),
    metadata: { displayName: dUser.globalName },
    createIfNotFound: true,
  });

  // create the entity
  return replykeClient.entities.createEntity({
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
    createdAt: new Date(thread.createdAt ?? new Date()),
  });
}
