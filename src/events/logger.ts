import { ReplykeClient } from "@replyke/node";
import axios from "axios";
import {
  Client,
  Events,
  ChannelType,
  MessageType,
  ThreadChannel,
  Message,
  MessageReaction,
  User,
  PartialUser,
  PartialMessageReaction,
  PartialMessage,
} from "discord.js";
import handleError from "../utils/handle-error";

// Placeholder for actual API client
const clientsMap = new Map<string, ReplykeClient>();

// This should be your actual API call, mocked here for now:
async function fetchProjectByGuildId(guildId: string) {
  try {
    const response = await axios.get(
      process.env.SERVER_URL + "/discord-bot/find-integration-by-server-id",
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

  const client = await ReplykeClient.init({
    projectId,
    apiKey: process.env.REPLYKE_SERVICE_API_KEY!,
    isInternal: true,
  });

  clientsMap.set(guildId, client);
  return client;
}

export default (client: Client): void => {
  /* ------------------------------------------------------------ */
  /* 🧵 THREAD CREATED IN A FORUM CHANNEL                         */
  /* ------------------------------------------------------------ */
  client.on(Events.ThreadCreate, async (thread: ThreadChannel) => {
    if (thread.parent?.type !== ChannelType.GuildForum) return;

    const replykeClient = await getReplykeClientForGuild(thread.guild.id);
    if (!replykeClient) {
      console.error("Issue initializing client for project");
      return;
    }

    /* ── fetch starter‑message so we can capture its author, text,
            attachments, etc.  (May throw if the thread was created
            without a starter message – so wrap in try/catch.) ── */
    let starterMsg: Message | null = null;
    try {
      starterMsg = await thread.fetchStarterMessage();
    } catch (_) {
      /* no starter message (rare) */
    }
    console.log(starterMsg)

    const authorDiscord =
      starterMsg?.author ??
      (thread.ownerId ? await thread.client.users.fetch(thread.ownerId) : null);

    if (!authorDiscord) {
      console.error("Issue getting thread author");
      return;
    }

    try {
      const { user: replykeUser } =
        await replykeClient.users.fetchUserByForeignId({
          foreignId: authorDiscord.id,
          username: authorDiscord.username,
          avatar: authorDiscord.displayAvatarURL({ size: 128 }),
          metadata: { displayName: authorDiscord.globalName },
        });

      if (replykeUser) {
        await replykeClient.entities.createEntity({
          resourceId: `discord_channel_${thread.parent.id}`,
          foreignId: thread.id,
          userId: replykeUser.id,
          title: thread.name,

          content: starterMsg?.content,
          attachments: starterMsg?.attachments.map((a) => ({
            id: a.id,
            name: a.name,
            url: a.url,
            contentType: a.contentType,
            size: a.size,
          })),
          metadata: {
            starterMsgId: starterMsg?.id,
            guildId: thread.guild.id,
            embeds: starterMsg?.embeds.map((e) => e.data),
          },
        });
      }
    } catch (err) {
      handleError(err, "Thread Created");
    }
  });

  /* ------------------------------------------------------------ */
  /* 📝 THREAD UPDATED                                            */
  /* ------------------------------------------------------------ */
  client.on(
    Events.ThreadUpdate,
    async (oldThread: ThreadChannel, newThread: ThreadChannel) => {
      if (newThread.parent?.type !== ChannelType.GuildForum) return;
      if (!newThread.guild) return;

      const replykeClient = await getReplykeClientForGuild(newThread.guild.id);
      if (!replykeClient) {
        console.error("Issue initializing client for project");
        return;
      }

      const entity = await replykeClient.entities.fetchEntityByForeignId({
        foreignId: newThread.id,
      });

      if (!entity) {
        console.error("Issue finding associated Replyke entity to update");
        return;
      }

      try {
        await replykeClient.entities.updateEntity({
          entityId: entity.id,
          title: newThread.name,
        });
      } catch (err) {
        handleError(err, "Thread Update");
      }
    }
  );

  /* ------------------------------------------------------------ */
  /* 🗑 THREAD DELETED                                            */
  /* ------------------------------------------------------------ */
  client.on(Events.ThreadDelete, async (thread: ThreadChannel) => {
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
  });

  /* ------------------------------------------------------------ */
  /* 💬 MESSAGE CREATED INSIDE A FORUM THREAD                     */
  /* ------------------------------------------------------------ */
  client.on(Events.MessageCreate, async (message: Message) => {
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

    /* ── Skip the starter post ── */
    if (
      message.id === message.channel.id || // method 1
      message.type === MessageType.ThreadStarterMessage // method 2
    ) {
      return; // ignore – we already processed it (or will in ThreadCreate)
    }

    const authorDiscord = message.author;
    if (!authorDiscord) {
      console.error("Issue getting thread author");
      return;
    }

    try {
      const { user: replykeUser } =
        await replykeClient.users.fetchUserByForeignId({
          foreignId: authorDiscord.id,
          username: authorDiscord.username,
          avatar: authorDiscord.displayAvatarURL({ size: 128 }),
          metadata: { displayName: authorDiscord.globalName },
        });

      const entity = await replykeClient.entities.fetchEntityByForeignId({
        foreignId: message.channel.id,
      });

      if (replykeUser && entity) {
        await replykeClient.comments.createComment({
          foreignId: message.id,
          userId: replykeUser.id,
          entityId: entity.id,
          content: message.content,
          referencedCommentId: message.reference?.messageId,
          attachments: message.attachments.map((att) => ({
            id: att.id,
            name: att.name,
            url: att.url,
            contentType: att.contentType,
            size: att.size,
          })),
          metadata: {
            guildId: message.guildId,
            channelId: message.channelId,
            embeds: message.embeds.map((e) => e.data),
          },
        });
      }
    } catch (err) {
      handleError(err, "Message Created");
    }
  });

  /* ------------------------------------------------------------ */
  /* 📝 MESSAGE UPDATED                                           */
  /* ------------------------------------------------------------ */
  client.on(
    Events.MessageUpdate,
    async (
      oldMessage: Message | PartialMessage,
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
          const { comment } =
            await replykeClient.comments.fetchCommentByForeignId({
              foreignId: newMessage.id,
            });

          if (!comment) {
            console.error("Issue finding associated Replyke comment to delete");
            return;
          }

          // Otherwise, update the corresponding comment
          await replykeClient.comments.updateComment({
            commentId: comment.id,
            update: newMessage.content || "",
          });
        }
      } catch (err) {
        handleError(err, "Message Update");
      }
    }
  );

  /* ------------------------------------------------------------ */
  /* 🗑 MESSAGE DELETED                                           */
  /* ------------------------------------------------------------ */
  client.on(Events.MessageDelete, async (message: Message | PartialMessage) => {
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
        const { comment } =
          await replykeClient.comments.fetchCommentByForeignId({
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
  });

  /* ------------------------------------------------------------ */
  /* 👍 REACTION ADDED TO A MESSAGE INSIDE A FORUM THREAD          */
  /* ------------------------------------------------------------ */
  client.on(
    Events.MessageReactionAdd,
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser
    ) => {
      const ch = reaction.message.channel;
      if (!ch.isThread() || ch.parent?.type !== ChannelType.GuildForum) return;

      const data = {
        emoji: {
          name: reaction.emoji.name,
          id: reaction.emoji.id, // null for unicode emoji
          animated: reaction.emoji.animated,
        },
        messageId: reaction.message.id,
        threadId: ch.id,
        user: {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          globalName: user.globalName,
          avatar: user.displayAvatarURL({ size: 128 }),
        },
        createdAt: new Date(), // the event timestamp
      };

      console.log("[thread:reaction]", data);
    }
  );

  /* ------------------------------------------------------------ */
  /* 👍 REACTION REMOVED FROM A MESSAGE INSIDE A FORUM THREAD          */
  /* ------------------------------------------------------------ */
  client.on(
    Events.MessageReactionRemove,
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser
    ) => {
      // Ensure we have the full reaction
      if (reaction.partial) {
        await reaction.fetch();
      }

      // Ensure we have the full user
      if (user.partial) {
        await user.fetch();
      }

      const ch = reaction.message.channel;
      if (!ch.isThread() || ch.parent?.type !== ChannelType.GuildForum) return;

      const data = {
        emoji: {
          name: reaction.emoji.name,
          id: reaction.emoji.id, // null for unicode emoji
          animated: reaction.emoji.animated,
        },
        messageId: reaction.message.id,
        threadId: ch.id,
        user: {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          globalName: user.globalName,
          avatar: user.displayAvatarURL({ size: 128 }),
        },
        createdAt: new Date(), // the event timestamp
      };

      console.log("[thread:reaction]", data);
    }
  );
};
