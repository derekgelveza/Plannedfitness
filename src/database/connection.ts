/**
 * database/connection.ts — Shared PostgreSQL connection pool.
 *
 * Every repository imports `pool` from here, so the whole app shares one set
 * of database connections instead of opening a new one per query.
 *
 * Configuration comes from the DATABASE_URL environment variable, e.g.
 *   DATABASE_URL=postgres://user:password@localhost:5432/everything_fitness
 * which can live in a `.env` file at the project root (loaded by dotenv below).
 */

// Side-effect import: reads the `.env` file and copies its values into
// process.env. It must run before we read process.env.DATABASE_URL below.
import "dotenv/config";
import pg from "pg";

// `pg` is a CommonJS package, so with ES modules we import the default export
// and pull `Pool` off of it.
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

// We only warn (not crash) when DATABASE_URL is missing, so the server can
// still start — e.g. /health will work — but any real query will fail.
if (!databaseUrl) console.warn("DATABASE_URL is not configured. Database operations will fail until it is set.");

/**
 * The connection pool. A pool keeps up to `max` open connections and hands
 * them out to queries as needed, which is much faster than connecting for
 * every query.
 *  - `pool.query(...)` borrows a connection for one query and returns it.
 *  - `pool.connect()` borrows a connection you keep until you call
 *    `client.release()` — needed for transactions (see WorkoutRepository).
 */
export const pool = new Pool({ connectionString: databaseUrl, max: 10 });

// If an idle connection in the pool dies (e.g. the DB restarts), pg emits an
// 'error' event. Without a listener, Node would treat that as an unhandled
// error and crash the process, so we just log it.
pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error:", error.message));

/** Close every connection in the pool. Called during graceful shutdown (main.ts). */
export async function closeDatabase(): Promise<void> { await pool.end(); }

/**
 * Quick connectivity check: runs a trivial query and throws a friendlier
 * error if the database can't be reached.
 *
 * REVIEW NOTE: nothing in src/ currently calls this. You could call it at
 * startup in main.ts to fail fast with a clear message when the DB is down.
 */
export async function checkDatabaseConnection(): Promise<void> {
    try {
        await pool.query("SELECT 1");
    } catch (error) {
        // `error` is typed `unknown` in a catch block, so we check whether it's
        // a real Error before reading `.message`.
        throw new Error(`Unable to connect to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`);
    }
}
