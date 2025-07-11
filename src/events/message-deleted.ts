import { ChannelType, Message, MessageType, PartialMessage } from "discord.js";
import { getReplykeClientForGuild } from "./logger";
import handleError from "../utils/handle-error";

export default async (message: Message | PartialMessage) => {
  if (!message.guild) return;
  if (!message.channel.isThread()) return;
  if (message.channel.parent?.type !== ChannelType.GuildForum) return;

  const replykeClient = await getReplykeClientForGuild(message.guildId!);
  if (!replykeClient) {
    console.error("Issue initializing client for project");
    return;
  }

  try {
    // If this is the starter message, delete the entity content
    if (
      message.id === message.channel.id ||
      message.type === MessageType.ThreadStarterMessage
    ) {
      const entities = await replykeClient.entities.fetchManyEntities({
        metadataFilters: { includes: { starterMsgId: message.id } },
      });

      if (entities.length === 0) {
        console.error("Couldn't find parent entity of starter message");
        return;
      }

      await replykeClient.entities.updateEntity({
        entityId: entities[0].id,
        content: "",
      });
    } else {
      const { comment } = await replykeClient.comments.fetchCommentByForeignId({
        foreignId: message.id,
      });

      if (!comment) {
        console.error("Issue finding associated Replyke comment to delete");
        return;
      }

      // Otherwise, delete the corresponding comment
      await replykeClient.comments.deleteComment({
        commentId: comment.id,
      });
    }
  } catch (err) {
    handleError(err, "Message Delete");
  }
};
