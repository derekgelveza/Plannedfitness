import { Router } from "express";
import { createWorkout, deleteWorkout, getWorkout, listWorkouts, updateWorkout } from "../controllers/workoutController.js";
import { startSession } from "../controllers/sessionController.js";
export const workoutRoutes = Router();
workoutRoutes.get("/", listWorkouts); workoutRoutes.get("/:id", getWorkout); workoutRoutes.post("/", createWorkout); workoutRoutes.put("/:id", updateWorkout); workoutRoutes.delete("/:id", deleteWorkout); workoutRoutes.post("/:id/sessions", startSession);
