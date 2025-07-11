import { ChannelType, Message, MessageType } from "discord.js";
import { getReplykeClientForGuild } from "./logger";
import handleError from "../utils/handle-error";

export default async (message: Message) => {
  // 1. Ensure the channel is a thread
  if (!message.channel.isThread()) return;
  if (!message.guild) return;

  const thread = message.channel;
  const parent = thread.parent;

  // 2. Ensure the parent exists and is a forum
  if (!parent || parent.type !== ChannelType.GuildForum) return;

  // Now you're inside a message on a thread in a forum
  const replykeClient = await getReplykeClientForGuild(message.guildId!);
  if (!replykeClient) {
    console.error("Issue initializing client for project");
    return;
  }

  /* ── Skip the starter post ── */
  if (
    message.id === message.channel.id || // method 1
    message.type === MessageType.ThreadStarterMessage // method 2
  ) {
    return; // ignore – we already processed it (or will in ThreadCreate)
  }

  const authorDiscord = message.author;
  if (!authorDiscord) {
    console.error("Issue getting thread author");
    return;
  }

  try {
    const { user: replykeUser } =
      await replykeClient.users.fetchUserByForeignId({
        foreignId: authorDiscord.id,
        username: authorDiscord.username,
        avatar: authorDiscord.displayAvatarURL({ size: 128 }),
        metadata: { displayName: authorDiscord.globalName },
      });

    const entity = await replykeClient.entities.fetchEntityByForeignId({
      foreignId: message.channel.id,
    });

    if (replykeUser && entity) {
      await replykeClient.comments.createComment({
        foreignId: message.id,
        userId: replykeUser.id,
        entityId: entity.id,
        content: message.content,
        referencedCommentId: message.reference?.messageId,
        attachments: message.attachments.map((att) => ({
          id: att.id,
          name: att.name,
          url: att.url,
          contentType: att.contentType,
          size: att.size,
        })),
        metadata: {
          guildId: message.guildId,
          channelId: message.channelId,
          embeds: message.embeds.map((e) => e.data),
        },
      });
    }
  } catch (err) {
    handleError(err, "Message Created");
  }
};
