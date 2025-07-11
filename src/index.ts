import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { Client, GatewayIntentBits, Partials } from "discord.js";

import router from "./router";
import loggerHandler from "./events/logger";
import { initBackfillProcessor } from "./services/backfill-service";
import logRequest from "./middleware/logRequest";
import corsOptions from "./middleware/cors-options";

// --- HTTP Server Setup ---
const app = express();

app.use(logRequest);
app.use(cors(corsOptions));

app.use(express.json());

app.use("/api", router);
console.log("→ Connecting to Redis URL:", process.env.REDIS_URL);
console.log("→ process.env.REDISHOST:", process.env.REDISHOST);
console.log("→ process.env.REDISPORT:", process.env.REDISPORT);
console.log("→ process.env.REDISPASSWORD:", process.env.REDISPASSWORD);
console.log("→ process.env.REDISUSER:", process.env.REDISUSER);

const HTTP_PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(HTTP_PORT, () => {
  console.log(`API server listening on port ${HTTP_PORT}`);
});

// --- Discord Bot Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Reaction,
    Partials.User,
    Partials.Channel,
  ],
});

// attach existing event handlers (e.g. thread/message listeners)
loggerHandler(client);

initBackfillProcessor(client);

client.once("ready", () => {
  console.log(`Discord bot logged in as ${client.user?.tag}`);
  // start processing backfill jobs once bot is ready
});
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("Failed to login Discord bot:", err);
  process.exit(1);
});
