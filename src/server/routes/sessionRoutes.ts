/**
 * server/routes/sessionRoutes.ts — URL → controller mapping for sessions.
 * Mounted at /api/sessions in api.ts. (Starting a session is in
 * workoutRoutes as POST /api/workouts/:id/sessions.)
 */
import { Router } from "express";
import { addSet, completeSession, discardSession, getSession, listSessions } from "../controllers/sessionController.js";

export const sessionRoutes = Router();

sessionRoutes.get("/", listSessions);                    // session history (newest first)
sessionRoutes.get("/:id", getSession);                   // one session with all its sets
sessionRoutes.delete("/:id", discardSession);            // NEW: discard a session and its sets
sessionRoutes.post("/:id/sets", addSet);                 // log a completed set (body: { exerciseName, setNumber, weight, reps, exerciseId? })
sessionRoutes.post("/:id/complete", completeSession);    // mark the session finished
