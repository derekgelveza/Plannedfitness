/**
 * server/api.ts — Builds the Express app (the REST API) and starts it.
 *
 * Request flow for every API call:
 *   HTTP request → route (routes/*.ts) → controller (controllers/*.ts)
 *     → service (validation) → repository (SQL) → PostgreSQL
 * and if anything throws along the way, the error handler below turns it
 * into a JSON error response.
 *
 * Endpoints:
 *   GET    /health                      → { status: "ok" }
 *   GET    /api/workouts                → list workouts
 *   GET    /api/workouts/:id            → one workout
 *   POST   /api/workouts                → create workout
 *   PUT    /api/workouts/:id            → replace workout
 *   DELETE /api/workouts/:id            → delete workout
 *   POST   /api/workouts/:id/sessions   → start a session for that workout
 *   GET    /api/sessions                → session history
 *   GET    /api/sessions/:id            → one session with its sets
 *   POST   /api/sessions/:id/sets       → log a completed set
 *   POST   /api/sessions/:id/complete   → mark a session finished
 */
import express, { type ErrorRequestHandler } from "express";
import { workoutRoutes } from "./routes/workoutRoutes.js";
import { sessionRoutes } from "./routes/sessionRoutes.js";

/**
 * Create and configure the app without starting it. Kept separate from
 * startServer() so tests could use the app without opening a port.
 */
export function createApi(): express.Express {
    // express.json() parses JSON request bodies into request.body.
    const app = express(); app.use(express.json());

    // Simple liveness check; doesn't touch the database.
    app.get("/health", (_request, response) => response.json({ status: "ok" }));

    // Mount the routers: paths inside them are relative to these prefixes.
    app.use("/api/workouts", workoutRoutes); app.use("/api/sessions", sessionRoutes);

    /**
     * Central error handler. Express recognizes it as an error handler
     * because it takes FOUR arguments (error, request, response, next).
     * Express 5 (which this project uses) automatically forwards errors
     * thrown in async controllers here, so controllers need no try/catch.
     *
     * Status is chosen by matching words in the error message:
     *   "not found"                       → 404
     *   "must" / "blank" / "positive" / "ID" → 400 (bad input)
     *   anything else                     → 500, with a generic message so
     *                                        internal details (SQL errors etc.)
     *                                        aren't leaked to the client.
     *
     * REVIEW NOTE: matching on message text is fragile. The /i flag makes "ID"
     * also match any message containing "id" (e.g. "invalid", "provided"),
     * which could turn an internal error into a 400. Custom error classes
     * (e.g. NotFoundError, ValidationError) would be more reliable.
     * Also, 500 errors aren't logged anywhere, which makes debugging hard.
     */
    const errors: ErrorRequestHandler = (error, _request, response, _next) => { const message = error instanceof Error ? error.message : "Unexpected error."; const status = /not found/i.test(message) ? 404 : /must|blank|positive|ID/i.test(message) ? 400 : 500; response.status(status).json({ error: status === 500 ? "Internal server error." : message }); };

    // The error handler must be registered AFTER the routes.
    app.use(errors); return app;
}

/**
 * Start listening. Port comes from the PORT env variable, defaulting to 3000.
 * Returns the http.Server so main.ts can close it on shutdown.
 */
export function startServer(port = Number(process.env.PORT ?? 3000)): ReturnType<express.Express["listen"]> { const server = createApi().listen(port, () => console.log(`API listening on port ${port}`)); return server; }
