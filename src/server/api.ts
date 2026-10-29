import express, { type ErrorRequestHandler } from "express";
import { workoutRoutes } from "./routes/workoutRoutes.js";
import { sessionRoutes } from "./routes/sessionRoutes.js";
export function createApi(): express.Express {
    const app = express(); app.use(express.json());
    app.get("/health", (_request, response) => response.json({ status: "ok" }));
    app.use("/api/workouts", workoutRoutes); app.use("/api/sessions", sessionRoutes);
    const errors: ErrorRequestHandler = (error, _request, response, _next) => { const message = error instanceof Error ? error.message : "Unexpected error."; const status = /not found/i.test(message) ? 404 : /must|blank|positive|ID/i.test(message) ? 400 : 500; response.status(status).json({ error: status === 500 ? "Internal server error." : message }); };
    app.use(errors); return app;
}
export function startServer(port = Number(process.env.PORT ?? 3000)): ReturnType<express.Express["listen"]> { const server = createApi().listen(port, () => console.log(`API listening on port ${port}`)); return server; }
