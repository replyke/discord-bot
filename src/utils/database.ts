import { Pool } from "pg";

let pool: Pool | null = null;

export function getDatabase(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });

    pool.on("error", (err: any) => {
      console.error("PostgreSQL pool error:", err);
    });
  }
  
  return pool;
}

export async function closeDatabaseConnection(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}