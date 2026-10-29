import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) console.warn("DATABASE_URL is not configured. Database operations will fail until it is set.");

export const pool = new Pool({ connectionString: databaseUrl, max: 10 });
pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error:", error.message));
export async function closeDatabase(): Promise<void> { await pool.end(); }
export async function checkDatabaseConnection(): Promise<void> {
    try { await pool.query("SELECT 1"); }
    catch (error) { throw new Error(`Unable to connect to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`); }
}
