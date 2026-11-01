/**
 * server/controllers/workoutController.ts — HTTP handlers for workouts.
 *
 * Controllers are deliberately thin: pull data out of the request, call the
 * service, and send the result back as JSON with the right status code.
 * No try/catch is needed — in Express 5, an error thrown in an async handler
 * goes straight to the error handler in api.ts.
 */
import type { Request, Response } from "express";
import { WorkoutService } from "../../services/WorkoutService.js";

// One shared service instance for all requests.
const service = new WorkoutService();

// Helper: read ":id" from the URL as a number. Non-numeric ids become NaN,
// which WorkoutService.assertId() rejects with a 400.
const id = (request: Request): number => Number(request.params.id);

// GET /api/workouts → 200 + array of workouts.
// response.json() calls Workout.toJSON() on each workout, which defines the
// exact { id, name, exercises: [...] } shape the frontend expects.
export async function listWorkouts(_request: Request, response: Response): Promise<void> { response.json(await service.listWorkouts()); }

// GET /api/workouts/:id → 200 + workout, or 404.
export async function getWorkout(request: Request, response: Response): Promise<void> { response.json(await service.getWorkout(id(request))); }

// POST /api/workouts → 201 Created + the new workout.
// request.body is passed straight to the service, which validates it.
export async function createWorkout(request: Request, response: Response): Promise<void> { response.status(201).json(await service.createWorkout(request.body)); }

// PUT /api/workouts/:id → 200 + updated workout, or 404 / 400.
// Send each kept exercise's `id` so it's updated in place (keeps its history).
export async function updateWorkout(request: Request, response: Response): Promise<void> { response.json(await service.updateWorkout(id(request), request.body)); }

// DELETE /api/workouts/:id → 204 No Content (success, empty body), or 404.
export async function deleteWorkout(request: Request, response: Response): Promise<void> { await service.deleteWorkout(id(request)); response.status(204).send(); }
