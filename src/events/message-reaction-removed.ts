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
};
