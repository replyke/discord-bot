import { ChannelType, Message, MessageType } from "discord.js";
import { getReplykeClientForGuild } from "./logger";
import handleError from "../utils/handle-error";
import { createMessageComment } from "../helpers/createMessageComment";

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

  try {
    const entity = await replykeClient.entities.fetchEntityByForeignId({
      foreignId: message.channel.id,
    });

    if (entity) {
      await createMessageComment({
        message,
        replykeClient,
        entityId: entity.id,
      });
    }
  } catch (err) {
    handleError(err, "Message Created");
  }
};
