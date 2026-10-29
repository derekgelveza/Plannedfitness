import type { Request, Response } from "express";
import { WorkoutService } from "../../services/WorkoutService.js";
const service = new WorkoutService();
const id = (request: Request): number => Number(request.params.id);
export async function listWorkouts(_request: Request, response: Response): Promise<void> { response.json(await service.listWorkouts()); }
export async function getWorkout(request: Request, response: Response): Promise<void> { response.json(await service.getWorkout(id(request))); }
export async function createWorkout(request: Request, response: Response): Promise<void> { response.status(201).json(await service.createWorkout(request.body)); }
export async function updateWorkout(request: Request, response: Response): Promise<void> { response.json(await service.updateWorkout(id(request), request.body)); }
export async function deleteWorkout(request: Request, response: Response): Promise<void> { await service.deleteWorkout(id(request)); response.status(204).send(); }
