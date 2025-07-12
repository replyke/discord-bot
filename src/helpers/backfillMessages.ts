import { ReplykeClient } from "@replyke/node";
import { ThreadChannel } from "discord.js";
import { createMessageComment } from "./createMessageComment";

export default async (
  thread: ThreadChannel<boolean>,
  replykeClient: ReplykeClient,
  entityId: string
) => {
  // Paginate messages
  let lastId: string | undefined;
  while (true) {
    const batch = await thread.messages.fetch({ limit: 100, before: lastId });
    if (!batch.size) break;

    for (const msg of batch.values()) {
      await createMessageComment({ message: msg, replykeClient, entityId });
    }

    lastId = batch.last()?.id;
  }
};
