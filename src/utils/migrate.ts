import { getDatabase } from "./database";
import fs from "fs";
import path from "path";

export async function runMigrations(): Promise<void> {
  const db = getDatabase();
  
  try {
    // Create migrations tracking table
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, "..", "migrations");
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith(".sql"))
      .sort();

    // Check which migrations have been executed
    const executedResult = await db.query(
      "SELECT filename FROM migrations ORDER BY filename"
    );
    const executedMigrations = new Set(
      executedResult.rows.map((row: any) => row.filename)
    );

    // Execute pending migrations
    for (const file of migrationFiles) {
      if (!executedMigrations.has(file)) {
        console.log(`Executing migration: ${file}`);
        
        const migrationPath = path.join(migrationsDir, file);
        const migrationSQL = fs.readFileSync(migrationPath, "utf8");
        
        await db.query("BEGIN");
        try {
          await db.query(migrationSQL);
          await db.query(
            "INSERT INTO migrations (filename) VALUES ($1)",
            [file]
          );
          await db.query("COMMIT");
          console.log(`Migration ${file} completed successfully`);
        } catch (err) {
          await db.query("ROLLBACK");
          throw err;
        }
      }
    }

    console.log("All migrations completed successfully");
  } catch (err) {
    console.error("Migration failed:", err);
    throw err;
  }
}