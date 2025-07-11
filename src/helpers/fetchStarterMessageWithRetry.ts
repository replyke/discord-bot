import { ThreadChannel, Message } from "discord.js";

export async function fetchStarterMessageWithRetry(
  thread: ThreadChannel
): Promise<Message | null> {
  for (let i = 0; i < 5; i++) {
    try {
      const msg = await thread.fetchStarterMessage();
      if (msg) return msg;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}
