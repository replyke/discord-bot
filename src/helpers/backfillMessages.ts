import { ReplykeClient } from "@replyke/node";
import { ThreadChannel } from "discord.js";
import { createMessageComment } from "./createMessageComment";
import { BackfillDatabase, ThreadCheckpoint } from "../services/backfill-db";

export default async (
  thread: ThreadChannel<boolean>,
  replykeClient: ReplykeClient,
  entityId: string,
  cutoffTimestamp?: Date,
  checkpoint?: ThreadCheckpoint
) => {
  const db = new BackfillDatabase();
  
  // Determine starting point for message pagination
  let lastId: string | undefined = checkpoint?.lastProcessedMessageId;
  
  while (true) {
    const batch = await thread.messages.fetch({ 
      limit: 100, 
      before: lastId 
    });
    
    if (!batch.size) break;

    // Filter messages to only those before cutoff timestamp
    const messagesToProcess = Array.from(batch.values()).filter(msg => {
      if (!cutoffTimestamp) return true;
      return msg.createdAt < cutoffTimestamp;
    });

    if (messagesToProcess.length === 0) {
      // All remaining messages are after cutoff, we're done
      break;
    }

    // Process messages in order (oldest first in this batch)
    const sortedMessages = messagesToProcess.sort((a, b) => 
      a.createdTimestamp - b.createdTimestamp
    );

    for (const msg of sortedMessages) {
      try {
        await createMessageComment({ message: msg, replykeClient, entityId });
        
        // Update checkpoint after each successful message
        if (checkpoint) {
          await db.updateThreadCheckpoint(checkpoint.id, {
            lastProcessedMessageId: msg.id,
            oldestProcessedTimestamp: msg.createdAt
          });
        }
      } catch (err: any) {
        console.error(`Error creating comment for message ${msg.id}:`, err);
        
        // If this is a Replyke quota error, we should bubble it up
        // to trigger the graceful pause logic in the backfill service
        if (isReplykeQuotaError(err)) {
          throw err;
        }
        
        // For other errors, log and continue with next message
        continue;
      }
    }

    // Update lastId for next batch
    lastId = batch.last()?.id;
    
    // If we processed fewer messages than the batch size and they're all before cutoff,
    // we might be at the end of the relevant message history
    if (messagesToProcess.length < batch.size) {
      // Check if the oldest message in the batch is before cutoff
      const oldestInBatch = Array.from(batch.values()).sort((a, b) => 
        a.createdTimestamp - b.createdTimestamp
      )[0];
      
      if (cutoffTimestamp && oldestInBatch?.createdAt && oldestInBatch.createdAt < cutoffTimestamp) {
        // Continue processing older messages
        continue;
      } else {
        // We've reached messages that are after cutoff, stop here
        break;
      }
    }
  }
};

// Helper function to detect Replyke quota errors
function isReplykeQuotaError(error: any): boolean {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorStatus = error?.response?.status;
  
  return (
    errorStatus === 429 || // Too Many Requests
    errorStatus === 402 || // Payment Required
    errorMessage.includes('quota') ||
    errorMessage.includes('limit') ||
    errorMessage.includes('plan') ||
    errorMessage.includes('upgrade') ||
    errorMessage.includes('allowance')
  );
}
