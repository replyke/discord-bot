# Smart Backfill Setup Instructions

## Overview
The new smart backfill system tracks progress in a PostgreSQL database, allowing graceful resume when Replyke quota limits are hit.

## 1. Railway PostgreSQL Setup

### Connect Your Database
1. In your Railway project dashboard, you should see your new PostgreSQL service
2. Click on the PostgreSQL service
3. Go to the "Variables" tab
4. Copy the `DATABASE_URL` value (starts with `postgresql://`)

### Add Environment Variable
1. Go to your Discord bot service in Railway
2. Click on "Variables" tab
3. Add a new variable:
   - **Name**: `DATABASE_URL`
   - **Value**: Paste the PostgreSQL connection string you copied

## 2. Code Deployment

### Automatic Migration
✅ **No manual migration needed!** 

The migrations run automatically when your bot starts up. Here's what happens:

1. You push code to GitHub
2. Railway automatically deploys from your GitHub repo
3. When the bot starts, it automatically:
   - Creates the migrations tracking table
   - Runs any pending SQL migrations from `src/migrations/`
   - Your database schema is ready!

### What Gets Created
The system creates these tables automatically:

- `migrations` - Tracks which migrations have been executed
- `backfill_jobs` - Stores backfill job state per forum channel
- `thread_checkpoints` - Tracks progress within each thread

## 3. How It Works

### Starting a Backfill
Use the same endpoint as before:
```bash
POST /api/backfill
{
  "guildId": "your-guild-id",
  "forumChannelId": "your-forum-channel-id"
}
```

**New Job**: Creates a `cutoff_timestamp = NOW()` - only processes messages before this time
**Existing Job**: Automatically detects and resumes from where it left off

### When Quota Limits Hit
1. System detects Replyke quota/plan limit errors
2. Marks job status as `paused_quota_limit`
3. Saves exact progress (last processed thread + message)
4. Job appears as "paused" but can be resumed later

### Resuming After Quota Reset
Simply call the same endpoint again:
```bash
POST /api/backfill
{
  "guildId": "same-guild-id", 
  "forumChannelId": "same-forum-channel-id"
}
```

The system automatically:
- Detects existing paused job
- Resumes from exact checkpoint
- Respects original time boundary (no overlap with real-time events)

## 4. Checking Status

Use the existing status endpoint:
```bash
GET /api/backfill/{jobId}
```

Now returns enhanced progress information including database checkpoint details.

## 5. Time Boundaries Explained

**Problem Solved**: Before, if backfill was interrupted and new messages arrived via real-time events, resuming could cause duplicates or missed messages.

**Solution**: Each backfill job gets a fixed time boundary:
- **Backfill Job**: Only processes messages created before `cutoff_timestamp`
- **Real-time Events**: Handle all messages created after bot was added
- **No Overlap**: Clean separation between historical and live data

## 6. Deployment Steps

1. ✅ Add `DATABASE_URL` environment variable in Railway
2. ✅ Push your code to GitHub
3. ✅ Railway deploys automatically
4. ✅ Migrations run on first startup
5. ✅ Start using the same `/api/backfill` endpoint

## 7. Monitoring

Check your Railway logs to see:
- Migration execution on startup
- Backfill job progress
- Quota limit detection and graceful pausing
- Resume operations

That's it! The same API works seamlessly with smart resume capabilities.