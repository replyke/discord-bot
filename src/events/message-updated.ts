import { ChannelType, Message, MessageType, PartialMessage } from "discord.js";
import { getReplykeClientForGuild } from "./logger";
import handleError from "../utils/handle-error";

export default async (
  _: Message | PartialMessage,
  newMessage: Message | PartialMessage
) => {
  if (!newMessage.guild) return;
  if (!newMessage.channel.isThread()) return;
  if (newMessage.channel.parent?.type !== ChannelType.GuildForum) return;

  const replykeClient = await getReplykeClientForGuild(newMessage.guildId!);
  if (!replykeClient) {
    console.error("Issue initializing client for project");
    return;
  }

  try {
    // If this message is the thread's starter message, update the entity
    if (
      newMessage.id === newMessage.channel.id ||
      newMessage.type === MessageType.ThreadStarterMessage
    ) {
      const entities = await replykeClient.entities.fetchManyEntities({
        metadataFilters: { includes: { starterMsgId: newMessage.id } },
      });

      if (entities.length === 0) {
        console.error("Couldn't find parent entity of starter message");
        return;
      }

      await replykeClient.entities.updateEntity({
        entityId: entities[0].id,
        content: newMessage.content ?? "",
      });
    } else {
      const { comment } = await replykeClient.comments.fetchCommentByForeignId({
        foreignId: newMessage.id,
      });

      if (!comment) {
        console.error("Issue finding associated Replyke comment to delete");
        return;
      }

      
      // Otherwise, update the corresponding comment
      await replykeClient.comments.updateComment({
        commentId: comment.id,
        content: newMessage.content || "",
      });
    }
  } catch (err) {
    handleError(err, "Message Update");
  }
};
