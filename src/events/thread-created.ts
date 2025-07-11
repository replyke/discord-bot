import { ChannelType, ThreadChannel } from "discord.js";
import { getReplykeClientForGuild } from "./logger";
import handleError from "../utils/handle-error";
import { fetchStarterMessageWithRetry } from "../helpers/fetchStarterMessageWithRetry";
import { createThreadEntity } from "../helpers/createThreadEntity";

export default async (thread: ThreadChannel) => {
  if (thread.parent?.type !== ChannelType.GuildForum) return;

  const replykeClient = await getReplykeClientForGuild(thread.guild.id);
  if (!replykeClient) {
    console.error("Issue initializing client for project");
    return;
  }

  try {
    const starter = await fetchStarterMessageWithRetry(thread);
    await createThreadEntity(thread, starter, replykeClient);
  } catch (err) {
    handleError(err, "Thread Created");
  }
};
