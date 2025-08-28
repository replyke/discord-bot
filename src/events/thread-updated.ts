import { ChannelType, ThreadChannel } from "discord.js";
import { getReplykeClientForGuild } from "./logger";
import handleError from "../utils/handle-error";

export default async (_: ThreadChannel, newThread: ThreadChannel) => {
  if (newThread.parent?.type !== ChannelType.GuildForum) return;
  if (!newThread.guild) return;

  const replykeClient = await getReplykeClientForGuild(newThread.guild.id);
  if (!replykeClient) {
    console.error("Issue initializing client for project");
    return;
  }

  try {
    const entity = await replykeClient.entities.fetchEntityByForeignId({
      foreignId: newThread.id,
    });

    if (!entity) {
      console.error("Issue finding associated Replyke entity to update");
      return;
    }

    await replykeClient.entities.updateEntity({
      entityId: entity.id,
      title: newThread.name,
    });
  } catch (err) {
    handleError(err, "Thread Update");
  }
};
