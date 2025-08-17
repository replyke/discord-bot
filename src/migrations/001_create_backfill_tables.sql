-- Migration: Create backfill progress tracking tables

-- Table to track backfill job state per forum channel
CREATE TABLE IF NOT EXISTS backfill_jobs (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL,
    forum_channel_id VARCHAR(255) NOT NULL,
    cutoff_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'running',
    last_processed_thread_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(guild_id, forum_channel_id)
);

-- Table to track progress within each thread
CREATE TABLE IF NOT EXISTS thread_checkpoints (
    id SERIAL PRIMARY KEY,
    backfill_job_id INTEGER NOT NULL REFERENCES backfill_jobs(id) ON DELETE CASCADE,
    thread_id VARCHAR(255) NOT NULL,
    last_processed_message_id VARCHAR(255),
    oldest_processed_timestamp TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(backfill_job_id, thread_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_backfill_jobs_guild_channel ON backfill_jobs(guild_id, forum_channel_id);
CREATE INDEX IF NOT EXISTS idx_backfill_jobs_status ON backfill_jobs(status);
CREATE INDEX IF NOT EXISTS idx_thread_checkpoints_job_id ON thread_checkpoints(backfill_job_id);
CREATE INDEX IF NOT EXISTS idx_thread_checkpoints_status ON thread_checkpoints(status);