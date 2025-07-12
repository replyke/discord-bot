// utils/createReplykeComment.ts

import { Message, MessageType } from "discord.js";
import { ReplykeClient } from "@replyke/node";

export async function createMessageComment({
  message,
  replykeClient,
  entityId,
}: {
  message: Message;
  replykeClient: ReplykeClient;
  entityId: string;
}) {
  if (
    message.id === message.channel.id || // skip thread starter
    message.type === MessageType.ThreadStarterMessage
  ) {
    return;
  }

  const author = message.author;
  if (!author) return;

  const replykeUser = await replykeClient.users.fetchUserByForeignId({
    foreignId: author.id,
    username: author.username,
    avatar: author.displayAvatarURL({ size: 128 }),
    metadata: { displayName: author.globalName },
  });

  await replykeClient.comments.createComment({
    foreignId: message.id,
    userId: replykeUser.id,
    entityId,
    content: message.content,
    attachments: message.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      contentType: a.contentType,
      size: a.size,
    })),
    metadata: {
      guildId: message.guildId,
      channelId: message.channelId,
      embeds: message.embeds.map((e) => e.data),
      referencedCommentId: message.reference?.messageId, // We pass it here and not directly as a main prop because Replyke's "referencedCommentId" expects a UUID, and this is an ID from Discord which isn't UUID
    },
    createdAt: new Date(message.createdAt ?? new Date()),
    updatedAt: new Date(message.editedAt ?? new Date()),
  });
}
