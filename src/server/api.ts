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
 *   PUT    /api/workouts/:id            → replace workout (send exercise ids to keep them)
 *   DELETE /api/workouts/:id            → delete workout
 *   GET    /api/workouts/:id/previous   → NEW: last weights/reps per exercise
 *   POST   /api/workouts/:id/sessions   → start a session for that workout
 *   GET    /api/sessions                → session history
 *   GET    /api/sessions/:id            → one session with its sets
 *   DELETE /api/sessions/:id            → NEW: discard a session
 *   POST   /api/sessions/:id/sets       → log a completed set
 *   POST   /api/sessions/:id/complete   → mark a session finished
 */
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { workoutRoutes } from "./routes/workoutRoutes.js";
import { sessionRoutes } from "./routes/sessionRoutes.js";

/**
 * NEW: CORS (Cross-Origin Resource Sharing).
 *
 * Browsers block a web page from calling an API on a different "origin"
 * (scheme + host + port) unless the API says it's allowed. When you run the
 * app with `npx expo start --web`, the page is served from
 * http://localhost:8081 and the API is on http://localhost:3000 — different
 * ports, so without these headers every fetch fails in the browser.
 * (Native iOS/Android apps don't enforce CORS, but it's harmless there.)
 *
 * The browser first sends an OPTIONS "preflight" request for anything other
 * than a simple GET, so we answer those immediately with 204.
 *
 * Allowing "*" is fine for local development. Before deploying publicly you'd
 * set CORS_ORIGIN in .env to your real app's origin.
 */
const cors: RequestHandler = (request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") { response.status(204).end(); return; }
    next();
};

/**
 * Create and configure the app without starting it. Kept separate from
 * startServer() so tests could use the app without opening a port.
 */
export function createApi(): express.Express {
    const app = express();
    app.use(cors);
    // express.json() parses JSON request bodies into request.body.
    app.use(express.json());

    // Simple liveness check; doesn't touch the database.
    app.get("/health", (_request, response) => response.json({ status: "ok" }));

    // Mount the routers: paths inside them are relative to these prefixes.
    app.use("/api/workouts", workoutRoutes);
    app.use("/api/sessions", sessionRoutes);

    // Anything else under /api is a 404 in JSON (instead of Express's HTML page),
    // so the app always gets an { error } object it can display.
    app.use("/api", (_request, response) => { response.status(404).json({ error: "Endpoint not found." }); });

    /**
     * Central error handler. Express recognizes it as an error handler
     * because it takes FOUR arguments (error, request, response, next).
     * Express 5 automatically forwards errors thrown in async controllers
     * here, so controllers need no try/catch.
     *
     * CHANGED: the status now comes from the error's CLASS (see errors.ts):
     *   ValidationError → 400, NotFoundError → 404, ConflictError → 409
     *   Malformed JSON body (express.json throws, type "entity.parse.failed") → 400
     *   Postgres constraint violation (SQLSTATE class 23, e.g. a CHECK) → 400
     *   anything else → 500 with a generic message, so SQL details aren't
     *                   leaked — and it's now LOGGED so you can debug it.
     */
    const errors: ErrorRequestHandler = (error, _request, response, _next) => {
        let status = 500;
        if (error instanceof ValidationError) status = 400;
        else if (error instanceof NotFoundError) status = 404;
        else if (error instanceof ConflictError) status = 409;
        else if (error?.type === "entity.parse.failed") status = 400;
        else if (typeof error?.code === "string" && error.code.startsWith("23")) status = 400;

        if (status === 500) console.error("Unhandled API error:", error);
        const message = status === 500 ? "Internal server error." : status === 400 && !(error instanceof ValidationError) ? "Invalid request data." : (error as Error).message;
        response.status(status).json({ error: message });
    };

    // The error handler must be registered AFTER the routes.
    app.use(errors);
    return app;
}

/**
 * Start listening. Port comes from the PORT env variable, defaulting to 3000.
 * Listening on 0.0.0.0 (all network interfaces) lets a phone running Expo Go
 * on the same Wi-Fi reach the API at http://<your-computer's-IP>:3000.
 * Returns the http.Server so main.ts can close it on shutdown.
 */
export function startServer(port = Number(process.env.PORT ?? 3000)): ReturnType<express.Express["listen"]> {
    return createApi().listen(port, "0.0.0.0", () => console.log(`API listening on port ${port}`));
}
