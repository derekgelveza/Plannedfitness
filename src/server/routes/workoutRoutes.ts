/**
 * server/routes/workoutRoutes.ts — URL → controller mapping for workouts.
 * Mounted at /api/workouts in api.ts, so "/" here means /api/workouts and
 * "/:id" means /api/workouts/123 (":id" is a URL parameter, read in the
 * controller as request.params.id).
 */
import { Router } from "express";
import { createWorkout, deleteWorkout, getWorkout, listWorkouts, updateWorkout } from "../controllers/workoutController.js";
import { getPrevious, startSession } from "../controllers/sessionController.js";

export const workoutRoutes = Router();

workoutRoutes.get("/", listWorkouts);             // list all workouts
workoutRoutes.get("/:id", getWorkout);            // one workout
workoutRoutes.post("/", createWorkout);           // create (body: { name, exercises: [...] })
workoutRoutes.put("/:id", updateWorkout);         // replace (same body; include exercise ids to keep them)
workoutRoutes.delete("/:id", deleteWorkout);      // delete a workout (history is kept)
// These two live here (not in sessionRoutes) because the URL is "under" a workout.
workoutRoutes.get("/:id/previous", getPrevious);  // NEW: last weights/reps for each exercise
workoutRoutes.post("/:id/sessions", startSession); // start a session for this workout
