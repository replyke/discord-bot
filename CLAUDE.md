# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Discord bot that converts content from selected channels on a Discord server into discoverable web pages via the Replyke platform. It's a hybrid Express.js API server and Discord.js bot that processes Discord events and provides backfill functionality.

## Development Commands

- **Start development server**: `npm run dev` (uses ts-node-dev with auto-restart)
- **Build**: `npm run build` (compiles TypeScript to `dist/`)
- **Start production**: `npm run start` (runs compiled JavaScript from `dist/`)

## Architecture

### Dual Server Architecture
The application runs two concurrent services:
1. **Express API Server** (`src/index.ts:19-31`) - HTTP API on port 3000 (configurable via PORT env var)
2. **Discord Bot Client** (`src/index.ts:34-73`) - WebSocket connection to Discord

### Core Components

**Event System** (`src/events/`)
- All Discord events are centrally managed through `src/events/logger.ts`
- Event handlers for threads: creation, updates, deletion
- Event handlers for messages: creation, updates, deletion, reactions
- Each guild gets its own ReplykeClient instance (cached in clientsMap)

**Backfill System** (`src/services/backfill-service.ts`)
- Bull queue-based job processing for forum channel backfills
- Uses Redis for job persistence and worker coordination
- Throttled processing (1 thread per second) to respect Discord rate limits
- Progress tracking and error handling for long-running backfill jobs

**API Endpoints** (`src/router.ts`)
- `POST /api/backfill` - Start backfill job for a forum channel
- `GET /api/backfill/:jobId` - Check backfill job progress

**Replyke Integration**
- Uses `@replyke/node` SDK for content synchronization
- Clients are initialized per-guild and cached
- Integration discovery via internal API call to main server

### Key Dependencies
- `discord.js` v14 - Discord API interaction
- `@replyke/node` - Content platform SDK
- `bull` - Redis-based job queues
- `p-queue` - Rate limiting and throttling
- `express` - HTTP API server

### Environment Variables Required
- `DISCORD_TOKEN` - Discord bot token
- `REPLYKE_SERVICE_API_KEY` - Replyke platform API key
- `SERVER_URL` - Main server URL for integration lookups
- `REDIS_PUBLIC_URL` - Redis connection string for job queue
- `PORT` - HTTP server port (defaults to 3000)

### Error Handling
- Graceful shutdown handlers for SIGINT/SIGTERM
- Redis connection resilience (fail-fast for producer, retry forever for worker)
- Discord API error handling with retry logic in helpers

### File Organization
- `src/controllers/` - HTTP request handlers
- `src/events/` - Discord event handlers
- `src/helpers/` - Utility functions for Discord operations
- `src/middleware/` - Express middleware (CORS, logging)
- `src/services/` - Business logic services
- `src/utils/` - Generic utilities