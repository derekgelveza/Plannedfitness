/**
 * server/routes/workoutRoutes.ts — URL → controller mapping for workouts.
 * Mounted at /api/workouts in api.ts, so "/" here means /api/workouts and
 * "/:id" means /api/workouts/123 (":id" is a URL parameter, read in the
 * controller as request.params.id).
 */
import { Router } from "express";
import { createWorkout, deleteWorkout, getWorkout, listWorkouts, updateWorkout } from "../controllers/workoutController.js";
import { startSession } from "../controllers/sessionController.js";

export const workoutRoutes = Router();

// GET /            list all workouts
// GET /:id         one workout
// POST /           create a workout          (body: { name, exercises: [...] })
// PUT /:id         replace a workout         (same body as create)
// DELETE /:id      delete a workout
// POST /:id/sessions  start a session for this workout. It lives here (not in
//                     sessionRoutes) because the URL is "under" a workout.
workoutRoutes.get("/", listWorkouts); workoutRoutes.get("/:id", getWorkout); workoutRoutes.post("/", createWorkout); workoutRoutes.put("/:id", updateWorkout); workoutRoutes.delete("/:id", deleteWorkout); workoutRoutes.post("/:id/sessions", startSession);
