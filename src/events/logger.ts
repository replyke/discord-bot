import { ReplykeClient } from "@replyke/node";
import axios from "axios";
import { Client, Events } from "discord.js";
import threadCreated from "./thread-created";
import threadUpdated from "./thread-updated";
import threadDeleted from "./thread-deleted";
import messageCreated from "./message-created";
import messageUpdated from "./message-updated";
import messageDeleted from "./message-deleted";
import messageReactionAdded from "./message-reaction-added";
import messageReactionRemoved from "./message-reaction-removed";

// Placeholder for actual API client
const clientsMap = new Map<string, ReplykeClient>();

// This should be your actual API call, mocked here for now:
async function fetchProjectByGuildId(guildId: string) {
  try {
    const response = await axios.get(
      process.env.SERVER_URL +
        "/internal/discord-bot/find-integration-by-server-id",
      {
        params: { serverId: guildId },
      }
    );

    return response.data;
  } catch (err) {
    console.error("Fetching project failed");
  }
}

async function getReplykeClientForGuild(guildId: string) {
  if (clientsMap.has(guildId)) return clientsMap.get(guildId);

  const projectId = await fetchProjectByGuildId(guildId);
  if (!projectId) {
    console.warn(`[Replyke] No project info linked for guild: ${guildId}`);
    return null;
  }

  console.log({ projectId });

  const client = await ReplykeClient.init({
    projectId,
    apiKey: process.env.REPLYKE_SERVICE_API_KEY!,
    isInternal: true,
  });

  clientsMap.set(guildId, client);
  return client;
}

export { fetchProjectByGuildId, getReplykeClientForGuild };

export default (client: Client): void => {
  /* ------------------------------------------------------------ */
  /* 🧵 THREAD CREATED IN A FORUM CHANNEL                         */
  /* ------------------------------------------------------------ */
  client.on(Events.ThreadCreate, threadCreated);

  /* ------------------------------------------------------------ */
  /* 📝 THREAD UPDATED                                            */
  /* ------------------------------------------------------------ */
  client.on(Events.ThreadUpdate, threadUpdated);

  /* ------------------------------------------------------------ */
  /* 🗑 THREAD DELETED                                            */
  /* ------------------------------------------------------------ */
  client.on(Events.ThreadDelete, threadDeleted);

  /* ------------------------------------------------------------ */
  /* 💬 MESSAGE CREATED INSIDE A FORUM THREAD                     */
  /* ------------------------------------------------------------ */
  client.on(Events.MessageCreate, messageCreated);

  /* ------------------------------------------------------------ */
  /* 📝 MESSAGE UPDATED                                           */
  /* ------------------------------------------------------------ */
  client.on(Events.MessageUpdate, messageUpdated);

  /* ------------------------------------------------------------ */
  /* 🗑 MESSAGE DELETED                                           */
  /* ------------------------------------------------------------ */
  client.on(Events.MessageDelete, messageDeleted);

  /* ------------------------------------------------------------ */
  /* 👍 REACTION ADDED TO A MESSAGE INSIDE A FORUM THREAD          */
  /* ------------------------------------------------------------ */
  client.on(Events.MessageReactionAdd, messageReactionAdded);

  /* ------------------------------------------------------------ */
  /* 👍 REACTION REMOVED FROM A MESSAGE INSIDE A FORUM THREAD          */
  /* ------------------------------------------------------------ */
  client.on(Events.MessageReactionRemove, messageReactionRemoved);
};
