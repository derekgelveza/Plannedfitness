/**
 * server/routes/sessionRoutes.ts — URL → controller mapping for sessions.
 * Mounted at /api/sessions in api.ts. (Starting a session is in
 * workoutRoutes as POST /api/workouts/:id/sessions.)
 */
import { Router } from "express";
import { addSet, completeSession, getSession, listSessions } from "../controllers/sessionController.js";

export const sessionRoutes = Router();

// GET /               session history (newest first)
// GET /:id            one session with all its sets
// POST /:id/sets      log a completed set   (body: { exerciseName, setNumber, weight, reps, exerciseId? })
// POST /:id/complete  mark the session finished
sessionRoutes.get("/", listSessions); sessionRoutes.get("/:id", getSession); sessionRoutes.post("/:id/sets", addSet); sessionRoutes.post("/:id/complete", completeSession);
