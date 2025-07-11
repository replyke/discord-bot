import { ChannelType, ThreadChannel } from "discord.js";
import { getReplykeClientForGuild } from "./logger";
import handleError from "../utils/handle-error";

export default async (thread: ThreadChannel) => {
  if (thread.parent?.type !== ChannelType.GuildForum) return;
  if (!thread.guild) return;

  const replykeClient = await getReplykeClientForGuild(thread.guild.id);
  if (!replykeClient) {
    console.error("Issue initializing client for project");
    return;
  }

  try {
    const entity = await replykeClient.entities.fetchEntityByForeignId({
      foreignId: thread.id,
    });

    if (entity) {
      await replykeClient.entities.deleteEntity({ entityId: entity.id });
    }
  } catch (err) {
    handleError(err, "Thread Delete");
  }
};
