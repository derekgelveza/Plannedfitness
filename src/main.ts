/**
 * main.ts — Entry point for the REST API (`npm start` runs dist/main.js).
 *
 * Responsibilities:
 *   1. Start the Express HTTP server (see server/api.ts).
 *   2. Shut down cleanly when the process is asked to stop (Ctrl+C or a
 *      container/host sending SIGTERM): stop accepting new HTTP requests,
 *      close the PostgreSQL connection pool, then exit.
 *
 * Note: the terminal (CLI) version of the app is NOT started from here.
 * See the review notes in cli/terminalApp.ts for how that one is launched.
 */
import { startServer } from "./server/api.js";
import { closeDatabase } from "./database/connection.js";

// Start listening for HTTP requests. `server` is Node's http.Server, which we
// keep a handle on so we can close it during shutdown.
const server = startServer();

/**
 * Graceful shutdown.
 * server.close() stops accepting NEW connections and waits for in-flight
 * requests to finish before running its callback. Only then do we close the
 * database pool (so no request loses its DB connection mid-query) and exit.
 */
const shutdown = async (): Promise<void> => {
    server.close(async () => {
        await closeDatabase();
        process.exit(0);
    });
};

// SIGINT  = Ctrl+C in the terminal.
// SIGTERM = the polite "please stop" signal sent by Docker, systemd, Heroku, etc.
// `once` makes sure a second signal doesn't trigger a second shutdown.
// `void` tells TypeScript/linters we're intentionally not awaiting the promise.
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
