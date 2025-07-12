import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { Client, GatewayIntentBits, Partials } from "discord.js";

import loggerHandler from "./events/logger";
import logRequest from "./middleware/logRequest";
import corsOptions from "./middleware/cors-options";
import router from "./router";
import {
  backfillProducer,
  backfillWorker,
  initBackfillProcessor,
} from "./services/backfill-service";

// --- HTTP Server Setup ---
const app = express();

app.use(logRequest);
app.use(cors(corsOptions));

app.use(express.json());

app.use("/api", router);

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

const shutdown = async () => {
  console.log("Shutting down…");
  await backfillWorker.close(); // stop processing & close Redis
  await backfillProducer.close(); // close Redis for producer
  await client.destroy(); // disconnect Discord bot
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
