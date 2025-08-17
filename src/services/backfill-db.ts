import { getDatabase } from "../utils/database";

export type BackfillJobStatus = 'running' | 'paused_quota_limit' | 'completed' | 'failed';
export type ThreadCheckpointStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface BackfillJob {
  id: number;
  guildId: string;
  forumChannelId: string;
  cutoffTimestamp: Date;
  status: BackfillJobStatus;
  lastProcessedThreadId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThreadCheckpoint {
  id: number;
  backfillJobId: number;
  threadId: string;
  lastProcessedMessageId?: string;
  oldestProcessedTimestamp?: Date;
  status: ThreadCheckpointStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class BackfillDatabase {
  private db = getDatabase();

  async getOrCreateBackfillJob(
    guildId: string, 
    forumChannelId: string, 
    cutoffTimestamp?: Date
  ): Promise<BackfillJob> {
    // First try to get existing job
    const existingResult = await this.db.query(
      `SELECT id, guild_id, forum_channel_id, cutoff_timestamp, status, 
              last_processed_thread_id, created_at, updated_at
       FROM backfill_jobs 
       WHERE guild_id = $1 AND forum_channel_id = $2`,
      [guildId, forumChannelId]
    );

    if (existingResult.rows.length > 0) {
      const row = existingResult.rows[0];
      return {
        id: row.id,
        guildId: row.guild_id,
        forumChannelId: row.forum_channel_id,
        cutoffTimestamp: new Date(row.cutoff_timestamp),
        status: row.status,
        lastProcessedThreadId: row.last_processed_thread_id,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    }

    // Create new job
    const newCutoff = cutoffTimestamp || new Date();
    const result = await this.db.query(
      `INSERT INTO backfill_jobs (guild_id, forum_channel_id, cutoff_timestamp, status)
       VALUES ($1, $2, $3, 'running')
       RETURNING id, guild_id, forum_channel_id, cutoff_timestamp, status, 
                 last_processed_thread_id, created_at, updated_at`,
      [guildId, forumChannelId, newCutoff]
    );

    const row: any = result.rows[0];
    return {
      id: row.id,
      guildId: row.guild_id,
      forumChannelId: row.forum_channel_id,
      cutoffTimestamp: new Date(row.cutoff_timestamp),
      status: row.status,
      lastProcessedThreadId: row.last_processed_thread_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async updateBackfillJobStatus(
    jobId: number, 
    status: BackfillJobStatus, 
    lastProcessedThreadId?: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE backfill_jobs 
       SET status = $1, last_processed_thread_id = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, lastProcessedThreadId, jobId]
    );
  }

  async getOrCreateThreadCheckpoint(
    backfillJobId: number, 
    threadId: string
  ): Promise<ThreadCheckpoint> {
    // First try to get existing checkpoint
    const existingResult = await this.db.query(
      `SELECT id, backfill_job_id, thread_id, last_processed_message_id, 
              oldest_processed_timestamp, status, created_at, updated_at
       FROM thread_checkpoints 
       WHERE backfill_job_id = $1 AND thread_id = $2`,
      [backfillJobId, threadId]
    );

    if (existingResult.rows.length > 0) {
      const row = existingResult.rows[0];
      return {
        id: row.id,
        backfillJobId: row.backfill_job_id,
        threadId: row.thread_id,
        lastProcessedMessageId: row.last_processed_message_id,
        oldestProcessedTimestamp: row.oldest_processed_timestamp ? new Date(row.oldest_processed_timestamp) : undefined,
        status: row.status,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    }

    // Create new checkpoint
    const result = await this.db.query(
      `INSERT INTO thread_checkpoints (backfill_job_id, thread_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING id, backfill_job_id, thread_id, last_processed_message_id, 
                 oldest_processed_timestamp, status, created_at, updated_at`,
      [backfillJobId, threadId]
    );

    const row: any = result.rows[0];
    return {
      id: row.id,
      backfillJobId: row.backfill_job_id,
      threadId: row.thread_id,
      lastProcessedMessageId: row.last_processed_message_id,
      oldestProcessedTimestamp: row.oldest_processed_timestamp ? new Date(row.oldest_processed_timestamp) : undefined,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async updateThreadCheckpoint(
    checkpointId: number,
    updates: {
      lastProcessedMessageId?: string;
      oldestProcessedTimestamp?: Date;
      status?: ThreadCheckpointStatus;
    }
  ): Promise<void> {
    const setParts: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.lastProcessedMessageId !== undefined) {
      setParts.push(`last_processed_message_id = $${paramIndex++}`);
      values.push(updates.lastProcessedMessageId);
    }

    if (updates.oldestProcessedTimestamp !== undefined) {
      setParts.push(`oldest_processed_timestamp = $${paramIndex++}`);
      values.push(updates.oldestProcessedTimestamp);
    }

    if (updates.status !== undefined) {
      setParts.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    values.push(checkpointId);

    await this.db.query(
      `UPDATE thread_checkpoints SET ${setParts.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  async getUnprocessedThreads(backfillJobId: number): Promise<string[]> {
    const result = await this.db.query(
      `SELECT thread_id FROM thread_checkpoints 
       WHERE backfill_job_id = $1 AND status IN ('pending', 'in_progress')
       ORDER BY created_at`,
      [backfillJobId]
    );

    return result.rows.map(row => row.thread_id);
  }

  async getBackfillProgress(backfillJobId: number): Promise<{
    totalThreads: number;
    completedThreads: number;
    failedThreads: number;
    inProgressThreads: number;
  }> {
    const result = await this.db.query(
      `SELECT 
         COUNT(*) as total_threads,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_threads,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_threads,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_threads
       FROM thread_checkpoints 
       WHERE backfill_job_id = $1`,
      [backfillJobId]
    );

    const row: any = result.rows[0];
    return {
      totalThreads: parseInt(row.total_threads),
      completedThreads: parseInt(row.completed_threads),
      failedThreads: parseInt(row.failed_threads),
      inProgressThreads: parseInt(row.in_progress_threads),
    };
  }
}