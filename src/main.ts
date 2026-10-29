import { startServer } from "./server/api.js";
import { closeDatabase } from "./database/connection.js";

const server = startServer();
const shutdown = async (): Promise<void> => {
    server.close(async () => { await closeDatabase(); process.exit(0); });
};
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
