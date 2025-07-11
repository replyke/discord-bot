import {
  ChannelType,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";

export default async (
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
};
